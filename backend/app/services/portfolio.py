"""Portfolio dashboard KPI aggregator for Mirage Suite."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, load_only

from app.db import (
    AgentRun,
    AuditEvent,
    BuildArtifact,
    DataProduct,
    DiscoveryRun,
    Disposition,
    InventoryObject,
    MappingRow,
    Project,
    ReconciliationResult,
    ReviewItem,
)

SUITE_STAGES = (
    ("atlas", "1_discovery"),
    ("horizon", "2_plan"),
    ("verdict", "2_disposition"),
    ("compass", "3_mapping"),
    ("forge", "4_build"),
    ("prove", "5_pilot_product"),
    ("transit", "6_migrate"),
    ("sunset", "7_decommission"),
)

STAGE_ORDER = [s[0] for s in SUITE_STAGES]
PHASE_TO_STAGE = {phase: tool for tool, phase in SUITE_STAGES}
PHASE_TO_STAGE["0_mobilisation"] = "atlas"

AVOID_FINALS = {"retire", "archive-only", "consolidate"}
SURVIVOR_FINALS = {"migrate", "rebuild"}
UNIT_COST_USD = 85

STAGE_LABELS = {
    "atlas": "Discover",
    "horizon": "Plan",
    "verdict": "Decide",
    "compass": "Align",
    "forge": "Build",
    "prove": "Pilot",
    "transit": "Migrate",
    "sunset": "Retire",
}


def _prod_signoff(project: Project) -> dict[str, Any]:
    pe = project.prod_env if isinstance(project.prod_env, dict) else {}
    return pe.get("signoff") if isinstance(pe.get("signoff"), dict) else {}


def _freeze_applied(project: Project) -> bool:
    fr = project.freeze_register if isinstance(project.freeze_register, dict) else {}
    if fr.get("published_at") or fr.get("status") == "published":
        return True
    pe = project.prod_env if isinstance(project.prod_env, dict) else {}
    return bool(pe.get("legacy_frozen") or pe.get("freeze_applied"))


def suite_stage_for_project(project: Project) -> str:
    if project.change_closed or project.status == "closed":
        return "sunset"
    signoff = _prod_signoff(project)
    if signoff.get("signed_at") or project.phase == "7_decommission":
        return "sunset" if project.change_closed else "transit"
    if project.phase == "6_migrate" or project.prod_env_ready:
        return "transit"
    if project.build_approved or project.phase == "5_pilot_product" or (
        isinstance(project.phase, str) and project.phase.startswith("5")
    ):
        return "prove"
    if project.metadata_complete and project.mapping_approved and not project.build_approved:
        return "forge"
    if project.disposition_approved and not project.metadata_complete:
        return "compass"
    if project.plan_approved and not project.disposition_approved:
        return "verdict"
    if project.inventory_signed_off and not project.plan_approved:
        return "horizon"
    if project.mobilisation_ready or project.phase in (
        "1_discovery",
        "2_plan",
        "2_disposition",
        "3_mapping",
        "4_build",
        "4_metadata",
        "0_mobilisation",
    ):
        return "atlas"
    return PHASE_TO_STAGE.get(project.phase or "", "atlas")


def _is_gated(project: Project) -> bool:
    if project.change_closed or project.status == "closed":
        return False
    stage = suite_stage_for_project(project)
    checks = {
        "atlas": project.inventory_signed_off,
        "horizon": project.plan_approved,
        "verdict": project.disposition_approved,
        "compass": project.mapping_approved and project.metadata_complete,
        "forge": project.build_approved,
        "prove": project.test_env_ready,
        "transit": bool(_prod_signoff(project).get("signed_at")),
        "sunset": project.change_closed,
    }
    return not bool(checks.get(stage))


def _is_complete(project: Project) -> bool:
    return bool(project.change_closed or project.status == "closed")


def _days_in_stage(project: Project) -> float:
    anchor = project.last_synced_at or project.created_at
    if not anchor:
        return 0.0
    delta = datetime.utcnow() - anchor
    return round(max(delta.total_seconds() / 86400.0, 0.0), 1)


def _in_window(dt: Optional[datetime], since: Optional[datetime]) -> bool:
    if since is None or dt is None:
        return True
    return dt >= since


def _count_by_project(db: Session, model, pids: list[int], *extra_filters) -> dict[int, int]:
    if not pids:
        return {}
    q = db.query(model.project_id, func.count()).filter(model.project_id.in_(pids))
    for f in extra_filters:
        q = q.filter(f)
    return {int(pid): int(n) for pid, n in q.group_by(model.project_id).all()}


def build_portfolio_dashboard(
    db: Session,
    project_id: Optional[int] = None,
    days: Optional[int] = None,
) -> dict[str, Any]:
    """Aggregate portfolio KPIs. Optional project_id / days scope analytics only."""
    all_projects = (
        db.query(Project)
        .options(
            load_only(
                Project.id,
                Project.name,
                Project.sample_slug,
                Project.phase,
                Project.status,
                Project.change_closed,
                Project.inventory_signed_off,
                Project.plan_approved,
                Project.disposition_approved,
                Project.mapping_approved,
                Project.metadata_complete,
                Project.build_approved,
                Project.test_env_ready,
                Project.prod_env_ready,
                Project.mobilisation_ready,
                Project.created_at,
                Project.last_synced_at,
                Project.prod_env,
                Project.test_env,
                Project.freeze_register,
            )
        )
        .order_by(Project.id)
        .all()
    )
    # Hide App Store sandbox from portfolio KPIs
    all_projects = [
        p
        for p in all_projects
        if (p.sample_slug or "") != "mirage-app-sandbox"
        and (p.name or "") != "App Store sandbox"
    ]
    projects = (
        [p for p in all_projects if p.id == project_id]
        if project_id
        else list(all_projects)
    )
    pids = [p.id for p in projects]
    since = (
        datetime.utcnow() - timedelta(days=int(days))
        if days and int(days) > 0
        else None
    )

    active = [p for p in projects if not (p.change_closed or p.status == "closed")]
    complete = [p for p in projects if p.change_closed or p.status == "closed"]

    stage_counts: Counter[str] = Counter()
    days_by_stage: dict[str, list[float]] = {s: [] for s in STAGE_ORDER}
    gated_n = 0
    for p in projects:
        stage = suite_stage_for_project(p)
        stage_counts[stage] += 1
        days_by_stage[stage].append(_days_in_stage(p))
        if _is_gated(p):
            gated_n += 1

    pct_by_stage = {}
    total_p = len(projects) or 1
    for sid in STAGE_ORDER:
        n = stage_counts.get(sid, 0)
        pct_by_stage[sid] = round((n / total_p) * 100, 1) if projects else 0.0

    avg_days = {
        sid: round(sum(vals) / len(vals), 1) if vals else 0.0
        for sid, vals in days_by_stage.items()
    }

    inv_total = 0
    if pids:
        inv_total = (
            db.query(func.count(InventoryObject.id))
            .filter(InventoryObject.project_id.in_(pids))
            .scalar()
            or 0
        )

    by_final: Counter[str] = Counter()
    if pids:
        for final, n in (
            db.query(Disposition.final, func.count())
            .filter(Disposition.project_id.in_(pids))
            .group_by(Disposition.final)
            .all()
        ):
            by_final[str(final or "")] = int(n)
    survivors = sum(by_final[f] for f in SURVIVOR_FINALS)
    avoided = sum(by_final[f] for f in AVOID_FINALS)
    disp_total = sum(by_final.values())
    avoid_pct = round((avoided / disp_total) * 100, 1) if disp_total else 0.0
    monthly_avoid = avoided * UNIT_COST_USD

    recon_q = db.query(ReconciliationResult.passed, ReconciliationResult.created_at)
    if pids:
        recon_q = recon_q.filter(ReconciliationResult.project_id.in_(pids))
    recon_rows = recon_q.all()
    if since:
        recon_rows = [r for r in recon_rows if _in_window(r.created_at, since)]
    recon_pass = sum(1 for r in recon_rows if r.passed)
    recon_rate = round((recon_pass / len(recon_rows)) * 100, 1) if recon_rows else None

    open_hitl = 0
    if pids:
        open_hitl = (
            db.query(func.count(ReviewItem.id))
            .filter(
                ReviewItem.project_id.in_(pids),
                ReviewItem.review_type == "discovery_finding",
                ReviewItem.status == "pending",
            )
            .scalar()
            or 0
        )

    failed_agents = 0
    if pids:
        fail_q = db.query(func.count(AgentRun.id)).filter(
            AgentRun.project_id.in_(pids),
            AgentRun.status.in_(["failed", "error"]),
        )
        if since:
            fail_q = fail_q.filter(AgentRun.created_at >= since)
        failed_agents = fail_q.scalar() or 0

    mapping_gaps = 0
    if pids:
        mapping_gaps = (
            db.query(func.count(MappingRow.id))
            .filter(
                MappingRow.project_id.in_(pids),
                or_(
                    MappingRow.status == "gap",
                    MappingRow.conformance.in_(
                        ["gap", "extension", "non_conformant"]
                    ),
                ),
            )
            .scalar()
            or 0
        )

    products = []
    if pids:
        products = (
            db.query(DataProduct)
            .options(
                load_only(
                    DataProduct.id,
                    DataProduct.project_id,
                    DataProduct.consumers,
                )
            )
            .filter(DataProduct.project_id.in_(pids))
            .all()
        )

    promoted = 0
    consumers_switched = 0
    consumers_blocked = 0
    signoffs_pending = 0
    for p in projects:
        pe = p.prod_env if isinstance(p.prod_env, dict) else {}
        te = p.test_env if isinstance(p.test_env, dict) else {}
        promoted += len(te.get("product_ids") or []) + len(pe.get("product_ids") or [])
        for c in pe.get("consumers") or []:
            if not isinstance(c, dict):
                continue
            st = str(c.get("status") or "").lower()
            if st in ("switched", "cutover", "live"):
                consumers_switched += 1
            elif st in ("blocked", "pending", "open"):
                consumers_blocked += 1
        if not _prod_signoff(p).get("signed_at") and (
            p.phase == "6_migrate" or p.prod_env_ready or p.build_approved
        ):
            signoffs_pending += 1

    freeze_n = sum(1 for p in projects if _freeze_applied(p))

    for prod in products:
        for c in prod.consumers or []:
            if not isinstance(c, dict):
                continue
            st = str(c.get("status") or "").lower()
            if st in ("switched", "cutover", "live"):
                consumers_switched += 1
            elif st in ("blocked", "hold"):
                consumers_blocked += 1

    activity: list[dict[str, Any]] = []
    daily: dict[str, Counter[str]] = defaultdict(Counter)

    def _bump(dt: Optional[datetime], kind: str) -> None:
        if not dt or not _in_window(dt, since):
            return
        daily[dt.strftime("%Y-%m-%d")][kind] += 1

    if pids:
        audit_q = (
            db.query(AuditEvent)
            .options(
                load_only(
                    AuditEvent.id,
                    AuditEvent.project_id,
                    AuditEvent.action,
                    AuditEvent.actor,
                    AuditEvent.created_at,
                )
            )
            .filter(AuditEvent.project_id.in_(pids))
            .order_by(AuditEvent.created_at.desc())
        )
        if since:
            audit_q = audit_q.filter(AuditEvent.created_at >= since)
        for ev in audit_q.limit(40).all():
            activity.append(
                {
                    "kind": "audit",
                    "project_id": ev.project_id,
                    "action": ev.action,
                    "actor": ev.actor,
                    "at": ev.created_at.isoformat() if ev.created_at else None,
                }
            )
            _bump(ev.created_at, "audit")

        disc_q = (
            db.query(DiscoveryRun)
            .options(
                load_only(
                    DiscoveryRun.id,
                    DiscoveryRun.project_id,
                    DiscoveryRun.status,
                    DiscoveryRun.created_at,
                )
            )
            .filter(DiscoveryRun.project_id.in_(pids))
            .order_by(DiscoveryRun.created_at.desc())
        )
        if since:
            disc_q = disc_q.filter(DiscoveryRun.created_at >= since)
        for run in disc_q.limit(30).all():
            activity.append(
                {
                    "kind": "discovery",
                    "project_id": run.project_id,
                    "action": f"discovery.{run.status}",
                    "actor": "system",
                    "at": run.created_at.isoformat() if run.created_at else None,
                    "run_id": run.id,
                }
            )
            _bump(run.created_at, "discovery")

        agent_list_q = (
            db.query(AgentRun)
            .options(
                load_only(
                    AgentRun.id,
                    AgentRun.project_id,
                    AgentRun.task,
                    AgentRun.status,
                    AgentRun.created_at,
                )
            )
            .filter(AgentRun.project_id.in_(pids))
            .order_by(AgentRun.created_at.desc())
        )
        if since:
            agent_list_q = agent_list_q.filter(AgentRun.created_at >= since)
        for run in agent_list_q.limit(30).all():
            activity.append(
                {
                    "kind": "agent",
                    "project_id": run.project_id,
                    "action": f"agent.{run.task}",
                    "actor": "system",
                    "at": run.created_at.isoformat() if run.created_at else None,
                    "status": run.status,
                }
            )
            _bump(run.created_at, "agent")

    activity.sort(key=lambda x: x.get("at") or "", reverse=True)
    activity = activity[:30]

    project_index = {
        p.id: {"id": p.id, "name": p.name, "stage": suite_stage_for_project(p)}
        for p in all_projects
    }
    for item in activity:
        meta = project_index.get(item["project_id"])
        item["project_name"] = meta["name"] if meta else f"#{item['project_id']}"

    trend_days = int(days) if days and int(days) > 0 else 30
    trend = []
    for i in range(trend_days - 1, -1, -1):
        day = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        c = daily.get(day) or Counter()
        trend.append(
            {
                "day": day,
                "label": day[5:],
                "audit": int(c.get("audit", 0)),
                "discovery": int(c.get("discovery", 0)),
                "agent": int(c.get("agent", 0)),
                "total": int(
                    c.get("audit", 0) + c.get("discovery", 0) + c.get("agent", 0)
                ),
            }
        )

    build_n = 0
    if pids:
        build_n = (
            db.query(func.count(BuildArtifact.id))
            .filter(BuildArtifact.project_id.in_(pids))
            .scalar()
            or 0
        )

    all_pids = [p.id for p in all_projects]
    inv_by = _count_by_project(db, InventoryObject, all_pids)
    disp_by = _count_by_project(db, Disposition, all_pids)
    art_by = _count_by_project(db, BuildArtifact, all_pids)
    hitl_by = _count_by_project(
        db,
        ReviewItem,
        all_pids,
        ReviewItem.review_type == "discovery_finding",
        ReviewItem.status == "pending",
    )

    estate_rows = []
    for p in all_projects:
        estate_rows.append(
            {
                "id": p.id,
                "name": p.name,
                "sample_slug": p.sample_slug or "",
                "phase": p.phase,
                "suite_stage": suite_stage_for_project(p),
                "gated": _is_gated(p),
                "complete": _is_complete(p),
                "days_in_stage": _days_in_stage(p),
                "inventory_signed_off": bool(p.inventory_signed_off),
                "plan_approved": bool(getattr(p, "plan_approved", False)),
                "disposition_approved": bool(p.disposition_approved),
                "build_approved": bool(p.build_approved),
                "objects_inventoried": inv_by.get(p.id, 0),
                "disposition_count": disp_by.get(p.id, 0),
                "build_artifacts": art_by.get(p.id, 0),
                "open_hitl": hitl_by.get(p.id, 0),
            }
        )

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "filters": {
            "project_id": project_id,
            "days": days,
            "scope": "estate" if project_id else "portfolio",
        },
        "portfolio_health": {
            "active_estates": len(active),
            "total_estates": len(projects),
            "complete_estates": len(complete),
            "gated_estates": gated_n,
            "pct_by_stage": pct_by_stage,
            "count_by_stage": {s: stage_counts.get(s, 0) for s in STAGE_ORDER},
            "avg_days_in_stage": avg_days,
            "stage_labels": STAGE_LABELS,
        },
        "estate_economics": {
            "objects_inventoried": inv_total,
            "disposition_register": disp_total,
            "survivors": survivors,
            "avoided": avoided,
            "avoid_pct": avoid_pct,
            "by_disposition": dict(by_final),
            "estimated_monthly_infra_avoidance_usd": monthly_avoid,
            "estimated_annual_infra_avoidance_usd": monthly_avoid * 12,
            "unit_cost_usd": UNIT_COST_USD,
            "build_artifacts": build_n,
        },
        "delivery_quality": {
            "reconcile_pass_rate_pct": recon_rate,
            "reconcile_total": len(recon_rows),
            "reconcile_passed": recon_pass,
            "open_hitl_findings": open_hitl,
            "failed_agent_runs": failed_agents,
            "mapping_conformance_gaps": mapping_gaps,
        },
        "cutover_risk": {
            "products_promoted": promoted,
            "consumers_switched": consumers_switched,
            "consumers_blocked": consumers_blocked,
            "freeze_applied_estates": freeze_n,
            "production_signoffs_pending": signoffs_pending,
        },
        "activity": activity,
        "activity_trend": trend,
        "estates": estate_rows,
    }
