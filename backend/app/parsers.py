"""Deterministic parsers for SQL, shell scripts, and scheduler definitions."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import sqlglot
from sqlglot import exp


def parse_sql_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    sources: set[str] = set()
    targets: set[str] = set()
    joins: list[str] = []
    filters: list[str] = []
    try:
        statements = sqlglot.parse(text, read="postgres")
    except Exception as exc:
        statements = []
        # fallback regex
        for m in re.finditer(r"(?:FROM|JOIN)\s+([a-zA-Z0-9_\.]+)", text, re.I):
            sources.add(m.group(1).lower())
        for m in re.finditer(
            r"(?:INSERT\s+INTO|CREATE\s+TABLE|MERGE\s+INTO)\s+([a-zA-Z0-9_\.]+)",
            text,
            re.I,
        ):
            targets.add(m.group(1).lower())
        return {
            "path": str(path),
            "sources": sorted(sources),
            "targets": sorted(targets),
            "joins": joins,
            "filters": filters,
            "raw_preview": text[:500],
            "parser": "regex_fallback",
            "parser_warning": str(exc)[:200],
        }

    for stmt in statements:
        if stmt is None:
            continue
        for table in stmt.find_all(exp.Table):
            name = ".".join(p.name for p in [table.catalog, table.db, table] if p and getattr(p, "name", None))
            if not name:
                name = table.name
            name = name.lower()
            # heuristic: INSERT/CREATE targets
            parent = table.parent
            while parent is not None and not isinstance(
                parent, (exp.Insert, exp.Create, exp.Merge, exp.Select, exp.From, exp.Join)
            ):
                parent = parent.parent
            if isinstance(parent, (exp.Insert, exp.Create, exp.Merge)):
                targets.add(name)
            else:
                sources.add(name)
        for j in stmt.find_all(exp.Join):
            joins.append(j.sql())
        for w in stmt.find_all(exp.Where):
            filters.append(w.sql())

    # Also catch CREATE TABLE AS / INSERT targets via regex backup
    for m in re.finditer(
        r"(?:INSERT\s+INTO|CREATE\s+(?:OR\s+REPLACE\s+)?TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+([a-zA-Z0-9_\.]+)",
        text,
        re.I,
    ):
        targets.add(m.group(1).lower())

    return {
        "path": str(path),
        "sources": sorted(sources - targets),
        "targets": sorted(targets),
        "joins": joins[:20],
        "filters": filters[:20],
        "raw_preview": text[:500],
        "parser": "sqlglot",
    }


def parse_shell_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    params = re.findall(r"\$\{?([A-Z_][A-Z0-9_]*)\}?", text)
    files = re.findall(r"(?:^|\s)(/[^\s]+\.\w+|\$\{?\w+\}?/[^\s]+)", text)
    cred_refs = [
        m
        for m in re.findall(r"(?:PASSWORD|SECRET|TOKEN|KEY|CREDENTIAL)[_A-Z0-9]*", text, re.I)
    ]
    # never capture values — only variable names / keys
    control = []
    if re.search(r"\bif\b", text):
        control.append("conditional")
    if re.search(r"\bfor\b|\bwhile\b", text):
        control.append("loop")
    if re.search(r"\bexit\b", text):
        control.append("exit_codes")
    return {
        "path": str(path),
        "params": sorted(set(params)),
        "file_interfaces": sorted(set(files))[:30],
        "credential_refs": sorted(set(cred_refs)),
        "control_flow": control,
        "raw_preview": text[:400],
    }


def parse_scheduler_file(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    jobs: list[dict[str, Any]] = []
    if path.suffix.lower() in {".json"}:
        data = json.loads(text)
        for job in data.get("jobs", data if isinstance(data, list) else []):
            jobs.append(
                {
                    "name": job.get("name", "unknown"),
                    "schedule": job.get("schedule", job.get("cron", "")),
                    "sla_minutes": job.get("sla_minutes"),
                    "script_path": job.get("script", job.get("script_path", job.get("command", ""))),
                    "depends_on": job.get("depends_on", []),
                    "params": job.get("params", {}),
                }
            )
    elif path.suffix.lower() in {".yml", ".yaml"}:
        # minimal YAML-ish parse without requiring PyYAML for schedule files we control as JSON
        # but we include YAML support via pyyaml in requirements
        import yaml

        data = yaml.safe_load(text) or {}
        for job in data.get("jobs", []):
            jobs.append(
                {
                    "name": job.get("name", "unknown"),
                    "schedule": job.get("schedule", ""),
                    "sla_minutes": job.get("sla_minutes"),
                    "script_path": job.get("script", ""),
                    "depends_on": job.get("depends_on", []),
                    "params": job.get("params", {}),
                }
            )
    else:
        # crontab-like
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) >= 6:
                jobs.append(
                    {
                        "name": parts[-1],
                        "schedule": " ".join(parts[:5]),
                        "sla_minutes": None,
                        "script_path": parts[5] if len(parts) > 5 else "",
                        "depends_on": [],
                        "params": {},
                    }
                )
    return {"path": str(path), "jobs": jobs}


def load_repo_meta(root: Path) -> dict[str, Any]:
    """Read git-shaped warehouse repo metadata (repo.json) if present."""
    for name in ("repo.json", ".lumina-repo.json"):
        path = root / name
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                data["_path"] = str(path)
                return data
            except Exception:
                return {"_path": str(path), "error": "invalid repo.json"}
    return {}


def parse_dag_directory(dag_dir: Path) -> dict[str, Any]:
    """
    Parse an on-prem DW DAG folder:
      dags/<dag_id>/dag.json + scripts/ + sql/
    """
    meta_path = dag_dir / "dag.json"
    if not meta_path.exists():
        # also accept dag.yaml
        yml = dag_dir / "dag.yaml"
        if yml.exists():
            import yaml

            data = yaml.safe_load(yml.read_text(encoding="utf-8")) or {}
            meta_path = yml
        else:
            return {}
    else:
        data = json.loads(meta_path.read_text(encoding="utf-8"))

    dag_id = str(data.get("id") or dag_dir.name)
    tasks_out: list[dict[str, Any]] = []
    for task in data.get("tasks") or []:
        tid = str(task.get("id") or task.get("name") or "task")
        script_rel = task.get("script") or task.get("script_path") or ""
        sql_rels = list(task.get("sql") or [])
        script_abs = (dag_dir / script_rel).resolve() if script_rel else None
        sql_abs = [(dag_dir / s).resolve() for s in sql_rels]
        # Infer SQL refs from shell if not declared
        if script_abs and script_abs.exists() and not sql_abs:
            try:
                text = script_abs.read_text(encoding="utf-8", errors="ignore")
                for m in re.finditer(r"([^\s\"']+\.sql)", text):
                    cand = (script_abs.parent / m.group(1)).resolve()
                    if not cand.exists():
                        cand = (dag_dir / m.group(1)).resolve()
                    if cand.exists():
                        sql_abs.append(cand)
                        sql_rels.append(str(cand.relative_to(dag_dir)))
            except Exception:
                pass
        tasks_out.append(
            {
                "id": tid,
                "name": task.get("name") or tid,
                "full_name": f"{dag_id}.{tid}",
                "script": script_rel,
                "script_path": str(script_abs) if script_abs else "",
                "spark": task.get("spark") or "",
                "sql": sql_rels,
                "sql_paths": [str(p) for p in sql_abs if p.exists()],
                "depends_on": [
                    d if "." in str(d) else f"{dag_id}.{d}" for d in (task.get("depends_on") or [])
                ],
                "sla_minutes": task.get("sla_minutes"),
                "writes": task.get("writes") or [],
                "upstream_dags": task.get("upstream_dags") or [],
                "params": task.get("params") or {},
            }
        )

    return {
        "id": dag_id,
        "name": data.get("name") or dag_id,
        "description": data.get("description") or "",
        "schedule": data.get("schedule") or "",
        "owner": data.get("owner") or "",
        "tags": data.get("tags") or [],
        "engine": data.get("engine") or "",
        "timezone": data.get("timezone") or "UTC",
        "path": str(dag_dir),
        "meta_path": str(meta_path),
        "tasks": tasks_out,
    }


def discover_dag_dirs(root: Path) -> list[Path]:
    dags_root = root / "dags"
    if not dags_root.is_dir():
        return []
    out: list[Path] = []
    for child in sorted(dags_root.iterdir()):
        if child.is_dir() and ((child / "dag.json").exists() or (child / "dag.yaml").exists()):
            out.append(child)
    return out


def discover_legacy_tree(root: Path) -> dict[str, Any]:
    sql_results = []
    shell_results = []
    scheduler_results = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() in {".sql"}:
            sql_results.append(parse_sql_file(path))
        elif path.suffix.lower() in {".sh", ".bash", ".ksh"}:
            shell_results.append(parse_shell_file(path))
        elif path.name in {"scheduler.json", "scheduler.yml", "scheduler.yaml", "crontab.txt"} or (
            "scheduler" in path.parts
        ):
            if path.suffix.lower() in {".json", ".yml", ".yaml", ".txt"}:
                scheduler_results.append(parse_scheduler_file(path))
    dags = [parse_dag_directory(d) for d in discover_dag_dirs(root)]
    dags = [d for d in dags if d]
    return {
        "sql": sql_results,
        "scripts": shell_results,
        "schedulers": scheduler_results,
        "dags": dags,
        "repo": load_repo_meta(root),
    }
