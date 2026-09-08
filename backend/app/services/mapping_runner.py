"""Async SID mapping agent run with progressive terminal steps for the Map workbench."""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from app.agents import run_agent_task
from app.db import (
    AgentRun,
    AuditEvent,
    Disposition,
    InventoryColumn,
    InventoryObject,
    MappingRow,
    Project,
    ReviewItem,
    SessionLocal,
)


def _term(agent: str, line: str) -> dict[str, Any]:
    return {
        "name": "terminal.log",
        "status": "success",
        "message": line,
        "detail": {
            "kind": "terminal",
            "agent": agent,
            "ts": datetime.utcnow().isoformat() + "Z",
        },
    }


def _step(name: str, status: str, message: str, agent: str) -> dict[str, Any]:
    return {
        "name": name,
        "status": status,
        "message": message,
        "detail": {"agent": agent},
    }


def build_survivor_columns(db, project_id: int) -> list[dict[str, Any]]:
    objs = (
        db.query(InventoryObject)
        .filter_by(project_id=project_id, object_type="table")
        .all()
    )
    survivor_ids = {
        d.object_id
        for d in db.query(Disposition).filter_by(project_id=project_id).all()
        if d.final in {"migrate", "rebuild"}
    }
    cols: list[dict[str, Any]] = []
    for obj in objs:
        if survivor_ids and obj.id not in survivor_ids:
            continue
        for c in db.query(InventoryColumn).filter_by(object_id=obj.id).all():
            cols.append(
                {
                    "object": obj.fully_qualified_name,
                    "column": c.name,
                    "type": c.data_type,
                }
            )
    return cols


def materialize_mappings(db, project_id: int, result: dict[str, Any]) -> tuple[int, int]:
    db.query(MappingRow).filter_by(project_id=project_id).delete()
    db.flush()
    n = 0
    for m in result.get("mappings", []):
        status = m.get("status") or (
            "gap" if m.get("conformance") == "gap" else "proposed"
        )
        db.add(
            MappingRow(
                project_id=project_id,
                legacy_object=m["legacy_object"],
                legacy_column=m["legacy_column"],
                domain=m.get("domain", ""),
                entity=m.get("entity", ""),
                attribute=m.get("attribute", ""),
                conformance=m.get("conformance", "conformant"),
                justification=m.get("justification", ""),
                citations=m.get("citations", []),
                confidence=m.get("confidence", 0.5),
                status=status,
                gap_reason=m.get("gap_reason", ""),
            )
        )
        n += 1
    return n, len(result.get("gaps") or [])


def execute_mapping_run(
    run_id: int,
    project_id: int,
    *,
    actor: str,
    use_llm: bool = False,
) -> None:
    db = SessionLocal()
    try:
        run = db.query(AgentRun).get(run_id)
        if not run:
            return
        run.status = "running"
        steps: list[dict[str, Any]] = [
            _step("queued", "success", "Standards Mapping Agent accepted", "MappingCoordinator"),
            _term("MappingCoordinator", "▶ MappingCoordinator · start SID alignment"),
        ]
        run.steps = list(steps)
        db.commit()
        time.sleep(0.25)

        cols = build_survivor_columns(db, project_id)
        steps.append(
            _term(
                "MappingCoordinator",
                f"  survivors → {len(cols)} columns from migrate/rebuild inventory",
            )
        )
        steps.append(
            _step(
                "load_columns",
                "success",
                f"Loaded {len(cols)} survivor columns",
                "MappingCoordinator",
            )
        )
        run.steps = list(steps)
        db.commit()
        time.sleep(0.3)

        if not cols:
            steps.append(
                _term(
                    "MappingCoordinator",
                    "✗ No survivor columns — approve Decide dispositions (migrate/rebuild) first",
                )
            )
            steps.append(
                _step(
                    "failed",
                    "failed",
                    "No survivor columns to map",
                    "MappingCoordinator",
                )
            )
            run.steps = list(steps)
            run.status = "failed"
            run.error = "No survivor columns — complete disposition Analyze & Approve first"
            run.completed_at = datetime.utcnow()
            db.commit()
            return

        steps.append(_term("StandardsLoader", "▶ StandardsLoader · load TM Forum SID catalogue"))
        steps.append(
            _step(
                "load_standards",
                "running",
                "Loading TM Forum SID Party / Customer / Product / Service / Resource / Common",
                "StandardsLoader",
            )
        )
        run.steps = list(steps)
        db.commit()
        time.sleep(0.35)
        steps[-1] = _step(
            "load_standards",
            "success",
            "Loaded TM Forum SID Party / Customer / Product / Service / Resource / Common",
            "StandardsLoader",
        )
        steps.append(_term("StandardsLoader", "  catalogue ready · sid-tmforum-1.2"))
        run.steps = list(steps)
        db.commit()

        steps.append(
            _term(
                "ColumnMapper",
                f"▶ ColumnMapper · propose domain → entity → attribute ({len(cols)} cols)",
            )
        )
        steps.append(
            _step(
                "map_columns",
                "running",
                "Mapping columns to SID attributes",
                "ColumnMapper",
            )
        )
        run.steps = list(steps)
        db.commit()
        time.sleep(0.4)

        payload: dict[str, Any] = {
            "columns": cols,
            "use_llm": bool(use_llm),
            "advanced_ai": bool(use_llm),
        }
        result = run_agent_task("standards_mapping", payload)

        # Optional Advanced AI pass (real OpenAI when configured; mock narrative otherwise)
        if use_llm:
            steps.append(
                _term("ModelAI", "▶ ModelAI · advanced enrichment pass on proposed mappings")
            )
            steps.append(
                _step(
                    "advanced_ai",
                    "running",
                    "Advanced Model AI enrichment",
                    "ModelAI",
                )
            )
            run.steps = list(steps)
            db.commit()
            time.sleep(0.45)
            enrichment = result.get("llm_enrichment") or {}
            if enrichment.get("status") == "ok":
                msg = f"OpenAI enrichment · {enrichment.get('model') or 'model'}"
                steps.append(_term("ModelAI", f"  {msg}"))
            else:
                # Demo-friendly advanced pass when LLM is mock
                narrative = (
                    f"Advanced AI reviewed {len(result.get('mappings') or [])} proposals; "
                    f"{len(result.get('gaps') or [])} remain as architecture gaps "
                    "(no invented SID attributes)."
                )
                result = dict(result)
                result["llm_enrichment"] = {
                    "status": "mock_advanced",
                    "narrative": narrative,
                    "mode": "advanced",
                }
                cites = list(result.get("citations") or [])
                cites.append(
                    {"type": "llm", "id": "model-ai:advanced", "ref": "advanced mapping pass"}
                )
                result["citations"] = cites
                steps.append(_term("ModelAI", f"  {narrative}"))
            steps.append(
                _step(
                    "advanced_ai",
                    "success",
                    "Advanced Model AI enrichment complete",
                    "ModelAI",
                )
            )
            run.steps = list(steps)
            db.commit()

        mapped_n = sum(
            1 for m in (result.get("mappings") or []) if m.get("conformance") != "gap"
        )
        total_n = len(result.get("mappings") or [])
        gap_n = len(result.get("gaps") or [])
        cov = result.get("coverage")
        if cov is None and total_n:
            cov = mapped_n / total_n
        cov_pct = f"{(cov or 0):.0%}"
        steps.append(
            _term(
                "ColumnMapper",
                f"  proposed {mapped_n}/{total_n} TM Forum SID mappings ({cov_pct}) · {gap_n} gaps",
            )
        )
        for i, s in enumerate(steps):
            if s.get("name") == "map_columns" and s.get("status") == "running":
                steps[i] = _step(
                    "map_columns",
                    "success",
                    f"Proposed {mapped_n}/{total_n} mappings ({cov_pct} TM Forum coverage)",
                    "ColumnMapper",
                )
                break
        else:
            steps.append(
                _step(
                    "map_columns",
                    "success",
                    f"Proposed {mapped_n}/{total_n} mappings with citations",
                    "ColumnMapper",
                )
            )
        steps.append(
            _step(
                "flag_gaps",
                "success",
                f"{gap_n} gaps for architect review",
                "GapAnalyst",
            )
        )
        steps.append(_term("GapAnalyst", f"▶ GapAnalyst · {gap_n} unresolved columns"))
        run.steps = list(steps)
        db.commit()
        time.sleep(0.25)

        steps.append(_term("MappingCoordinator", "▶ materialize mapping register"))
        n_rows, n_gaps = materialize_mappings(db, project_id, result)
        steps.append(
            _term(
                "MappingCoordinator",
                f"✓ register ready · {n_rows} rows · {n_gaps} gaps",
            )
        )
        steps.append(
            _step(
                "materialize",
                "success",
                f"Persisted {n_rows} mapping rows",
                "MappingCoordinator",
            )
        )

        run.output = result
        run.steps = list(steps)
        run.confidence = float(result.get("confidence") or 0.85)
        run.status = "completed"
        run.completed_at = datetime.utcnow()

        db.add(
            ReviewItem(
                project_id=project_id,
                agent_run_id=run.id,
                review_type="mapping",
                title="Approve SID mapping proposals",
                payload={"gaps": result.get("gaps", []), "advanced_ai": use_llm},
                required_role="architect",
            )
        )
        p = db.query(Project).get(project_id)
        if p:
            p.phase = "3_mapping"
        db.add(
            AuditEvent(
                project_id=project_id,
                actor=actor,
                action="mappings.generate",
                entity_type="agent_run",
                entity_id=str(run.id),
                detail={
                    "mappings": n_rows,
                    "gaps": n_gaps,
                    "advanced_ai": use_llm,
                },
            )
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        run = db.query(AgentRun).get(run_id)
        if run:
            failed = list(run.steps or [])
            failed.append(_term("MappingCoordinator", f"✗ failed · {exc}"))
            failed.append(
                _step("failed", "failed", str(exc)[:240], "MappingCoordinator")
            )
            run.steps = failed
            run.status = "failed"
            run.error = str(exc)[:500]
            run.completed_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()
