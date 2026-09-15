"""Migration wave planning — split discovered estate into delivery waves."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db import InventoryObject, JobNode, LineageEdge, Project

FACTOR_WEIGHTS = {
    "dependency_cluster": 0.28,
    "pipeline_complexity": 0.22,
    "consumer_criticality": 0.18,
    "usage_intensity": 0.12,
    "object_volume": 0.10,
    "retention_risk": 0.10,
}

DISPOSITION_TYPES = ("table", "script", "repo", "dag", "view", "job", "report")


def empty_plan() -> dict[str, Any]:
    return {
        "waves": [],
        "unassigned_object_ids": [],
        "active_wave_id": "",
        "recommended_at": None,
        "approved_at": None,
        "approved_by": "",
        "factors": list(FACTOR_WEIGHTS.keys()),
        "narrative": "",
    }


def get_wave_plan(project: Project) -> dict[str, Any]:
    raw = project.wave_plan if isinstance(project.wave_plan, dict) else {}
    base = empty_plan()
    base.update({k: raw[k] for k in base if k in raw})
    if isinstance(raw.get("waves"), list):
        base["waves"] = raw["waves"]
    return base


def set_wave_plan(project: Project, plan: dict[str, Any]) -> dict[str, Any]:
    cleaned = empty_plan()
    cleaned.update(plan or {})
    waves = cleaned.get("waves") or []
    cleaned["waves"] = waves
    project.wave_plan = cleaned
    return cleaned


def active_wave(plan: dict[str, Any]) -> dict[str, Any] | None:
    wid = (plan.get("active_wave_id") or "").strip()
    waves = plan.get("waves") or []
    if wid:
        for w in waves:
            if w.get("id") == wid:
                return w
    for w in waves:
        if w.get("status") == "active":
            return w
    return waves[0] if waves else None


def active_wave_object_ids(project: Project) -> list[int] | None:
    """None = no plan / not approved → all objects. Else scoped ids."""
    if not project.plan_approved:
        return None
    plan = get_wave_plan(project)
    wave = active_wave(plan)
    if not wave:
        return []
    return [int(x) for x in (wave.get("object_ids") or []) if x is not None]


def _fqn_map(objs: list[InventoryObject]) -> dict[str, InventoryObject]:
    return {o.fully_qualified_name: o for o in objs if o.fully_qualified_name}


def _cluster_objects(
    objs: list[InventoryObject], edges: list[LineageEdge]
) -> list[list[InventoryObject]]:
    """Union-find clusters by lineage connectivity."""
    by_fqn = _fqn_map(objs)
    parent: dict[str, str] = {o.fully_qualified_name: o.fully_qualified_name for o in objs}

    def find(x: str) -> str:
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        if a not in parent or b not in parent:
            return
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for e in edges:
        if e.source_fqn in by_fqn and e.target_fqn in by_fqn:
            union(e.source_fqn, e.target_fqn)

    # Also cluster by schema prefix for unbound isolates
    groups: dict[str, list[InventoryObject]] = defaultdict(list)
    for o in objs:
        root = find(o.fully_qualified_name) if o.fully_qualified_name in parent else o.fully_qualified_name
        groups[root].append(o)

    clusters = list(groups.values())
    # Merge tiny isolates into nearest schema bucket for readability
    clusters.sort(key=lambda c: (-len(c), c[0].schema_name or "", c[0].name or ""))
    return clusters


def _score_cluster(
    cluster: list[InventoryObject],
    *,
    job_count: int,
    edge_degree: dict[str, int],
) -> dict[str, Any]:
    n = len(cluster) or 1
    consumers = 0
    usage = 0
    retention = 0
    deg = 0
    types: dict[str, int] = defaultdict(int)
    for o in cluster:
        types[o.object_type] = types.get(o.object_type, 0) + 1
        consumers += len(o.consumers or []) if isinstance(o.consumers, list) else 0
        usage += int(o.access_count or 0)
        if o.retention_required:
            retention += 1
        deg += edge_degree.get(o.fully_qualified_name, 0)

    pipeline = min(1.0, (job_count / 8.0) + (deg / max(n * 3, 1)))
    consumer_crit = min(1.0, consumers / max(n * 2, 1))
    usage_intensity = min(1.0, usage / max(n * 50, 1))
    volume = min(1.0, n / 40.0)
    ret_risk = retention / n
    dep = min(1.0, deg / max(n * 2, 1))

    factors = {
        "dependency_cluster": round(dep, 3),
        "pipeline_complexity": round(pipeline, 3),
        "consumer_criticality": round(consumer_crit, 3),
        "usage_intensity": round(usage_intensity, 3),
        "object_volume": round(volume, 3),
        "retention_risk": round(ret_risk, 3),
    }
    score = sum(factors[k] * FACTOR_WEIGHTS[k] for k in FACTOR_WEIGHTS)
    return {
        "score": round(score, 3),
        "factors": factors,
        "object_count": n,
        "by_type": dict(types),
        "consumer_touchpoints": consumers,
        "lineage_degree": deg,
    }


def recommend_waves(
    db: Session,
    project: Project,
    *,
    target_wave_count: int | None = None,
    max_objects_per_wave: int = 80,
    object_ids: list[int] | None = None,
) -> dict[str, Any]:
    q = db.query(InventoryObject).filter(
        InventoryObject.project_id == project.id,
        InventoryObject.object_type.in_(DISPOSITION_TYPES),
    )
    if object_ids:
        q = q.filter(InventoryObject.id.in_([int(x) for x in object_ids]))
    objs = q.order_by(
        InventoryObject.object_type, InventoryObject.fully_qualified_name
    ).all()
    edges = db.query(LineageEdge).filter_by(project_id=project.id).all()
    jobs = db.query(JobNode).filter_by(project_id=project.id).all()

    edge_degree: dict[str, int] = defaultdict(int)
    for e in edges:
        edge_degree[e.source_fqn] += 1
        edge_degree[e.target_fqn] += 1

    clusters = _cluster_objects(objs, edges)
    scored = []
    for cluster in clusters:
        meta = _score_cluster(cluster, job_count=len(jobs), edge_degree=edge_degree)
        scored.append({"objects": cluster, **meta})
    # Higher complexity / criticality earlier (Wave 1 = highest risk/value slice first,
    # or lower score first for "thin end of wedge" — use ascending score for safer start)
    scored.sort(key=lambda x: (x["score"], x["object_count"]))

    # Target wave count: heuristic from estate size
    if not target_wave_count:
        n = len(objs)
        if n <= 40:
            target_wave_count = 1
        elif n <= 120:
            target_wave_count = 2
        elif n <= 250:
            target_wave_count = 3
        else:
            target_wave_count = min(6, max(3, (n + max_objects_per_wave - 1) // max_objects_per_wave))

    # Pack clusters into waves without exceeding soft size cap
    wave_buckets: list[list[dict[str, Any]]] = [[] for _ in range(target_wave_count)]
    wave_sizes = [0] * target_wave_count
    for item in scored:
        # Prefer least-full wave that stays under cap; else least-full
        best = min(range(target_wave_count), key=lambda i: (wave_sizes[i], i))
        for i in range(target_wave_count):
            if wave_sizes[i] + item["object_count"] <= max_objects_per_wave:
                best = i
                break
        wave_buckets[best].append(item)
        wave_sizes[best] += item["object_count"]

    # Drop empty trailing waves
    wave_buckets = [b for b in wave_buckets if b]

    waves = []
    for idx, bucket in enumerate(wave_buckets):
        object_ids: list[int] = []
        fqns: list[str] = []
        factor_acc = {k: 0.0 for k in FACTOR_WEIGHTS}
        total_score = 0.0
        by_type: dict[str, int] = defaultdict(int)
        for item in bucket:
            for o in item["objects"]:
                object_ids.append(o.id)
                fqns.append(o.fully_qualified_name)
                by_type[o.object_type] += 1
            for k, v in item["factors"].items():
                factor_acc[k] += v
            total_score += item["score"] * item["object_count"]
        n = len(object_ids) or 1
        avg_factors = {k: round(factor_acc[k] / max(len(bucket), 1), 3) for k in FACTOR_WEIGHTS}
        rationale = _rationale(idx, avg_factors, by_type, len(object_ids))
        waves.append(
            {
                "id": f"wave-{idx + 1}",
                "name": _wave_name(idx, by_type),
                "order": idx + 1,
                "status": "draft" if idx else "active",
                "object_ids": object_ids,
                "object_fqns": fqns[:200],
                "object_count": len(object_ids),
                "by_type": dict(by_type),
                "recommendation_factors": avg_factors,
                "complexity_score": round(total_score / n, 3),
                "rationale": rationale,
                "notes": "",
            }
        )

    assigned = {oid for w in waves for oid in w["object_ids"]}
    unassigned = [o.id for o in objs if o.id not in assigned]

    narrative = (
        f"Recommended {len(waves)} wave(s) for {len(objs)} inventoried objects "
        f"using lineage clusters, pipeline complexity, consumer criticality, usage, "
        f"volume, and retention risk. Deliver Wave 1 end-to-end (Decide→Retire), then activate the next wave."
    )

    plan = {
        **empty_plan(),
        "waves": waves,
        "unassigned_object_ids": unassigned,
        "active_wave_id": waves[0]["id"] if waves else "",
        "recommended_at": datetime.utcnow().isoformat() + "Z",
        "narrative": narrative,
        "estate_object_count": len(objs),
        "lineage_edge_count": len(edges),
        "job_count": len(jobs),
    }
    return plan


def _wave_name(idx: int, by_type: dict[str, int]) -> str:
    dominant = max(by_type.items(), key=lambda x: x[1])[0] if by_type else "estate"
    labels = {
        "table": "Core data",
        "dag": "Orchestration",
        "script": "Transforms",
        "repo": "Code packs",
        "job": "Jobs",
        "view": "Views",
        "report": "Reports",
    }
    return f"Wave {idx + 1} · {labels.get(dominant, dominant.title())}"


def _rationale(
    idx: int, factors: dict[str, float], by_type: dict[str, int], n: int
) -> str:
    top = sorted(factors.items(), key=lambda x: -x[1])[:2]
    bits = [f"{k.replace('_', ' ')} {v:.0%}" for k, v in top]
    order_note = (
        "Earlier wave — thinner dependency / lower complexity for faster learning"
        if idx == 0
        else "Later wave — denser lineage or higher consumer/retention pressure"
    )
    return f"{n} objects ({', '.join(f'{k}:{v}' for k, v in by_type.items())}). Drivers: {', '.join(bits)}. {order_note}."


def approve_plan(project: Project, actor: str) -> dict[str, Any]:
    plan = get_wave_plan(project)
    if not plan.get("waves"):
        raise ValueError("Generate or save waves before approving the plan")
    # Ensure active wave
    if not plan.get("active_wave_id"):
        plan["active_wave_id"] = plan["waves"][0]["id"]
    for w in plan["waves"]:
        if w.get("id") == plan["active_wave_id"]:
            w["status"] = "active"
        elif w.get("status") == "active":
            w["status"] = "planned"
        elif w.get("status") == "draft":
            w["status"] = "planned"
    plan["approved_at"] = datetime.utcnow().isoformat() + "Z"
    plan["approved_by"] = actor
    set_wave_plan(project, plan)
    project.plan_approved = True
    project.phase = "2_disposition"
    return plan


def activate_wave(project: Project, wave_id: str) -> dict[str, Any]:
    plan = get_wave_plan(project)
    found = None
    for w in plan.get("waves") or []:
        if w.get("id") == wave_id:
            found = w
            break
    if not found:
        raise ValueError(f"Unknown wave '{wave_id}'")
    if found.get("status") == "complete":
        raise ValueError("Wave already complete")
    for w in plan["waves"]:
        if w.get("id") == wave_id:
            w["status"] = "active"
        elif w.get("status") == "active":
            w["status"] = "planned"
    plan["active_wave_id"] = wave_id
    set_wave_plan(project, plan)
    # Reset delivery gates for the new wave cycle (keep Discover + Plan)
    project.disposition_approved = False
    project.mapping_approved = False
    project.metadata_complete = False
    project.build_approved = False
    project.test_env_ready = False
    project.prod_env_ready = False
    project.change_closed = False
    project.phase = "2_disposition"
    return plan


def complete_active_wave(project: Project) -> dict[str, Any]:
    plan = get_wave_plan(project)
    wave = active_wave(plan)
    if not wave:
        raise ValueError("No active wave")
    wave["status"] = "complete"
    wave["completed_at"] = datetime.utcnow().isoformat() + "Z"
    # Activate next planned wave if any
    nxt = next(
        (w for w in sorted(plan["waves"], key=lambda x: x.get("order", 0)) if w.get("status") in ("planned", "draft")),
        None,
    )
    if nxt:
        plan["active_wave_id"] = nxt["id"]
        nxt["status"] = "active"
        project.disposition_approved = False
        project.mapping_approved = False
        project.metadata_complete = False
        project.build_approved = False
        project.test_env_ready = False
        project.prod_env_ready = False
        project.change_closed = False
        project.phase = "2_disposition"
    else:
        plan["active_wave_id"] = wave["id"]
        project.change_closed = True
        project.phase = "7_decommission"
    set_wave_plan(project, plan)
    return plan
