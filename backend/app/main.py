from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

# Adapters: backend/adapters (dev) or /app/adapters (Docker PYTHONPATH)
_BACKEND = Path(__file__).resolve().parents[1]
for _p in (_BACKEND, _BACKEND / "adapters"):
    _s = str(_p)
    if _p.exists() and _s not in sys.path:
        sys.path.insert(0, _s)

from app.agents import run_agent_task
from app.auth import (
    DEMO_USERS,
    create_access_token,
    get_current_user,
    hash_password,
    require_roles,
    verify_password,
)
from app.config import get_settings
from app.db import (
    AgentRun,
    AuditEvent,
    BuildArtifact,
    BusinessMetadata,
    CutoverChecklist,
    DataProduct,
    DiscoveryRun,
    DiscoveryStep,
    Disposition,
    InventoryColumn,
    InventoryObject,
    JobNode,
    LineageEdge,
    MappingRow,
    PipelineRun,
    Project,
    ReconciliationResult,
    ReviewItem,
    User,
    get_db,
    init_db,
)
from app.disposition import (
    build_dependents_map,
    clear_dispositions,
    hydrate_inventory_from_discover_disk,
    materialize_dispositions,
    next_retirement_state,
    objects_for_disposition,
    score_disposition,
)
from app.schemas import (
    AgentRunCreate,
    AgentRunOut,
    BuildArtifactOut,
    BuildArtifactPatch,
    BuildGenerateIn,
    BuildTargetsIn,
    DispositionOut,
    DispositionOverride,
    FreezePut,
    GitBindIn,
    GitSyncIn,
    HubBindIn,
    MappingGenerateIn,
    MappingBulkReviewIn,
    MappingOut,
    MappingPatch,
    MetadataIn,
    MetadataOut,
    MobilisationBulk,
    MobilisationItemPatch,
    DecisionPatch,
    ProjectCreate,
    ProjectOut,
    ReviewDecision,
    ReviewBulkDecision,
    ReviewOut,
    SampleBindIn,
    DiscoveryRunIn,
    TeamPatch,
    TokenOut,
    UserOut,
)
from app.services.discovery_runner import execute_discovery_run
from app.services.agent_runner import execute_agent_run
from app.services.mapping_runner import execute_mapping_run
from app.services.estate import (
    bind_git,
    bind_sample,
    bind_zip,
    estate_status,
    list_sample_projects as estate_list_samples,
    resolve_legacy_root,
    sync_git,
)
from app.services.mobilisation import (
    apply_decision_defaults,
    apply_freeze_defaults,
    apply_freeze_patch,
    apply_item_patch,
    apply_team_defaults,
    apply_team_patch,
    checklist_complete,
    ensure_checklist,
    ensure_decisions,
    ensure_freeze,
    ensure_team,
    evidence_gaps,
    group_progress,
    mark_freeze_checklist,
    patch_decision,
    publish_freeze,
    ready_checks,
    team_roster,
)
from app.services.udp_hub import (
    normalize_spoke_id,
    run_hub_probe,
    udp_hub_status,
)
from app.services.projects import (
    create_project as create_project_svc,
    delete_project as delete_project_svc,
    list_catalog_samples,
    sync_sample_projects_to_db,
)

try:
    from gcp_stub import bq, dataplex, gcs, run_full_pipeline
except ImportError:
    from adapters.gcp_stub import bq, dataplex, gcs, run_full_pipeline  # type: ignore

settings = get_settings()
app = FastAPI(
    title="Lumina Control Plane",
    version="0.1.0",
    description="Enterprise control plane for legacy data estate discovery, disposition, SID mapping, agents, and GCP-shaped pilot product.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def audit(db: Session, project_id: int, actor: str, action: str, **kwargs: Any) -> None:
    db.add(
        AuditEvent(
            project_id=project_id,
            actor=actor,
            action=action,
            entity_type=kwargs.get("entity_type", ""),
            entity_id=str(kwargs.get("entity_id", "")),
            detail=kwargs.get("detail", {}),
        )
    )


def _test_env_dict(project: Project | None) -> dict[str, Any]:
    if not project:
        return {}
    env = project.test_env
    return env if isinstance(env, dict) else {}


def _assert_product_in_test_env(project: Project | None, product_id: int) -> dict[str, Any]:
    """Dual pipeline + reconcile require Migrate to Test promotion of this product."""
    if not project:
        raise HTTPException(404, "Project not found")
    if not project.test_env_ready:
        raise HTTPException(
            400,
            "Migrate to Test first — promote SDPs before dual pipeline or reconcile",
        )
    env = _test_env_dict(project)
    ids = [int(x) for x in (env.get("product_ids") or [])]
    if ids and int(product_id) not in ids:
        raise HTTPException(
            400,
            "Product is not in the Test promotion set. Re-promote from Migrate to Test.",
        )
    return env


def _resolve_kind_for_product(prod: DataProduct) -> str:
    try:
        from adapters.gcp_stub import resolve_product_kind  # type: ignore
    except Exception:
        from gcp_stub import resolve_product_kind  # type: ignore
    return resolve_product_kind(
        getattr(prod, "product_kind", None),
        prod.name,
    )


def seed_users(db: Session) -> None:
    """Insert any missing demo users (idempotent for role additions)."""
    existing = {u.email for u in db.query(User).all()}
    added = False
    for u in DEMO_USERS:
        if u["email"] in existing:
            continue
        db.add(
            User(
                email=u["email"],
                name=u["name"],
                role=u["role"],
                password_hash=hash_password(u["password"]),
            )
        )
        added = True
    if added:
        db.commit()


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    db = next(get_db())
    try:
        seed_users(db)
        # Keep DB projects in sync with sample-data/projects/* catalogue
        sync_sample_projects_to_db(db)
    finally:
        db.close()


def _load_sample_project_meta() -> dict[str, Any]:
    path = settings.project_dir() / "project.json"
    if path.exists():
        import json

        return json.loads(path.read_text(encoding="utf-8"))
    return {}


@app.get("/sample-projects")
def list_sample_projects_catalog(
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """List demo estates under sample-data/projects/."""
    out = list_catalog_samples()
    for meta in out:
        meta["active"] = meta["id"] == settings.sample_project_id
        meta["path"] = str(Path(settings.sample_projects_root) / meta["id"])
    return out


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "sample_project": settings.sample_project_id,
        "legacy_path": settings.sample_legacy_path,
    }


@app.post("/auth/login", response_model=TokenOut)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> TokenOut:
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    token = create_access_token(user.email, user.role)
    return TokenOut(
        access_token=token, role=user.role, name=user.name, email=user.email
    )


@app.get("/auth/demo-users")
def demo_users() -> list[dict[str, str]]:
    return [
        {"email": u["email"], "password": u["password"], "role": u["role"], "name": u["name"]}
        for u in DEMO_USERS
    ]


@app.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@app.get("/projects", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Project]:
    return db.query(Project).order_by(Project.id).all()


@app.post("/projects", response_model=ProjectOut)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("engineer", "architect", "change_board", "product_owner")
    ),
) -> Project:
    return create_project_svc(
        db,
        name=body.name,
        description=body.description,
        sample_id=body.sample_id,
        slug=body.slug,
        scaffold=body.scaffold,
        actor_email=user.email,
    )


@app.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Project:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


# ---------- Phase 0 — Mobilisation ----------


def _estate_bound(p: Project) -> bool:
    return bool(
        (p.sample_slug or "").strip()
        or (p.legacy_root or "").strip()
        or (p.git_url or "").strip()
        or (p.estate_label or "").strip()
    )


def _mobilisation_payload(p: Project, db: Session) -> dict[str, Any]:
    items = ensure_checklist(getattr(p, "mobilisation", None) or [])
    decisions = ensure_decisions(
        getattr(p, "decisions", None) or [],
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    freeze = ensure_freeze(
        getattr(p, "freeze_register", None) or {},
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    team = ensure_team(getattr(p, "team", None) or {}, seed_demo=False)
    dirty = False
    if items != (p.mobilisation or []):
        p.mobilisation = items
        dirty = True
    if decisions != (getattr(p, "decisions", None) or []):
        p.decisions = decisions
        dirty = True
    if freeze != (getattr(p, "freeze_register", None) or {}):
        p.freeze_register = freeze
        dirty = True
    if team != (getattr(p, "team", None) or {}):
        p.team = team
        dirty = True
    if dirty:
        db.commit()
    done = sum(
        1 for i in items if i.get("done") or (i.get("status") in {"done", "na"})
    )
    checks = ready_checks(
        items=items,
        decisions=decisions,
        estate_bound=_estate_bound(p),
        freeze=freeze,
        team=team,
        hub_spoke_id=getattr(p, "hub_spoke_id", "") or "",
        hub_probe=getattr(p, "hub_probe", None) or {},
    )
    return {
        "items": items,
        "decisions": decisions,
        "freeze": freeze,
        "team": team,
        "team_roster": team_roster(team),
        "hub_spoke_id": getattr(p, "hub_spoke_id", "") or "",
        "hub_probe": getattr(p, "hub_probe", None) or {},
        "ready": bool(getattr(p, "mobilisation_ready", False)),
        "progress": {"done": done, "total": len(items)},
        "by_group": group_progress(items),
        "evidence_gaps": evidence_gaps(items),
        "ready_checks": checks,
        "exit_criterion": "Team can read source and deploy to non-production",
    }


@app.get("/projects/{project_id}/mobilisation")
def mobilisation_get(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return _mobilisation_payload(p, db)


@app.patch("/projects/{project_id}/mobilisation/items")
def mobilisation_patch_item(
    project_id: int,
    body: MobilisationItemPatch,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            "engineer",
            "architect",
            "change_board",
            "product_owner",
            "data_owner",
            "data_steward",
        )
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    items = ensure_checklist(p.mobilisation or [])
    found = False
    patch = body.model_dump(exclude_unset=True)
    item_id = patch.pop("item_id")
    for idx, it in enumerate(items):
        if it["id"] == item_id:
            items[idx] = apply_item_patch(it, patch, user.email)
            found = True
            break
    if not found:
        raise HTTPException(404, f"Unknown checklist item: {item_id}")
    p.mobilisation = items
    if getattr(p, "mobilisation_ready", False) and not checklist_complete(items):
        p.mobilisation_ready = False
    audit(
        db,
        project_id,
        user.email,
        "mobilisation.item",
        detail={"item_id": item_id, **{k: patch.get(k) for k in patch}},
    )
    db.commit()
    return _mobilisation_payload(p, db)


@app.post("/projects/{project_id}/mobilisation/bulk")
def mobilisation_bulk(
    project_id: int,
    body: MobilisationBulk,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            "engineer",
            "architect",
            "change_board",
            "product_owner",
            "data_owner",
            "data_steward",
        )
    ),
) -> dict[str, Any]:
    from datetime import datetime

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    items = ensure_checklist(p.mobilisation or [])
    ids = set(body.item_ids or [])
    now = datetime.utcnow().isoformat() + "Z"

    def _mark(it: dict) -> None:
        it["done"] = body.done
        it["status"] = "done" if body.done else "open"
        if body.done and body.accept_demo_evidence:
            it["notes"] = it.get("notes") or "Demo evidence accepted"
            it["owner_email"] = it.get("owner_email") or user.email
            it["verified_at"] = it.get("verified_at") or now
            it["evidence_url"] = it.get("evidence_url") or "demo://mobilisation/evidence"

    if body.group or ids:
        for it in items:
            if (body.group and it.get("group") == body.group) or (ids and it["id"] in ids):
                _mark(it)
    elif body.accept_demo_evidence and body.done:
        for it in items:
            _mark(it)
    else:
        for it in items:
            if body.group and it.get("group") == body.group:
                _mark(it)
            elif ids and it["id"] in ids:
                _mark(it)

    p.mobilisation = items
    if getattr(p, "mobilisation_ready", False) and not checklist_complete(items):
        p.mobilisation_ready = False
    audit(
        db,
        project_id,
        user.email,
        "mobilisation.bulk",
        detail={
            "group": body.group,
            "item_ids": body.item_ids,
            "done": body.done,
            "accept_demo_evidence": body.accept_demo_evidence,
        },
    )
    db.commit()
    return _mobilisation_payload(p, db)


@app.get("/projects/{project_id}/mobilisation/decisions")
def mobilisation_decisions_get(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    from app.services.mobilisation import decisions_ready

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    decisions = ensure_decisions(
        getattr(p, "decisions", None) or [],
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    if decisions != (p.decisions or []):
        p.decisions = decisions
        db.commit()
    ok, missing = decisions_ready(decisions)
    return {"decisions": decisions, "ready": ok, "missing": missing}


@app.patch("/projects/{project_id}/mobilisation/decisions")
def mobilisation_decisions_patch(
    project_id: int,
    body: DecisionPatch,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            "architect",
            "change_board",
            "product_owner",
            "data_owner",
            "engineer",
        )
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    decisions = ensure_decisions(
        getattr(p, "decisions", None) or [],
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    try:
        decisions = patch_decision(
            decisions,
            body.decision_id,
            body.model_dump(exclude_unset=True),
            user.email,
        )
    except KeyError:
        raise HTTPException(404, f"Unknown decision: {body.decision_id}") from None
    p.decisions = decisions
    audit(
        db,
        project_id,
        user.email,
        "mobilisation.decision",
        detail={"decision_id": body.decision_id},
    )
    db.commit()
    return mobilisation_decisions_get(project_id, db, user)


@app.post("/projects/{project_id}/mobilisation/decisions/accept-defaults")
def mobilisation_decisions_defaults(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "change_board", "product_owner", "data_owner", "engineer")
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    decisions = ensure_decisions(
        getattr(p, "decisions", None) or [],
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    decisions = apply_decision_defaults(
        decisions,
        actor=user.email,
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    p.decisions = decisions
    audit(db, project_id, user.email, "mobilisation.decisions_defaults")
    db.commit()
    return mobilisation_decisions_get(project_id, db, user)


@app.get("/projects/{project_id}/mobilisation/freeze")
def mobilisation_freeze_get(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    from app.services.mobilisation import freeze_ready

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    freeze = ensure_freeze(
        getattr(p, "freeze_register", None) or {},
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    if freeze != (getattr(p, "freeze_register", None) or {}):
        p.freeze_register = freeze
        db.commit()
    ok, mode = freeze_ready(freeze)
    return {"freeze": freeze, "ready": ok, "mode": mode}


@app.put("/projects/{project_id}/mobilisation/freeze")
def mobilisation_freeze_put(
    project_id: int,
    body: FreezePut,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            "architect",
            "change_board",
            "product_owner",
            "engineer",
            "data_owner",
        )
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    freeze = ensure_freeze(
        getattr(p, "freeze_register", None) or {},
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    freeze = apply_freeze_patch(freeze, body.model_dump(exclude_unset=True))
    # Saving a draft unpublishes unless they only deferred
    if freeze.get("published") and not freeze.get("deferred"):
        # Allow editing published register without auto-unpublish unless dates/scope change
        pass
    if freeze.get("deferred"):
        freeze["published"] = False
        freeze["published_at"] = None
        freeze["published_by"] = ""
        items = ensure_checklist(p.mobilisation or [])
        items = mark_freeze_checklist(items, published=False, deferred=True)
        p.mobilisation = items
    p.freeze_register = freeze
    audit(db, project_id, user.email, "mobilisation.freeze_save", detail={"deferred": freeze.get("deferred")})
    db.commit()
    return _mobilisation_payload(p, db)


@app.post("/projects/{project_id}/mobilisation/freeze/accept-defaults")
def mobilisation_freeze_defaults(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "change_board", "product_owner", "engineer", "data_owner")
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    freeze = ensure_freeze(
        getattr(p, "freeze_register", None) or {},
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    freeze = apply_freeze_defaults(
        freeze, project_name=p.name or "", sample_slug=p.sample_slug or ""
    )
    p.freeze_register = freeze
    audit(db, project_id, user.email, "mobilisation.freeze_defaults")
    db.commit()
    return _mobilisation_payload(p, db)


@app.post("/projects/{project_id}/mobilisation/freeze/publish")
def mobilisation_freeze_publish(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("architect", "change_board")),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    freeze = ensure_freeze(
        getattr(p, "freeze_register", None) or {},
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    try:
        freeze = publish_freeze(freeze, actor=user.email)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    items = ensure_checklist(p.mobilisation or [])
    items = mark_freeze_checklist(
        items, published=bool(freeze.get("published")), deferred=bool(freeze.get("deferred"))
    )
    p.freeze_register = freeze
    p.mobilisation = items
    audit(
        db,
        project_id,
        user.email,
        "freeze.publish",
        detail={
            "freeze_start": freeze.get("freeze_start"),
            "freeze_end": freeze.get("freeze_end"),
            "change_board_ref": freeze.get("change_board_ref"),
        },
    )
    db.commit()
    return _mobilisation_payload(p, db)


@app.get("/projects/{project_id}/mobilisation/team")
def mobilisation_team_get(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    from app.services.mobilisation import team_ready

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    team = ensure_team(getattr(p, "team", None) or {})
    if team != (getattr(p, "team", None) or {}):
        p.team = team
        db.commit()
    ok, missing = team_ready(team)
    return {
        "team": team,
        "roster": team_roster(team),
        "ready": ok,
        "missing": missing,
        "demo_users": [
            {"email": u["email"], "name": u["name"], "role": u["role"]} for u in DEMO_USERS
        ],
    }


@app.patch("/projects/{project_id}/mobilisation/team")
def mobilisation_team_patch(
    project_id: int,
    body: TeamPatch,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            "architect",
            "change_board",
            "product_owner",
            "data_owner",
            "engineer",
        )
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    team = ensure_team(getattr(p, "team", None) or {})
    team = apply_team_patch(team, body.model_dump(exclude_unset=True))
    p.team = team
    audit(db, project_id, user.email, "mobilisation.team", detail=team)
    db.commit()
    return _mobilisation_payload(p, db)


@app.post("/projects/{project_id}/mobilisation/team/accept-defaults")
def mobilisation_team_defaults(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "change_board", "product_owner", "data_owner", "engineer")
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    team = ensure_team(getattr(p, "team", None) or {})
    team = apply_team_defaults(team)
    p.team = team
    audit(db, project_id, user.email, "mobilisation.team_defaults")
    db.commit()
    return _mobilisation_payload(p, db)


@app.post("/projects/{project_id}/mobilisation/ready")
def mobilisation_ready(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("architect", "change_board", "product_owner")),
) -> ProjectOut:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    items = ensure_checklist(p.mobilisation or [])
    decisions = ensure_decisions(
        getattr(p, "decisions", None) or [],
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    freeze = ensure_freeze(
        getattr(p, "freeze_register", None) or {},
        project_name=p.name or "",
        sample_slug=p.sample_slug or "",
    )
    team = ensure_team(getattr(p, "team", None) or {})
    checks = ready_checks(
        items=items,
        decisions=decisions,
        estate_bound=_estate_bound(p),
        freeze=freeze,
        team=team,
        hub_spoke_id=getattr(p, "hub_spoke_id", "") or "",
        hub_probe=getattr(p, "hub_probe", None) or {},
    )
    if not checks["passed"]:
        raise HTTPException(
            400,
            detail={
                "message": "Mobilisation ready checks failed",
                "ready_checks": checks,
            },
        )
    p.mobilisation = items
    p.decisions = decisions
    p.freeze_register = freeze
    p.team = team
    p.mobilisation_ready = True
    if p.phase == "0_mobilisation":
        p.phase = "1_discovery"
        p.status = "active"
    audit(db, project_id, user.email, "mobilisation.ready", detail=checks)
    db.commit()
    db.refresh(p)
    return p


@app.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board")),
) -> dict[str, Any]:
    result = delete_project_svc(db, project_id)
    remaining = db.query(Project).order_by(Project.id).first()
    if remaining:
        audit(
            db,
            remaining.id,
            user.email,
            "project.delete",
            entity_type="project",
            entity_id=project_id,
            detail=result,
        )
        db.commit()
    return result


# ---------- Discovery / Inventory ----------


@app.get("/platform/udp-hub")
def platform_udp_hub(
    project_id: int | None = None,
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    return udp_hub_status(project_id)


@app.get("/platform/llm")
def platform_llm(user: User = Depends(get_current_user)) -> dict[str, Any]:
    from app.services.cursor_agents import cursor_status

    cs = cursor_status()
    return {
        "llm_mode": settings.llm_mode,
        "model": settings.openai_model if settings.llm_mode == "openai" else "mock-deterministic",
        "openai_configured": bool(settings.openai_api_key),
        "cursor_configured": cs["cursor_configured"],
        "cursor_model": cs["cursor_model"],
        "discovery_mode": cs["discovery_mode"],
        "require_hub_probe": settings.require_hub_probe
        or (settings.llm_mode or "").lower() == "openai",
        "note": "Discovery uses live Cursor agents (CURSOR_API_KEY). OpenAI is optional for other narrations.",
    }


@app.get("/projects/{project_id}/udp-hub")
def project_udp_hub(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return udp_hub_status(
        project_id,
        hub_spoke_id=getattr(p, "hub_spoke_id", "") or "",
        hub_probe=getattr(p, "hub_probe", None) or {},
    )


@app.put("/projects/{project_id}/udp-hub/bind")
def project_udp_hub_bind(
    project_id: int,
    body: HubBindIn,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("engineer", "architect", "change_board", "product_owner", "data_owner")
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    try:
        spoke = normalize_spoke_id(body.spoke_id)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    p.hub_spoke_id = spoke
    # Clear stale probe when rebinding
    p.hub_probe = {}
    audit(db, project_id, user.email, "udp_hub.bind", detail={"spoke_id": spoke})
    db.commit()
    return udp_hub_status(
        project_id,
        hub_spoke_id=p.hub_spoke_id or "",
        hub_probe=p.hub_probe or {},
    )


@app.post("/projects/{project_id}/udp-hub/probe")
def project_udp_hub_probe(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("engineer", "architect", "change_board", "product_owner", "data_owner")
    ),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    spoke = (getattr(p, "hub_spoke_id", "") or "").strip()
    if not spoke:
        # Default bind landing for demo convenience
        spoke = normalize_spoke_id("landing")
        p.hub_spoke_id = spoke
    probe = run_hub_probe(spoke_id=spoke, actor=user.email)
    p.hub_probe = probe
    audit(db, project_id, user.email, "udp_hub.probe", detail=probe)
    db.commit()
    return udp_hub_status(
        project_id,
        hub_spoke_id=p.hub_spoke_id or "",
        hub_probe=probe,
    )


@app.get("/estate/samples")
def estate_samples(user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    return estate_list_samples()


@app.get("/projects/{project_id}/estate")
def get_estate(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return estate_status(p)


@app.post("/projects/{project_id}/estate/sample")
def estate_bind_sample(
    project_id: int,
    body: SampleBindIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board")),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    result = bind_sample(db, p, body.sample_id)
    audit(db, project_id, user.email, "estate.bind_sample", detail=result)
    db.commit()
    return result


@app.post("/projects/{project_id}/estate/upload")
async def estate_upload(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board")),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    result = bind_zip(db, p, file)
    audit(
        db,
        project_id,
        user.email,
        "estate.upload",
        detail={"label": result.get("estate_label"), "files": result.get("extracted_files")},
    )
    db.commit()
    return result


@app.post("/projects/{project_id}/estate/git")
def estate_bind_git(
    project_id: int,
    body: GitBindIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board")),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    result = bind_git(
        db,
        p,
        url=body.url,
        branch=body.branch,
        path_prefix=body.path_prefix,
        token=body.token,
    )
    audit(
        db,
        project_id,
        user.email,
        "estate.git",
        detail={
            "url": body.url,
            "branch": body.branch,
            "path_prefix": body.path_prefix,
            "commit": result.get("commit"),
        },
    )
    db.commit()
    return result


@app.post("/projects/{project_id}/estate/git/sync")
def estate_sync_git(
    project_id: int,
    body: GitSyncIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board")),
) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    token = body.token if body else None
    result = sync_git(db, p, token=token)
    audit(
        db,
        project_id,
        user.email,
        "estate.git_sync",
        detail={"commit": result.get("commit"), "url": p.git_url},
    )
    db.commit()
    return result


@app.post("/projects/{project_id}/discovery/run")
def discovery_run(
    project_id: int,
    background_tasks: BackgroundTasks,
    body: DiscoveryRunIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board")),
) -> dict[str, Any]:
    from app.services.cursor_agents import cursor_configured

    if settings.discovery_require_cursor and not cursor_configured():
        raise HTTPException(
            400,
            "Live Cursor agents required. Set CURSOR_API_KEY in backend/.env "
            "(Cursor Dashboard → Integrations), then restart the API.",
        )

    pipe = ((body.pipeline if body else None) or "discover").strip().lower()
    if pipe not in {"discover", "inventory"}:
        raise HTTPException(400, "pipeline must be 'discover' or 'inventory'")

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.legacy_root:
        bind_sample(db, p)
        db.refresh(p)
    root = resolve_legacy_root(p)
    if not root.exists():
        raise HTTPException(400, f"Legacy root not found: {root}")

    # Inventory must chain from the latest completed Activity (discover) run —
    # use that run's estate as source of truth (not a drifted project binding).
    prior_discover = None
    if pipe == "inventory":
        from app.services.discovery_stage import latest_completed_run

        prior_discover = latest_completed_run(db, project_id, "discover")
        if not prior_discover:
            raise HTTPException(
                400,
                "Complete Activity (discover scan) before Find inventory",
            )
        activity_root = Path(prior_discover.legacy_root or "").expanduser()
        if not str(activity_root) or not activity_root.exists():
            raise HTTPException(
                400,
                "Activity estate path is missing on disk — re-run Activity, then Find inventory",
            )
        root = activity_root.resolve()
        # Keep project binding aligned with last Activity so later stages match
        current = resolve_legacy_root(p)
        if str(current.resolve()) != str(root):
            p.legacy_root = str(root)
            db.add(p)
            db.commit()
            db.refresh(p)

    # Auto-fail stale active runs so a hung Cursor agent does not block forever
    stale_cutoff = datetime.utcnow().timestamp() - 25 * 60
    stale_rows = (
        db.query(DiscoveryRun)
        .filter(
            DiscoveryRun.project_id == project_id,
            DiscoveryRun.status.in_(["queued", "running"]),
        )
        .all()
    )
    for row in stale_rows:
        started = (row.created_at or datetime.utcnow()).timestamp()
        if started < stale_cutoff:
            row.status = "failed"
            row.error = "Timed out / interrupted (stale active run cleared)"
            row.completed_at = datetime.utcnow()
    if stale_rows:
        db.commit()

    active = (
        db.query(DiscoveryRun)
        .filter(
            DiscoveryRun.project_id == project_id,
            DiscoveryRun.status.in_(["queued", "running"]),
        )
        .first()
    )
    if active:
        active_pipe = (active.summary or {}).get("pipeline") or "discover"
        raise HTTPException(
            409,
            f"{active_pipe} run #{active.id} is already {active.status}. "
            f"Wait for it to finish before starting {pipe}.",
        )

    agents = (
        [
            "DiscoveryCoordinator",
            "StructureAnalyst",
            "SqlLeafScanner",
            "ScriptScanner",
            "OrchestrationScanner",
            "CatalogUsageHarvester",
        ]
        if pipe == "discover"
        else ["InventoryProfiler", "LineageStitcher"]
    )
    queue_msg = (
        "Live Cursor discovery scan queued — leaf→root (SQL → scripts → DAGs → catalog)"
        if pipe == "discover"
        else "Live Cursor inventory & lineage queued — InventoryProfiler → LineageStitcher"
    )

    run = DiscoveryRun(
        project_id=project_id,
        status="queued",
        source_type=p.legacy_source_type or "sample",
        legacy_root=str(root),
        summary={
            "pipeline": pipe,
            **(
                {
                    "prior_discover_run_id": prior_discover.id,
                    "chained_from": "discover/activity",
                }
                if prior_discover is not None
                else {}
            ),
        },
    )
    db.add(run)
    p.phase = "1_discovery"
    db.commit()
    db.refresh(run)
    db.add(
        DiscoveryStep(
            run_id=run.id,
            seq=1,
            name="queued",
            status="success",
            message=queue_msg,
            detail={
                "legacy_root": str(root),
                "runtime": "cursor_sdk",
                "pipeline": pipe,
                "agents": agents,
            },
        )
    )
    audit(db, project_id, user.email, "discovery.queued", entity_id=run.id, detail={"pipeline": pipe})
    db.commit()

    background_tasks.add_task(
        execute_discovery_run,
        run.id,
        project_id=project_id,
        actor=user.email,
        pipeline=pipe,
    )
    return {
        "run_id": run.id,
        "status": run.status,
        "pipeline": pipe,
        "message": f"{pipe.title()} queued — poll /discovery/runs/{run.id} for live Cursor agent steps",
        "runtime": "cursor_sdk",
    }

@app.get("/projects/{project_id}/discovery/runs")
def discovery_runs(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    rows = (
        db.query(DiscoveryRun)
        .filter_by(project_id=project_id)
        .order_by(DiscoveryRun.id.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": r.id,
            "status": r.status,
            "source_type": r.source_type,
            "legacy_root": r.legacy_root,
            "summary": r.summary,
            "error": r.error,
            "created_at": r.created_at,
            "completed_at": r.completed_at,
        }
        for r in rows
    ]


@app.get("/projects/{project_id}/discovery/runs/{run_id}")
def discovery_run_detail(
    project_id: int,
    run_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    run = db.query(DiscoveryRun).filter_by(id=run_id, project_id=project_id).first()
    if not run:
        raise HTTPException(404, "Discovery run not found")
    steps = (
        db.query(DiscoveryStep)
        .filter_by(run_id=run.id)
        .order_by(DiscoveryStep.seq.asc())
        .all()
    )
    return {
        "id": run.id,
        "status": run.status,
        "source_type": run.source_type,
        "legacy_root": run.legacy_root,
        "summary": run.summary,
        "error": run.error,
        "created_at": run.created_at,
        "completed_at": run.completed_at,
        "steps": [
            {
                "id": s.id,
                "seq": s.seq,
                "name": s.name,
                "status": s.status,
                "message": s.message,
                "detail": s.detail,
                "duration_ms": s.duration_ms,
                "created_at": s.created_at,
            }
            for s in steps
        ],
    }

@app.get("/projects/{project_id}/inventory")
def inventory(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    objs = db.query(InventoryObject).filter_by(project_id=project_id).all()
    out = []
    for o in objs:
        cols = db.query(InventoryColumn).filter_by(object_id=o.id).all()
        out.append(
            {
                **{c.name: getattr(o, c.name) for c in o.__table__.columns},
                "columns": [
                    {
                        "id": c.id,
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
    return out


@app.get("/projects/{project_id}/lineage")
def lineage(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    edges = db.query(LineageEdge).filter_by(project_id=project_id).all()
    inv_tables = (
        db.query(InventoryObject)
        .filter_by(project_id=project_id, object_type="table")
        .all()
    )
    nodes: set[str] = set()
    edge_list = []
    seen_edge: set[tuple[str, str, str, str]] = set()
    for e in edges:
        key = (e.source_fqn, e.target_fqn, e.job_name or "", e.edge_type or "")
        if key in seen_edge:
            continue
        seen_edge.add(key)
        # Omit synthetic dag: placeholders from API surface
        if (e.source_fqn or "").startswith("dag:") or (e.target_fqn or "").startswith("dag:"):
            continue
        nodes.add(e.source_fqn)
        nodes.add(e.target_fqn)
        edge_list.append(
            {
                "id": e.id,
                "source": e.source_fqn,
                "target": e.target_fqn,
                "transformation": e.transformation,
                "job_name": e.job_name,
                "edge_type": e.edge_type,
            }
        )

    def _is_table_fqn(fqn: str) -> bool:
        if not fqn or ":" in fqn:
            return False
        if fqn.startswith(("dag.", "git.", "scripts.", "job_")):
            return False
        return "." in fqn

    linked_tables = sorted({n for n in nodes if _is_table_fqn(n)})
    linked_l = {n.lower() for n in linked_tables}
    unlinked_tables = sorted(
        o.fully_qualified_name
        for o in inv_tables
        if o.fully_qualified_name and o.fully_qualified_name.lower() not in linked_l
    )

    return {
        "nodes": [{"id": n, "label": n} for n in sorted(nodes)],
        "edges": edge_list,
        "stats": {
            "edge_count": len(edge_list),
            "linked_table_count": len(linked_tables),
            "unlinked_table_count": len(unlinked_tables),
            "inventory_table_count": len(inv_tables),
            "linked_tables": linked_tables,
            "unlinked_tables": unlinked_tables,
            "source": "lineage_stitcher",
        },
    }


@app.get("/projects/{project_id}/jobs")
def jobs(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    return [
        {
            "id": j.id,
            "name": j.name,
            "schedule": j.schedule,
            "sla_minutes": j.sla_minutes,
            "script_path": j.script_path,
            "depends_on": j.depends_on,
            "params": j.params,
        }
        for j in db.query(JobNode).filter_by(project_id=project_id).all()
    ]


@app.post("/projects/{project_id}/inventory/signoff")
def inventory_signoff(
    project_id: int,
    body: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "change_board", "product_owner", "engineer")
    ),
) -> ProjectOut:
    """Approve Discovery → Decide using Inventory + Activity stage evidence."""
    from app.services.discovery_stage import (
        latest_completed_run,
        save_hitl_decisions,
        stage_status,
    )

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    payload = body if isinstance(body, dict) else {}
    decisions = payload.get("decisions") if isinstance(payload.get("decisions"), dict) else {}
    agent_run_id = payload.get("agent_run_id")
    # Flush any HITL Accept/Flag from Review before gate check (source of truth = API)
    if decisions:
        save_hitl_decisions(
            db,
            project_id,
            {str(k): str(v) for k, v in decisions.items()},
            reviewer=user.email,
            agent_run_id=int(agent_run_id) if agent_run_id else None,
        )

    status = stage_status(db, p)
    discover = latest_completed_run(db, project_id, "discover")
    inventory_run = latest_completed_run(db, project_id, "inventory")
    if not discover:
        raise HTTPException(400, "Complete Activity scan before sign-off")
    if not inventory_run and not status["inventory_count"]:
        raise HTTPException(
            400,
            "Run Find inventory first — Review signs off the Inventory catalog + lineage",
        )
    if not status["inventory_count"]:
        raise HTTPException(400, "Run Inventory first — no catalog objects stored")
    if not status["lineage_edge_count"]:
        raise HTTPException(400, "Run Inventory until Lineage edges are stored")

    # Approve → Decide is the gate: apply any remaining pending findings as accepted
    remaining = (
        db.query(ReviewItem)
        .filter_by(project_id=project_id, review_type="discovery_finding", status="pending")
        .all()
    )
    for row in remaining:
        row.status = "approved"
        row.reviewer = user.email
        row.decision_notes = "accepted_on_signoff"
        payload_row = dict(row.payload or {})
        payload_row["decision"] = "accepted"
        payload_row["key"] = payload_row.get("key") or row.title
        row.payload = payload_row
        if agent_run_id:
            try:
                row.agent_run_id = int(agent_run_id)
            except (TypeError, ValueError):
                pass
    if remaining:
        db.commit()

    p.inventory_signed_off = True
    p.phase = "2_disposition"
    # Fresh Decide board — dispositions appear only after Analyze
    cleared = clear_dispositions(db, project_id)
    p.disposition_approved = False
    stage_snapshot = {
        **status,
        "discover_run_id": discover.id if discover else status.get("discover_run_id"),
        "inventory_run_id": inventory_run.id if inventory_run else status.get("inventory_run_id"),
        "discover_legacy_root": discover.legacy_root if discover else "",
        "inventory_legacy_root": inventory_run.legacy_root if inventory_run else "",
        "prior_stages": ["discover/activity", "discover/inventory", "discover/lineage"],
    }
    audit(
        db,
        project_id,
        user.email,
        "inventory.signoff",
        detail={"cleared_dispositions": cleared, "stage": stage_snapshot},
    )
    db.commit()
    db.refresh(p)
    try:
        from app.services.project_workspace import export_review_signoff

        export_review_signoff(p, signed_by=user.email, stage_snapshot=stage_snapshot)
    except Exception as exc:
        # Sign-off already committed; surface path failure in logs without rolling back gate
        import logging

        logging.getLogger(__name__).exception(
            "Failed to export discover/review signoff for project %s: %s",
            project_id,
            exc,
        )
    return p


@app.get("/projects/{project_id}/discovery/stage")
def discovery_stage(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    from app.services.discovery_stage import stage_status

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return stage_status(db, p)


@app.get("/projects/{project_id}/workspace")
def project_workspace(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Full section/view tree under this project's migration-repo."""
    from app.services.project_workspace import list_stage_tree

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return list_stage_tree(p)


@app.get("/projects/{project_id}/stages")
def stages_list(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    from app.services.project_workspace import list_stage_tree

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return list_stage_tree(p)


@app.get("/projects/{project_id}/stages/{section}/{view}")
def stage_get(
    project_id: int,
    section: str,
    view: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Load this page's artifacts + prior page latest (for chaining)."""
    from app.services.project_workspace import PHASE_TREE, read_stage_bundle

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if section not in PHASE_TREE or view not in PHASE_TREE[section]:
        raise HTTPException(404, f"Unknown stage {section}/{view}")
    return read_stage_bundle(p, f"{section}/{view}")


@app.get("/projects/{project_id}/stages/{section}/{view}/prior")
def stage_prior(
    project_id: int,
    section: str,
    view: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Prior page output that this view should consume."""
    from app.services.project_workspace import (
        PHASE_TREE,
        prior_stage_key,
        read_stage_bundle,
    )

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if section not in PHASE_TREE or view not in PHASE_TREE[section]:
        raise HTTPException(404, f"Unknown stage {section}/{view}")
    prior = prior_stage_key(f"{section}/{view}")
    if not prior:
        return {"stage": f"{section}/{view}", "prior_stage": None, "prior": None}
    bundle = read_stage_bundle(p, prior)
    return {
        "stage": f"{section}/{view}",
        "prior_stage": prior,
        "prior": bundle,
    }


@app.post("/projects/{project_id}/stages/{section}/{view}")
def stage_write(
    project_id: int,
    section: str,
    view: str,
    body: dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("engineer", "architect", "product_owner", "change_board")
    ),
) -> dict[str, Any]:
    """Generic write of page artifacts (filename → JSON) + refresh latest.json."""
    from app.services.project_workspace import (
        PHASE_TREE,
        read_stage_bundle,
        write_json,
        write_stage_manifest,
    )

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if section not in PHASE_TREE or view not in PHASE_TREE[section]:
        raise HTTPException(404, f"Unknown stage {section}/{view}")
    stage = f"{section}/{view}"
    artifacts = body.get("artifacts") or {}
    if not isinstance(artifacts, dict):
        raise HTTPException(400, "artifacts must be an object of filename → JSON")
    written: list[str] = []
    for name, data in artifacts.items():
        safe = str(name).replace("/", "_").replace("..", "_")
        if not safe.endswith(".json"):
            safe = f"{safe}.json"
        write_json(p, stage, safe, data)
        written.append(safe)
    status = str(body.get("status") or "updated")
    summary = body.get("summary") if isinstance(body.get("summary"), dict) else {}
    write_stage_manifest(
        p,
        stage,
        run_id=body.get("run_id"),
        status=status,
        prior_stage=body.get("prior_stage"),
        summary=summary,
        artifacts=written,
    )
    audit(
        db,
        project_id,
        user.email,
        "stage.write",
        detail={"stage": stage, "artifacts": written},
    )
    db.commit()
    return read_stage_bundle(p, stage)


@app.get("/projects/{project_id}/discovery/hitl")
def discovery_hitl_get(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    from app.services.discovery_stage import load_hitl_decisions

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return {"decisions": load_hitl_decisions(db, project_id)}


@app.post("/projects/{project_id}/discovery/hitl")
def discovery_hitl_save(
    project_id: int,
    body: dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "change_board", "product_owner", "engineer")
    ),
) -> dict[str, Any]:
    from app.services.discovery_stage import save_hitl_decisions

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    decisions = body.get("decisions") or {}
    if not isinstance(decisions, dict):
        raise HTTPException(400, "decisions must be an object of key → accepted|flagged")
    agent_run_id = body.get("agent_run_id")
    saved = save_hitl_decisions(
        db,
        project_id,
        {str(k): str(v) for k, v in decisions.items()},
        reviewer=user.email,
        agent_run_id=int(agent_run_id) if agent_run_id else None,
    )
    audit(
        db,
        project_id,
        user.email,
        "discovery.hitl",
        detail={"keys": list(saved.keys())},
    )
    db.commit()
    return {"decisions": saved}


# ---------- Disposition ----------


def _persist_disposition_register(
    db: Session,
    project: Project,
    *,
    run_id: int | None = None,
    status: str = "analyzed",
    summary: dict[str, Any] | None = None,
) -> None:
    from app.services.project_workspace import (
        export_disposition_register,
        serialize_disposition_register,
    )

    rows = db.query(Disposition).filter_by(project_id=project.id).all()
    objs = {
        o.id: o
        for o in db.query(InventoryObject).filter_by(project_id=project.id).all()
    }
    register = serialize_disposition_register(rows, objects_by_id=objs)
    export_disposition_register(
        project,
        register,
        summary=summary,
        run_id=run_id,
        status=status,
    )


@app.post("/projects/{project_id}/disposition/analyze")
def disposition_analyze(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board", "product_owner")),
) -> dict[str, Any]:
    """Run disposition agents and materialize recommendations for all inventory object types."""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.inventory_signed_off:
        raise HTTPException(
            400,
            "Sign off Discovery Review first — Decide consumes the signed inventory pack",
        )

    # Prefer Discover disk artifacts when DB catalog is empty
    hydrate = hydrate_inventory_from_discover_disk(db, p)
    if hydrate.get("hydrated_objects"):
        db.commit()

    objs = objects_for_disposition(db, project_id)
    if not objs:
        raise HTTPException(
            400,
            "No inventory objects to analyze — complete Discovery Inventory "
            "(and ensure migration-repo/inventory/objects.json exists)",
        )

    edges = db.query(LineageEdge).filter_by(project_id=project_id).all()
    deps = build_dependents_map(edges)
    payload_objects = [
        {
            "object_id": o.id,
            "fqn": o.fully_qualified_name,
            "name": o.name,
            "schema": o.schema_name,
            "object_type": o.object_type,
            "access_count": o.access_count or 0,
            "consumers": o.consumers or [],
            "dependents": deps.get(o.fully_qualified_name or "", []),
            "retention_required": bool(o.retention_required),
            "unsound": bool((o.extra or {}).get("unsound_logic")),
            "duplicate_of": (o.extra or {}).get("duplicate_of"),
        }
        for o in objs
    ]

    # Materialize first so API returns a populated board immediately
    result = materialize_dispositions(
        db,
        project_id,
        agent_meta={
            "agents": [
                "UsageProfiler",
                "LineageImpactAgent",
                "RetentionPolicyAgent",
                "DispositionRecommender",
            ],
            "source": "disposition_analyze",
            "hydrate": hydrate,
        },
    )

    agent_out = run_agent_task(
        "disposition_analyze",
        {
            "objects": payload_objects,
            "recommendations": result.get("recommendations") or [],
        },
    )

    run = AgentRun(
        project_id=project_id,
        task="disposition_analyze",
        status="completed",
        input_artifact_ids=[],
        prompt_version="v1",
        standards_version="sid-party-1.0",
        output=agent_out,
        steps=agent_out.get("steps") or [],
        confidence=float(agent_out.get("confidence") or 0.88),
        completed_at=datetime.utcnow(),
    )
    db.add(run)
    audit(
        db,
        project_id,
        user.email,
        "disposition.analyze",
        detail={
            "count": result["dispositions"],
            "by_object_type": result.get("by_object_type"),
            "by_recommendation": result.get("by_recommendation"),
            "hydrate": hydrate,
        },
    )
    db.commit()
    db.refresh(run)

    try:
        _persist_disposition_register(
            db,
            p,
            run_id=run.id,
            status="analyzed",
            summary={
                "by_object_type": result.get("by_object_type") or {},
                "by_recommendation": result.get("by_recommendation") or {},
                "hydrate": hydrate,
            },
        )
    except Exception:
        pass

    return {
        "dispositions": result["dispositions"],
        "by_object_type": result.get("by_object_type") or {},
        "by_recommendation": result.get("by_recommendation") or {},
        "run_id": run.id,
        "hydrate": hydrate,
        "migration_repo_disposition": f"migration-repo/disposition",
        "agents": [
            "UsageProfiler",
            "LineageImpactAgent",
            "RetentionPolicyAgent",
            "DispositionRecommender",
        ],
        "confidence": run.confidence,
    }


@app.post("/projects/{project_id}/disposition/compute")
def disposition_compute(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "change_board", "product_owner")),
) -> dict[str, Any]:
    """Back-compat alias for Analyze (same agent pipeline)."""
    return disposition_analyze(project_id, db, user)


@app.get("/projects/{project_id}/disposition", response_model=list[DispositionOut])
def disposition_list(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[DispositionOut]:
    rows = db.query(Disposition).filter_by(project_id=project_id).all()
    out = []
    for d in rows:
        obj = db.query(InventoryObject).get(d.object_id)
        item = DispositionOut.model_validate(d)
        item.object_fqn = obj.fully_qualified_name if obj else None
        item.object_type = obj.object_type if obj else None
        out.append(item)
    return out


@app.patch("/projects/{project_id}/disposition/{disp_id}")
def disposition_override(
    project_id: int,
    disp_id: int,
    body: DispositionOverride,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("engineer", "architect", "change_board", "product_owner")
    ),
) -> DispositionOut:
    d = db.query(Disposition).filter_by(id=disp_id, project_id=project_id).first()
    if not d:
        raise HTTPException(404, "Disposition not found")
    override = (body.override or "").strip().lower()
    allowed = {"migrate", "rebuild", "consolidate", "archive-only", "retire"}
    if override not in allowed:
        raise HTTPException(400, f"override must be one of {sorted(allowed)}")
    d.override = override
    d.final = override
    if override in {"retire", "archive-only"}:
        # Enter retirement queue; Notify / Freeze / Advance drive the path
        if d.retirement_state in ("none", "", None) or d.retirement_state not in {
            "notified",
            "frozen",
            "silence",
            "archived",
            "decommissioned",
        }:
            d.retirement_state = "none"
    else:
        d.retirement_state = "none"
    audit(
        db,
        project_id,
        user.email,
        "disposition.override",
        entity_type="disposition",
        entity_id=disp_id,
        detail={"override": override},
    )
    db.commit()
    db.refresh(d)
    try:
        p = db.query(Project).get(project_id)
        if p:
            _persist_disposition_register(db, p, status="updated")
    except Exception:
        pass
    obj = db.query(InventoryObject).get(d.object_id)
    item = DispositionOut.model_validate(d)
    item.object_fqn = obj.fully_qualified_name if obj else None
    item.object_type = obj.object_type if obj else None
    return item


@app.post("/projects/{project_id}/disposition/{disp_id}/advance-retirement")
def advance_retirement(
    project_id: int,
    disp_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("engineer", "change_board", "architect", "data_owner")
    ),
) -> DispositionOut:
    d = db.query(Disposition).filter_by(id=disp_id, project_id=project_id).first()
    if not d:
        raise HTTPException(404, "Disposition not found")
    if d.final not in {"retire", "archive-only"}:
        raise HTTPException(400, "Only retire / archive-only objects follow the retirement path")
    nxt = next_retirement_state(d.retirement_state)
    # Compliance: final decommission requires Data Owner (or Change Board)
    if nxt == "decommissioned" and user.role not in {"data_owner", "change_board"}:
        raise HTTPException(
            403,
            "Decommission requires Data Owner or Change Board compliance sign-off",
        )
    d.retirement_state = nxt
    if d.retirement_state == "archived":
        obj = db.query(InventoryObject).get(d.object_id)
        if obj:
            gcs.write_object(
                "archive",
                f"project_{project_id}/{obj.fully_qualified_name}.json",
                f'{{"archived": "{obj.fully_qualified_name}"}}',
            )
    audit(
        db,
        project_id,
        user.email,
        "retirement.advance",
        entity_type="disposition",
        entity_id=disp_id,
        detail={"state": d.retirement_state},
    )
    db.commit()
    db.refresh(d)
    try:
        p = db.query(Project).get(project_id)
        if p:
            _persist_disposition_register(db, p, status="updated")
    except Exception:
        pass
    obj = db.query(InventoryObject).get(d.object_id)
    item = DispositionOut.model_validate(d)
    item.object_fqn = obj.fully_qualified_name if obj else None
    item.object_type = obj.object_type if obj else None
    return item


@app.post("/projects/{project_id}/disposition/notify-consumers")
def disposition_notify_consumers(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("engineer", "change_board", "architect", "product_owner")
    ),
) -> dict[str, Any]:
    """Advance retire/archive candidates from queued → notified (consumer freeze start)."""
    rows = (
        db.query(Disposition)
        .filter_by(project_id=project_id)
        .filter(Disposition.final.in_(["retire", "archive-only"]))
        .all()
    )
    updated = 0
    consumers: set[str] = set()
    for d in rows:
        for c in (d.evidence or {}).get("consumers") or []:
            consumers.add(str(c))
        if d.retirement_state in ("none", "", None):
            d.retirement_state = "notified"
            updated += 1
    audit(
        db,
        project_id,
        user.email,
        "retirement.notify_consumers",
        detail={"updated": updated, "consumers": sorted(consumers)[:40]},
    )
    db.commit()
    try:
        p = db.query(Project).get(project_id)
        if p:
            _persist_disposition_register(db, p, status="retirement_notified")
    except Exception:
        pass
    return {
        "updated": updated,
        "consumers": sorted(consumers),
        "message": f"Notified consumers for {updated} retirement candidates",
    }


@app.post("/projects/{project_id}/disposition/freeze-scope")
def disposition_freeze_scope(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "change_board", "architect")),
) -> dict[str, Any]:
    """Move notified retirement candidates to frozen (change freeze on legacy)."""
    rows = db.query(Disposition).filter_by(project_id=project_id).all()
    updated = 0
    for d in rows:
        if d.final in {"retire", "archive-only"} and d.retirement_state == "notified":
            d.retirement_state = "frozen"
            updated += 1
        elif d.final in {"migrate", "rebuild"} and d.retirement_state in ("none", "", None):
            d.evidence = {**(d.evidence or {}), "cutover_freeze": True}
            updated += 1
    audit(
        db,
        project_id,
        user.email,
        "retirement.freeze_scope",
        detail={"updated": updated},
    )
    db.commit()
    try:
        p = db.query(Project).get(project_id)
        if p:
            _persist_disposition_register(db, p, status="retirement_frozen")
    except Exception:
        pass
    return {"updated": updated, "message": f"Freeze applied to {updated} objects"}


@app.post("/projects/{project_id}/disposition/approve")
def disposition_approve(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("change_board", "architect", "product_owner", "engineer")
    ),
) -> ProjectOut:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.inventory_signed_off:
        raise HTTPException(400, "Discovery must be signed off before approving Decide")
    rows = db.query(Disposition).filter_by(project_id=project_id).all()
    if not rows:
        raise HTTPException(400, "Analyze dispositions first — Board register is empty")
    for d in rows:
        d.approved = True
    p.disposition_approved = True
    p.phase = "3_mapping"
    audit(db, project_id, user.email, "disposition.approve")
    db.commit()
    db.refresh(p)
    try:
        from app.services.project_workspace import (
            export_disposition_approval,
            serialize_disposition_register,
        )

        objs = {
            o.id: o
            for o in db.query(InventoryObject).filter_by(project_id=project_id).all()
        }
        register = serialize_disposition_register(rows, objects_by_id=objs)
        benefits = disposition_benefits(project_id, db, user)
        export_disposition_approval(
            p,
            approved_by=user.email,
            register=register,
            benefits=benefits,
        )
        _persist_disposition_register(
            db,
            p,
            status="approved",
            summary={"benefits": benefits},
        )
    except Exception:
        pass
    return p


@app.get("/projects/{project_id}/disposition/benefits")
def disposition_benefits(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    rows = db.query(Disposition).filter_by(project_id=project_id).all()
    counts: dict[str, int] = {}
    by_type: dict[str, int] = {}
    retirement_states: dict[str, int] = {}
    for d in rows:
        counts[d.final] = counts.get(d.final, 0) + 1
        obj = db.query(InventoryObject).get(d.object_id)
        otype = (obj.object_type if obj else None) or (d.evidence or {}).get("object_type") or "table"
        by_type[str(otype)] = by_type.get(str(otype), 0) + 1
        if d.final in {"retire", "archive-only"}:
            st = d.retirement_state or "none"
            if st in ("", None):
                st = "none"
            retirement_states[st] = retirement_states.get(st, 0) + 1

    total = len(rows)
    survivors = counts.get("migrate", 0) + counts.get("rebuild", 0)
    not_migrated = (
        counts.get("retire", 0)
        + counts.get("archive-only", 0)
        + counts.get("consolidate", 0)
    )
    monthly = not_migrated * 85
    annual = monthly * 12
    avoid_pct = round((not_migrated / total) * 100, 1) if total else 0.0
    migrate_pct = round((survivors / total) * 100, 1) if total else 0.0

    mix = [
        {
            "disposition": k,
            "count": counts.get(k, 0),
            "pct": round((counts.get(k, 0) / total) * 100, 1) if total else 0.0,
        }
        for k in ("migrate", "rebuild", "consolidate", "archive-only", "retire")
        if counts.get(k, 0)
    ]

    narrative = (
        f"Of {total} inventoried objects, {not_migrated} ({avoid_pct}%) are not migrated "
        f"(retire / archive-only / consolidate), avoiding an estimated "
        f"${monthly:,}/mo (${annual:,}/yr) in illustrative infra and license cost. "
        f"{survivors} objects ({migrate_pct}%) remain as migrate/rebuild survivors for Wave-1."
        if total
        else "Run Analyze on the Board to build the decommission benefits case."
    )

    return {
        "by_disposition": counts,
        "by_object_type": by_type,
        "mix": mix,
        "retirement_states": retirement_states,
        "register_size": total,
        "survivors": survivors,
        "objects_not_migrated": not_migrated,
        "avoid_pct": avoid_pct,
        "migrate_pct": migrate_pct,
        "estimated_monthly_infra_saved_usd": monthly,
        "estimated_annual_infra_saved_usd": annual,
        "unit_cost_usd": 85,
        "narrative": narrative,
    }


# ---------- Mapping ----------


@app.post("/projects/{project_id}/mappings/generate")
def mappings_generate(
    project_id: int,
    background_tasks: BackgroundTasks,
    body: MappingGenerateIn = MappingGenerateIn(),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "product_owner")),
) -> dict[str, Any]:
    """Queue Standards Mapping Agent (async) — workbench polls AgentRun for terminal output."""
    opts = body
    use_llm = bool(opts.advanced_ai or opts.use_llm)

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.disposition_approved:
        raise HTTPException(400, "Approve disposition register (Decide) before mapping")

    # Seed Align inputs from Decide disk pack
    try:
        from app.services.project_workspace import (
            read_json,
            read_prior_stage,
            write_json,
            write_stage_manifest,
        )

        disp = read_prior_stage(p, "decide/approve") or read_prior_stage(p, "decide/board")
        register = (
            read_json(p, "decide/approve", "register.json")
            or read_json(p, "decide/board", "register.json")
            or []
        )
        write_json(
            p,
            "align/workbench",
            "input_from_decide.json",
            {
                "disposition_status": (disp or {}).get("status"),
                "register": register,
                "survivors": [
                    r
                    for r in register
                    if (r.get("final") or "") in {"migrate", "rebuild"}
                ],
            },
        )
        write_stage_manifest(
            p,
            "align/workbench",
            status="queued",
            prior_stage="decide/approve",
            summary={"register_size": len(register)},
            artifacts=["input_from_decide.json"],
        )
    except Exception:
        pass

    run = AgentRun(
        project_id=project_id,
        task="standards_mapping",
        status="queued",
        input_artifact_ids=[],
        prompt_version="v2",
        standards_version="sid-tmforum-1.2",
        steps=[
            {
                "name": "queued",
                "status": "running",
                "message": "Queued Standards Mapping Agent",
                "detail": {"agent": "MappingCoordinator"},
            }
        ],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    background_tasks.add_task(
        execute_mapping_run,
        run.id,
        project_id,
        actor=user.email,
        use_llm=use_llm,
    )
    return {
        "run_id": run.id,
        "status": "queued",
        "advanced_ai": use_llm,
        "message": "Standards Mapping Agent queued",
    }


@app.get("/projects/{project_id}/mappings", response_model=list[MappingOut])
def mappings_list(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[MappingRow]:
    return db.query(MappingRow).filter_by(project_id=project_id).all()


@app.patch("/projects/{project_id}/mappings/{mapping_id}", response_model=MappingOut)
def mappings_patch(
    project_id: int,
    mapping_id: int,
    body: MappingPatch,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "engineer", "change_board", "product_owner")
    ),
) -> MappingRow:
    row = db.query(MappingRow).filter_by(id=mapping_id, project_id=project_id).first()
    if not row:
        raise HTTPException(404, "Mapping not found")
    data = body.model_dump(exclude_unset=True)
    explicit_status = "status" in data and data.get("status") is not None
    for k, v in data.items():
        if v is not None:
            setattr(row, k, v)
    # Filling SID on an open gap → proposed, unless the human set an explicit status
    # (e.g. Accept → approved, Flag → keep gap).
    if (
        not explicit_status
        and row.domain
        and row.entity
        and row.attribute
        and row.status == "gap"
    ):
        row.status = "proposed"
        row.conformance = row.conformance or "extension"
        if not row.gap_reason:
            row.gap_reason = ""
    # Flagged gaps stay documented as gaps
    if explicit_status and data.get("status") == "gap":
        row.status = "gap"
        row.conformance = "gap"
        if not (row.gap_reason or "").strip():
            row.gap_reason = "Flagged in Gaps review — needs architecture decision"
    cites = list(row.citations or [])
    decision = None
    if explicit_status and data.get("status") == "approved":
        decision = "accepted"
    elif explicit_status and data.get("status") == "gap":
        decision = "flagged"
    cites.append(
        {
            "type": "human_review" if decision else "human_edit",
            "id": user.email,
            "ref": "gaps" if decision else "workbench",
            "status": row.status,
            "decision": decision,
        }
    )
    row.citations = cites
    audit(
        db,
        project_id,
        user.email,
        "mappings.patch",
        entity_id=mapping_id,
        detail=data,
    )
    db.commit()
    db.refresh(row)
    return row


@app.post("/projects/{project_id}/mappings/bulk-review")
def mappings_bulk_review(
    project_id: int,
    body: MappingBulkReviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "engineer", "change_board", "product_owner")
    ),
) -> dict[str, Any]:
    """Accept or flag many mapping rows in one call (Gaps review)."""
    decision = (body.decision or "").strip().lower()
    if decision not in ("accept", "flag"):
        raise HTTPException(400, "decision must be accept or flag")
    q = db.query(MappingRow).filter_by(project_id=project_id)
    if body.ids:
        rows = q.filter(MappingRow.id.in_(body.ids)).all()
    else:
        rows = q.all()
        # Default: only rows still needing review (not approved, no prior human_review)
        pending = []
        for r in rows:
            if r.status == "approved":
                continue
            cites = r.citations or []
            if any(
                isinstance(c, dict) and c.get("type") == "human_review" for c in cites
            ):
                continue
            if r.status == "gap" or r.conformance == "gap" or float(r.confidence or 1) < 0.8:
                pending.append(r)
        rows = pending
    updated = 0
    for row in rows:
        if decision == "accept":
            row.status = "approved"
            if not (row.justification or "").strip():
                row.justification = "Accepted in Gaps review (bulk)"
            row.gap_reason = ""
            decision_label = "accepted"
        else:
            row.status = "gap"
            row.conformance = "gap"
            if not (row.gap_reason or "").strip():
                row.gap_reason = "Flagged in Gaps review — needs architecture decision"
            decision_label = "flagged"
        cites = list(row.citations or [])
        cites.append(
            {
                "type": "human_review",
                "id": user.email,
                "ref": "gaps",
                "status": row.status,
                "decision": decision_label,
                "bulk": True,
            }
        )
        row.citations = cites
        updated += 1
    audit(
        db,
        project_id,
        user.email,
        "mappings.bulk_review",
        detail={"decision": decision, "updated": updated, "ids": body.ids},
    )
    db.commit()
    return {"updated": updated, "decision": decision}


@app.get("/projects/{project_id}/mappings/scorecard")
def mappings_scorecard(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    rows = db.query(MappingRow).filter_by(project_id=project_id).all()
    total = len(rows) or 1
    by_conf: dict[str, int] = {}
    approved = sum(1 for r in rows if r.status == "approved")
    gaps = sum(1 for r in rows if r.status == "gap")
    for r in rows:
        by_conf[r.conformance] = by_conf.get(r.conformance, 0) + 1
    return {
        "total": len(rows),
        "approved": approved,
        "gaps": gaps,
        "by_conformance": by_conf,
        "conformance_pct": round(100 * by_conf.get("conformant", 0) / total, 1),
        "coverage_pct": round(100 * by_conf.get("conformant", 0) / total, 1),
    }


@app.post("/projects/{project_id}/mappings/approve")
def mappings_approve(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("architect", "change_board", "engineer", "product_owner")),
) -> ProjectOut:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    rows = db.query(MappingRow).filter_by(project_id=project_id).all()
    if not rows:
        raise HTTPException(400, "Generate mappings first")
    for r in rows:
        if r.status != "gap":
            r.status = "approved"
    # Promote to this project's migration-repo/align/workbench (mappings pack)
    from app.services.project_workspace import resolve_migration_repo, write_stage_manifest

    repo = resolve_migration_repo(p) / "align" / "workbench"
    repo.mkdir(parents=True, exist_ok=True)
    import yaml

    payload = [
        {
            "legacy_object": r.legacy_object,
            "legacy_column": r.legacy_column,
            "domain": r.domain,
            "entity": r.entity,
            "attribute": r.attribute,
            "conformance": r.conformance,
        }
        for r in rows
        if r.status == "approved"
    ]
    (repo / "party_wave1.yaml").write_text(yaml.safe_dump(payload), encoding="utf-8")
    p.mapping_approved = True
    p.phase = "4_metadata"
    try:
        write_stage_manifest(
            p,
            "align/approve",
            status="approved",
            prior_stage="align/entities",
            summary={"mappings": len(payload)},
            artifacts=["party_wave1.yaml"],
        )
        write_stage_manifest(
            p,
            "align/workbench",
            status="approved",
            prior_stage="decide/approve",
            summary={"mappings": len(payload)},
            artifacts=["party_wave1.yaml", "input_from_decide.json"],
        )
    except Exception:
        pass
    audit(db, project_id, user.email, "mappings.approve")
    db.commit()
    db.refresh(p)
    return p


# ---------- Metadata ----------


def _mapped_sid_entities(db: Session, project_id: int) -> list[dict[str, Any]]:
    """Unique SID entities from mapping rows, with source legacy objects."""
    rows = db.query(MappingRow).filter_by(project_id=project_id).all()
    by_entity: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = (r.entity or "").strip()
        if not key:
            continue
        bucket = by_entity.setdefault(
            key,
            {
                "entity_key": key,
                "domain": (r.domain or "").strip(),
                "sources": set(),
                "attributes": [],
                "attr_keys": set(),
                "mapping_count": 0,
                "approved_count": 0,
                "gap_count": 0,
            },
        )
        if r.domain and not bucket["domain"]:
            bucket["domain"] = r.domain.strip()
        if r.legacy_object:
            bucket["sources"].add(r.legacy_object)
        bucket["mapping_count"] += 1
        if r.status == "approved":
            bucket["approved_count"] += 1
        if r.status == "gap" or r.conformance == "gap":
            bucket["gap_count"] += 1
        attr = (r.attribute or "").strip()
        if attr and attr not in bucket["attr_keys"]:
            bucket["attr_keys"].add(attr)
            bucket["attributes"].append(
                {
                    "attribute": attr,
                    "legacy_column": r.legacy_column or "",
                    "legacy_object": r.legacy_object or "",
                    "conformance": r.conformance or "",
                    "confidence": r.confidence,
                }
            )
    out = []
    for key in sorted(by_entity.keys()):
        b = by_entity[key]
        out.append(
            {
                "entity_key": b["entity_key"],
                "domain": b["domain"],
                "sources": sorted(b["sources"]),
                "attributes": b["attributes"],
                "attribute_count": len(b["attributes"]),
                "mapping_count": b["mapping_count"],
                "approved_count": b["approved_count"],
                "gap_count": b["gap_count"],
            }
        )
    return out


_ENTITY_SEED_TEMPLATES: dict[str, dict[str, Any]] = {
    "Party": {
        "business_term": "Party",
        "definition": "TM Forum SID Party — an individual or organization of interest to the enterprise",
        "system_of_record": "CRM",
        "criticality": "business-critical",
        "sensitivity": "personal",
        "lawful_basis": "contract",
        "policy_tags": ["PII", "sid:Party", "domain:Party"],
        "consumers": ["crm_360", "billing_reports"],
    },
    "Individual": {
        "business_term": "Individual",
        "definition": "TM Forum SID Individual — a person playing one or more Party roles",
        "system_of_record": "CRM",
        "criticality": "business-critical",
        "sensitivity": "personal",
        "lawful_basis": "contract",
        "policy_tags": ["PII", "sid:Individual", "domain:Party"],
        "consumers": ["crm_360"],
    },
    "Organization": {
        "business_term": "Organization",
        "definition": "TM Forum SID Organization — a company or legal entity Party",
        "system_of_record": "CRM",
        "criticality": "business-critical",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:Organization", "domain:Party"],
        "consumers": ["crm_360", "b2b_reports"],
    },
    "PartyRole": {
        "business_term": "Party Role",
        "definition": "TM Forum SID PartyRole — role a Party plays (customer, billing contact, etc.)",
        "system_of_record": "CRM",
        "criticality": "operational",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:PartyRole", "domain:Party"],
        "consumers": ["crm_360"],
    },
    "ContactMedium": {
        "business_term": "Contact Medium",
        "definition": "TM Forum SID ContactMedium — email, phone, or other contact channel for a Party",
        "system_of_record": "CRM",
        "criticality": "business-critical",
        "sensitivity": "personal",
        "lawful_basis": "contract",
        "policy_tags": ["PII", "sid:ContactMedium", "domain:Party"],
        "consumers": ["crm_360", "notification_hub"],
    },
    "GeographicAddress": {
        "business_term": "Geographic Address",
        "definition": "TM Forum SID GeographicAddress — postal / street address for a Party or site",
        "system_of_record": "CRM",
        "criticality": "operational",
        "sensitivity": "personal",
        "lawful_basis": "contract",
        "policy_tags": ["PII", "sid:GeographicAddress", "domain:Party"],
        "consumers": ["crm_360", "logistics"],
    },
    "CustomerAccount": {
        "business_term": "Customer Account",
        "definition": "TM Forum SID CustomerAccount — financial account managing the billing relationship",
        "system_of_record": "CRM",
        "criticality": "business-critical",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:CustomerAccount", "domain:Party"],
        "consumers": ["billing_reports"],
    },
    "Customer": {
        "business_term": "Customer",
        "definition": "TM Forum SID Customer — Party role acquiring products and services",
        "system_of_record": "CRM",
        "criticality": "business-critical",
        "sensitivity": "personal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:Customer", "domain:Customer"],
        "consumers": ["crm_360", "billing_reports"],
    },
    "CustomerUsage": {
        "business_term": "Customer Usage",
        "definition": "TM Forum SID CustomerUsage — measured service usage attributable to an account",
        "system_of_record": "Billing",
        "criticality": "business-critical",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:CustomerUsage", "domain:Customer"],
        "consumers": ["finance_pack", "usage_workspace"],
    },
    "CustomerBill": {
        "business_term": "Customer Bill",
        "definition": "TM Forum SID CustomerBill — invoice / charge summary for an account period",
        "system_of_record": "Billing",
        "criticality": "business-critical",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:CustomerBill", "domain:Customer"],
        "consumers": ["finance_pack"],
    },
    "AppliedCustomerBillingRate": {
        "business_term": "Applied Customer Billing Rate",
        "definition": "TM Forum SID AppliedCustomerBillingRate — rated charge applied to a bill",
        "system_of_record": "Billing",
        "criticality": "business-critical",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:AppliedCustomerBillingRate", "domain:Customer"],
        "consumers": ["finance_pack"],
    },
    "Product": {
        "business_term": "Product",
        "definition": "TM Forum SID Product — instantiated offering subscribed by a customer",
        "system_of_record": "Product Catalog",
        "criticality": "business-critical",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:Product", "domain:Product"],
        "consumers": ["product_workspace"],
    },
    "ProductOffering": {
        "business_term": "Product Offering",
        "definition": "TM Forum SID ProductOffering — marketable product specification",
        "system_of_record": "Product Catalog",
        "criticality": "operational",
        "sensitivity": "internal",
        "lawful_basis": "legitimate_interest",
        "policy_tags": ["sid:ProductOffering", "domain:Product"],
        "consumers": ["product_workspace"],
    },
    "Service": {
        "business_term": "Service",
        "definition": "TM Forum SID Service — customer- or resource-facing service instance",
        "system_of_record": "Service Inventory",
        "criticality": "business-critical",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:Service", "domain:Service"],
        "consumers": ["service_assurance"],
    },
    "CustomerFacingService": {
        "business_term": "Customer Facing Service",
        "definition": "TM Forum SID CustomerFacingService — service visible to the customer",
        "system_of_record": "Service Inventory",
        "criticality": "operational",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:CustomerFacingService", "domain:Service"],
        "consumers": ["service_assurance"],
    },
    "LogicalResource": {
        "business_term": "Logical Resource",
        "definition": "TM Forum SID LogicalResource — MSISDN, IP, or other logical identifier",
        "system_of_record": "Resource Inventory",
        "criticality": "business-critical",
        "sensitivity": "personal",
        "lawful_basis": "contract",
        "policy_tags": ["PII", "sid:LogicalResource", "domain:Resource"],
        "consumers": ["network_ops", "crm_360"],
    },
    "PhysicalResource": {
        "business_term": "Physical Resource",
        "definition": "TM Forum SID PhysicalResource — device, SIM, or hardware asset",
        "system_of_record": "Resource Inventory",
        "criticality": "operational",
        "sensitivity": "internal",
        "lawful_basis": "contract",
        "policy_tags": ["sid:PhysicalResource", "domain:Resource"],
        "consumers": ["network_ops"],
    },
    "RootEntity": {
        "business_term": "Root Entity",
        "definition": "TM Forum SID RootEntity — common identity / audit attributes shared across SID entities",
        "system_of_record": "Legacy DW",
        "criticality": "analytical",
        "sensitivity": "internal",
        "lawful_basis": "legitimate_interest",
        "policy_tags": ["sid:RootEntity", "domain:Common"],
        "consumers": ["dwh_analytics"],
    },
    "BusinessInteraction": {
        "business_term": "Business Interaction",
        "definition": "TM Forum SID BusinessInteraction — event, batch, or channel interaction",
        "system_of_record": "Legacy DW",
        "criticality": "operational",
        "sensitivity": "internal",
        "lawful_basis": "legitimate_interest",
        "policy_tags": ["sid:BusinessInteraction", "domain:Common"],
        "consumers": ["dwh_analytics", "ops_reports"],
    },
    "Characteristic": {
        "business_term": "Characteristic",
        "definition": "TM Forum SID Characteristic — name/value extension attribute on a SID entity",
        "system_of_record": "Legacy DW",
        "criticality": "analytical",
        "sensitivity": "internal",
        "lawful_basis": "legitimate_interest",
        "policy_tags": ["sid:Characteristic", "domain:Common"],
        "consumers": ["dwh_analytics"],
    },
}


def _seed_payload_for_entity(
    entity_key: str,
    domain: str = "",
    *,
    attributes: list[dict[str, Any]] | None = None,
    sources: list[str] | None = None,
) -> MetadataIn:
    tmpl = dict(_ENTITY_SEED_TEMPLATES.get(entity_key) or {})
    label = entity_key.replace("_", " ")
    dom = domain or "Common"
    if not tmpl:
        tmpl = {
            "business_term": label,
            "definition": f"TM Forum SID {dom}.{entity_key} — business metadata for Wave-1 alignment",
            "system_of_record": "Legacy DW",
            "criticality": "analytical",
            "sensitivity": "internal",
            "lawful_basis": "legitimate_interest",
            "policy_tags": [f"domain:{entity_key}", f"sid:{dom}"],
            "consumers": [],
        }

    attrs = attributes or []
    if attrs:
        mapped = ", ".join(
            f"{a.get('attribute')}←{a.get('legacy_column')}"
            for a in attrs[:12]
            if a.get("attribute")
        )
        extra = f" Mapped attributes ({len(attrs)}): {mapped}."
        if len(attrs) > 12:
            extra += f" (+{len(attrs) - 12} more)"
        tmpl["definition"] = (tmpl.get("definition") or "") + extra

    rules = list(tmpl.get("quality_rules") or [])
    for a in attrs[:8]:
        attr = a.get("attribute")
        col = a.get("legacy_column")
        if attr and col:
            rules.append(f"{attr} sourced from {col}")
    if sources:
        rules.append(f"sources: {', '.join(sources[:6])}")
    tmpl["quality_rules"] = list(dict.fromkeys(rules))

    return MetadataIn(
        entity_key=entity_key,
        owner="Dana Data Owner",
        steward="Sam Data Steward",
        **tmpl,
    )


@app.get("/projects/{project_id}/metadata", response_model=list[MetadataOut])
def metadata_list(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[BusinessMetadata]:
    return db.query(BusinessMetadata).filter_by(project_id=project_id).all()


@app.put("/projects/{project_id}/metadata", response_model=MetadataOut)
def metadata_upsert(
    project_id: int,
    body: MetadataIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("product_owner", "architect", "engineer", "data_owner", "data_steward")),
) -> BusinessMetadata:
    row = (
        db.query(BusinessMetadata)
        .filter_by(project_id=project_id, entity_key=body.entity_key)
        .first()
    )
    if not row:
        row = BusinessMetadata(project_id=project_id, entity_key=body.entity_key)
        db.add(row)
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    if body.policy_tags:
        dataplex.apply_tags(body.entity_key, body.policy_tags)
    audit(
        db,
        project_id,
        user.email,
        "metadata.upsert",
        entity_type="metadata",
        entity_id=body.entity_key,
    )
    db.commit()
    db.refresh(row)
    return row


@app.post("/projects/{project_id}/metadata/seed")
def metadata_seed(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            "engineer",
            "product_owner",
            "data_steward",
            "data_owner",
            "architect",
            "change_board",
        )
    ),
) -> dict[str, Any]:
    """Seed business metadata for every SID entity identified in mappings."""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    mapped = _mapped_sid_entities(db, project_id)
    entity_keys = [m["entity_key"] for m in mapped]

    # Always ensure Party / CustomerAccount when no mappings yet (demo baseline)
    if not entity_keys:
        entity_keys = ["Party", "CustomerAccount"]
        billing = bool(p and "billing" in ((p.sample_slug or "") + (p.name or "")).lower())
        if billing:
            entity_keys.extend(["CustomerUsage", "CustomerBill"])

    mapped_by_key = {m["entity_key"]: m for m in mapped}
    seeded = 0
    for key in entity_keys:
        existing = (
            db.query(BusinessMetadata)
            .filter_by(project_id=project_id, entity_key=key)
            .first()
        )
        if existing and (existing.owner or existing.definition):
            continue
        info = mapped_by_key.get(key) or {}
        payload = _seed_payload_for_entity(
            key,
            info.get("domain") or "",
            attributes=info.get("attributes") or [],
            sources=info.get("sources") or [],
        )
        metadata_upsert(project_id, payload, db, user)
        seeded += 1

    audit(
        db,
        project_id,
        user.email,
        "metadata.seed",
        detail={"seeded": seeded, "entities": entity_keys},
    )
    return {
        "seeded": seeded,
        "entities": entity_keys,
        "from_mappings": len(mapped),
    }


@app.get("/projects/{project_id}/metadata/completeness")
def metadata_completeness(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    """Completeness over SID entities identified in mappings (source → TM Forum)."""
    p = db.query(Project).get(project_id)
    mapped = _mapped_sid_entities(db, project_id)
    if mapped:
        required = [m["entity_key"] for m in mapped]
    else:
        billing = bool(p and "billing" in ((p.sample_slug or "") + (p.name or "")).lower())
        required = ["Party", "CustomerAccount"]
        if billing:
            required = ["CustomerUsage", "CustomerBill", "CustomerAccount"]

    rows = {
        m.entity_key: m
        for m in db.query(BusinessMetadata).filter_by(project_id=project_id).all()
    }
    mapped_by_key = {m["entity_key"]: m for m in mapped}
    checks = []
    for key in required:
        m = rows.get(key)
        missing = []
        if not m:
            missing = ["owner", "steward", "definition", "sensitivity"]
        else:
            for field, val in {
                "owner": m.owner,
                "steward": m.steward,
                "definition": m.definition,
                "sensitivity": m.sensitivity,
            }.items():
                if not val:
                    missing.append(field)
        info = mapped_by_key.get(key) or {}
        checks.append(
            {
                "entity_key": key,
                "complete": not missing,
                "missing": missing,
                "domain": info.get("domain") or "",
                "sources": info.get("sources") or [],
                "attributes": info.get("attributes") or [],
                "attribute_count": info.get("attribute_count") or 0,
                "mapping_count": info.get("mapping_count") or 0,
            }
        )
    complete = all(c["complete"] for c in checks) if checks else False
    return {
        "complete": complete,
        "checks": checks,
        "entities": mapped,
        "required_count": len(required),
    }


@app.post("/projects/{project_id}/metadata/complete")
def metadata_complete(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles(
            "product_owner",
            "change_board",
            "data_owner",
            "architect",
            "engineer",
        )
    ),
) -> ProjectOut:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    # Auto-seed from mappings so Complete is not blocked by empty catalogue
    try:
        metadata_seed(project_id, db, user)
    except Exception:
        pass
    comp = metadata_completeness(project_id, db, user)
    if not comp["complete"]:
        raise HTTPException(400, detail=comp)
    p.metadata_complete = True
    p.phase = "4_build"
    audit(db, project_id, user.email, "metadata.complete")
    db.commit()
    db.refresh(p)
    return p


# ---------- Build (platform conversion) ----------


@app.post("/projects/{project_id}/build/generate")
def build_generate(
    project_id: int,
    body: BuildGenerateIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "product_owner")),
) -> dict[str, Any]:
    from pathlib import Path

    from app.services.build_pack import generate_build_pack

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.metadata_complete:
        raise HTTPException(400, "Complete Align (metadata) before generating Build pack")
    if not p.disposition_approved:
        raise HTTPException(400, "Disposition register must be approved")

    targets = (body.targets if body else None) or None
    # Persist lane targets if provided (asset_type → target)
    if targets:
        saved = dict(p.build_targets or {})
        from app.services.build_pack import KIND_BY_ASSET

        for asset_type, tid in targets.items():
            kind = KIND_BY_ASSET.get(asset_type, "code")
            prev = saved.get(asset_type) if isinstance(saved.get(asset_type), dict) else {}
            saved[asset_type] = {**(prev or {}), "target": tid, "kind": kind}
        p.build_targets = saved

    summary = generate_build_pack(db, project_id, targets=targets)
    from app.services.project_workspace import resolve_migration_repo, write_stage_manifest

    repo = resolve_migration_repo(p) / "build" / "tables"
    arts = db.query(BuildArtifact).filter_by(project_id=project_id).all()
    for a in arts:
        kind = (a.kind or "table").lower()
        sub = "tables"
        if kind in {"code", "dataproc", "spark"}:
            sub = "code"
        elif kind in {"dag", "dags", "composer", "airflow"}:
            sub = "dags"
        path = resolve_migration_repo(p) / "build" / sub / a.target_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(a.content or "", encoding="utf-8")
    try:
        write_stage_manifest(
            p,
            "build/tables",
            status="generated",
            prior_stage="align/approve",
            summary=summary if isinstance(summary, dict) else {"total": summary},
            artifacts=["*"],
        )
    except Exception:
        pass
    p.build_approved = False
    audit(db, project_id, user.email, "build.generate", detail=summary)
    db.commit()
    return {"summary": summary, "count": summary.get("total", 0)}


@app.get("/projects/{project_id}/build/options")
def build_options(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    from app.services.build_pack import detect_conversion_lanes

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    lanes = detect_conversion_lanes(db, project_id)
    return {"lanes": lanes, "build_approved": bool(p.build_approved)}


@app.put("/projects/{project_id}/build/targets")
def build_set_targets(
    project_id: int,
    body: BuildTargetsIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "product_owner")),
) -> dict[str, Any]:
    from app.services.build_pack import (
        KIND_BY_ASSET,
        TARGET_OPTIONS,
        detect_conversion_lanes,
    )

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    saved = dict(p.build_targets or {})
    for asset_type, tid in (body.targets or {}).items():
        kind = KIND_BY_ASSET.get(asset_type, asset_type if asset_type in TARGET_OPTIONS else "code")
        options = TARGET_OPTIONS.get(kind) or TARGET_OPTIONS["code"]
        valid = {t["id"] for t in options}
        if tid not in valid:
            raise HTTPException(400, f"Invalid target {tid} for {asset_type}")
        prev = saved.get(asset_type) if isinstance(saved.get(asset_type), dict) else {}
        saved[asset_type] = {**(prev or {}), "target": tid, "kind": kind}
    p.build_targets = saved
    audit(db, project_id, user.email, "build.targets", detail=saved)
    db.commit()
    return {"lanes": detect_conversion_lanes(db, project_id), "targets": saved}


@app.get("/projects/{project_id}/build/artifacts", response_model=list[BuildArtifactOut])
def build_list(
    project_id: int,
    kind: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BuildArtifact]:
    q = db.query(BuildArtifact).filter_by(project_id=project_id)
    if kind:
        q = q.filter_by(kind=kind)
    return q.order_by(BuildArtifact.kind, BuildArtifact.id).all()


@app.get("/projects/{project_id}/build/summary")
def build_summary(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    from app.services.build_pack import summarize_build

    p = db.query(Project).get(project_id)
    summary = summarize_build(db, project_id)
    summary["build_approved"] = bool(p and p.build_approved)
    summary["metadata_complete"] = bool(p and p.metadata_complete)
    return summary


@app.patch("/projects/{project_id}/build/artifacts/{artifact_id}", response_model=BuildArtifactOut)
def build_patch(
    project_id: int,
    artifact_id: int,
    body: BuildArtifactPatch,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect")),
) -> BuildArtifact:
    row = (
        db.query(BuildArtifact)
        .filter_by(id=artifact_id, project_id=project_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Artifact not found")
    if body.status is not None:
        if body.status not in {"proposed", "reviewed", "approved", "rejected"}:
            raise HTTPException(400, "Invalid status")
        row.status = body.status
    if body.content is not None:
        row.content = body.content
    if body.title is not None:
        row.title = body.title
    audit(db, project_id, user.email, "build.artifact.patch", entity_type="build_artifact", entity_id=artifact_id)
    db.commit()
    db.refresh(row)
    return row


@app.post("/projects/{project_id}/build/approve", response_model=ProjectOut)
def build_approve(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "engineer", "change_board", "product_owner")
    ),
) -> ProjectOut:
    from app.services.build_pack import summarize_build

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.metadata_complete:
        raise HTTPException(400, "Align must be complete first")
    summary = summarize_build(db, project_id)
    if not summary.get("total"):
        raise HTTPException(400, "Generate the Build pack first")
    arts = db.query(BuildArtifact).filter_by(project_id=project_id).all()
    for a in arts:
        if a.status == "proposed":
            a.status = "approved"
    p.build_approved = True
    p.phase = "5_pilot_product"
    audit(db, project_id, user.email, "build.approve", detail=summary)
    db.commit()
    db.refresh(p)
    return p


@app.post("/projects/{project_id}/test-env/promote", response_model=ProjectOut)
def test_env_promote(
    project_id: int,
    body: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "engineer", "product_owner", "change_board")
    ),
) -> Project:
    """Promote selected SDPs into the Test environment for dual-run."""
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not p.build_approved or not p.metadata_complete:
        raise HTTPException(
            400, "Complete Align and approve Build before promoting to Test"
        )
    payload = body or {}
    product_ids = payload.get("product_ids") or []
    if not product_ids:
        product_ids = [
            r.id
            for r in db.query(DataProduct)
            .filter_by(project_id=project_id)
            .filter(DataProduct.product_tier == "sdp")
            .all()
        ]
    products = (
        db.query(DataProduct)
        .filter(DataProduct.project_id == project_id, DataProduct.id.in_(product_ids))
        .all()
        if product_ids
        else []
    )
    env = {
        "environment": payload.get("environment") or "test",
        "promoted_at": datetime.utcnow().isoformat() + "Z",
        "promoted_by": user.email,
        "product_ids": [r.id for r in products],
        "products": [
            {
                "id": r.id,
                "name": r.name,
                "dataset_name": r.dataset_name,
                "tier": getattr(r, "product_tier", None) or "sdp",
            }
            for r in products
        ],
        "spoke": "spoke-products-test",
        "dual_run_enabled": True,
        "notes": "Legacy + migrated pipelines can now execute in parallel on Test.",
    }
    p.test_env = env
    p.test_env_ready = True
    # Ensure promoted SDPs are runnable for dual pipeline
    for r in products:
        if (r.status or "").lower() in {"suggested", "proposed", "draft"}:
            r.status = "approved"
    audit(
        db,
        project_id,
        user.email,
        "test_env.promote",
        detail={"product_ids": env["product_ids"], "environment": env["environment"]},
    )
    db.commit()
    db.refresh(p)
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        write_json(p, "pilot/test_env", "promotion.json", env)
        write_stage_manifest(
            p,
            "pilot/test_env",
            status="ready",
            prior_stage="products",
            summary=env,
            artifacts=["promotion.json"],
        )
    except Exception:
        pass
    return p


# ---------- Agents & Reviews ----------


@app.post("/projects/{project_id}/agents/{task}/runs", response_model=AgentRunOut)
def agent_run(
    project_id: int,
    task: str,
    body: AgentRunCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "product_owner")),
) -> AgentRun:
    payload = dict(body.payload)
    # Auto-enrich common tasks
    if task == "legacy_code_assessment" and not payload.get("objects"):
        objs = db.query(InventoryObject).filter_by(project_id=project_id).all()
        payload["objects"] = [
            {
                "fqn": o.fully_qualified_name,
                "unsound": (o.extra or {}).get("unsound_logic", False),
                "dependencies": [],
            }
            for o in objs
            if o.object_type == "table"
        ]
    if task == "data_product_identification":
        p = db.query(Project).get(project_id)
        kind = payload.get("product_kind")
        if not kind and p and "billing" in (p.sample_slug or p.name or "").lower():
            kind = "usage_billing"
        kind = kind or "party"
        payload["product_kind"] = kind
        entity_key = "CustomerUsage" if kind == "usage_billing" else "Party"
        meta = (
            db.query(BusinessMetadata)
            .filter_by(project_id=project_id, entity_key=entity_key)
            .first()
        )
        if not meta and kind == "usage_billing":
            meta = (
                db.query(BusinessMetadata)
                .filter_by(project_id=project_id, entity_key="Party")
                .first()
            )
        payload.setdefault(
            "metadata",
            {
                "owner": meta.owner if meta else "",
                "system_of_record": meta.system_of_record
                if meta
                else ("Billing" if kind == "usage_billing" else "CRM"),
                "consumers": meta.consumers if meta else [],
            },
        )
        payload["mapping_approved"] = bool(p and p.mapping_approved)
    if task == "code_transformation":
        p = db.query(Project).get(project_id)
        payload["mapping_approved"] = bool(p and p.mapping_approved)
    if task == "contract_documentation" and not payload:
        payload = {"candidate_contract": {"name": "party_customer_account", "version": "0.1.0"}}

    run = AgentRun(
        project_id=project_id,
        task=task,
        status="queued",
        input_artifact_ids=payload.get("input_artifact_ids", []),
        steps=[
            {
                "name": "queued",
                "status": "running",
                "message": f"Queued agent task '{task}'",
            }
        ],
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    background_tasks.add_task(
        execute_agent_run,
        run.id,
        task,
        payload,
        actor=user.email,
        project_id=project_id,
    )
    return run


@app.get("/projects/{project_id}/agents/runs", response_model=list[AgentRunOut])
def agent_runs(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[AgentRun]:
    return (
        db.query(AgentRun)
        .filter_by(project_id=project_id)
        .order_by(AgentRun.id.desc())
        .all()
    )


@app.get("/projects/{project_id}/agents/runs/{run_id}", response_model=AgentRunOut)
def agent_run_detail(
    project_id: int,
    run_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AgentRun:
    run = db.query(AgentRun).filter_by(id=run_id, project_id=project_id).first()
    if not run:
        raise HTTPException(404, "Agent run not found")
    return run


@app.get("/projects/{project_id}/reviews", response_model=list[ReviewOut])
def reviews_list(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ReviewItem]:
    return (
        db.query(ReviewItem)
        .filter_by(project_id=project_id)
        .order_by(ReviewItem.id.desc())
        .all()
    )


@app.post("/projects/{project_id}/reviews/{review_id}/decide", response_model=ReviewOut)
def review_decide(
    project_id: int,
    review_id: int,
    body: ReviewDecision,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewItem:
    item = db.query(ReviewItem).filter_by(id=review_id, project_id=project_id).first()
    if not item:
        raise HTTPException(404, "Review not found")
    _apply_review_decision(db, project_id, item, user, body.decision, body.notes)
    db.commit()
    db.refresh(item)
    return item


def _can_decide_review(user: User, item: ReviewItem) -> bool:
    return user.role in {
        item.required_role,
        "change_board",
        "architect",
        "engineer",
        "product_owner",
    }


def _apply_review_decision(
    db: Session,
    project_id: int,
    item: ReviewItem,
    user: User,
    decision: str,
    notes: str,
) -> None:
    if not _can_decide_review(user, item):
        raise HTTPException(403, f"Requires role {item.required_role}")
    if decision not in {"approve", "reject"}:
        raise HTTPException(400, "decision must be approve|reject")
    if item.status != "pending":
        return
    item.status = "approved" if decision == "approve" else "rejected"
    item.reviewer = user.email
    item.decision_notes = notes
    item.decided_at = datetime.utcnow()
    if item.status == "approved" and item.review_type == "data_product_identification":
        payload = item.payload or {}
        product_name = (
            payload.get("product_name")
            or payload.get("product_boundary")
            or "Party & Customer Account"
        )
        from app.services import data_products as dp_svc

        prod = (
            db.query(DataProduct)
            .filter_by(project_id=project_id, name=product_name)
            .first()
        )
        if not prod:
            prod = dp_svc.upsert_from_identification(
                db, project_id, payload, status="approved"
            )
        else:
            if not (prod.input_ports or prod.output_ports):
                dossier = dp_svc.dossier_from_identification(
                    payload, project=db.query(Project).get(project_id)
                )
                dp_svc.apply_dossier(prod, dossier, status="approved")
            else:
                prod.status = "approved"
            if payload.get("dataset_name"):
                prod.dataset_name = payload["dataset_name"]
        import yaml

        contract = prod.contract or {}
        slug = (contract.get("name") if isinstance(contract, dict) else None) or "product"
        from app.services.project_workspace import resolve_migration_repo

        proj = db.query(Project).get(project_id)
        path = resolve_migration_repo(proj) / "pilot" / "product" / f"{slug}.yaml"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(prod.contract), encoding="utf-8")
    audit(
        db,
        project_id,
        user.email,
        "review.decide",
        entity_id=item.id,
        detail={"decision": decision},
    )


@app.post("/projects/{project_id}/reviews/bulk-decide")
def reviews_bulk_decide(
    project_id: int,
    body: ReviewBulkDecision,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Approve or reject many pending review items in one call."""
    decision = (body.decision or "approve").strip().lower()
    if decision not in {"approve", "reject"}:
        raise HTTPException(400, "decision must be approve|reject")
    q = db.query(ReviewItem).filter_by(project_id=project_id, status="pending")
    if body.ids:
        items = q.filter(ReviewItem.id.in_(body.ids)).all()
    else:
        items = q.order_by(ReviewItem.id.asc()).all()
    updated = 0
    skipped = 0
    for item in items:
        if not _can_decide_review(user, item):
            skipped += 1
            continue
        _apply_review_decision(
            db,
            project_id,
            item,
            user,
            decision,
            body.notes
            or (
                "Bulk demo approval"
                if decision == "approve"
                else "Bulk reject"
            ),
        )
        updated += 1
    audit(
        db,
        project_id,
        user.email,
        "review.bulk_decide",
        detail={"decision": decision, "updated": updated, "skipped": skipped},
    )
    db.commit()
    return {"updated": updated, "skipped": skipped, "decision": decision}


@app.get("/projects/{project_id}/audit")
def audit_list(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    return [
        {
            "id": a.id,
            "actor": a.actor,
            "action": a.action,
            "entity_type": a.entity_type,
            "entity_id": a.entity_id,
            "detail": a.detail,
            "created_at": a.created_at.isoformat(),
        }
        for a in db.query(AuditEvent)
        .filter_by(project_id=project_id)
        .order_by(AuditEvent.id.desc())
        .limit(200)
        .all()
    ]


# ---------- Products / Platform / Reconcile / Cutover ----------


@app.get("/projects/{project_id}/products")
def products_list(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    from app.services import data_products as dp_svc

    dp_svc.ensure_suggested_catalog(db, project_id)
    rows = db.query(DataProduct).filter_by(project_id=project_id).order_by(DataProduct.id.asc()).all()
    for p in rows:
        # Backfill dossier for legacy rows created before catalog fields
        if not (p.input_ports or p.output_ports) and (p.contract or p.name):
            dossier = dp_svc.dossier_from_identification(
                {
                    "product_name": p.name,
                    "product_kind": getattr(p, "product_kind", None) or "party",
                    "candidate_contract": p.contract or {},
                    "sid_entities": p.sid_entities or [],
                    "owner": p.owner or "",
                    "dataset_name": p.dataset_name,
                    "consumers": getattr(p, "consumers", None) or [],
                    "system_of_record": getattr(p, "system_of_record", None) or "",
                    "rationale": getattr(p, "description", None) or "",
                    "confidence": getattr(p, "confidence", None) or 0.85,
                },
                project=db.query(Project).get(project_id),
            )
            # Preserve existing status / cost
            status = p.status
            cost = p.cost_estimate_monthly
            dp_svc.apply_dossier(p, dossier, status=status)
            p.cost_estimate_monthly = cost or dossier.get("cost_estimate_monthly") or 120.0
        dp_svc.backfill_usage_for_live(p)
    db.commit()
    return [dp_svc.serialize_product(p) for p in rows]


@app.post("/projects/{project_id}/products/{product_id}/pipeline/run")
def pipeline_run(
    project_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "product_owner")),
) -> dict[str, Any]:
    from app.services import pipeline_chain as pipe_svc

    prod = db.query(DataProduct).filter_by(id=product_id, project_id=project_id).first()
    if not prod:
        raise HTTPException(404, "Product not found")
    project = db.query(Project).get(project_id)
    _assert_product_in_test_env(project, product_id)

    tier = (getattr(prod, "product_tier", None) or "adp").lower()
    status = (prod.status or "").lower()
    # After Test promote, SDPs are approved; allow re-run when live
    if tier == "sdp":
        if status not in {"approved", "live"}:
            raise HTTPException(
                400,
                "Promote this SDP to Test (status becomes approved) before dual pipeline",
            )
    elif status not in {"approved", "live"}:
        raise HTTPException(400, "Product must be approved before pipeline run")

    prod.pipeline_status = "running"
    db.commit()
    result = run_full_pipeline(
        project_id,
        prod.name,
        product_id=prod.id,
        dataset_name=prod.dataset_name,
        product_kind=getattr(prod, "product_kind", None),
        system_of_record=getattr(prod, "system_of_record", None),
        product_tier=tier,
    )
    stage_rows = pipe_svc.stage_details_from_result(result, prod)
    for row in stage_rows:
        db.add(
            PipelineRun(
                project_id=project_id,
                product_id=product_id,
                stage=row["stage"],
                status=row["status"],
                detail={**result, **(row.get("detail") or {})},
                completed_at=datetime.utcnow(),
            )
        )
    prod.pipeline_status = "success"
    prod.status = "live"
    if result.get("product", {}).get("dataset"):
        prod.dataset_name = result["product"]["dataset"]
    elif result.get("dataset_name"):
        prod.dataset_name = result["dataset_name"]
    # Refresh usage / Collibra stubs for live product
    from app.services import data_products as dp_svc

    dp_svc.backfill_usage_for_live(prod)
    # Stay in Pilot until reconcile exit — do not jump to Phase 6 here
    if project and (project.phase or "") in {"", "4_build", "5_pilot_product"}:
        project.phase = "5_pilot_product"
    audit(db, project_id, user.email, "pipeline.run", entity_id=product_id, detail=result)
    db.commit()
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        if project:
            write_json(
                project,
                "pilot/pipeline",
                f"product_{product_id}.json",
                result,
            )
            write_stage_manifest(
                project,
                "pilot/pipeline",
                run_id=product_id,
                prior_stage="pilot/test_env",
                summary={
                    "product_id": product_id,
                    "product_name": prod.name,
                    "dataset": result.get("dataset_name") or prod.dataset_name,
                },
                artifacts=[f"product_{product_id}.json"],
            )
    except Exception:
        pass
    blueprint = pipe_svc.blueprint_for_product(
        prod,
        project=project,
        runs=db.query(PipelineRun)
        .filter_by(project_id=project_id, product_id=product_id)
        .order_by(PipelineRun.id.desc())
        .limit(40)
        .all(),
    )
    return {
        **result,
        "blueprint": blueprint,
        "stages": [r["stage"] for r in stage_rows],
    }


@app.get("/projects/{project_id}/products/{product_id}/pipeline/blueprint")
def pipeline_blueprint(
    project_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    from app.services import pipeline_chain as pipe_svc

    prod = db.query(DataProduct).filter_by(id=product_id, project_id=project_id).first()
    if not prod:
        raise HTTPException(404, "Product not found")
    runs = (
        db.query(PipelineRun)
        .filter_by(project_id=project_id, product_id=product_id)
        .order_by(PipelineRun.id.desc())
        .limit(80)
        .all()
    )
    return pipe_svc.blueprint_for_product(
        prod, project=db.query(Project).get(project_id), runs=runs
    )


@app.get("/projects/{project_id}/products/{product_id}/data")
def product_data(
    project_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    prod = db.query(DataProduct).filter_by(id=product_id, project_id=project_id).first()
    if not prod:
        raise HTTPException(404, "Product not found")
    kind = _resolve_kind_for_product(prod)
    mask = user.role == "viewer"
    return bq.query_product(mask_pii=mask, kind=kind, product_id=prod.id)


@app.post("/projects/{project_id}/products/{product_id}/reconcile")
def reconcile(
    project_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("engineer", "architect", "product_owner", "change_board")),
) -> dict[str, Any]:
    prod = db.query(DataProduct).filter_by(id=product_id, project_id=project_id).first()
    if not prod:
        raise HTTPException(404, "Product not found")
    project = db.query(Project).get(project_id)
    _assert_product_in_test_env(project, product_id)

    prior_runs = (
        db.query(PipelineRun)
        .filter_by(project_id=project_id, product_id=product_id)
        .filter(PipelineRun.stage != "reconcile")
        .order_by(PipelineRun.id.desc())
        .limit(12)
        .all()
    )
    if not prior_runs:
        raise HTTPException(
            400,
            "Run dual pipeline for this product on Test before reconcile",
        )

    kind = _resolve_kind_for_product(prod)
    migrated_stages = [
        {
            "name": r.stage,
            "status": r.status,
            "detail": (
                (r.detail or {}).get("message")
                if isinstance(r.detail, dict)
                else None
            )
            or f"stage {r.stage}",
        }
        for r in reversed(prior_runs[:6])
    ]
    metrics = bq.reconcile(
        settings.reconcile_tolerance_pct,
        kind=kind,
        product_id=prod.id,
        product_name=prod.name,
        dataset_name=prod.dataset_name,
        product_kind=getattr(prod, "product_kind", None),
        migrated_stages=migrated_stages,
    )
    metrics = {
        **metrics,
        "product_id": prod.id,
        "product_name": prod.name,
        "product_tier": getattr(prod, "product_tier", None) or "adp",
        "dataset_name": prod.dataset_name,
        "migrated_run_trail": [
            {
                "id": r.id,
                "stage": r.stage,
                "status": r.status,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
                "message": (r.detail or {}).get("message") if isinstance(r.detail, dict) else None,
            }
            for r in prior_runs
        ],
    }
    row = ReconciliationResult(
        project_id=project_id,
        product_id=product_id,
        metrics=metrics,
        passed=bool(metrics.get("passed")),
    )
    db.add(row)
    db.add(
        PipelineRun(
            project_id=project_id,
            product_id=product_id,
            stage="reconcile",
            status="success" if metrics["passed"] else "failed",
            detail=metrics,
            completed_at=datetime.utcnow(),
        )
    )
    audit(db, project_id, user.email, "reconcile.run", entity_id=product_id, detail=metrics)
    db.commit()
    try:
        from app.services.project_workspace import write_json, write_stage_manifest

        if project:
            write_json(
                project,
                "pilot/reconcile",
                f"product_{product_id}.json",
                metrics,
            )
            write_json(project, "pilot/reconcile", "latest.json", metrics)
            write_stage_manifest(
                project,
                "pilot/reconcile",
                run_id=product_id,
                prior_stage="pilot/pipeline",
                summary={
                    "product_id": product_id,
                    "passed": metrics.get("passed"),
                    "product_name": prod.name,
                },
                artifacts=[f"product_{product_id}.json", "latest.json"],
            )
    except Exception:
        pass
    return metrics


@app.get("/projects/{project_id}/products/{product_id}/reconcile")
def reconcile_history(
    project_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return [
        {
            "id": r.id,
            "passed": r.passed,
            "metrics": r.metrics,
            "created_at": r.created_at.isoformat(),
        }
        for r in db.query(ReconciliationResult)
        .filter_by(project_id=project_id, product_id=product_id)
        .order_by(ReconciliationResult.id.desc())
        .all()
    ]


@app.get("/projects/{project_id}/reconcile/overview")
def reconcile_overview(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Latest legacy vs migrated reconcile status for Test-promoted (or all) products."""
    project = db.query(Project).get(project_id)
    env = _test_env_dict(project)
    promoted_ids = [int(x) for x in (env.get("product_ids") or [])]

    q = db.query(DataProduct).filter_by(project_id=project_id)
    if promoted_ids:
        q = q.filter(DataProduct.id.in_(promoted_ids))
    products = q.order_by(DataProduct.name.asc()).all()

    rows: list[dict[str, Any]] = []
    passed_n = 0
    failed_n = 0
    pending_n = 0
    for p in products:
        latest = (
            db.query(ReconciliationResult)
            .filter_by(project_id=project_id, product_id=p.id)
            .order_by(ReconciliationResult.id.desc())
            .first()
        )
        dual_run = (
            db.query(PipelineRun)
            .filter_by(project_id=project_id, product_id=p.id)
            .filter(PipelineRun.stage != "reconcile")
            .order_by(PipelineRun.id.desc())
            .first()
        )
        metrics = (latest.metrics if latest else None) or {}
        status = (
            "passed"
            if latest and latest.passed
            else "failed"
            if latest and not latest.passed
            else "pending"
        )
        if status == "passed":
            passed_n += 1
        elif status == "failed":
            failed_n += 1
        else:
            pending_n += 1
        legacy = metrics.get("legacy_pipeline") or {}
        migrated = metrics.get("migrated_pipeline") or {}
        rows.append(
            {
                "product_id": p.id,
                "name": p.name,
                "tier": getattr(p, "product_tier", None) or "adp",
                "status": p.status,
                "dataset_name": p.dataset_name,
                "promoted": True if not promoted_ids else p.id in promoted_ids,
                "dual_run_status": dual_run.status if dual_run else "pending",
                "reconcile_status": status,
                "passed": bool(latest.passed) if latest else None,
                "created_at": latest.created_at.isoformat() + "Z" if latest and latest.created_at else None,
                "legacy_row_count": metrics.get("legacy_row_count"),
                "migrated_row_count": metrics.get("product_row_count"),
                "row_count_delta_pct": metrics.get("row_count_delta_pct"),
                "key_set_match": metrics.get("key_set_match"),
                "legacy_pipeline": {
                    "label": legacy.get("label"),
                    "status": legacy.get("status"),
                    "row_count": legacy.get("row_count"),
                    "key_count": legacy.get("key_count"),
                    "stages": legacy.get("stages") or [],
                },
                "migrated_pipeline": {
                    "label": migrated.get("label"),
                    "status": migrated.get("status"),
                    "row_count": migrated.get("row_count"),
                    "key_count": migrated.get("key_count"),
                    "stages": migrated.get("stages") or [],
                },
                "checks": metrics.get("checks") or [],
            }
        )
    return {
        "test_env_ready": bool(project.test_env_ready) if project else False,
        "promoted_product_ids": promoted_ids,
        "summary": {
            "total": len(rows),
            "passed": passed_n,
            "failed": failed_n,
            "pending": pending_n,
        },
        "products": rows,
    }


@app.get("/projects/{project_id}/test-env")
def test_env_get(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    env = _test_env_dict(project)
    return {
        "test_env_ready": bool(project.test_env_ready),
        "test_env": env,
        "product_ids": env.get("product_ids") or [],
    }


@app.get("/projects/{project_id}/pipeline/runs")
def pipeline_runs(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict[str, Any]]:
    return [
        {
            "id": r.id,
            "product_id": r.product_id,
            "stage": r.stage,
            "status": r.status,
            "detail": r.detail,
            "created_at": r.created_at.isoformat(),
        }
        for r in db.query(PipelineRun)
        .filter_by(project_id=project_id)
        .order_by(PipelineRun.id.desc())
        .all()
    ]


@app.get("/projects/{project_id}/cutover")
def cutover_get(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    from app.services import migrate_cutover as mig

    return mig.cutover_payload(db, project_id)


@app.get("/projects/{project_id}/migrate/status")
def migrate_status(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    from app.services import migrate_cutover as mig

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    # Ensure rows + consumer harvest
    payload = mig.cutover_payload(db, project_id)
    return {
        "project_id": project_id,
        "phase": p.phase,
        "prod_env_ready": bool(getattr(p, "prod_env_ready", False)),
        "prod_env": getattr(p, "prod_env", None) or {},
        "test_env_ready": bool(getattr(p, "test_env_ready", False)),
        "readiness": payload.get("readiness") or mig.migrate_readiness(db, p),
        "by_product": payload.get("by_product") or [],
    }


@app.post("/projects/{project_id}/migrate/promote-prod")
def migrate_promote_prod(
    project_id: int,
    body: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "engineer", "product_owner", "change_board")
    ),
) -> dict[str, Any]:
    """Promote Pilot-reconciled products into production (Migrate to Production)."""
    from app.services import migrate_cutover as mig

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    payload = body or {}
    result = mig.promote_to_production(
        db,
        p,
        product_ids=payload.get("product_ids"),
        actor=user.email,
    )
    audit(
        db,
        project_id,
        user.email,
        "migrate.promote_prod",
        detail={"product_ids": (result.get("prod_env") or {}).get("product_ids")},
    )
    db.commit()
    return result


@app.post("/projects/{project_id}/migrate/consumers")
def migrate_update_consumer(
    project_id: int,
    body: dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "engineer", "product_owner", "change_board")
    ),
) -> dict[str, Any]:
    from app.services import migrate_cutover as mig

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    result = mig.update_consumer(
        db,
        p,
        name,
        status=str(body.get("status") or "pending"),
        contract=str(body.get("contract") or ""),
        notes=str(body.get("notes") or ""),
        actor=user.email,
    )
    audit(db, project_id, user.email, "migrate.consumer", detail=result)
    db.commit()
    return result


@app.post("/projects/{project_id}/migrate/freeze")
def migrate_apply_freeze(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("architect", "engineer", "product_owner", "change_board")
    ),
) -> dict[str, Any]:
    from app.services import migrate_cutover as mig

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    result = mig.apply_legacy_freeze(db, p, actor=user.email)
    audit(db, project_id, user.email, "migrate.freeze", detail=result)
    db.commit()
    return result


@app.post("/projects/{project_id}/migrate/signoff")
def migrate_signoff(
    project_id: int,
    body: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("change_board", "product_owner", "architect", "engineer")
    ),
) -> dict[str, Any]:
    from app.services import migrate_cutover as mig

    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    result = mig.production_signoff(
        db, p, actor=user.email, notes=str((body or {}).get("notes") or "")
    )
    audit(db, project_id, user.email, "migrate.signoff", detail=result.get("signoff"))
    db.commit()
    return result


@app.post("/projects/{project_id}/cutover/{item_id}/complete")
def cutover_complete_item(
    project_id: int,
    item_id: str,
    product_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(
        require_roles("change_board", "product_owner", "architect", "engineer")
    ),
) -> dict[str, Any]:
    from app.services import migrate_cutover as mig

    result = mig.complete_checklist_item(
        db,
        project_id,
        item_id,
        product_id=product_id,
        actor=user.email,
    )
    audit(
        db,
        project_id,
        user.email,
        "cutover.item",
        detail={"item": item_id, "product_id": product_id},
    )
    db.commit()
    return result


@app.get("/projects/{project_id}/hypercare")
def hypercare_get(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, Any]:
    products = db.query(DataProduct).filter_by(project_id=project_id).all()
    metrics = []
    for prod in products:
        latest = (
            db.query(ReconciliationResult)
            .filter_by(project_id=project_id, product_id=prod.id)
            .order_by(ReconciliationResult.id.desc())
            .first()
        )
        metrics.append(
            {
                "product_id": prod.id,
                "product_name": prod.name,
                "freshness_slo": "Healthy",
                "reconcile_passed": bool(latest.passed) if latest else False,
                "consumer_contract": "On new contract",
                "pii_tags": "Enforced",
                "cost_attribution": "Within estimate",
            }
        )
    retirees = (
        db.query(Disposition)
        .filter_by(project_id=project_id)
        .filter(Disposition.final.in_(["retire", "archive-only"]))
        .all()
    )
    infra = {
        "jobs_archived": sum(1 for d in retirees if d.retirement_state in ("archived", "decommissioned")),
        "jobs_total": len(retirees),
        "infra_release_ready": all(
            d.retirement_state == "decommissioned" for d in retirees
        )
        if retirees
        else False,
        "licence_release_notes": "Legacy warehouse licence release pending finance sign-off",
    }
    p = db.query(Project).get(project_id)
    return {
        "metrics": metrics,
        "infra": infra,
        "change_closed": bool(getattr(p, "change_closed", False)) if p else False,
    }


@app.post("/projects/{project_id}/change/close")
def change_close(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("change_board", "architect")),
) -> ProjectOut:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    cutovers = db.query(CutoverChecklist).filter_by(project_id=project_id).all()
    if not cutovers or any(c.status != "complete" for c in cutovers):
        raise HTTPException(400, "Complete all product cutovers before closing the change")
    p.change_closed = True
    p.phase = "7_decommission"
    p.status = "closed"
    audit(db, project_id, user.email, "change.close")
    db.commit()
    db.refresh(p)
    return p


@app.get("/projects/{project_id}/catalogue/tags")
def catalogue_tags(
    project_id: int, user: User = Depends(get_current_user)
) -> dict[str, list[str]]:
    return dataplex.all_tags()


@app.get("/standards/sid")
def sid_standards(
    project_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    from app.services.project_workspace import resolve_migration_repo

    project = db.query(Project).get(project_id) if project_id else None
    path = resolve_migration_repo(project) / "shared" / "standards" / "sid_party.yaml"
    if not path.exists():
        path = resolve_migration_repo(project) / "standards" / "sid_party.yaml"
    if not path.exists():
        path = Path(settings.migration_repo_path) / "standards" / "sid_party.yaml"
    if not path.exists():
        path = Path(settings.migration_repo_path) / "shared" / "standards" / "sid_party.yaml"
    if not path.exists():
        return {"domains": []}
    import yaml

    return yaml.safe_load(path.read_text()) or {}
