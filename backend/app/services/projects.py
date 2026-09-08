"""Multi-project lifecycle: sync sample estates, create, delete, scaffold under sample-data."""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

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
)
from app.services.estate import bind_sample

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "project"


def list_catalog_samples() -> list[dict[str, Any]]:
    settings = get_settings()
    root = Path(settings.sample_projects_root)
    out: list[dict[str, Any]] = []
    if not root.exists():
        return out
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        meta_path = child / "project.json"
        meta: dict[str, Any] = {}
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        legacy = child / "legacy"
        out.append(
            {
                "id": child.name,
                "name": meta.get("name", child.name),
                "description": meta.get("description", ""),
                "managed": bool(meta.get("managed", False)),
                "status": meta.get("status", "active"),
                "wave": meta.get("wave"),
                "has_legacy": legacy.exists(),
                "legacy_path": str(legacy) if legacy.exists() else "",
            }
        )
    return out


def sync_sample_projects_to_db(db: Session) -> list[Project]:
    """Ensure each sample-data/projects/* estate has a matching DB project row.

    Binds the legacy root only — does **not** pre-run inventory/lineage.
    Catalog + LineageStitcher edges are created when the user runs the
    inventory pipeline after source identification (Find inventory).
    """
    created: list[Project] = []
    for sample in list_catalog_samples():
        slug = sample["id"]
        existing = db.query(Project).filter(Project.sample_slug == slug).first()
        if existing:
            continue
        # Match legacy single-seed project by name once
        by_name = (
            db.query(Project)
            .filter(Project.name == sample["name"], Project.sample_slug == "")
            .first()
        )
        if by_name:
            by_name.sample_slug = slug
            by_name.managed = bool(sample.get("managed"))
            if not by_name.legacy_root and sample.get("has_legacy"):
                bind_sample(db, by_name, slug)
            else:
                db.add(by_name)
            created.append(by_name)
            continue
        p = Project(
            name=sample["name"],
            description=sample.get("description") or "",
            status=sample.get("status") or "active",
            phase="0_mobilisation",
            sample_slug=slug,
            managed=bool(sample.get("managed")),
            team={
                "architect": "architect@demo.local",
                "product_owner": "owner@demo.local",
                "data_owner": "dataowner@demo.local",
                "data_steward": "steward@demo.local",
                "change_board": "board@demo.local",
                "engineer_lead": "engineer@demo.local",
            },
        )
        db.add(p)
        db.flush()
        if sample.get("has_legacy"):
            bind_sample(db, p, slug)
        else:
            db.commit()
            db.refresh(p)
        created.append(p)
    db.commit()
    # Ensure every synced project has stage folders under its migration-repo
    from app.services.project_workspace import ensure_migration_repo, export_source_binding

    for p in db.query(Project).all():
        try:
            ensure_migration_repo(p)
            if p.legacy_root:
                # Don't wipe — only write source binding if missing
                from app.services.project_workspace import read_prior_stage

                if not read_prior_stage(p, "source"):
                    export_source_binding(p)
        except Exception:
            continue
    return created


def scaffold_sample_estate(
    slug: str,
    name: str,
    description: str = "",
) -> Path:
    """Create a managed estate folder under sample-data/projects/<slug>/."""
    if not SLUG_RE.match(slug):
        raise HTTPException(400, "slug must be lowercase letters, numbers, and hyphens")
    settings = get_settings()
    root = Path(settings.sample_projects_root)
    dest = root / slug
    if dest.exists():
        raise HTTPException(409, f"Sample estate '{slug}' already exists on disk")
    for sub in (
        "legacy/sql",
        "legacy/scripts",
        "legacy/scheduler",
        "legacy/catalog",
        "legacy/usage",
    ):
        (dest / sub).mkdir(parents=True, exist_ok=True)
    from app.services.project_workspace import scaffold_migration_repo_dirs

    scaffold_migration_repo_dirs(dest)
    meta = {
        "id": slug,
        "name": name,
        "description": description,
        "status": "draft",
        "managed": True,
        "wave": 1,
        "paths": {"legacy": "legacy", "migration_repo": "migration-repo"},
        "stages": {
            "discover": {
                "source": "migration-repo/discover/source",
                "activity": "migration-repo/discover/activity",
                "inventory": "migration-repo/discover/inventory",
                "lineage": "migration-repo/discover/lineage",
                "review": "migration-repo/discover/review",
            },
            "decide": {
                "board": "migration-repo/decide/board",
                "retirement": "migration-repo/decide/retirement",
                "approve": "migration-repo/decide/approve",
            },
            "align": {
                "workbench": "migration-repo/align/workbench",
                "gaps": "migration-repo/align/gaps",
                "entities": "migration-repo/align/entities",
                "approve": "migration-repo/align/approve",
            },
            "build": {
                "tables": "migration-repo/build/tables",
                "code": "migration-repo/build/code",
                "dags": "migration-repo/build/dags",
                "approve": "migration-repo/build/approve",
            },
            "pilot": "migration-repo/pilot",
            "migrate": "migration-repo/migrate",
            "retire": "migration-repo/retire",
        },
        "cloud_target": {
            "provider": "gcp-shaped",
            "landing": "gcs",
            "warehouse": "bigquery",
            "orchestration": "composer",
            "governance": "dataplex",
        },
        "defaults": {
            "usage_observation_days": 90,
            "reconcile_tolerance_pct": 0.1,
            "archive_retention_years": 7,
        },
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    (dest / "project.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    (dest / "legacy" / "catalog" / "tables.json").write_text(
        json.dumps({"tables": []}, indent=2) + "\n", encoding="utf-8"
    )
    (dest / "legacy" / "scheduler" / "scheduler.json").write_text(
        json.dumps({"jobs": []}, indent=2) + "\n", encoding="utf-8"
    )
    (dest / "legacy" / "usage" / "query_log.csv").write_text(
        "query_id,user,object_fqn,started_at,duration_ms\n", encoding="utf-8"
    )
    from app.services.spark_estate_seed import seed_spark_dag_estate

    seed_spark_dag_estate(dest / "legacy", project_name=name)
    meta["description"] = description or (
        "On-prem Spark estate: 5 Airflow DAGs, each with 2–3 Spark scripts "
        "(4–5 source tables → 1–2 targets)."
    )
    (dest / "project.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return dest


def create_project(
    db: Session,
    *,
    name: str,
    description: str = "",
    sample_id: Optional[str] = None,
    slug: Optional[str] = None,
    scaffold: bool = False,
    actor_email: str = "",
) -> Project:
    name = (name or "").strip()
    if not name:
        raise HTTPException(400, "name is required")

    sample_slug = ""
    managed = False

    if scaffold:
        raw = (slug or _slugify(name)).strip()
        sample_slug = _slugify(raw) if raw else _slugify(name)
        if not sample_slug:
            raise HTTPException(400, "Could not derive a valid slug from name")
        scaffold_sample_estate(sample_slug, name, description)
        managed = True
    elif sample_id:
        sample_slug = sample_id.strip()
        catalog = {s["id"]: s for s in list_catalog_samples()}
        if sample_slug not in catalog:
            raise HTTPException(404, f"Unknown sample estate '{sample_slug}'")
        # Reuse DB row if this catalog estate is already synced
        existing = db.query(Project).filter(Project.sample_slug == sample_slug).first()
        if existing:
            raise HTTPException(
                409,
                f"Project already bound to sample '{sample_slug}' (id={existing.id})",
            )
        managed = bool(catalog[sample_slug].get("managed"))

    p = Project(
        name=name,
        description=description or "",
        status="draft" if scaffold else "active",
        phase="0_mobilisation",
        sample_slug=sample_slug,
        managed=managed,
        team={
            "architect": "architect@demo.local",
            "product_owner": "owner@demo.local",
            "data_owner": "dataowner@demo.local",
            "data_steward": "steward@demo.local",
            "change_board": "board@demo.local",
            "engineer_lead": "engineer@demo.local",
        },
    )
    db.add(p)
    db.flush()

    if sample_slug:
        bind_sample(db, p, sample_slug)
    else:
        db.commit()
        db.refresh(p)

    # Always ensure per-project migration-repo stage folders exist
    from app.services.project_workspace import ensure_migration_repo, export_source_binding

    ensure_migration_repo(p)
    if p.legacy_root:
        export_source_binding(p)

    if actor_email:
        db.add(
            AuditEvent(
                project_id=p.id,
                actor=actor_email,
                action="project.create",
                entity_type="project",
                entity_id=str(p.id),
                detail={
                    "name": name,
                    "sample_slug": sample_slug,
                    "scaffold": scaffold,
                },
            )
        )
        db.commit()
        db.refresh(p)
    return p


def delete_project(db: Session, project_id: int, *, remove_managed_sample: bool = True) -> dict[str, Any]:
    p = db.query(Project).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    settings = get_settings()
    slug = (p.sample_slug or "").strip()
    managed = bool(p.managed)
    name = p.name
    projects_root = Path(settings.sample_projects_root).resolve()
    estate_path = (projects_root / slug) if slug else None
    workspace_path = projects_root.parent / "workspaces" / str(project_id)
    sample_path_str = str(estate_path) if estate_path else ""

    # Prefer disk project.json — DB managed/sample_slug can be stale
    disk_managed = False
    if estate_path and estate_path.exists():
        meta_path = estate_path / "project.json"
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                disk_managed = bool(meta.get("managed"))
            except Exception:
                disk_managed = False
        elif managed:
            disk_managed = True

    should_remove_estate = bool(
        remove_managed_sample and estate_path and (managed or disk_managed)
    )

    # Remove managed estate BEFORE DB commit so a failed rmtree does not leave a
    # folder that sync_sample_projects_to_db would resurrect on restart.
    removed_sample = False
    sample_error = ""
    if should_remove_estate and estate_path and estate_path.exists():
        try:
            estate_path.resolve().relative_to(projects_root)
        except ValueError as exc:
            raise HTTPException(
                400, f"Refused to delete path outside projects root: {estate_path}"
            ) from exc
        try:
            shutil.rmtree(estate_path)
            removed_sample = not estate_path.exists()
        except OSError as exc:
            sample_error = str(exc)
            removed_sample = not estate_path.exists()
        if not removed_sample:
            raise HTTPException(
                500,
                f"Failed to remove managed estate at {estate_path}: "
                f"{sample_error or 'folder still present'}",
            )

    # Child rows that reference inventory / products first
    obj_ids = [r.id for r in db.query(InventoryObject.id).filter_by(project_id=project_id).all()]
    if obj_ids:
        db.query(InventoryColumn).filter(InventoryColumn.object_id.in_(obj_ids)).delete(
            synchronize_session=False
        )
        db.query(Disposition).filter(Disposition.object_id.in_(obj_ids)).delete(
            synchronize_session=False
        )

    product_ids = [r.id for r in db.query(DataProduct.id).filter_by(project_id=project_id).all()]
    if product_ids:
        db.query(PipelineRun).filter(PipelineRun.product_id.in_(product_ids)).delete(
            synchronize_session=False
        )
        db.query(ReconciliationResult).filter(
            ReconciliationResult.product_id.in_(product_ids)
        ).delete(synchronize_session=False)
        db.query(CutoverChecklist).filter(CutoverChecklist.product_id.in_(product_ids)).delete(
            synchronize_session=False
        )

    run_ids = [r.id for r in db.query(DiscoveryRun.id).filter_by(project_id=project_id).all()]
    if run_ids:
        db.query(DiscoveryStep).filter(DiscoveryStep.run_id.in_(run_ids)).delete(
            synchronize_session=False
        )

    # ReviewItem → AgentRun FK; DiscoveryStep already cleared above
    for model in (
        LineageEdge,
        JobNode,
        Disposition,
        MappingRow,
        BusinessMetadata,
        BuildArtifact,
        ReviewItem,
        AgentRun,
        DiscoveryRun,
        AuditEvent,
        PipelineRun,
        ReconciliationResult,
        CutoverChecklist,
        DataProduct,
        InventoryObject,
    ):
        db.query(model).filter_by(project_id=project_id).delete(synchronize_session=False)

    db.delete(p)
    db.commit()

    removed_workspace = False
    workspace_error = ""
    if workspace_path.exists():
        try:
            shutil.rmtree(workspace_path)
            removed_workspace = True
        except OSError as exc:
            workspace_error = str(exc)

    return {
        "deleted": True,
        "id": project_id,
        "name": name,
        "sample_slug": slug,
        "managed": managed,
        "disk_managed": disk_managed,
        "removed_sample_estate": removed_sample,
        "removed_workspace": removed_workspace,
        "estate_path": sample_path_str,
        "workspace_path": str(workspace_path),
        "sample_error": sample_error or None,
        "workspace_error": workspace_error or None,
    }
