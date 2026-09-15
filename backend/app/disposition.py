"""Disposition scoring: migrate | consolidate | rebuild | retire | archive-only."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.db import Disposition, InventoryColumn, InventoryObject, LineageEdge, Project


REBUILD_HINTS = ("truncate", "delete from", "drop table", "non-restartable")
CATEGORIES = ("migrate", "rebuild", "consolidate", "archive-only", "retire")


def score_disposition(
    obj: InventoryObject,
    dependents: list[str],
    lineage_logic: str = "",
    duplicate_of: str | None = None,
) -> dict[str, Any]:
    """Score a single inventory object (object-type aware)."""
    access = obj.access_count or 0
    consumers = obj.consumers or []
    retention = bool(obj.retention_required)
    otype = (obj.object_type or "table").lower()
    schema = (obj.schema_name or "").lower()
    name = (obj.name or "").lower()
    fqn = (obj.fully_qualified_name or "").lower()
    extra = obj.extra or {}

    evidence = {
        "access_count": access,
        "consumers": consumers,
        "dependents": dependents,
        "retention_required": retention,
        "last_accessed": obj.last_accessed.isoformat() if obj.last_accessed else None,
        "duplicate_of": duplicate_of,
        "object_type": otype,
        "schema": obj.schema_name,
    }

    # --- Structural / orchestration objects ---
    if otype == "repo":
        return _rec(
            "migrate",
            evidence,
            "Git estate root — retain as migration source of truth",
        )

    if otype == "dag":
        return _rec(
            "migrate",
            evidence,
            "Airflow / orchestration DAG — convert into target scheduler",
        )

    if otype == "script":
        # Scripts that write downstream tables follow those targets; unused scripts retire
        if dependents or access > 0 or consumers:
            return _rec(
                "migrate",
                evidence,
                "Script participates in active pipeline / has downstream dependents",
            )
        if "tmp" in name or "experiment" in name or "sandbox" in fqn:
            return _rec("retire", evidence, "Experimental / sandbox script with no dependents")
        return _rec(
            "retire",
            evidence,
            "Script has no observed consumers or downstream lineage",
        )

    # --- Tables & other catalog objects ---
    if duplicate_of:
        return _rec(
            "consolidate",
            evidence,
            "Near-duplicate of an actively consumed object",
            consolidate_into=duplicate_of,
        )

    # Sandbox / temp → retire
    if (
        schema in {"sandbox", "tmp", "temp"}
        or name.startswith("tmp_")
        or name.startswith("temp_")
        or "experiment" in name
    ):
        return _rec(
            "retire",
            evidence,
            f"{otype.title()} in sandbox/temp namespace — not a migration candidate",
        )

    # Archive / historical → archive-only (or retire if no retention)
    if (
        schema in {"archive", "archive_src", "hist"}
        or "hist_" in name
        or name.endswith("_hist")
        or "_201" in name  # year-suffixed archives e.g. cust_hist_2012
    ):
        if retention:
            return _rec(
                "archive-only",
                evidence,
                "Historical / archive object with retention obligation",
            )
        return _rec(
            "archive-only" if access == 0 else "migrate",
            evidence,
            "Historical archive object — cold store unless still queried",
        )

    logic_lower = (lineage_logic or "").lower()
    unsound = any(h in logic_lower for h in REBUILD_HINTS) or bool(
        extra.get("unsound_logic")
    )

    if access == 0 and not consumers and not dependents:
        if retention:
            return _rec(
                "archive-only",
                evidence,
                "No consumption but retention/audit obligation applies",
            )
        return _rec(
            "retire",
            evidence,
            "No consumption in observation window and no downstream dependency",
        )

    if unsound and (access > 0 or consumers):
        return _rec(
            "rebuild",
            evidence,
            "Actively consumed but logic is unsound or non-restartable",
        )

    # Reference / dimension-like tables → migrate (small, shared)
    if schema in {"ref", "refs", "dim"} or name.startswith("ref_"):
        return _rec(
            "migrate",
            evidence,
            "Reference / dimension object — migrate with consuming products",
        )

    # Marts with usage → migrate
    if schema in {"marts", "mart", "dm"} or name.startswith("dm_"):
        return _rec(
            "migrate",
            evidence,
            "Downstream mart — migrate or rebuild with the consuming product",
        )

    return _rec(
        "migrate",
        evidence,
        "Actively consumed with sound logic",
    )


def _rec(
    recommendation: str,
    evidence: dict[str, Any],
    rationale: str,
    *,
    consolidate_into: str | None = None,
) -> dict[str, Any]:
    return {
        "recommendation": recommendation,
        "evidence": evidence,
        "consolidate_into": consolidate_into,
        "rationale": rationale,
    }


def build_dependents_map(edges: list[LineageEdge]) -> dict[str, list[str]]:
    deps: dict[str, list[str]] = {}
    for e in edges:
        deps.setdefault(e.source_fqn, []).append(e.target_fqn)
    return deps


def objects_for_disposition(db: Session, project_id: int) -> list[InventoryObject]:
    """Tables, scripts, repos, and DAGs — scoped to active wave when Plan is approved."""
    rows = (
        db.query(InventoryObject)
        .filter(
            InventoryObject.project_id == project_id,
            InventoryObject.object_type.in_(("table", "script", "repo", "dag")),
        )
        .order_by(InventoryObject.object_type, InventoryObject.fully_qualified_name)
        .all()
    )
    project = db.query(Project).get(project_id)
    if not project or not project.plan_approved:
        return rows
    from app.services.wave_plan import active_wave_object_ids

    scoped = active_wave_object_ids(project)
    if scoped is None:
        return rows
    allow = set(scoped)
    return [r for r in rows if r.id in allow]


def hydrate_inventory_from_discover_disk(db: Session, project: Project) -> dict[str, int]:
    """If DB inventory empty, load objects + edges from migration-repo Discover stages."""
    existing = (
        db.query(InventoryObject).filter_by(project_id=project.id).count()
    )
    if existing:
        return {"hydrated_objects": 0, "hydrated_edges": 0, "source": "db"}

    from app.services.project_workspace import read_json, read_prior_stage

    inv_latest = read_prior_stage(project, "discover/inventory")
    objects = read_json(project, "discover/inventory", "objects.json")
    edges = read_json(project, "discover/lineage", "edges.json")
    if not isinstance(objects, list) or not objects:
        # legacy flat paths
        objects = read_json(project, "inventory", "objects.json")
        edges = edges or read_json(project, "lineage", "edges.json")
        inv_latest = inv_latest or read_prior_stage(project, "inventory")
    if not isinstance(objects, list) or not objects:
        return {"hydrated_objects": 0, "hydrated_edges": 0, "source": "none"}

    n_obj = 0
    for row in objects:
        otype = (row.get("object_type") or "table").lower()
        if otype not in {"table", "script", "repo", "dag"}:
            continue
        fqn = row.get("fully_qualified_name") or row.get("name") or ""
        if not fqn:
            continue
        clash = (
            db.query(InventoryObject)
            .filter_by(project_id=project.id, fully_qualified_name=fqn)
            .first()
        )
        if clash:
            continue
        obj = InventoryObject(
            project_id=project.id,
            discovery_run_id=row.get("discovery_run_id")
            or (inv_latest or {}).get("run_id"),
            object_type=otype,
            schema_name=row.get("schema_name") or "",
            name=row.get("name") or fqn.split(".")[-1],
            fully_qualified_name=fqn,
            source_path=row.get("source_path") or "",
            description=row.get("description") or "",
            row_count=row.get("row_count"),
            access_count=int(row.get("access_count") or 0),
            consumers=row.get("consumers") or [],
            profile=row.get("profile") or {},
            retention_required=bool(row.get("retention_required")),
            extra={
                **(row.get("extra") or {}),
                "hydrated_from": "migration-repo/discover/inventory/objects.json",
            },
        )
        db.add(obj)
        db.flush()
        for col in row.get("columns") or []:
            db.add(
                InventoryColumn(
                    object_id=obj.id,
                    name=col.get("name") or "col",
                    data_type=col.get("data_type") or "VARCHAR",
                    nullable=bool(col.get("nullable", True)),
                    is_pk=bool(col.get("is_pk")),
                    null_rate=col.get("null_rate"),
                    distinct_count=col.get("distinct_count"),
                )
            )
        n_obj += 1

    n_edge = 0
    if isinstance(edges, list):
        for e in edges:
            src = e.get("source_fqn")
            tgt = e.get("target_fqn")
            if not src or not tgt:
                continue
            db.add(
                LineageEdge(
                    project_id=project.id,
                    discovery_run_id=e.get("discovery_run_id")
                    or (inv_latest or {}).get("run_id"),
                    source_fqn=src,
                    target_fqn=tgt,
                    transformation=e.get("transformation") or "",
                    job_name=e.get("job_name") or "",
                    edge_type=e.get("edge_type") or "data",
                )
            )
            n_edge += 1
    db.flush()
    return {
        "hydrated_objects": n_obj,
        "hydrated_edges": n_edge,
        "source": "disk",
        "inventory_run_id": (inv_latest or {}).get("run_id"),
    }


def clear_dispositions(db: Session, project_id: int) -> int:
    n = db.query(Disposition).filter_by(project_id=project_id).delete()
    db.flush()
    return n


def materialize_dispositions(
    db: Session,
    project_id: int,
    *,
    agent_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Score all disposition-eligible objects and replace the register."""
    objs = objects_for_disposition(db, project_id)
    edges = db.query(LineageEdge).filter_by(project_id=project_id).all()
    deps = build_dependents_map(edges)
    clear_dispositions(db, project_id)

    by_type: dict[str, int] = {}
    by_rec: dict[str, int] = {}
    created = 0
    recommendations: list[dict[str, Any]] = []

    for obj in objs:
        logic = ""
        fqn = obj.fully_qualified_name or ""
        for e in edges:
            if e.target_fqn == fqn or e.source_fqn == fqn:
                logic += " " + (e.transformation or "")
        if (obj.extra or {}).get("unsound_logic"):
            logic += " truncate"

        scored = score_disposition(
            obj,
            deps.get(fqn, []),
            logic,
            (obj.extra or {}).get("duplicate_of"),
        )
        rec = scored["recommendation"]
        otype = obj.object_type or "table"
        by_type[otype] = by_type.get(otype, 0) + 1
        by_rec[rec] = by_rec.get(rec, 0) + 1

        evidence = {
            **scored["evidence"],
            "rationale": scored["rationale"],
            "agent": agent_meta or {"source": "DispositionRecommender"},
        }
        db.add(
            Disposition(
                project_id=project_id,
                object_id=obj.id,
                recommendation=rec,
                final=rec,
                override=None,
                evidence=evidence,
                consolidate_into=scored.get("consolidate_into"),
                retirement_state="none",
                approved=False,
            )
        )
        created += 1
        recommendations.append(
            {
                "object_id": obj.id,
                "fqn": fqn,
                "object_type": otype,
                "recommendation": rec,
                "rationale": scored["rationale"],
            }
        )

    p = db.query(Project).get(project_id)
    if p:
        p.phase = "2_disposition"
        # Fresh analyze invalidates prior approval
        p.disposition_approved = False

    return {
        "dispositions": created,
        "by_object_type": by_type,
        "by_recommendation": by_rec,
        "recommendations": recommendations,
    }


RETIREMENT_FLOW = ["notified", "frozen", "silence", "archived", "decommissioned"]


def next_retirement_state(current: str) -> str:
    if current == "none":
        return "notified"
    if current not in RETIREMENT_FLOW:
        return "notified"
    idx = RETIREMENT_FLOW.index(current)
    if idx >= len(RETIREMENT_FLOW) - 1:
        return current
    return RETIREMENT_FLOW[idx + 1]
