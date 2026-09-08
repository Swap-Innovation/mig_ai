"""Migrate-to-Production: promote, consumers, freeze, sign-off, stage exports."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db import (
    CutoverChecklist,
    DataProduct,
    Disposition,
    InventoryObject,
    Project,
    ReconciliationResult,
)


CONSUMER_STATUSES = ("pending", "notified", "switched", "blocked")


def default_checklist_items(product_name: str) -> list[dict[str, Any]]:
    return [
        {
            "id": "prod_promote",
            "label": f"Promote {product_name} to production",
            "done": False,
            "group": "prepare",
        },
        {
            "id": "dual_run",
            "label": f"Pilot dual-run evidence accepted for {product_name}",
            "done": False,
            "group": "prepare",
        },
        {
            "id": "reconcile",
            "label": "Production reconcile within tolerance",
            "done": False,
            "group": "prepare",
        },
        {
            "id": "consumers",
            "label": "Consumers switched to production contract",
            "done": False,
            "group": "cutover",
        },
        {
            "id": "freeze",
            "label": "Legacy objects frozen for cutover window",
            "done": False,
            "group": "cutover",
        },
        {
            "id": "consumer_signoff",
            "label": "Consumer owners signed off",
            "done": False,
            "group": "gate",
        },
        {
            "id": "signoff",
            "label": "Change Board production cutover sign-off",
            "done": False,
            "group": "gate",
        },
    ]


def _prod_env(project: Project) -> dict[str, Any]:
    env = getattr(project, "prod_env", None) or {}
    return dict(env) if isinstance(env, dict) else {}


def harvest_consumers(db: Session, project_id: int) -> list[str]:
    names: set[str] = set()
    for d in db.query(Disposition).filter_by(project_id=project_id).all():
        for c in (d.evidence or {}).get("consumers") or []:
            if c:
                names.add(str(c))
    for o in db.query(InventoryObject).filter_by(project_id=project_id).all():
        for c in o.consumers or []:
            if c:
                names.add(str(c))
    for prod in db.query(DataProduct).filter_by(project_id=project_id).all():
        for c in getattr(prod, "consumers", None) or []:
            if isinstance(c, dict):
                n = c.get("name") or c.get("id")
                if n:
                    names.add(str(n))
            elif c:
                names.add(str(c))
    return sorted(names)


def ensure_consumer_register(project: Project, names: list[str]) -> dict[str, Any]:
    from sqlalchemy.orm.attributes import flag_modified

    env = _prod_env(project)
    reg = dict(env.get("consumers") or {})
    changed = False
    for name in names:
        if name not in reg:
            reg[name] = {
                "status": "pending",
                "contract": "",
                "notes": "",
                "updated_at": None,
            }
            changed = True
    # drop nothing — keep historical
    if changed:
        env["consumers"] = reg
        project.prod_env = env
        flag_modified(project, "prod_env")
    return reg


def product_reconcile_ok(db: Session, project_id: int, product_id: int) -> bool:
    latest = (
        db.query(ReconciliationResult)
        .filter_by(project_id=project_id, product_id=product_id)
        .order_by(ReconciliationResult.id.desc())
        .first()
    )
    if latest and latest.passed:
        return True
    # Live/approved products can ride a project-level Pilot reconcile pass
    # (some runs only stamp a subset of product_ids).
    prod = db.query(DataProduct).get(product_id)
    if not prod or prod.project_id != project_id:
        return False
    if (prod.status or "").lower() not in {
        "live",
        "approved",
        "production",
        "reconciled",
    }:
        return False
    any_pass = (
        db.query(ReconciliationResult)
        .filter_by(project_id=project_id, passed=True)
        .first()
    )
    return bool(any_pass)


def sync_checklist_from_evidence(
    db: Session,
    project: Project,
    row: CutoverChecklist,
    product: DataProduct,
) -> CutoverChecklist:
    """Auto-tick prepare steps from Pilot / promote evidence."""
    env = _prod_env(project)
    items = list(row.items or [])
    by_id = {i.get("id"): i for i in items}
    for di in default_checklist_items(product.name):
        if di["id"] not in by_id:
            items.append(di)
            by_id[di["id"]] = di

    promoted_ids = set(env.get("product_ids") or [])
    if getattr(project, "prod_env_ready", False) and product.id in promoted_ids:
        by_id["prod_promote"]["done"] = True

    if (product.pipeline_status or "") == "success" or product.status in {
        "live",
        "production",
    }:
        by_id["dual_run"]["done"] = True

    if product_reconcile_ok(db, project.id, product.id):
        by_id["reconcile"]["done"] = True

    consumers = env.get("consumers") or {}
    if consumers and all(
        (c or {}).get("status") == "switched" for c in consumers.values()
    ):
        by_id["consumers"]["done"] = True
        by_id["consumer_signoff"]["done"] = True

    freeze_ids = set((env.get("frozen_disposition_ids") or []))
    if freeze_ids or (env.get("freeze_applied")):
        by_id["freeze"]["done"] = True

    if (env.get("signoff") or {}).get("signed_at"):
        by_id["signoff"]["done"] = True

    row.items = list(by_id.values())
    if all(i.get("done") for i in row.items):
        row.status = "complete"
    elif row.status == "complete":
        row.status = "open"
    return row


def ensure_cutover_rows(db: Session, project_id: int) -> list[dict[str, Any]]:
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    products = db.query(DataProduct).filter_by(project_id=project_id).all()
    names = harvest_consumers(db, project_id)
    ensure_consumer_register(project, names)
    by_product: list[dict[str, Any]] = []
    for prod in products:
        row = (
            db.query(CutoverChecklist)
            .filter_by(project_id=project_id, product_id=prod.id)
            .first()
        )
        if not row:
            row = CutoverChecklist(
                project_id=project_id,
                product_id=prod.id,
                items=default_checklist_items(prod.name),
                status="open",
            )
            db.add(row)
            db.flush()
        sync_checklist_from_evidence(db, project, row, prod)
        by_product.append(
            {
                "product_id": prod.id,
                "product_name": prod.name,
                "dataset_name": prod.dataset_name,
                "product_status": prod.status,
                "id": row.id,
                "status": row.status,
                "items": row.items,
                "reconcile_passed": product_reconcile_ok(db, project_id, prod.id),
            }
        )
    db.add(project)
    db.commit()
    return by_product


def cutover_payload(db: Session, project_id: int) -> dict[str, Any]:
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    by_product = ensure_cutover_rows(db, project_id)
    db.refresh(project)
    env = _prod_env(project)
    if not by_product:
        return {
            "items": [],
            "status": "none",
            "products": [],
            "by_product": [],
            "prod_env_ready": bool(getattr(project, "prod_env_ready", False)),
            "prod_env": env,
            "readiness": migrate_readiness(db, project),
        }
    primary = by_product[0]
    all_complete = all(p["status"] == "complete" for p in by_product)
    return {
        "id": primary["id"],
        "status": "complete" if all_complete else primary["status"],
        "items": primary["items"],
        "product_id": primary["product_id"],
        "products": [
            {"id": p["product_id"], "name": p["product_name"]} for p in by_product
        ],
        "by_product": by_product,
        "prod_env_ready": bool(getattr(project, "prod_env_ready", False)),
        "prod_env": env,
        "readiness": migrate_readiness(db, project),
    }


def migrate_readiness(db: Session, project: Project) -> dict[str, Any]:
    products = db.query(DataProduct).filter_by(project_id=project.id).all()
    env = _prod_env(project)
    consumers = env.get("consumers") or {}
    switched = sum(1 for c in consumers.values() if (c or {}).get("status") == "switched")
    blocked = sum(1 for c in consumers.values() if (c or {}).get("status") == "blocked")

    promoted_ids = {int(x) for x in (env.get("product_ids") or []) if x is not None}
    # Gate scope: promoted products when a promote already ran; otherwise in-production
    # products. Draft/suggested leftovers must not block Change Board sign-off.
    in_scope: list[DataProduct] = []
    if promoted_ids:
        in_scope = [p for p in products if p.id in promoted_ids]
    if not in_scope:
        in_scope = [
            p
            for p in products
            if (p.status or "").lower()
            in {"live", "approved", "production", "reconciled"}
        ]
    if not in_scope:
        in_scope = list(products)

    reconcile_ok = 0
    pending_reconcile: list[dict[str, Any]] = []
    for prod in in_scope:
        if product_reconcile_ok(db, project.id, prod.id):
            reconcile_ok += 1
        else:
            pending_reconcile.append({"id": prod.id, "name": prod.name})

    freeze_candidates = (
        db.query(Disposition)
        .filter_by(project_id=project.id)
        .filter(Disposition.final.in_(["retire", "archive-only", "consolidate"]))
        .count()
    )
    frozen = (
        db.query(Disposition)
        .filter_by(project_id=project.id)
        .filter(Disposition.retirement_state == "frozen")
        .count()
    )
    checklists = db.query(CutoverChecklist).filter_by(project_id=project.id).all()
    checks_done = sum(1 for c in checklists if c.status == "complete")
    pilot_reconcile_done = bool(in_scope) and reconcile_ok == len(in_scope)
    gates = [
        {
            "id": "pilot_reconcile",
            "label": "Pilot reconcile passed for each promoted product",
            "done": pilot_reconcile_done,
            "detail": (
                None
                if pilot_reconcile_done
                else (
                    f"{len(pending_reconcile)} pending: "
                    + ", ".join(p["name"] for p in pending_reconcile[:4])
                    + ("…" if len(pending_reconcile) > 4 else "")
                )
            ),
            "pending": pending_reconcile,
        },
        {
            "id": "test_env",
            "label": "Test environment dual-run completed",
            "done": bool(getattr(project, "test_env_ready", False)),
        },
        {
            "id": "prod_promote",
            "label": "Products promoted to production",
            "done": bool(getattr(project, "prod_env_ready", False)),
        },
        {
            "id": "consumers",
            "label": "All consumers switched (none blocked)",
            "done": bool(consumers)
            and switched == len(consumers)
            and blocked == 0,
        },
        {
            "id": "freeze",
            "label": "Legacy freeze applied",
            "done": frozen > 0 or bool(env.get("freeze_applied")),
        },
        {
            "id": "signoff",
            "label": "Change Board production sign-off",
            "done": bool((env.get("signoff") or {}).get("signed_at")),
            "detail": (
                None
                if (env.get("signoff") or {}).get("signed_at")
                else (
                    "Waiting on Change Board / Product Owner / Architect after gates above"
                    if pilot_reconcile_done
                    and bool(getattr(project, "prod_env_ready", False))
                    and bool(consumers)
                    and switched == len(consumers)
                    and blocked == 0
                    and (frozen > 0 or bool(env.get("freeze_applied")))
                    else "Blocked until earlier gates are met"
                )
            ),
        },
    ]
    return {
        "products": len(products),
        "in_scope_products": len(in_scope),
        "reconcile_ok": reconcile_ok,
        "pending_reconcile": pending_reconcile,
        "consumers_total": len(consumers),
        "consumers_switched": switched,
        "consumers_blocked": blocked,
        "freeze_candidates": freeze_candidates,
        "frozen": frozen,
        "checklists_complete": checks_done,
        "checklists_total": len(checklists),
        "gates": gates,
        "ready_for_signoff": all(g["done"] for g in gates if g["id"] != "signoff"),
        "prod_env_ready": bool(getattr(project, "prod_env_ready", False)),
    }


def promote_to_production(
    db: Session,
    project: Project,
    *,
    product_ids: list[int] | None,
    actor: str,
) -> dict[str, Any]:
    if not getattr(project, "test_env_ready", False):
        raise HTTPException(
            400, "Complete Pilot · Migrate to Test (and dual-run) before production"
        )
    requested = [int(x) for x in (product_ids or []) if x is not None]
    all_products = db.query(DataProduct).filter_by(project_id=project.id).all()
    if not all_products:
        raise HTTPException(400, "No data products to promote — finish Pilot first")

    selected = (
        [p for p in all_products if p.id in set(requested)]
        if requested
        else list(all_products)
    )

    skipped: list[dict[str, Any]] = []
    ready: list[DataProduct] = []
    for prod in selected:
        if product_reconcile_ok(db, project.id, prod.id):
            ready.append(prod)
        else:
            skipped.append(
                {
                    "id": prod.id,
                    "name": prod.name,
                    "reason": "Pilot reconcile has not passed",
                }
            )

    # If the selection was only blocked products, fall back to any ready ones
    if not ready:
        ready = [
            p for p in all_products if product_reconcile_ok(db, project.id, p.id)
        ]
        for prod in selected:
            if prod.id not in {r.id for r in ready} and not any(
                s["id"] == prod.id for s in skipped
            ):
                skipped.append(
                    {
                        "id": prod.id,
                        "name": prod.name,
                        "reason": "Pilot reconcile has not passed",
                    }
                )

    if not ready:
        raise HTTPException(
            400,
            "No products are ready to promote — run Pilot Reconcile until at least one product passes",
        )

    for prod in ready:
        prod.status = "production"
    env = _prod_env(project)
    env.update(
        {
            "environment": "production",
            "promoted_at": datetime.utcnow().isoformat() + "Z",
            "promoted_by": actor,
            "product_ids": [r.id for r in ready],
            "products": [
                {
                    "id": r.id,
                    "name": r.name,
                    "dataset_name": r.dataset_name,
                    "tier": getattr(r, "product_tier", None) or "adp",
                }
                for r in ready
            ],
            "skipped": skipped,
        }
    )
    # Preserve consumer register if already present
    env.setdefault("consumers", {})
    project.prod_env = env
    project.prod_env_ready = True
    if (project.phase or "") in {"", "5_pilot_product", "6_migrate"}:
        project.phase = "6_migrate"
    ensure_consumer_register(project, harvest_consumers(db, project.id))
    for prod in ready:
        row = (
            db.query(CutoverChecklist)
            .filter_by(project_id=project.id, product_id=prod.id)
            .first()
        )
        if row:
            sync_checklist_from_evidence(db, project, row, prod)
    db.add(project)
    db.flush()
    _export_prod_promote(project)
    _export_checklist(db, project)
    return {
        "prod_env_ready": True,
        "prod_env": _prod_env(project),
        "promoted": [{"id": r.id, "name": r.name} for r in ready],
        "skipped": skipped,
        "cutover": cutover_payload(db, project.id),
    }


def update_consumer(
    db: Session,
    project: Project,
    name: str,
    *,
    status: str,
    contract: str = "",
    notes: str = "",
    actor: str = "",
) -> dict[str, Any]:
    if status not in CONSUMER_STATUSES:
        raise HTTPException(400, f"status must be one of {CONSUMER_STATUSES}")
    names = harvest_consumers(db, project.id)
    ensure_consumer_register(project, names)
    env = _prod_env(project)
    reg = dict(env.get("consumers") or {})
    if name not in reg and name not in names:
        # allow explicit add
        reg[name] = {"status": "pending", "contract": "", "notes": "", "updated_at": None}
    entry = dict(reg.get(name) or {})
    entry["status"] = status
    if contract:
        entry["contract"] = contract
    if notes is not None:
        entry["notes"] = notes
    entry["updated_at"] = datetime.utcnow().isoformat() + "Z"
    entry["updated_by"] = actor
    reg[name] = entry
    env["consumers"] = reg
    project.prod_env = env
    # Sync checklist if all switched
    for prod in db.query(DataProduct).filter_by(project_id=project.id).all():
        row = (
            db.query(CutoverChecklist)
            .filter_by(project_id=project.id, product_id=prod.id)
            .first()
        )
        if row:
            sync_checklist_from_evidence(db, project, row, prod)
    db.add(project)
    db.commit()
    db.refresh(project)
    _export_consumers(project)
    _export_checklist(db, project)
    return {"name": name, **entry, "consumers": reg}


def apply_legacy_freeze(
    db: Session,
    project: Project,
    *,
    actor: str,
) -> dict[str, Any]:
    rows = (
        db.query(Disposition)
        .filter_by(project_id=project.id)
        .filter(Disposition.final.in_(["retire", "archive-only", "consolidate"]))
        .all()
    )
    frozen_ids: list[int] = []
    for d in rows:
        if d.retirement_state in ("none", "notified", ""):
            d.retirement_state = "frozen"
        d.evidence = {**(d.evidence or {}), "cutover_freeze": True, "frozen_by": actor}
        frozen_ids.append(d.id)
    env = _prod_env(project)
    env["freeze_applied"] = True
    env["freeze_applied_at"] = datetime.utcnow().isoformat() + "Z"
    env["freeze_applied_by"] = actor
    env["frozen_disposition_ids"] = frozen_ids
    project.prod_env = env
    for prod in db.query(DataProduct).filter_by(project_id=project.id).all():
        row = (
            db.query(CutoverChecklist)
            .filter_by(project_id=project.id, product_id=prod.id)
            .first()
        )
        if row:
            sync_checklist_from_evidence(db, project, row, prod)
    db.add(project)
    db.commit()
    db.refresh(project)
    _export_freeze(project, frozen_ids)
    _export_checklist(db, project)
    return {
        "frozen_count": len(frozen_ids),
        "frozen_disposition_ids": frozen_ids,
        "prod_env": _prod_env(project),
    }


def production_signoff(
    db: Session,
    project: Project,
    *,
    actor: str,
    notes: str = "",
) -> dict[str, Any]:
    from sqlalchemy.orm.attributes import flag_modified

    readiness = migrate_readiness(db, project)
    if not readiness.get("prod_env_ready"):
        raise HTTPException(400, "Promote products to production before sign-off")
    missing = [g["label"] for g in readiness["gates"] if g["id"] != "signoff" and not g["done"]]
    if missing:
        raise HTTPException(
            400,
            "Complete cutover gates before sign-off: " + "; ".join(missing),
        )
    env = _prod_env(project)
    signoff = {
        "signed_at": datetime.utcnow().isoformat() + "Z",
        "signed_by": actor,
        "notes": notes,
        "readiness": readiness,
    }
    env["signoff"] = signoff
    project.prod_env = env
    flag_modified(project, "prod_env")
    promoted_ids = {int(x) for x in (env.get("product_ids") or []) if x is not None}
    for prod in db.query(DataProduct).filter_by(project_id=project.id).all():
        # Only force-complete checklists for promoted / in-production products
        if promoted_ids and prod.id not in promoted_ids:
            continue
        row = (
            db.query(CutoverChecklist)
            .filter_by(project_id=project.id, product_id=prod.id)
            .first()
        )
        if row:
            items = list(row.items or [])
            for it in items:
                if it.get("id") == "signoff":
                    it["done"] = True
            row.items = items
            if all(i.get("done") for i in items):
                row.status = "complete"
    # Sign-off is the journey gate — advance even if draft product checklists remain open
    project.phase = "7_decommission"
    project.status = "pilot_complete"
    db.add(project)
    db.commit()
    db.refresh(project)
    _export_signoff(project, signoff)
    _export_checklist(db, project)
    return {
        "signoff": signoff,
        "phase": project.phase,
        "cutover": cutover_payload(db, project.id),
    }


def complete_checklist_item(
    db: Session,
    project_id: int,
    item_id: str,
    *,
    product_id: int | None,
    actor: str,
) -> dict[str, Any]:
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    # Route structured actions
    if item_id == "prod_promote":
        raise HTTPException(
            400, "Use POST /migrate/promote-prod to promote products to production"
        )
    if item_id == "freeze":
        apply_legacy_freeze(db, project, actor=actor)
        return cutover_payload(db, project_id)
    if item_id == "signoff":
        return production_signoff(db, project, actor=actor)["cutover"]
    if item_id == "consumers":
        from sqlalchemy.orm.attributes import flag_modified

        names = harvest_consumers(db, project_id)
        ensure_consumer_register(project, names)
        env = _prod_env(project)
        reg = dict(env.get("consumers") or {})
        if not reg:
            raise HTTPException(
                400,
                "No consumers to migrate — harvest from Discover/Decide first",
            )
        for name, entry in reg.items():
            e = dict(entry or {})
            if e.get("status") != "blocked":
                e["status"] = "switched"
                e["updated_at"] = datetime.utcnow().isoformat() + "Z"
                e["updated_by"] = actor
            reg[name] = e
        env["consumers"] = reg
        project.prod_env = env
        flag_modified(project, "prod_env")
        db.add(project)
        db.commit()
        _export_consumers(project)
        # Project-wide consumer switch — sync every product checklist from evidence
        for prod in db.query(DataProduct).filter_by(project_id=project_id).all():
            row = (
                db.query(CutoverChecklist)
                .filter_by(project_id=project_id, product_id=prod.id)
                .first()
            )
            if row:
                sync_checklist_from_evidence(db, project, row, prod)
        db.commit()
        return cutover_payload(db, project_id)

    q = db.query(CutoverChecklist).filter_by(project_id=project_id)
    if product_id is not None:
        q = q.filter_by(product_id=product_id)
    row = q.first()
    if not row:
        raise HTTPException(404, "Cutover checklist not found")
    items = list(row.items or [])
    found = False
    for it in items:
        if it["id"] == item_id:
            it["done"] = True
            found = True
    if not found:
        raise HTTPException(404, f"Checklist item '{item_id}' not found")
    row.items = items
    if all(i.get("done") for i in items):
        row.status = "complete"
        remaining = (
            db.query(CutoverChecklist)
            .filter_by(project_id=project_id)
            .filter(CutoverChecklist.status != "complete")
            .count()
        )
        if remaining == 0:
            project.phase = "7_decommission"
            project.status = "pilot_complete"
            db.add(project)
    db.commit()
    _export_checklist(db, project)
    return cutover_payload(db, project_id)


# ---------- disk exports ----------


def _export_prod_promote(project: Project) -> None:
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        env = _prod_env(project)
        write_json(project, "migrate/checklist", "promotion.json", env)
        write_stage_manifest(
            project,
            "migrate/checklist",
            status="promoted" if getattr(project, "prod_env_ready", False) else "open",
            prior_stage="pilot/reconcile",
            summary={
                "prod_env_ready": bool(getattr(project, "prod_env_ready", False)),
                "product_ids": env.get("product_ids") or [],
            },
            artifacts=["promotion.json"],
        )
    except Exception:
        pass


def _export_checklist(db: Session, project: Project) -> None:
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        rows = (
            db.query(CutoverChecklist).filter_by(project_id=project.id).all()
        )
        payload = {
            "project_id": project.id,
            "by_product": [
                {
                    "product_id": r.product_id,
                    "status": r.status,
                    "items": r.items,
                }
                for r in rows
            ],
            "written_at": datetime.utcnow().isoformat() + "Z",
        }
        write_json(project, "migrate/checklist", "checklist.json", payload)
        write_stage_manifest(
            project,
            "migrate/checklist",
            prior_stage="pilot/reconcile",
            summary={
                "products": len(rows),
                "complete": sum(1 for r in rows if r.status == "complete"),
            },
            artifacts=["checklist.json", "promotion.json"],
        )
    except Exception:
        pass


def _export_consumers(project: Project) -> None:
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        env = _prod_env(project)
        consumers = env.get("consumers") or {}
        write_json(project, "migrate/consumers", "consumers.json", consumers)
        write_stage_manifest(
            project,
            "migrate/consumers",
            prior_stage="migrate/checklist",
            summary={
                "total": len(consumers),
                "switched": sum(
                    1 for c in consumers.values() if (c or {}).get("status") == "switched"
                ),
            },
            artifacts=["consumers.json"],
        )
    except Exception:
        pass


def _export_freeze(project: Project, frozen_ids: list[int]) -> None:
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        env = _prod_env(project)
        payload = {
            "frozen_disposition_ids": frozen_ids,
            "freeze_applied_at": env.get("freeze_applied_at"),
            "freeze_applied_by": env.get("freeze_applied_by"),
        }
        write_json(project, "migrate/freeze", "freeze.json", payload)
        write_stage_manifest(
            project,
            "migrate/freeze",
            prior_stage="migrate/consumers",
            summary={"frozen_count": len(frozen_ids)},
            artifacts=["freeze.json"],
        )
    except Exception:
        pass


def _export_signoff(project: Project, signoff: dict[str, Any]) -> None:
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        write_json(project, "migrate/signoff", "signoff.json", signoff)
        write_stage_manifest(
            project,
            "migrate/signoff",
            status="signed_off",
            prior_stage="migrate/freeze",
            summary={
                "signed_by": signoff.get("signed_by"),
                "signed_at": signoff.get("signed_at"),
            },
            artifacts=["signoff.json"],
        )
    except Exception:
        pass
