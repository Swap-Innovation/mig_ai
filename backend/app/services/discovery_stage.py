"""Discovery stage chaining: status, artifact clear, HITL persistence."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.db import (
    DiscoveryRun,
    InventoryColumn,
    InventoryObject,
    JobNode,
    LineageEdge,
    Project,
    ReviewItem,
)


def latest_completed_run(
    db: Session, project_id: int, pipeline: str
) -> DiscoveryRun | None:
    rows = (
        db.query(DiscoveryRun)
        .filter_by(project_id=project_id, status="completed")
        .order_by(DiscoveryRun.id.desc())
        .limit(40)
        .all()
    )
    for r in rows:
        pipe = ((r.summary or {}) if isinstance(r.summary, dict) else {}).get("pipeline")
        if (pipe or "discover").lower() == pipeline.lower():
            return r
    return None


def clear_discovery_artifacts(db: Session, project_id: int) -> dict[str, int]:
    """Wipe inventory / lineage / jobs when estate source changes."""
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
    # Drop discovery HITL reviews so Review restarts against new estate
    n_rev = (
        db.query(ReviewItem)
        .filter_by(project_id=project_id, review_type="discovery_finding")
        .delete(synchronize_session=False)
    )
    return {
        "cleared_objects": int(n_obj or 0),
        "cleared_columns": int(n_cols or 0),
        "cleared_lineage": int(n_lin or 0),
        "cleared_jobs": int(n_jobs or 0),
        "cleared_reviews": int(n_rev or 0),
    }


def stage_status(db: Session, project: Project) -> dict[str, Any]:
    pid = project.id
    estate_bound = bool(project.legacy_root)
    discover = latest_completed_run(db, pid, "discover")
    inventory_run = latest_completed_run(db, pid, "inventory")
    inv_count = db.query(InventoryObject).filter_by(project_id=pid).count()
    edge_count = db.query(LineageEdge).filter_by(project_id=pid).count()
    job_count = db.query(JobNode).filter_by(project_id=pid).count()
    pending_hitl = (
        db.query(ReviewItem)
        .filter_by(project_id=pid, review_type="discovery_finding", status="pending")
        .count()
    )
    hitl_total = (
        db.query(ReviewItem)
        .filter_by(project_id=pid, review_type="discovery_finding")
        .count()
    )

    stages = [
        {
            "id": "source",
            "label": "Source",
            "ready": estate_bound,
            "detail": project.estate_label or project.legacy_root or "Not bound",
        },
        {
            "id": "discover",
            "label": "Activity",
            "ready": bool(discover),
            "run_id": discover.id if discover else None,
            "detail": (
                f"Completed run #{discover.id}"
                if discover
                else "Run discovery scan on Activity"
            ),
            "requires": ["source"],
        },
        {
            "id": "inventory",
            "label": "Inventory",
            "ready": bool(inventory_run) or inv_count > 0,
            "run_id": inventory_run.id if inventory_run else None,
            "object_count": inv_count,
            "detail": (
                f"{inv_count} objects"
                if inv_count
                else "Find inventory after Activity completes"
            ),
            "requires": ["source", "discover"],
        },
        {
            "id": "lineage",
            "label": "Lineage",
            "ready": edge_count > 0,
            "edge_count": edge_count,
            "job_count": job_count,
            "detail": (
                f"{edge_count} edges · {job_count} jobs"
                if edge_count
                else "Produced by inventory LineageStitcher"
            ),
            "requires": ["inventory"],
        },
        {
            "id": "review",
            "label": "Review",
            "ready": bool(project.inventory_signed_off),
            "pending_hitl": pending_hitl,
            "hitl_total": hitl_total,
            "detail": (
                "Signed off"
                if project.inventory_signed_off
                else f"{pending_hitl} HITL pending" if hitl_total else "Assess & sign off"
            ),
            "requires": ["inventory", "lineage"],
        },
    ]
    disk_stages: dict[str, Any] = {}
    migration_repo_path = ""
    try:
        from app.services.project_workspace import (
            STAGE_CHAIN,
            ensure_migration_repo,
            migration_repo,
            read_prior_stage,
        )

        ensure_migration_repo(project)
        migration_repo_path = str(migration_repo(project))
        for stage_name in STAGE_CHAIN:
            latest = read_prior_stage(project, stage_name)
            section, view = stage_name.split("/", 1)
            disk_stages.setdefault(section, {})[view] = {
                "ready": bool(latest),
                "run_id": (latest or {}).get("run_id"),
                "status": (latest or {}).get("status"),
                "path": f"{migration_repo_path}/{stage_name}",
                "stage": stage_name,
            }
    except Exception:
        pass
    return {
        "estate_bound": estate_bound,
        "legacy_root": project.legacy_root or "",
        "migration_repo": migration_repo_path,
        "discover_run_id": discover.id if discover else None,
        "inventory_run_id": inventory_run.id if inventory_run else None,
        "inventory_count": inv_count,
        "lineage_edge_count": edge_count,
        "job_count": job_count,
        "inventory_signed_off": bool(project.inventory_signed_off),
        "can_run_discover": estate_bound,
        "can_run_inventory": estate_bound and bool(discover),
        "can_signoff": inv_count > 0 and edge_count > 0 and pending_hitl == 0,
        "stages": stages,
        "disk_stages": disk_stages,
    }


def load_hitl_decisions(db: Session, project_id: int) -> dict[str, str]:
    rows = (
        db.query(ReviewItem)
        .filter_by(project_id=project_id, review_type="discovery_finding")
        .all()
    )
    out: dict[str, str] = {}
    for r in rows:
        payload = r.payload if isinstance(r.payload, dict) else {}
        key = str(payload.get("key") or r.title or "")
        if not key:
            continue
        if r.status == "approved":
            out[key] = "accepted"
        elif r.status == "rejected":
            out[key] = "flagged"
        elif payload.get("decision") in {"accepted", "flagged"}:
            out[key] = str(payload["decision"])
    return out


def save_hitl_decisions(
    db: Session,
    project_id: int,
    decisions: dict[str, str],
    *,
    reviewer: str,
    agent_run_id: int | None = None,
) -> dict[str, str]:
    """Upsert discovery_finding ReviewItems from key → accepted|flagged."""
    existing = {
        str((r.payload or {}).get("key") or r.title): r
        for r in db.query(ReviewItem)
        .filter_by(project_id=project_id, review_type="discovery_finding")
        .all()
    }
    for key, decision in decisions.items():
        if decision not in {"accepted", "flagged"}:
            continue
        status = "approved" if decision == "accepted" else "rejected"
        row = existing.get(key)
        if row:
            row.status = status
            row.reviewer = reviewer
            row.decision_notes = decision
            payload = dict(row.payload or {})
            payload.update({"key": key, "decision": decision})
            row.payload = payload
            if agent_run_id:
                row.agent_run_id = agent_run_id
        else:
            db.add(
                ReviewItem(
                    project_id=project_id,
                    agent_run_id=agent_run_id,
                    review_type="discovery_finding",
                    title=key[:255],
                    payload={"key": key, "decision": decision},
                    required_role="architect",
                    status=status,
                    reviewer=reviewer,
                    decision_notes=decision,
                )
            )
    db.commit()
    saved = load_hitl_decisions(db, project_id)
    try:
        from app.services.project_workspace import export_review_hitl

        project = db.query(Project).get(project_id)
        if project:
            export_review_hitl(project, saved, agent_run_id=agent_run_id)
    except Exception as exc:
        logger.exception(
            "Failed to export discover/review HITL for project %s: %s",
            project_id,
            exc,
        )
    return saved


def ensure_hitl_items_from_findings(
    db: Session,
    project_id: int,
    findings: list[dict[str, Any]],
    *,
    agent_run_id: int | None = None,
) -> int:
    """Create pending ReviewItems for low-confidence findings (idempotent by key)."""
    existing_keys = {
        str((r.payload or {}).get("key") or r.title)
        for r in db.query(ReviewItem)
        .filter_by(project_id=project_id, review_type="discovery_finding")
        .all()
    }
    created = 0
    for i, f in enumerate(findings or []):
        conf = f.get("confidence")
        try:
            c = float(conf) if conf is not None else 1.0
        except (TypeError, ValueError):
            c = 1.0
        if c > 1:
            c = c / 100.0
        if c >= 0.8:
            continue
        key = f"{str(f.get('object') or 'obj')}:{i}"
        if key in existing_keys:
            continue
        db.add(
            ReviewItem(
                project_id=project_id,
                agent_run_id=agent_run_id,
                review_type="discovery_finding",
                title=key[:255],
                payload={
                    "key": key,
                    "finding": f,
                    "created_at": datetime.utcnow().isoformat() + "Z",
                },
                required_role="architect",
                status="pending",
            )
        )
        created += 1
        existing_keys.add(key)
    if created:
        db.commit()
    return created
