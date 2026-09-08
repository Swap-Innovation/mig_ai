"""Discovery orchestration: parse legacy tree into inventory with step logs."""
from __future__ import annotations

import csv
import json
import logging
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.config import get_settings
from app.db import (
    DiscoveryRun,
    DiscoveryStep,
    InventoryColumn,
    InventoryObject,
    JobNode,
    LineageEdge,
    Project,
)
from app.parsers import (
    discover_dag_dirs,
    load_repo_meta,
    parse_dag_directory,
    parse_scheduler_file,
    parse_shell_file,
    parse_sql_file,
)
from app.services.estate import resolve_legacy_root


def _fqn(schema: str, name: str) -> str:
    return f"{schema}.{name}".lower() if schema else name.lower()


class _StepLogger:
    def __init__(self, db: Session, run: DiscoveryRun, start_seq: int = 0):
        self.db = db
        self.run = run
        self.seq = start_seq
        self._terminal_buf: list[str] = []
        self._terminal_flush_at = 0

    def step(
        self,
        name: str,
        message: str = "",
        detail: dict[str, Any] | None = None,
        status: str = "success",
        duration_ms: int | None = None,
        *,
        agent: str = "",
        phase: str = "",
        tech: str = "",
    ) -> DiscoveryStep:
        self.seq += 1
        payload = dict(detail or {})
        if agent:
            payload.setdefault("agent", agent)
        if phase:
            payload.setdefault("phase", phase)
        if tech:
            payload.setdefault("tech", tech)
        row = DiscoveryStep(
            run_id=self.run.id,
            seq=self.seq,
            name=name,
            status=status,
            message=message,
            detail=payload,
            duration_ms=duration_ms,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def terminal(self, line: str, *, agent: str = "", phase: str = "") -> None:
        """Append a terminal log line to run.summary and periodically emit a step."""
        text = (line or "").rstrip()
        if not text:
            return
        summary = dict(self.run.summary or {})
        pipe = summary.get("pipeline")
        log_lines = list(summary.get("terminal_log") or [])
        entry = {
            "ts": datetime.utcnow().isoformat() + "Z",
            "agent": agent or "system",
            "line": text[:4000],
        }
        log_lines.append(entry)
        summary["terminal_log"] = log_lines[-2500:]
        summary["terminal_open"] = True
        if pipe:
            summary["pipeline"] = pipe
        self.run.summary = summary
        self.db.add(self.run)
        self._terminal_buf.append(text)
        # Flush a compact step every ~8 lines so Activity timeline stays readable
        if len(self._terminal_buf) >= 8:
            self._flush_terminal_step(agent=agent, phase=phase)
        else:
            self.db.commit()

    def _flush_terminal_step(self, *, agent: str = "", phase: str = "") -> None:
        if not self._terminal_buf:
            return
        chunk = "\n".join(self._terminal_buf[-8:])
        self._terminal_buf = []
        self.step(
            "terminal.log",
            chunk[:1500],
            {"kind": "terminal", "agent": agent, "phase": phase},
            status="running",
            agent=agent or "DiscoveryCoordinator",
            phase=phase or "terminal",
        )

    def flush_terminal(self, *, agent: str = "", phase: str = "") -> None:
        self._flush_terminal_step(agent=agent, phase=phase)

    def timed(
        self,
        name: str,
        message: str,
        fn: Callable[[], Any],
        *,
        agent: str = "",
        phase: str = "",
        tech: str = "",
    ) -> Any:
        t0 = time.perf_counter()
        try:
            result = fn()
            ms = int((time.perf_counter() - t0) * 1000)
            detail = result if isinstance(result, dict) else {"result": result}
            status = detail.pop("_status", "success") if isinstance(detail, dict) else "success"
            msg = detail.pop("_message", message) if isinstance(detail, dict) else message
            self.step(
                name,
                msg,
                detail if isinstance(detail, dict) else {},
                status,
                ms,
                agent=agent,
                phase=phase,
                tech=tech,
            )
            return result
        except Exception as exc:  # noqa: BLE001
            ms = int((time.perf_counter() - t0) * 1000)
            self.step(
                name,
                str(exc),
                {"error": str(exc)},
                "failed",
                ms,
                agent=agent,
                phase=phase,
                tech=tech,
            )
            raise


def _live_agent(
    log: _StepLogger,
    root: Path,
    agent: str,
    phase: str,
    *,
    extra: str = "",
) -> dict[str, Any]:
    """Run a Cursor live agent and stream output into the discovery terminal."""
    from app.services.cursor_agents import cursor_configured, run_discovery_agent_phase

    settings = get_settings()
    if settings.discovery_require_cursor and not cursor_configured():
        raise RuntimeError(
            "CURSOR_API_KEY required for live discovery agents. "
            "Set it in backend/.env (Cursor Dashboard → Integrations)."
        )
    if not cursor_configured():
        log.terminal(
            f"(skip live agent {agent} — CURSOR_API_KEY not set)",
            agent=agent,
            phase=phase,
        )
        return {"skipped": True, "agent": agent}

    log.step(
        f"agent.live.{phase}",
        f"Starting live Cursor agent · {agent}",
        {"kind": "agent_start", "runtime": "cursor_sdk"},
        status="running",
        agent=agent,
        phase=phase,
    )
    t0 = time.perf_counter()

    def on_log(line: str) -> None:
        log.terminal(line, agent=agent, phase=phase)

    try:
        result = run_discovery_agent_phase(
            agent_name=agent,
            phase=phase,
            cwd=root,
            on_log=on_log,
            extra_context=extra,
        )
        log.flush_terminal(agent=agent, phase=phase)
        ms = int((time.perf_counter() - t0) * 1000)
        log.step(
            f"agent.live.{phase}.done",
            f"Cursor agent {agent} completed",
            {
                "kind": "agent_done",
                "runtime": "cursor_sdk",
                "agent_id": result.get("agent_id"),
                "run_id": result.get("run_id"),
                "status": result.get("status"),
            },
            status="success",
            duration_ms=ms,
            agent=agent,
            phase=phase,
        )
        return result
    except Exception as exc:  # noqa: BLE001
        log.flush_terminal(agent=agent, phase=phase)
        ms = int((time.perf_counter() - t0) * 1000)
        log.step(
            f"agent.live.{phase}.failed",
            f"Cursor agent {agent} unavailable — continuing with deterministic parsers ({exc})",
            {"kind": "agent_failed", "error": str(exc), "continued": True},
            status="warning",
            duration_ms=ms,
            agent=agent,
            phase=phase,
        )
        log.terminal(
            f"(continue without live agent {agent}: {exc})",
            agent=agent,
            phase=phase,
        )
        return {"skipped": True, "agent": agent, "error": str(exc)}


def _detect_technologies(root: Path, files: list[Path]) -> list[dict[str, Any]]:
    """Identify stack signals so scanners can specialize (SQL, dbt, Spark, Cognos, …)."""
    names = {p.name.lower() for p in files}
    rels: list[str] = []
    for p in files:
        try:
            rels.append(p.relative_to(root).as_posix().lower())
        except ValueError:
            rels.append(p.name.lower())
    joined = " ".join(rels)
    found: list[dict[str, Any]] = []

    def add(tech: str, evidence: str, role: str) -> None:
        found.append({"id": tech, "evidence": evidence, "role": role})

    sql_n = sum(1 for p in files if p.suffix.lower() == ".sql")
    if sql_n:
        add("sql", f"{sql_n} SQL files", "leaf")
    if "dbt_project.yml" in names or "/models/" in joined or "dbt" in joined:
        add("dbt", "dbt project or models/", "transform")
    if any(
        p.suffix.lower() in {".scala", ".py"}
        and ("spark" in p.name.lower() or "spark" in str(p.parent).lower())
        for p in files
    ) or "pyspark" in joined or "/spark/" in joined or "spark-submit" in joined:
        add("spark", "Spark / PySpark artifacts", "compute")
    sh_n = sum(1 for p in files if p.suffix.lower() in {".sh", ".bash", ".ksh"})
    if sh_n:
        # spark-submit wrappers still count as shell + spark
        if any(
            "spark-submit" in p.read_text(encoding="utf-8", errors="ignore")[:800]
            for p in files
            if p.suffix.lower() in {".sh", ".bash", ".ksh"}
        ):
            if not any(t["id"] == "spark" for t in found):
                add("spark", "spark-submit shell wrappers", "compute")
        add("shell", f"{sh_n} shell wrappers", "script")
    if discover_dag_dirs(root) or "dags/" in joined:
        add("airflow", "DAG definitions under dags/", "orchestration")
    if "scheduler" in joined:
        add("scheduler", "Scheduler definitions", "orchestration")
    if (root / "usage" / "report_log.csv").exists() or "report_log" in joined:
        add("cognos", "BI / Cognos-style report usage log", "bi")
    if (root / "catalog" / "tables.json").exists():
        add("catalog", "Warehouse table catalog", "metadata")
    if not found:
        add("generic", "Unclassified estate tree", "unknown")
    return found


def run_discovery(
    db: Session,
    project_id: int,
    legacy_root: Path | None = None,
    *,
    discovery_run_id: int | None = None,
    pipeline: str = "discover",
) -> dict[str, Any]:
    settings = get_settings()
    project = db.query(Project).get(project_id)
    root = Path(legacy_root) if legacy_root else (
        resolve_legacy_root(project) if project else Path(settings.sample_legacy_path)
    )
    if not root.exists():
        raise FileNotFoundError(f"Legacy root not found: {root}")

    pipe = (pipeline or "discover").strip().lower()
    if pipe not in {"discover", "inventory"}:
        pipe = "discover"

    if discovery_run_id:
        run = db.query(DiscoveryRun).get(discovery_run_id)
        if not run:
            raise ValueError("Discovery run not found")
    else:
        run = DiscoveryRun(
            project_id=project_id,
            status="running",
            source_type=(project.legacy_source_type if project else "sample") or "sample",
            legacy_root=str(root),
            summary={"pipeline": pipe},
        )
        db.add(run)
        db.commit()
        db.refresh(run)

    run.status = "running"
    run.legacy_root = str(root)
    run.source_type = (project.legacy_source_type if project else "sample") or "sample"
    summary0 = dict(run.summary or {})
    summary0["pipeline"] = pipe
    run.summary = summary0
    db.commit()

    existing_seq = (
        db.query(DiscoveryStep)
        .filter_by(run_id=run.id)
        .count()
    )
    log = _StepLogger(db, run, start_seq=existing_seq)
    try:
        return _execute_discovery(db, project_id, root, log, run, pipeline=pipe)
    except Exception as exc:  # noqa: BLE001
        run.status = "failed"
        run.error = str(exc)
        run.completed_at = datetime.utcnow()
        db.commit()
        raise


def _rel(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return path.name


def _execute_discovery(
    db: Session,
    project_id: int,
    root: Path,
    log: _StepLogger,
    run: DiscoveryRun,
    *,
    pipeline: str = "discover",
) -> dict[str, Any]:
    # -------------------------------------------------------------------------
    # Split agentic flows:
    #   discover  (Activity)  — Plan → Structure → SQL → Scripts → Orch → Catalog
    #   inventory (Inventory) — InventoryProfiler + LineageStitcher → materialize
    # -------------------------------------------------------------------------
    A_STRUCT = "StructureAnalyst"
    A_SQL = "SqlLeafScanner"
    A_SCRIPT = "ScriptScanner"
    A_ORCH = "OrchestrationScanner"
    A_META = "CatalogUsageHarvester"
    A_STITCH = "LineageStitcher"
    A_INV = "InventoryProfiler"

    is_discover = pipeline == "discover"
    is_inventory = pipeline == "inventory"
    # Inventory flow: tag deterministic prep as EstateParser so stage chips
    # only reflect InventoryProfiler / LineageStitcher.
    prep = "EstateParser"

    if is_discover:
        log.terminal(
            "Activity · discovery scan (Cursor agents)",
            agent="DiscoveryCoordinator",
            phase="plan",
        )
        _live_agent(log, root, "DiscoveryCoordinator", "plan")
        log.step(
            "agent.plan",
            "Coordinator: leaf→root estate scan — SQL → scripts → DAGs → catalog",
            {
                "pipeline": [A_STRUCT, A_SQL, A_SCRIPT, A_ORCH, A_META],
                "strategy": "bottom_up",
                "runtime": "cursor_sdk",
                "flow": "discover",
            },
            agent="DiscoveryCoordinator",
            phase="plan",
        )
    else:
        log.terminal(
            "Inventory · inventory & lineage (Cursor agents)",
            agent=A_INV,
            phase="inventory",
        )
        # Chain context from last Activity stage (API / migration-repo)
        activity_meta: dict[str, Any] = {}
        try:
            from app.services.project_workspace import read_prior_stage

            project = db.query(Project).get(project_id)
            if project:
                activity = read_prior_stage(project, "discover/activity") or {}
                activity_meta = {
                    "activity_run_id": activity.get("run_id"),
                    "activity_summary_keys": sorted(
                        k for k in (activity.get("summary") or activity or {}).keys()
                        if k != "terminal_log"
                    )[:24],
                }
        except Exception:
            activity_meta = {}
        log.step(
            "agent.plan",
            "Inventory pipeline: profile + lineage from last Activity estate",
            {
                "pipeline": [A_INV, A_STITCH],
                "runtime": "cursor_sdk",
                "flow": "inventory",
                "legacy_root": str(root),
                "chained_from": "discover/activity",
                **activity_meta,
            },
            agent=A_INV,
            phase="plan",
        )

    files = [
        p
        for p in sorted(root.rglob("*"))
        if p.is_file() and not any(x.startswith(".") for x in p.parts)
    ]
    # Prefer DAG-local SQL/scripts (avoid double-counting flat copies if present)
    def _under_dags(p: Path) -> bool:
        return "dags" in p.parts

    sql_all = [p for p in files if p.suffix.lower() == ".sql"]
    script_all = [p for p in files if p.suffix.lower() in {".sh", ".bash", ".ksh"}]
    spark_all = [
        p
        for p in files
        if p.suffix.lower() in {".py", ".scala"}
        and (
            "spark" in p.parts
            or "spark" in p.name.lower()
            or "pyspark" in p.read_text(encoding="utf-8", errors="ignore")[:400].lower()
        )
    ]
    dag_dirs = discover_dag_dirs(root)
    if dag_dirs:
        sql_paths = [p for p in sql_all if _under_dags(p)] or sql_all
        script_paths = [p for p in script_all if _under_dags(p)] or script_all
        spark_paths = [p for p in spark_all if _under_dags(p)] or spark_all
    else:
        sql_paths = sql_all
        script_paths = script_all
        spark_paths = spark_all
    sched_paths = [
        p
        for p in files
        if p.name in {"scheduler.json", "scheduler.yml", "scheduler.yaml", "crontab.txt"}
        or ("scheduler" in p.parts and p.suffix.lower() in {".json", ".yml", ".yaml", ".txt"})
    ]
    repo_meta = load_repo_meta(root)
    techs = _detect_technologies(root, files)

    if is_discover:
        _live_agent(
            log,
            root,
            A_STRUCT,
            "structure",
            extra=f"files={len(files)} sql={len(sql_paths)} scripts={len(script_paths)} spark={len(spark_paths)} dags={len(dag_dirs)}",
        )

    log.step(
        "structure.understand",
        f"Mapped estate layout under {root.name}: {len(files)} files",
        {
            "root": str(root),
            "files": len(files),
            "sql": len(sql_paths),
            "scripts": len(script_paths),
            "spark": len(spark_paths),
            "schedulers": len(sched_paths),
            "dags": len(dag_dirs),
            "repo_remote": repo_meta.get("remote"),
            "warehouse": (repo_meta.get("warehouse") or {}).get("engine"),
            "folders": sorted(
                {
                    parts[0]
                    for p in files
                    for parts in [list(p.relative_to(root).parts)]
                    if len(parts) > 1
                }
            )[:20],
        },
        agent=A_STRUCT if is_discover else prep,
        phase="structure",
    )
    log.step(
        "structure.detect_tech",
        "Detected technologies: " + ", ".join(t["id"] for t in techs),
        {"technologies": techs},
        agent=A_STRUCT if is_discover else prep,
        phase="structure",
        tech=",".join(t["id"] for t in techs),
    )

    # Clear scope differs by pipeline
    if is_discover:
        def _clear_jobs() -> dict[str, Any]:
            n_jobs = db.query(JobNode).filter_by(project_id=project_id).delete()
            db.flush()
            return {
                "cleared_jobs": n_jobs,
                "_message": f"Cleared prior orchestration jobs ({n_jobs})",
            }

        log.timed(
            "discover.clear_jobs",
            "Clearing prior orchestration graph",
            _clear_jobs,
            agent="DiscoveryCoordinator",
            phase="prepare",
        )
    else:
        def _clear_inventory() -> dict[str, Any]:
            obj_ids = [
                o.id for o in db.query(InventoryObject).filter_by(project_id=project_id).all()
            ]
            n_cols = 0
            if obj_ids:
                n_cols = (
                    db.query(InventoryColumn)
                    .filter(InventoryColumn.object_id.in_(obj_ids))
                    .delete(synchronize_session=False)
                )
            n_obj = db.query(InventoryObject).filter_by(project_id=project_id).delete()
            n_lin = db.query(LineageEdge).filter_by(project_id=project_id).delete()
            n_jobs = db.query(JobNode).filter_by(project_id=project_id).delete()
            db.flush()
            return {
                "cleared_objects": n_obj,
                "cleared_columns": n_cols,
                "cleared_lineage": n_lin,
                "cleared_jobs": n_jobs,
                "_message": f"Cleared prior inventory ({n_obj} objects)",
            }

        log.timed(
            "inventory.clear",
            "Clearing prior inventory & lineage",
            _clear_inventory,
            agent=A_INV,
            phase="prepare",
        )

    # --- LEAF: SQL (bottom of dependency tree) ---
    if is_discover:
        _live_agent(
            log,
            root,
            A_SQL,
            "sql",
            extra=f"{len(sql_paths)} SQL files to scan",
        )
    log.step(
        "sql.begin",
        f"{'SqlLeafScanner' if is_discover else 'Parse'}: {len(sql_paths)} SQL leaves (sources → targets)",
        {"count": len(sql_paths)},
        agent=A_SQL if is_discover else prep,
        phase="leaf",
        tech="sql",
    )
    discovered_sql: list[dict[str, Any]] = []
    for path in sql_paths:
        t0 = time.perf_counter()
        parsed = parse_sql_file(path)
        ms = int((time.perf_counter() - t0) * 1000)
        discovered_sql.append(parsed)
        rel = _rel(path, root)
        status = "warning" if parsed.get("parser") == "regex_fallback" else "success"
        log.step(
            "sql.parse",
            f"{rel}: {len(parsed.get('sources') or [])} inputs → {len(parsed.get('targets') or [])} outputs",
            {
                "path": rel,
                "parser": parsed.get("parser"),
                "sources": parsed.get("sources"),
                "targets": parsed.get("targets"),
                "warning": parsed.get("parser_warning"),
            },
            status,
            ms,
            agent=A_SQL if is_discover else prep,
            phase="leaf",
            tech="sql",
        )
        if is_discover and len(sql_paths) > 1:
            time.sleep(0.05)

    # --- scripts (mid) ---
    if is_discover:
        _live_agent(
            log,
            root,
            A_SCRIPT,
            "scripts",
            extra=f"{len(script_paths)} scripts after {len(discovered_sql)} SQL files",
        )
    log.step(
        "script.begin",
        f"{'ScriptScanner' if is_discover else 'Parse'}: {len(script_paths)} wrappers linking DAGs to SQL",
        {"count": len(script_paths)},
        agent=A_SCRIPT if is_discover else prep,
        phase="mid",
        tech="shell",
    )
    discovered_scripts: list[dict[str, Any]] = []
    for path in script_paths:
        t0 = time.perf_counter()
        parsed = parse_shell_file(path)
        ms = int((time.perf_counter() - t0) * 1000)
        discovered_scripts.append(parsed)
        rel = _rel(path, root)
        preview = (parsed.get("raw_preview") or "").lower()
        is_spark = "spark-submit" in preview or "/spark/" in rel or "spark_" in rel
        log.step(
            "script.parse",
            f"{rel}: {'Spark submit wrapper' if is_spark else 'params & credential refs'}",
            {
                "path": rel,
                "kind": "spark_submit" if is_spark else "shell",
                "engine": "spark" if is_spark else "shell",
                "params": parsed.get("params"),
                "control_flow": parsed.get("control_flow"),
                "credential_refs": parsed.get("credential_refs"),
            },
            "success",
            ms,
            agent=A_SCRIPT if is_discover else prep,
            phase="mid",
            tech="spark" if is_spark else "shell",
        )

    # --- Spark / PySpark job files ---
    discovered_spark: list[dict[str, Any]] = []
    if spark_paths:
        if is_discover:
            _live_agent(
                log,
                root,
                A_SCRIPT,
                "spark",
                extra=f"{len(spark_paths)} Spark jobs",
            )
        log.step(
            "spark.begin",
            f"SparkScanner: {len(spark_paths)} Spark / PySpark jobs",
            {"count": len(spark_paths)},
            agent=A_SCRIPT if is_discover else prep,
            phase="mid",
            tech="spark",
        )
        for path in spark_paths:
            t0 = time.perf_counter()
            text = path.read_text(encoding="utf-8", errors="ignore")
            ms = int((time.perf_counter() - t0) * 1000)
            rel = _rel(path, root)
            sources = re.findall(r"SOURCES\s*=\s*\[([^\]]*)\]", text)
            targets = re.findall(r"TARGETS\s*=\s*\[([^\]]*)\]", text)

            def _names(blob: str) -> list[str]:
                return [x.strip().strip("'\"") for x in blob.split(",") if x.strip().strip("'\"")]

            src_list = _names(sources[0]) if sources else []
            tgt_list = _names(targets[0]) if targets else []
            entry = {
                "path": rel,
                "kind": "pyspark" if path.suffix.lower() == ".py" else "spark",
                "sources": src_list,
                "targets": tgt_list,
            }
            discovered_spark.append(entry)
            log.step(
                "spark.parse",
                f"{rel}: {len(src_list)} sources → {len(tgt_list)} targets",
                entry,
                "success",
                ms,
                agent=A_SCRIPT if is_discover else prep,
                phase="mid",
                tech="spark",
            )

    # Infer tables from SQL + Spark for Activity findings (even before Inventory)
    inferred_tables: set[str] = set()
    for parsed in discovered_sql:
        for t in (parsed.get("sources") or []) + (parsed.get("targets") or []):
            if t:
                inferred_tables.add(str(t).split(".")[-1].lower())
    for entry in discovered_spark:
        for t in (entry.get("sources") or []) + (entry.get("targets") or []):
            if t:
                inferred_tables.add(str(t).lower())
    if inferred_tables and is_discover:
        log.step(
            "sql.tables_inferred",
            f"Inferred {len(inferred_tables)} tables from SQL / Spark lineage",
            {"tables": sorted(inferred_tables)[:200], "count": len(inferred_tables)},
            agent=A_SQL,
            phase="leaf",
            tech="sql",
        )

    # --- orchestration (top of runtime graph) ---
    if is_discover:
        _live_agent(
            log,
            root,
            A_ORCH,
            "orchestration",
            extra=f"{len(dag_dirs)} DAG dirs, {len(sched_paths)} schedulers",
        )
    log.step(
        "orch.begin",
        f"{'OrchestrationScanner' if is_discover else 'Parse'}: {len(dag_dirs)} DAGs / schedulers and task dependencies",
        {"dags": len(dag_dirs), "schedulers": len(sched_paths)},
        agent=A_ORCH if is_discover else prep,
        phase="top",
        tech="airflow",
    )
    discovered_dags: list[dict[str, Any]] = []
    for ddir in dag_dirs:
        t0 = time.perf_counter()
        parsed = parse_dag_directory(ddir)
        ms = int((time.perf_counter() - t0) * 1000)
        if not parsed:
            continue
        discovered_dags.append(parsed)
        log.step(
            "orch.dag",
            f"DAG {parsed['id']}: {len(parsed.get('tasks') or [])} tasks · deps · {parsed.get('schedule') or 'manual'}",
            {
                "dag_id": parsed["id"],
                "dag_name": parsed.get("name"),
                "engine": parsed.get("engine")
                or (
                    "spark"
                    if "spark" in (parsed.get("tags") or [])
                    else "airflow"
                ),
                "tasks": [t.get("full_name") for t in parsed.get("tasks") or []],
                "task_names": [t.get("name") or t.get("id") for t in parsed.get("tasks") or []],
                "spark_jobs": [
                    t.get("spark") or t.get("script")
                    for t in parsed.get("tasks") or []
                    if (t.get("params") or {}).get("engine") == "spark"
                    or "spark" in str(t.get("script") or "").lower()
                    or t.get("spark")
                ],
                "task_deps": {
                    t.get("full_name"): t.get("depends_on") or []
                    for t in parsed.get("tasks") or []
                },
                "schedule": parsed.get("schedule"),
                "owner": parsed.get("owner"),
                "tags": parsed.get("tags") or [],
            },
            "success",
            ms,
            agent=A_ORCH if is_discover else prep,
            phase="top",
            tech="airflow",
        )

    if repo_meta:
        log.step(
            "orch.repo_meta",
            f"Git warehouse repo · {(repo_meta.get('warehouse') or {}).get('engine') or 'on-prem'}",
            {
                "remote": repo_meta.get("remote"),
                "branch": repo_meta.get("default_branch"),
                "databases": (repo_meta.get("warehouse") or {}).get("databases"),
            },
            agent=A_ORCH if is_discover else prep,
            phase="top",
        )

    discovered_sched: list[dict[str, Any]] = []
    if not discovered_dags:
        for path in sched_paths:
            t0 = time.perf_counter()
            parsed = parse_scheduler_file(path)
            ms = int((time.perf_counter() - t0) * 1000)
            discovered_sched.append(parsed)
            rel = _rel(path, root)
            n_jobs = len(parsed.get("jobs") or [])
            log.step(
                "orch.scheduler",
                f"{rel}: {n_jobs} jobs",
                {"path": rel, "jobs": [j.get("name") for j in parsed.get("jobs") or []]},
                "success",
                ms,
                agent=A_ORCH if is_discover else prep,
                phase="top",
                tech="scheduler",
            )

    # --- catalog + usage / BI ---
    if is_discover:
        _live_agent(log, root, A_META, "catalog")
    tables = _load_table_catalog(root)
    log.step(
        "meta.catalog",
        f"Catalog: {len(tables)} tables",
        {"tables": [t.get("name") for t in tables]},
        "warning" if not tables else "success",
        agent=A_META if is_discover else prep,
        phase="metadata",
        tech="catalog",
    )

    usage = _load_usage(root)
    bi_consumers = sorted(
        {
            c
            for u in usage.values()
            for c in (u.get("consumers") or [])
            if c
        }
    )
    log.step(
        "meta.usage_bi",
        f"Usage & BI harvest: {len(usage)} objects · {len(bi_consumers)} consumers (incl. Cognos-style reports)",
        {"objects_with_usage": len(usage), "consumers_sample": bi_consumers[:12]},
        agent=A_META if is_discover else prep,
        phase="metadata",
        tech="cognos" if (root / "usage" / "report_log.csv").exists() else "usage",
    )

    # -------------------------------------------------------------------------
    # Discover pipeline ends here: orchestration JobNodes for Activity findings
    # -------------------------------------------------------------------------
    if is_discover:
        jobs_created = 0
        if discovered_dags:
            for dag in discovered_dags:
                dag_job = f"dag.{dag['id']}"
                db.add(
                    JobNode(
                        project_id=project_id,
                        discovery_run_id=run.id,
                        name=dag_job,
                        schedule=dag.get("schedule") or "",
                        sla_minutes=None,
                        script_path=dag.get("meta_path") or "",
                        depends_on=[f"dag.{u}" for u in _collect_upstream_dags(dag)],
                        params={
                            "kind": "dag",
                            "dag_id": dag["id"],
                            "dag_name": dag.get("name"),
                            "owner": dag.get("owner"),
                            "tags": dag.get("tags") or [],
                            "engine": dag.get("engine") or "",
                            "repo_remote": repo_meta.get("remote"),
                            "task_count": len(dag.get("tasks") or []),
                        },
                    )
                )
                jobs_created += 1
                for task in dag.get("tasks") or []:
                    full = task["full_name"]
                    tparams = task.get("params") or {}
                    db.add(
                        JobNode(
                            project_id=project_id,
                            discovery_run_id=run.id,
                            name=full,
                            schedule=dag.get("schedule") or "",
                            sla_minutes=task.get("sla_minutes"),
                            script_path=task.get("script") or task.get("script_path") or "",
                            depends_on=task.get("depends_on") or [],
                            params={
                                "kind": "task",
                                "dag_id": dag["id"],
                                "task_id": task["id"],
                                "task_name": task.get("name"),
                                "sql": task.get("sql") or [],
                                "script": task.get("script"),
                                "spark": task.get("spark") or "",
                                "engine": tparams.get("engine")
                                or dag.get("engine")
                                or "",
                                "sources": tparams.get("sources") or [],
                                "targets": tparams.get("targets") or [],
                                "repo_remote": repo_meta.get("remote"),
                            },
                        )
                    )
                    jobs_created += 1
        else:
            for sched in discovered_sched:
                for job in sched.get("jobs", []):
                    db.add(
                        JobNode(
                            project_id=project_id,
                            discovery_run_id=run.id,
                            name=job["name"],
                            schedule=job.get("schedule") or "",
                            sla_minutes=job.get("sla_minutes"),
                            script_path=job.get("script_path") or "",
                            depends_on=job.get("depends_on") or [],
                            params=job.get("params") or {},
                        )
                    )
                    jobs_created += 1

        log.step(
            "discover.jobs",
            f"Orchestration findings: {jobs_created} DAG/task nodes",
            {"jobs": jobs_created, "dags": len(discovered_dags)},
            agent=A_ORCH,
            phase="top",
        )

        summary = {
            "pipeline": "discover",
            "objects": 0,
            "jobs": jobs_created,
            "sql_files": len(discovered_sql),
            "scripts": len(discovered_scripts),
            "spark_files": len(discovered_spark),
            "tables_inferred": len(inferred_tables),
            "schedulers": len(discovered_sched),
            "dags": len(discovered_dags),
            "lineage_edges": 0,
            "technologies": [t["id"] for t in techs],
            "repo_remote": repo_meta.get("remote"),
            "warehouse_engine": (repo_meta.get("warehouse") or {}).get("engine"),
            "run_id": run.id,
            "runtime": "cursor_sdk",
            "confidence": round(
                min(
                    0.97,
                    0.72
                    + (0.05 if discovered_sql else 0)
                    + (0.05 if discovered_dags else 0)
                    + (0.04 if discovered_spark else 0)
                    + (0.04 if techs else 0)
                    + (0.04 if repo_meta.get("remote") else 0),
                ),
                2,
            ),
            "outcomes": {
                "scan": True,
                "inventory": False,
                "lineage": False,
            },
        }
        prev = dict(run.summary or {})
        if prev.get("terminal_log"):
            summary["terminal_log"] = prev["terminal_log"]
        summary["terminal_open"] = True
        log.flush_terminal(agent="DiscoveryCoordinator", phase="complete")
        log.terminal("Discovery scan complete.", agent="DiscoveryCoordinator", phase="complete")
        log.flush_terminal(agent="DiscoveryCoordinator", phase="complete")
        prev2 = dict(run.summary or {})
        if prev2.get("terminal_log"):
            summary["terminal_log"] = prev2["terminal_log"]
        run.status = "completed"
        run.summary = summary
        run.completed_at = datetime.utcnow()
        run.error = ""
        log.step(
            "complete",
            "Discovery scan complete — run Inventory agents for inventory & lineage",
            {k: v for k, v in summary.items() if k != "terminal_log"},
            agent="DiscoveryCoordinator",
            phase="complete",
        )
        db.commit()
        # Persist under project migration-repo/activity for Inventory to consume
        try:
            from app.services.project_workspace import export_activity_run

            project = db.query(Project).get(project_id)
            if project:
                steps = [
                    {
                        "seq": s.seq,
                        "name": s.name,
                        "status": s.status,
                        "message": s.message,
                        "detail": s.detail,
                    }
                    for s in db.query(DiscoveryStep)
                    .filter_by(run_id=run.id)
                    .order_by(DiscoveryStep.seq.asc())
                    .all()
                ]
                jobs = [
                    {
                        "id": j.id,
                        "name": j.name,
                        "schedule": j.schedule,
                        "script_path": j.script_path,
                        "depends_on": j.depends_on,
                        "params": j.params,
                    }
                    for j in db.query(JobNode).filter_by(project_id=project_id).all()
                ]
                path = export_activity_run(
                    project,
                    run_id=run.id,
                    summary=summary,
                    steps=steps,
                    jobs=jobs,
                )
                summary["migration_repo_activity"] = str(path)
                run.summary = summary
                db.commit()
        except Exception as exc:
            logger.exception(
                "Failed to export discover/activity for project %s run %s: %s",
                project_id,
                run.id,
                exc,
            )
            summary["migration_repo_activity_error"] = str(exc)
            run.summary = summary
            db.commit()
        return summary

    # -------------------------------------------------------------------------
    # Inventory pipeline: InventoryProfiler + LineageStitcher → materialize
    # -------------------------------------------------------------------------
    objects_created = 0
    _live_agent(
        log,
        root,
        A_INV,
        "inventory",
        extra=f"About to inventory {len(tables)} catalog tables",
    )
    for table in tables:
        schema = table.get("schema", "legacy")
        name = table["name"]
        fqn = _fqn(schema, name)
        u = usage.get(fqn, {})
        obj = InventoryObject(
            project_id=project_id,
            discovery_run_id=run.id,
            object_type="table",
            schema_name=schema,
            name=name,
            fully_qualified_name=fqn,
            source_path=table.get("ddl_path", ""),
            description=table.get("description", ""),
            row_count=table.get("row_count"),
            last_accessed=_parse_dt(u.get("last_accessed")),
            access_count=int(u.get("access_count", 0)),
            consumers=u.get("consumers", []),
            profile=table.get("profile", {}),
            retention_required=bool(table.get("retention_required", False)),
            extra={
                "unsound_logic": table.get("unsound_logic", False),
                "duplicate_of": table.get("duplicate_of"),
                "discovery_run_id": run.id,
            },
        )
        db.add(obj)
        db.flush()
        profile_enrich = _enrich_table_profile(table, u)
        cols_prof: dict[str, Any] = {}
        for col in table.get("columns", []):
            null_rate = col.get("null_rate")
            distinct = col.get("distinct_count")
            samples = col.get("samples", [])
            # Synthesize profiling when catalog omits metrics (demo estates)
            if null_rate is None and not col.get("pk"):
                null_rate = 0.02
            if distinct is None and table.get("row_count"):
                distinct = max(1, int(table["row_count"] * (0.95 if col.get("pk") else 0.4)))
            pii = _pii_hint(col.get("name", ""))
            db.add(
                InventoryColumn(
                    object_id=obj.id,
                    name=col["name"],
                    data_type=col.get("type", "VARCHAR"),
                    nullable=col.get("nullable", True),
                    is_pk=col.get("pk", False),
                    null_rate=null_rate,
                    distinct_count=distinct,
                    sample_values=samples,
                )
            )
            cols_prof[col["name"]] = {
                "null_rate": null_rate,
                "distinct_count": distinct,
                "cardinality": _cardinality_class(distinct, table.get("row_count")),
                "pii_hint": pii,
                "is_pk": bool(col.get("pk")),
                "data_type": col.get("type", "VARCHAR"),
            }
        obj.profile = {**(table.get("profile") or {}), **profile_enrich, "columns": cols_prof}
        objects_created += 1

    log.step(
        "inventory.tables",
        f"Inventory: {objects_created} tables with columns",
        {"tables": objects_created},
        agent=A_INV,
        phase="inventory",
    )
    log.step(
        "profiling.columns",
        f"Profiling: null rate, cardinality, PII hints on {objects_created} tables",
        {"tables_profiled": objects_created},
        agent=A_INV,
        phase="profiling",
    )

    lineage_count = 0
    sql_by_path = {str(Path(s["path"]).resolve()): s for s in discovered_sql}
    edge_keys: set[tuple[str, str, str, str]] = set()

    def _norm_fqn(name: str) -> str:
        n = name.lower()
        return n if "." in n else f"legacy.{n}"

    def _add_edge(
        *,
        source_fqn: str,
        target_fqn: str,
        transformation: str = "",
        job_name: str = "",
        edge_type: str = "data",
    ) -> bool:
        nonlocal lineage_count
        key = (source_fqn, target_fqn, job_name or "", edge_type)
        if key in edge_keys or source_fqn == target_fqn:
            return False
        edge_keys.add(key)
        db.add(
            LineageEdge(
                project_id=project_id,
                discovery_run_id=run.id,
                source_fqn=source_fqn,
                target_fqn=target_fqn,
                transformation=transformation,
                job_name=job_name,
                edge_type=edge_type,
            )
        )
        lineage_count += 1
        return True

    _live_agent(
        log,
        root,
        A_STITCH,
        "lineage",
        extra=f"sql={len(discovered_sql)} dags={len(discovered_dags)} tables={objects_created}",
    )
    log.step(
        "lineage.begin",
        "LineageStitcher: sewing SQL leaves → scripts → DAG tasks → repo (bottom-up)",
        {"sql_files": len(discovered_sql), "dags": len(discovered_dags)},
        agent=A_STITCH,
        phase="lineage",
    )

    # SQL lineage (prefer task-attributed when DAGs present)
    if discovered_dags:
        for dag in discovered_dags:
            for task in dag.get("tasks") or []:
                job_name = task["full_name"]
                for sp in task.get("sql_paths") or []:
                    sql = sql_by_path.get(str(Path(sp).resolve()))
                    if not sql:
                        continue
                    for t in sql.get("targets") or []:
                        for s in sql.get("sources") or []:
                            _add_edge(
                                source_fqn=_norm_fqn(s),
                                target_fqn=_norm_fqn(t),
                                transformation="; ".join((sql.get("filters") or [])[:3]),
                                job_name=job_name,
                                edge_type="data",
                            )
                for w in task.get("writes") or []:
                    # Prefer task → table over synthetic dag: placeholder
                    _add_edge(
                        source_fqn=job_name,
                        target_fqn=_norm_fqn(w),
                        transformation="declared write",
                        job_name=job_name,
                        edge_type="data",
                    )
    else:
        for sql in discovered_sql:
            targets = sql.get("targets") or []
            sources = sql.get("sources") or []
            for t in targets:
                for s in sources:
                    _add_edge(
                        source_fqn=_norm_fqn(s),
                        target_fqn=_norm_fqn(t),
                        transformation="; ".join((sql.get("filters") or [])[:3]),
                        job_name=Path(sql["path"]).stem,
                        edge_type="data",
                    )

    log.step(
        "lineage.data",
        f"Stitched {lineage_count} data edges (input → output tables via SQL / pipelines)",
        {"edges": lineage_count},
        agent=A_STITCH,
        phase="lineage",
    )

    jobs_created = 0
    repo_fqn = ""
    if repo_meta.get("remote"):
        repo_stem = Path(str(repo_meta.get("remote")).rstrip("/")).stem or "warehouse-etl"
        repo_fqn = f"git.{repo_stem}"
        # Synthetic inventory object for the git root
        db.add(
            InventoryObject(
                project_id=project_id,
                discovery_run_id=run.id,
                object_type="repo",
                schema_name="git",
                name=repo_stem,
                fully_qualified_name=repo_fqn,
                source_path=str(repo_meta.get("remote")),
                description=f"On-prem DW git repo · {(repo_meta.get('warehouse') or {}).get('engine') or 'warehouse'}",
                access_count=0,
                consumers=[],
                profile=repo_meta.get("warehouse") or {},
                retention_required=False,
                extra={"repo": repo_meta},
            )
        )
        objects_created += 1

    if discovered_dags:
        for dag in discovered_dags:
            dag_job = f"dag.{dag['id']}"
            # First-class inventory row for the DAG (Build → DAGs workbench)
            if not db.query(InventoryObject).filter_by(
                project_id=project_id, fully_qualified_name=dag_job
            ).first():
                db.add(
                    InventoryObject(
                        project_id=project_id,
                        discovery_run_id=run.id,
                        object_type="dag",
                        schema_name="dags",
                        name=dag["id"],
                        fully_qualified_name=dag_job,
                        source_path=dag.get("meta_path") or f"dags/{dag['id']}/dag.json",
                        description=dag.get("name")
                        or f"Airflow DAG · {dag['id']} · {len(dag.get('tasks') or [])} tasks",
                        access_count=max(1, len(dag.get("tasks") or [])),
                        consumers=list(dag.get("tags") or [])[:8],
                        profile={
                            "schedule": dag.get("schedule") or "",
                            "owner": dag.get("owner") or "",
                            "engine": dag.get("engine") or "spark",
                        },
                        retention_required=False,
                        extra={
                            "kind": "dag",
                            "dag_id": dag["id"],
                            "task_count": len(dag.get("tasks") or []),
                            "tags": dag.get("tags") or [],
                        },
                    )
                )
                objects_created += 1
            db.add(
                JobNode(
                    project_id=project_id,
                    discovery_run_id=run.id,
                    name=dag_job,
                    schedule=dag.get("schedule") or "",
                    sla_minutes=None,
                    script_path=dag.get("meta_path") or "",
                    depends_on=[f"dag.{u}" for u in _collect_upstream_dags(dag)],
                    params={
                        "kind": "dag",
                        "dag_id": dag["id"],
                        "dag_name": dag.get("name"),
                        "owner": dag.get("owner"),
                        "tags": dag.get("tags") or [],
                        "repo_remote": repo_meta.get("remote"),
                        "task_count": len(dag.get("tasks") or []),
                    },
                )
            )
            jobs_created += 1
            # repo → dag
            if repo_fqn:
                _add_edge(
                    source_fqn=repo_fqn,
                    target_fqn=dag_job,
                    transformation="git discover",
                    job_name=dag_job,
                    edge_type="job",
                )
            for task in dag.get("tasks") or []:
                full = task["full_name"]
                db.add(
                    JobNode(
                        project_id=project_id,
                        discovery_run_id=run.id,
                        name=full,
                        schedule=dag.get("schedule") or "",
                        sla_minutes=task.get("sla_minutes"),
                        script_path=task.get("script") or task.get("script_path") or "",
                        depends_on=task.get("depends_on") or [],
                        params={
                            "kind": "task",
                            "dag_id": dag["id"],
                            "task_id": task["id"],
                            "task_name": task.get("name"),
                            "sql": task.get("sql") or [],
                            "script": task.get("script"),
                            "spark": task.get("spark") or "",
                            "repo_remote": repo_meta.get("remote"),
                            "sources": (task.get("params") or {}).get("sources") or [],
                            "targets": (task.get("params") or {}).get("targets") or [],
                            "engine": (task.get("params") or {}).get("engine")
                            or dag.get("engine")
                            or "",
                        },
                    )
                )
                jobs_created += 1
                # dag → task
                _add_edge(
                    source_fqn=dag_job,
                    target_fqn=full,
                    transformation="dag task",
                    job_name=full,
                    edge_type="job",
                )
                for dep in task.get("depends_on") or []:
                    _add_edge(
                        source_fqn=dep,
                        target_fqn=full,
                        transformation="task dependency",
                        job_name=full,
                        edge_type="job",
                    )
                # task → script inventory + edge
                if task.get("script"):
                    script_name = Path(task["script"]).name
                    script_fqn = f"scripts.{dag['id']}.{script_name}"
                    db.add(
                        InventoryObject(
                            project_id=project_id,
                            discovery_run_id=run.id,
                            object_type="script",
                            schema_name=f"dags.{dag['id']}",
                            name=script_name,
                            fully_qualified_name=script_fqn,
                            source_path=task.get("script_path") or task.get("script") or "",
                            description=f"DAG {dag['id']} · task {task['id']}",
                            access_count=0,
                            consumers=[],
                            profile={},
                            retention_required=False,
                            extra={
                                "dag_id": dag["id"],
                                "task_id": task["id"],
                                "sql": task.get("sql") or [],
                                "kind": "shell",
                            },
                        )
                    )
                    objects_created += 1
                    _add_edge(
                        source_fqn=full,
                        target_fqn=script_fqn,
                        transformation="runs script",
                        job_name=full,
                        edge_type="job",
                    )
                    # script → table targets from SQL
                    for sp in task.get("sql_paths") or []:
                        sql = sql_by_path.get(str(Path(sp).resolve()))
                        if not sql:
                            continue
                        for t in sql.get("targets") or []:
                            _add_edge(
                                source_fqn=script_fqn,
                                target_fqn=_norm_fqn(t),
                                transformation=Path(sp).name,
                                job_name=full,
                                edge_type="data",
                            )
                # Spark / PySpark module inventory
                spark_rel = (task.get("spark") or "").strip()
                if spark_rel:
                    spark_name = Path(spark_rel).name
                    spark_fqn = f"spark.{dag['id']}.{Path(spark_rel).stem}"
                    spark_path = (
                        spark_rel
                        if spark_rel.startswith("dags/")
                        else f"dags/{dag['id']}/{spark_rel}"
                    )
                    db.add(
                        InventoryObject(
                            project_id=project_id,
                            discovery_run_id=run.id,
                            object_type="script",
                            schema_name=f"spark.{dag['id']}",
                            name=Path(spark_rel).stem,
                            fully_qualified_name=spark_fqn,
                            source_path=spark_path,
                            description=f"Spark / PySpark · DAG {dag['id']} · {task.get('id')}",
                            access_count=1,
                            consumers=[],
                            profile={
                                "engine": "spark",
                                "sources": (task.get("params") or {}).get("sources") or [],
                                "targets": (task.get("params") or {}).get("targets") or [],
                            },
                            retention_required=False,
                            extra={
                                "kind": "pyspark",
                                "dag_id": dag["id"],
                                "task_id": task["id"],
                                "sources": (task.get("params") or {}).get("sources") or [],
                                "targets": (task.get("params") or {}).get("targets") or [],
                            },
                        )
                    )
                    objects_created += 1
                    _add_edge(
                        source_fqn=full,
                        target_fqn=spark_fqn,
                        transformation="runs spark",
                        job_name=full,
                        edge_type="job",
                    )
    else:
        for sched in discovered_sched:
            for job in sched.get("jobs", []):
                db.add(
                    JobNode(
                        project_id=project_id,
                        discovery_run_id=run.id,
                        name=job["name"],
                        schedule=job.get("schedule") or "",
                        sla_minutes=job.get("sla_minutes"),
                        script_path=job.get("script_path") or "",
                        depends_on=job.get("depends_on") or [],
                        params=job.get("params") or {},
                    )
                )
                jobs_created += 1
                for dep in job.get("depends_on") or []:
                    _add_edge(
                        source_fqn=dep,
                        target_fqn=job["name"],
                        transformation="scheduler",
                        job_name=job["name"],
                        edge_type="job",
                    )

    log.step(
        "lineage.jobs",
        f"Orchestration graph: {jobs_created} DAG/task nodes · what runs under what",
        {"jobs": jobs_created, "dags": len(discovered_dags)},
        agent=A_STITCH,
        phase="lineage",
    )

    # Catalog tables with no stitcher edge stay in inventory only (not on lineage canvas)
    linked_l = {
        fqn.lower()
        for src, tgt, _job, et in edge_keys
        if et == "data"
        for fqn in (src, tgt)
        if fqn
        and "." in fqn
        and not fqn.startswith(("dag.", "git.", "scripts."))
        and ":" not in fqn
    }
    catalog_fqns = {_fqn(t.get("schema", "legacy"), t["name"]) for t in tables if t.get("name")}
    unlinked = sorted(f for f in catalog_fqns if f.lower() not in linked_l)
    log.step(
        "lineage.coverage",
        f"Lineage coverage: {len(linked_l)} linked / {len(catalog_fqns)} catalog tables"
        + (f" · {len(unlinked)} catalog-only (not on canvas)" if unlinked else ""),
        {
            "linked_tables": sorted(linked_l),
            "unlinked_tables": unlinked,
            "catalog_tables": len(catalog_fqns),
        },
        agent=A_STITCH,
        phase="lineage",
    )

    # Persist leftover scripts not already covered by DAG tasks
    covered_scripts = {
        Path(t.get("script_path") or "").name
        for dag in discovered_dags
        for t in dag.get("tasks") or []
    }
    for script in discovered_scripts:
        name = Path(script["path"]).name
        if name in covered_scripts:
            continue
        rel = script["path"].replace("\\", "/")
        # When git-shaped dags/ exist, ignore flat legacy/scripts orphans
        if discovered_dags and ("/dags/" not in rel):
            continue
        if "/dags/" in rel:
            continue
        db.add(
            InventoryObject(
                project_id=project_id,
                discovery_run_id=run.id,
                object_type="script",
                schema_name="scripts",
                name=name,
                fully_qualified_name=f"scripts.{name}",
                source_path=script["path"],
                description="Wrapper script",
                access_count=0,
                consumers=[],
                profile={},
                retention_required=False,
                extra=script,
            )
        )
        objects_created += 1

    log.step(
        "inventory.scripts",
        f"Inventory: script objects linked to DAGs",
        {"scripts_parsed": len(discovered_scripts)},
        agent=A_INV,
        phase="inventory",
    )

    summary = {
        "pipeline": "inventory",
        "objects": objects_created,
        "jobs": jobs_created,
        "sql_files": len(discovered_sql),
        "scripts": len(discovered_scripts),
        "spark_files": len(discovered_spark),
        "schedulers": len(discovered_sched),
        "dags": len(discovered_dags),
        "lineage_edges": lineage_count,
        "linked_tables": len(linked_l),
        "unlinked_tables": unlinked,
        "technologies": [t["id"] for t in techs],
        "repo_remote": repo_meta.get("remote"),
        "warehouse_engine": (repo_meta.get("warehouse") or {}).get("engine"),
        "run_id": run.id,
        "runtime": "cursor_sdk",
        "confidence": round(
            min(
                0.98,
                0.7
                + (0.08 if objects_created else 0)
                + (0.08 if lineage_count else 0)
                + (0.05 if jobs_created else 0)
                + (0.04 if tables else 0),
            ),
            2,
        ),
        "outcomes": {
            "inventory": True,
            "lineage": lineage_count > 0,
            "profiling": objects_created > 0,
        },
    }
    prev = dict(run.summary or {})
    if prev.get("terminal_log"):
        summary["terminal_log"] = prev["terminal_log"]
    summary["terminal_open"] = True
    log.flush_terminal(agent=A_INV, phase="complete")
    log.terminal("Inventory & lineage complete.", agent=A_INV, phase="complete")
    log.flush_terminal(agent=A_INV, phase="complete")
    # Re-merge terminal after final lines
    prev2 = dict(run.summary or {})
    if prev2.get("terminal_log"):
        summary["terminal_log"] = prev2["terminal_log"]
    run.status = "completed"
    run.summary = summary
    run.completed_at = datetime.utcnow()
    run.error = ""
    log.step(
        "complete",
        "Inventory & lineage complete — review catalog and Lineage canvas",
        {k: v for k, v in summary.items() if k != "terminal_log"},
        agent=A_INV,
        phase="complete",
    )
    db.commit()
    # Persist under project migration-repo/inventory + lineage for Review / next stages
    try:
        from app.services.project_workspace import export_inventory_run, read_prior_stage

        project = db.query(Project).get(project_id)
        if project:
            # Require activity disk output when present (chain check)
            activity = read_prior_stage(project, "discover/activity")
            if activity:
                summary["activity_run_id"] = activity.get("run_id")
            objects = []
            for o in db.query(InventoryObject).filter_by(project_id=project_id).all():
                cols = (
                    db.query(InventoryColumn).filter_by(object_id=o.id).all()
                )
                objects.append(
                    {
                        "id": o.id,
                        "object_type": o.object_type,
                        "name": o.name,
                        "fully_qualified_name": o.fully_qualified_name,
                        "schema_name": o.schema_name,
                        "source_path": o.source_path,
                        "row_count": o.row_count,
                        "access_count": o.access_count,
                        "profile": o.profile,
                        "discovery_run_id": getattr(o, "discovery_run_id", None),
                        "columns": [
                            {
                                "name": c.name,
                                "data_type": c.data_type,
                                "nullable": c.nullable,
                                "is_pk": c.is_pk,
                                "null_rate": c.null_rate,
                                "distinct_count": c.distinct_count,
                            }
                            for c in cols
                        ],
                    }
                )
            edges = [
                {
                    "source_fqn": e.source_fqn,
                    "target_fqn": e.target_fqn,
                    "job_name": e.job_name,
                    "edge_type": e.edge_type,
                    "transformation": e.transformation,
                    "discovery_run_id": getattr(e, "discovery_run_id", None),
                }
                for e in db.query(LineageEdge).filter_by(project_id=project_id).all()
            ]
            jobs = [
                {
                    "id": j.id,
                    "name": j.name,
                    "schedule": j.schedule,
                    "script_path": j.script_path,
                    "depends_on": j.depends_on,
                    "params": j.params,
                }
                for j in db.query(JobNode).filter_by(project_id=project_id).all()
            ]
            paths = export_inventory_run(
                project,
                run_id=run.id,
                summary=summary,
                objects=objects,
                edges=edges,
                jobs=jobs,
            )
            summary["migration_repo_inventory"] = str(paths.get("inventory"))
            summary["migration_repo_lineage"] = str(paths.get("lineage"))
            run.summary = summary
            db.commit()
    except Exception as exc:
        logger.exception(
            "Failed to export discover/inventory+lineage for project %s run %s: %s",
            project_id,
            run.id,
            exc,
        )
        summary["migration_repo_inventory_error"] = str(exc)
        run.summary = summary
        db.commit()
    return summary


def _collect_upstream_dags(dag: dict[str, Any]) -> list[str]:
    ups: list[str] = []
    for task in dag.get("tasks") or []:
        for u in task.get("upstream_dags") or []:
            if u not in ups:
                ups.append(str(u))
    return ups


def _load_table_catalog(root: Path) -> list[dict[str, Any]]:
    catalog = root / "catalog" / "tables.json"
    if catalog.exists():
        data = json.loads(catalog.read_text())
        if isinstance(data, dict):
            return data.get("tables", [])
        return data
    return []


def _load_usage(root: Path) -> dict[str, Any]:
    """Merge query logs and report/BI usage harvests (flexible CSV shapes)."""
    usage: dict[str, Any] = {}
    for rel in ("usage/query_log.csv", "usage/report_log.csv"):
        path = root / rel
        if not path.exists():
            continue
        with path.open() as f:
            reader = csv.DictReader(f)
            for row in reader:
                fqn = (row.get("object_fqn") or "").lower()
                if not fqn:
                    continue
                entry = usage.setdefault(
                    fqn,
                    {
                        "access_count": 0,
                        "consumers": set(),
                        "last_accessed": None,
                        "sources": set(),
                    },
                )
                # Some estates log one row per query (count=1); others pre-aggregate
                try:
                    bump = int(row.get("access_count") or 1)
                except ValueError:
                    bump = 1
                entry["access_count"] += bump
                consumer = (
                    row.get("consumer")
                    or row.get("report_name")
                    or row.get("dashboard")
                    or row.get("user")
                )
                if consumer:
                    entry["consumers"].add(consumer)
                entry["sources"].add(rel)
                la = row.get("last_accessed") or row.get("started_at") or row.get("accessed_at")
                if la and (entry["last_accessed"] is None or la > entry["last_accessed"]):
                    entry["last_accessed"] = la
    for v in usage.values():
        v["consumers"] = sorted(v["consumers"])
        v["sources"] = sorted(v["sources"])
    return usage


def _pii_hint(col_name: str) -> str | None:
    n = col_name.lower()
    if any(x in n for x in ("email", "mail")):
        return "personal"
    if any(x in n for x in ("phone", "msisdn", "mobile", "tel")):
        return "personal"
    if any(x in n for x in ("name", "address", "dob", "ssn", "national")):
        return "personal"
    if "loc" in n or "geo" in n or "lat" in n or "lon" in n:
        return "location"
    return None


def _cardinality_class(distinct: int | None, row_count: int | None) -> str:
    if distinct is None:
        return "unknown"
    if distinct <= 1:
        return "constant"
    if row_count and distinct >= row_count * 0.95:
        return "unique"
    if distinct <= 20:
        return "low"
    if row_count and distinct < row_count * 0.1:
        return "moderate"
    return "high"


def _enrich_table_profile(table: dict[str, Any], usage: dict[str, Any]) -> dict[str, Any]:
    cols = table.get("columns") or []
    pii_cols = [c["name"] for c in cols if _pii_hint(c.get("name", ""))]
    pk_cols = [c["name"] for c in cols if c.get("pk")]
    return {
        "column_count": len(cols),
        "pk_columns": pk_cols,
        "pii_columns": pii_cols,
        "usage_sources": usage.get("sources") or [],
        "profiled_at": datetime.utcnow().isoformat() + "Z",
        "update_frequency": (table.get("profile") or {}).get("update_frequency", "unknown"),
        "date_range": (table.get("profile") or {}).get("date_range"),
    }


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", ""))
    except ValueError:
        return datetime.utcnow() - timedelta(days=30)
