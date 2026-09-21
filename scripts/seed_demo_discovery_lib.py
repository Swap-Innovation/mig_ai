"""Seed GitHub Pages demo fixtures with Atlas discovery + profiling data."""
from __future__ import annotations

import json
from pathlib import Path


def _clean_paths(obj):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if isinstance(v, str) and (
                "/Users/" in v or "/Desktop/github/" in v or "/sample-data/" in v
            ):
                if "sample-data/" in v:
                    out[k] = v.split("sample-data/", 1)[-1]
                elif "migration-repo/" in v:
                    out[k] = "migration-repo/" + v.split("migration-repo/", 1)[-1]
                elif "legacy/" in v:
                    out[k] = "legacy/" + v.split("legacy/", 1)[-1]
                else:
                    out[k] = Path(v).name
            else:
                out[k] = _clean_paths(v)
        return out
    if isinstance(obj, list):
        return [_clean_paths(x) for x in obj]
    return obj


def _step_rows(raw_steps, run_id: int):
    out = []
    for i, s in enumerate(raw_steps, start=1):
        out.append(
            {
                "id": run_id * 1000 + i,
                "seq": s.get("seq", i),
                "name": s.get("name"),
                "status": s.get("status") or "success",
                "message": s.get("message") or "",
                "detail": s.get("detail") or {},
                "duration_ms": s.get("duration_ms"),
                "created_at": s.get("created_at") or "2026-09-21T04:15:00Z",
            }
        )
    return out


def seed(root: Path, project_id: int = 5) -> dict:
    store_path = root / "frontend/lib/demo/fixtures/store.json"
    demo = root / "sample-data/projects/demo/migration-repo/discover"
    store = json.loads(store_path.read_text())

    act_summary = _clean_paths(json.loads((demo / "activity/summary.json").read_text()))
    act_steps = _clean_paths(json.loads((demo / "activity/steps.json").read_text()))
    inv_summary = _clean_paths(json.loads((demo / "inventory/summary.json").read_text()))
    objects = _clean_paths(json.loads((demo / "inventory/objects.json").read_text()))
    edges = _clean_paths(json.loads((demo / "lineage/edges.json").read_text()))
    jobs = _clean_paths(json.loads((demo / "lineage/jobs.json").read_text()))

    inv_out = []
    for o in objects:
        profile = o.get("profile") or {}
        cols = []
        for c in o.get("columns") or []:
            if not isinstance(c, dict):
                cols.append(c)
                continue
            cols.append(
                {
                    **c,
                    "data_type": c.get("data_type") or c.get("type") or "string",
                    "null_rate": c.get("null_rate", c.get("nulls_pct")),
                    "distinct_count": c.get("distinct_count", c.get("distinct")),
                    "is_pk": c.get("is_pk", c.get("name") in (profile.get("pk_columns") or [])),
                }
            )
        inv_out.append(
            {
                **o,
                "object_type": o.get("object_type") or o.get("type") or "table",
                "fully_qualified_name": o.get("fully_qualified_name") or o.get("name"),
                "columns": cols,
                "profile": {**profile, "pii_columns": profile.get("pii_columns") or []},
                "consumers": o.get("consumers") or profile.get("usage_sources") or [],
            }
        )

    nodes: set[str] = set()
    edge_list = []
    for i, e in enumerate(edges, start=1):
        src = e.get("source") or e.get("source_fqn") or e.get("from")
        tgt = e.get("target") or e.get("target_fqn") or e.get("to")
        if not src or not tgt:
            continue
        if str(src).startswith("dag:") or str(tgt).startswith("dag:"):
            continue
        nodes.add(src)
        nodes.add(tgt)
        edge_list.append(
            {
                "id": e.get("id", i),
                "source": src,
                "target": tgt,
                "transformation": e.get("transformation") or e.get("transform") or "",
                "job_name": e.get("job_name") or e.get("job") or "",
                "edge_type": e.get("edge_type") or e.get("type") or "data",
            }
        )

    lineage = {
        "nodes": [{"id": n, "label": n} for n in sorted(nodes)],
        "edges": edge_list,
        "stats": {
            "edge_count": len(edge_list),
            "node_count": len(nodes),
            "source": "demo_fixtures",
        },
    }

    jobs_out = [
        {
            "id": j.get("id"),
            "name": j.get("name"),
            "schedule": j.get("schedule") or j.get("cron"),
            "script_path": j.get("script_path") or j.get("path") or "",
            "depends_on": j.get("depends_on") or j.get("deps") or [],
            "params": j.get("params") or {},
        }
        for j in jobs
    ]

    discover_steps = _step_rows(act_steps, 3)
    inv_steps_raw = [
        {
            "seq": 1,
            "name": "queued",
            "status": "success",
            "message": "Profiling pipeline queued",
            "detail": {"pipeline": "inventory", "agent": "DiscoveryCoordinator"},
        },
        {
            "seq": 2,
            "name": "inventory.profile",
            "status": "success",
            "message": f"Profiled {len(inv_out)} inventory objects",
            "detail": {"agent": "InventoryProfiler", "objects": len(inv_out)},
        },
        {
            "seq": 3,
            "name": "lineage.stitch",
            "status": "success",
            "message": f"Stitched {len(edge_list)} lineage edges",
            "detail": {"agent": "LineageStitcher", "edges": len(edge_list)},
        },
        {
            "seq": 4,
            "name": "terminal.log",
            "status": "success",
            "message": "Profiling completed",
            "detail": {"kind": "terminal", "agent": "InventoryProfiler"},
        },
    ]
    inventory_steps = _step_rows(inv_steps_raw, 4)

    discover_run = {
        "id": 3,
        "status": "completed",
        "source_type": "sample",
        "legacy_root": "sample-data/projects/demo/legacy",
        "summary": {
            **act_summary,
            "pipeline": "discover",
            "confidence": act_summary.get("confidence", 0.94),
            "terminal_log": [
                {
                    "agent": "DiscoveryCoordinator",
                    "line": "Discovery scan complete — estate ready for profiling.",
                },
                {
                    "agent": "SqlLeafScanner",
                    "line": f"Parsed {act_summary.get('sql_files', 0)} SQL files.",
                },
            ],
        },
        "error": None,
        "created_at": "2026-09-21T04:14:10Z",
        "completed_at": "2026-09-21T04:15:55Z",
        "steps": discover_steps,
    }
    inventory_run = {
        "id": 4,
        "status": "completed",
        "source_type": "sample",
        "legacy_root": "sample-data/projects/demo/legacy",
        "summary": {
            **inv_summary,
            "pipeline": "inventory",
            "confidence": inv_summary.get("confidence", 0.95),
            "objects": len(inv_out),
            "lineage_edges": len(edge_list),
            "activity_run_id": 3,
            "terminal_log": [
                {
                    "agent": "InventoryProfiler",
                    "line": f"Catalogued {len(inv_out)} objects.",
                },
                {
                    "agent": "LineageStitcher",
                    "line": f"Built lineage graph with {len(edge_list)} edges.",
                },
            ],
        },
        "error": None,
        "created_at": "2026-09-21T04:16:00Z",
        "completed_at": "2026-09-21T04:17:21Z",
        "steps": inventory_steps,
    }

    pid = project_id
    store[f"GET /projects/{pid}/discovery/runs"] = [inventory_run, discover_run]
    store[f"GET /projects/{pid}/inventory"] = inv_out
    store[f"GET /projects/{pid}/jobs"] = jobs_out
    store[f"GET /projects/{pid}/lineage"] = lineage
    store[f"GET /projects/{pid}/discovery/hitl"] = {
        "decisions": {
            "table:legacy.fact_invoice": {
                "decision": "migrate",
                "rationale": "Core billing fact — high consumer count",
                "decided_by": "architect@demo.local",
            },
            "table:legacy.dim_account": {
                "decision": "migrate",
                "rationale": "Shared dimension for CRM and billing",
                "decided_by": "architect@demo.local",
            },
            "dag:billing_finance_daily": {
                "decision": "rebuild",
                "rationale": "Airflow DAG → Composer equivalent",
                "decided_by": "engineer@demo.local",
            },
        }
    }
    est = store.get(f"GET /projects/{pid}/estate") or {}
    if isinstance(est, dict):
        store[f"GET /projects/{pid}/estate"] = {
            **est,
            "exists": True,
            "ready": True,
            "discovery_hint": "Demo fixtures loaded — discovery & profiling ready",
        }

    store_path.write_text(json.dumps(store, indent=2) + "\n")
    return {
        "runs": 2,
        "inventory": len(inv_out),
        "jobs": len(jobs_out),
        "edges": len(edge_list),
        "steps": len(discover_steps),
        "bytes": store_path.stat().st_size,
    }
