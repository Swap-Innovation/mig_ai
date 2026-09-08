"""Per-project migration-repo workspace — mirrors UI sections & subsections.

Layout under sample-data/projects/<slug>/migration-repo/ (or workspaces/<id>/):

  discover/{source,activity,inventory,lineage,review}/
  decide/{board,retirement,approve}/
  align/{workbench,gaps,entities,approve}/
  build/{tables,code,dags,approve}/
  pilot/{agents,reviews,product,test_env,pipeline,reconcile}/
  migrate/{checklist,consumers,freeze,signoff}/
  retire/{archive,hypercare,close}/
  shared/{standards,prompts,ingestion,udp}/

Every page writes latest.json (+ artifacts). The next page loads via API
(GET …/stages/{section}/{view} or prior).
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.db import Project

# section → ordered views (matches frontend/lib/phases.ts nav)
PHASE_TREE: dict[str, tuple[str, ...]] = {
    "discover": ("source", "activity", "inventory", "lineage", "review"),
    "decide": ("board", "retirement", "approve"),
    "align": ("workbench", "gaps", "entities", "approve"),
    "build": ("tables", "code", "dags", "approve"),
    "pilot": ("agents", "reviews", "product", "test_env", "pipeline", "reconcile"),
    "migrate": ("checklist", "consumers", "freeze", "signoff"),
    "retire": ("archive", "hypercare", "close"),
    "shared": ("standards", "prompts", "ingestion", "udp"),
}

# Flat list of "section/view" paths to mkdir
STAGE_DIRS: tuple[str, ...] = tuple(
    f"{section}/{view}" for section, views in PHASE_TREE.items() for view in views
)

# Linear chain for "next page reads prior"
STAGE_CHAIN: tuple[str, ...] = (
    "discover/source",
    "discover/activity",
    "discover/inventory",
    "discover/lineage",
    "discover/review",
    "decide/board",
    "decide/retirement",
    "decide/approve",
    "align/workbench",
    "align/gaps",
    "align/entities",
    "align/approve",
    "build/tables",
    "build/code",
    "build/dags",
    "build/approve",
    "pilot/agents",
    "pilot/reviews",
    "pilot/product",
    "pilot/test_env",
    "pilot/pipeline",
    "pilot/reconcile",
    "migrate/checklist",
    "migrate/consumers",
    "migrate/freeze",
    "migrate/signoff",
    "retire/archive",
    "retire/hypercare",
    "retire/close",
)

# Map old flat / nested paths → canonical section/view
LEGACY_ALIASES: dict[str, str] = {
    "source": "discover/source",
    "activity": "discover/activity",
    "inventory": "discover/inventory",
    "lineage": "discover/lineage",
    "review": "discover/review",
    "disposition": "decide/board",
    "disposition/board": "decide/board",
    "disposition/retirement": "decide/retirement",
    "disposition/approve": "decide/approve",
    "mappings": "align/workbench",
    "mappings/workbench": "align/workbench",
    "metadata": "align/entities",
    "metadata/entities": "align/entities",
    "build": "build/tables",
    "build/tables": "build/tables",
    "build/code": "build/code",
    "build/dags": "build/dags",
    "products": "pilot/product",
    "transformations": "pilot/pipeline",
    "pilot/test_env": "pilot/test_env",
    "pilot/pipeline": "pilot/pipeline",
    "pilot/reconcile": "pilot/reconcile",
    "standards": "shared/standards",
    "prompts": "shared/prompts",
    "ingestion": "shared/ingestion",
    "udp": "shared/udp",
}

DOWNSTREAM_STAGES: tuple[str, ...] = tuple(
    s for s in STAGE_CHAIN if not s.startswith("shared/")
)

MANAGED_CLEAR_STAGES: tuple[str, ...] = (
    "align/workbench",
    "align/gaps",
    "align/entities",
    "align/approve",
    "build/tables",
    "build/code",
    "build/dags",
    "build/approve",
    "pilot/product",
    "pilot/pipeline",
)

LATEST = "latest.json"
MANIFEST = "manifest.json"


def canonicalize_stage(stage: str) -> str:
    """Normalize stage path to section/view."""
    s = (stage or "").strip().strip("/")
    if not s:
        raise ValueError("stage is required")
    if s in LEGACY_ALIASES:
        return LEGACY_ALIASES[s]
    # already section/view
    if "/" in s:
        return s
    # bare view name → search tree
    for section, views in PHASE_TREE.items():
        if s in views:
            return f"{section}/{s}"
    return s


def prior_stage_key(stage: str) -> str | None:
    key = canonicalize_stage(stage)
    try:
        idx = STAGE_CHAIN.index(key)
    except ValueError:
        return None
    if idx <= 0:
        return None
    return STAGE_CHAIN[idx - 1]


def project_home(project: Project) -> Path:
    settings = get_settings()
    slug = (project.sample_slug or "").strip()
    if slug:
        return Path(settings.sample_projects_root) / slug
    base = Path(settings.sample_projects_root).resolve().parent / "workspaces" / str(project.id)
    return base


def migration_repo(project: Project) -> Path:
    return project_home(project) / "migration-repo"


def resolve_migration_repo(project: Project | None) -> Path:
    settings = get_settings()
    if project is None:
        return Path(settings.migration_repo_path)
    path = migration_repo(project)
    ensure_migration_repo(project)
    return path


def stage_dir(project: Project, stage: str) -> Path:
    key = canonicalize_stage(stage)
    path = migration_repo(project) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_migration_repo(project: Project) -> Path:
    """Create full section/view tree; migrate legacy flat folders; seed standards."""
    root = migration_repo(project)
    root.mkdir(parents=True, exist_ok=True)
    for stage in STAGE_DIRS:
        (root / stage).mkdir(parents=True, exist_ok=True)
    _migrate_legacy_layout(root)
    _seed_standards_if_needed(root)
    _write_project_json_stages(project, root)
    return root


def _migrate_legacy_layout(root: Path) -> None:
    """Copy files from old flat folders into section/view (non-destructive)."""
    moves = [
        ("source", "discover/source"),
        ("activity", "discover/activity"),
        ("inventory", "discover/inventory"),
        ("lineage", "discover/lineage"),
        ("review", "discover/review"),
        ("disposition", "decide/board"),
        ("mappings", "align/workbench"),
        ("metadata", "align/entities"),
        ("products", "pilot/product"),
        ("transformations", "pilot/pipeline"),
        ("standards", "shared/standards"),
        ("prompts", "shared/prompts"),
        ("ingestion", "shared/ingestion"),
        ("udp", "shared/udp"),
    ]
    for old, new in moves:
        src = root / old
        dest = root / new
        if not src.exists() or not src.is_dir():
            continue
        if src.resolve() == dest.resolve():
            continue
        dest.mkdir(parents=True, exist_ok=True)
        for child in src.iterdir():
            # skip if this is already a section dir we created (e.g. build/)
            if child.is_dir() and child.name in PHASE_TREE:
                continue
            target = dest / child.name
            if target.exists():
                continue
            try:
                shutil.move(str(child), str(target))
            except OSError:
                try:
                    if child.is_file():
                        shutil.copy2(child, target)
                except OSError:
                    pass
    # legacy pilot/* already under pilot/ — ensure subsection dirs
    for view in PHASE_TREE["pilot"]:
        (root / "pilot" / view).mkdir(parents=True, exist_ok=True)
    # build artifacts may live under build/project_N — leave; also ensure view dirs
    for view in PHASE_TREE["build"]:
        (root / "build" / view).mkdir(parents=True, exist_ok=True)


def _write_project_json_stages(project: Project, root: Path) -> None:
    home = project_home(project)
    meta_path = home / "project.json"
    if not meta_path.exists():
        return
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        meta = {}
    stages: dict[str, Any] = {}
    for section, views in PHASE_TREE.items():
        if section == "shared":
            continue
        stages[section] = {
            view: f"migration-repo/{section}/{view}" for view in views
        }
    meta["stages"] = stages
    meta.setdefault("paths", {})
    meta["paths"]["legacy"] = meta["paths"].get("legacy") or "legacy"
    meta["paths"]["migration_repo"] = "migration-repo"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def _seed_standards_if_needed(repo: Path) -> None:
    dest = repo / "shared" / "standards" / "sid_party.yaml"
    if dest.exists():
        return
    settings = get_settings()
    candidates = [
        Path(settings.migration_repo_path) / "standards" / "sid_party.yaml",
        Path(settings.migration_repo_path) / "shared" / "standards" / "sid_party.yaml",
        Path(settings.sample_projects_root)
        / "party-customer-wave1"
        / "migration-repo"
        / "shared"
        / "standards"
        / "sid_party.yaml",
        Path(settings.sample_projects_root)
        / "party-customer-wave1"
        / "migration-repo"
        / "standards"
        / "sid_party.yaml",
    ]
    src = next((p for p in candidates if p.exists()), None)
    if not src:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    glossary = src.parent / "glossary.yaml"
    gdest = dest.parent / "glossary.yaml"
    if glossary.exists() and not gdest.exists():
        shutil.copy2(glossary, gdest)


def clear_stage_dirs(
    project: Project,
    stages: tuple[str, ...] | None = None,
) -> dict[str, int]:
    ensure_migration_repo(project)
    if stages is None:
        targets = [canonicalize_stage(s) for s in DOWNSTREAM_STAGES]
        if bool(project.managed):
            targets.extend(canonicalize_stage(s) for s in MANAGED_CLEAR_STAGES)
    else:
        targets = [canonicalize_stage(s) for s in stages]
    # unique preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for t in targets:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    cleared = 0
    for stage in uniq:
        path = migration_repo(project) / stage
        if not path.exists():
            continue
        for child in path.rglob("*"):
            if child.is_file():
                try:
                    child.unlink()
                    cleared += 1
                except OSError:
                    pass
        for child in sorted(path.rglob("*"), reverse=True):
            if child.is_dir():
                try:
                    child.rmdir()
                except OSError:
                    pass
    return {"cleared_files": cleared, "stages": uniq}


def write_json(
    project: Project,
    stage: str,
    filename: str,
    data: Any,
    *,
    also_latest: bool = False,
) -> Path:
    folder = stage_dir(project, stage)
    path = folder / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str) + "\n", encoding="utf-8")
    if also_latest:
        (folder / LATEST).write_text(
            json.dumps(data, indent=2, default=str) + "\n", encoding="utf-8"
        )
    return path


def read_json(project: Project, stage: str, filename: str = LATEST) -> Any | None:
    key = canonicalize_stage(stage)
    path = migration_repo(project) / key / filename
    if not path.exists():
        # try legacy location
        legacy = next((k for k, v in LEGACY_ALIASES.items() if v == key and "/" not in k), None)
        if legacy:
            alt = migration_repo(project) / legacy / filename
            if alt.exists():
                path = alt
            else:
                return None
        else:
            return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_stage_manifest(
    project: Project,
    stage: str,
    *,
    run_id: int | None = None,
    status: str = "completed",
    prior_stage: str | None = None,
    summary: dict[str, Any] | None = None,
    artifacts: list[str] | None = None,
) -> Path:
    key = canonicalize_stage(stage)
    prior_key = canonicalize_stage(prior_stage) if prior_stage else prior_stage_key(key)
    prior = read_json(project, prior_key, LATEST) if prior_key else None
    section, view = key.split("/", 1)
    payload = {
        "stage": key,
        "section": section,
        "view": view,
        "project_id": project.id,
        "sample_slug": project.sample_slug or "",
        "status": status,
        "run_id": run_id,
        "written_at": datetime.utcnow().isoformat() + "Z",
        "prior_stage": prior_key,
        "prior_run_id": (prior or {}).get("run_id") if isinstance(prior, dict) else None,
        "summary": summary or {},
        "artifacts": artifacts or [],
        "migration_repo": str(migration_repo(project)),
        "path": f"migration-repo/{key}",
    }
    write_json(project, key, MANIFEST, payload)
    (stage_dir(project, key) / LATEST).write_text(
        json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8"
    )
    return stage_dir(project, key) / LATEST


def read_prior_stage(project: Project, stage: str) -> dict[str, Any] | None:
    data = read_json(project, stage, LATEST)
    return data if isinstance(data, dict) else None


def read_stage_bundle(project: Project, stage: str) -> dict[str, Any]:
    """API payload for a section/view — latest + file listing + prior."""
    ensure_migration_repo(project)
    key = canonicalize_stage(stage)
    folder = migration_repo(project) / key
    files: list[str] = []
    artifacts: dict[str, Any] = {}
    if folder.exists():
        for f in sorted(folder.iterdir()):
            if f.is_file():
                files.append(f.name)
                if f.suffix == ".json" and f.name not in {LATEST, MANIFEST}:
                    try:
                        artifacts[f.name] = json.loads(f.read_text(encoding="utf-8"))
                    except Exception:
                        artifacts[f.name] = None
    latest = read_prior_stage(project, key)
    prior_key = prior_stage_key(key)
    prior = read_prior_stage(project, prior_key) if prior_key else None
    return {
        "stage": key,
        "section": key.split("/")[0],
        "view": key.split("/")[1] if "/" in key else key,
        "path": str(folder),
        "relative_path": f"migration-repo/{key}",
        "files": files,
        "latest": latest,
        "prior_stage": prior_key,
        "prior": prior,
        "artifacts": artifacts,
    }


def list_stage_tree(project: Project) -> dict[str, Any]:
    ensure_migration_repo(project)
    sections: dict[str, Any] = {}
    for section, views in PHASE_TREE.items():
        sections[section] = []
        for view in views:
            key = f"{section}/{view}"
            bundle = read_stage_bundle(project, key)
            sections[section].append(
                {
                    "view": view,
                    "stage": key,
                    "ready": bool(bundle.get("latest")),
                    "status": (bundle.get("latest") or {}).get("status"),
                    "run_id": (bundle.get("latest") or {}).get("run_id"),
                    "file_count": len(bundle.get("files") or []),
                    "path": bundle.get("relative_path"),
                    "prior_stage": bundle.get("prior_stage"),
                }
            )
    return {
        "project_id": project.id,
        "sample_slug": project.sample_slug or "",
        "home": str(project_home(project)),
        "migration_repo": str(migration_repo(project)),
        "chain": list(STAGE_CHAIN),
        "sections": sections,
    }


def write_text(project: Project, stage: str, filename: str, content: str) -> Path:
    path = stage_dir(project, stage) / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def scaffold_migration_repo_dirs(dest_home: Path) -> None:
    repo = dest_home / "migration-repo"
    for stage in STAGE_DIRS:
        (repo / stage).mkdir(parents=True, exist_ok=True)
    _seed_standards_if_needed(repo)


# ---------- Discover exporters ----------


def export_source_binding(
    project: Project,
    *,
    source_sample_id: str | None = None,
) -> Path:
    ensure_migration_repo(project)
    legacy = (project.legacy_root or "").strip()
    inferred_source = ""
    if legacy:
        try:
            # …/projects/<slug>/legacy → slug
            p = Path(legacy)
            if p.name == "legacy" and p.parent.name:
                inferred_source = p.parent.name
        except Exception:
            inferred_source = ""
    src = (source_sample_id or inferred_source or project.sample_slug or "").strip()
    payload = {
        "project_id": project.id,
        "name": project.name,
        "legacy_source_type": project.legacy_source_type,
        "legacy_root": project.legacy_root,
        "sample_slug": project.sample_slug,
        "workspace_slug": project.sample_slug or "",
        "source_sample_id": src,
        "estate_label": project.estate_label,
        "git_url": project.git_url,
        "git_branch": project.git_branch,
        "git_commit": project.git_commit,
        "bound_at": datetime.utcnow().isoformat() + "Z",
        "migration_repo": str(migration_repo(project)),
    }
    write_json(project, "discover/source", "binding.json", payload)
    return write_stage_manifest(
        project,
        "discover/source",
        status="ready",
        summary=payload,
        artifacts=["binding.json"],
    )


def export_activity_run(
    project: Project,
    *,
    run_id: int,
    summary: dict[str, Any],
    steps: list[dict[str, Any]] | None = None,
    jobs: list[dict[str, Any]] | None = None,
) -> Path:
    ensure_migration_repo(project)
    prior = read_prior_stage(project, "discover/source")
    artifacts = ["summary.json"]
    # Keep disk artifacts lean — terminal logs stay in DB only
    disk_summary = {k: v for k, v in (summary or {}).items() if k != "terminal_log"}
    write_json(project, "discover/activity", "summary.json", disk_summary)
    write_json(project, "discover/activity", f"run_{run_id}_summary.json", disk_summary)
    if steps is not None:
        write_json(project, "discover/activity", "steps.json", steps)
        write_json(project, "discover/activity", f"run_{run_id}_steps.json", steps)
        artifacts.append("steps.json")
    if jobs is not None:
        write_json(project, "discover/activity", "jobs.json", jobs)
        artifacts.append("jobs.json")
    return write_stage_manifest(
        project,
        "discover/activity",
        run_id=run_id,
        prior_stage="discover/source",
        summary={
            **disk_summary,
            "source_bound": bool(prior),
            "workspace_slug": project.sample_slug or "",
            "migration_repo": str(migration_repo(project)),
        },
        artifacts=artifacts,
    )


def export_inventory_run(
    project: Project,
    *,
    run_id: int,
    summary: dict[str, Any],
    objects: list[dict[str, Any]],
    edges: list[dict[str, Any]] | None = None,
    jobs: list[dict[str, Any]] | None = None,
) -> dict[str, Path]:
    ensure_migration_repo(project)
    prior = read_prior_stage(project, "discover/activity")
    paths: dict[str, Path] = {}
    disk_summary = {k: v for k, v in (summary or {}).items() if k != "terminal_log"}
    write_json(project, "discover/inventory", "objects.json", objects)
    write_json(project, "discover/inventory", "summary.json", disk_summary)
    write_json(project, "discover/inventory", f"run_{run_id}_objects.json", objects)
    paths["inventory"] = write_stage_manifest(
        project,
        "discover/inventory",
        run_id=run_id,
        prior_stage="discover/activity",
        summary={
            **disk_summary,
            "object_count": len(objects),
            "activity_run_id": (prior or {}).get("run_id"),
            "workspace_slug": project.sample_slug or "",
            "migration_repo": str(migration_repo(project)),
        },
        artifacts=["objects.json", "summary.json"],
    )
    edge_list = edges or []
    write_json(project, "discover/lineage", "edges.json", edge_list)
    if jobs is not None:
        write_json(project, "discover/lineage", "jobs.json", jobs)
    paths["lineage"] = write_stage_manifest(
        project,
        "discover/lineage",
        run_id=run_id,
        prior_stage="discover/inventory",
        summary={
            "edge_count": len(edge_list),
            "job_count": len(jobs or []),
            "inventory_run_id": run_id,
            "workspace_slug": project.sample_slug or "",
            "migration_repo": str(migration_repo(project)),
        },
        artifacts=["edges.json"] + (["jobs.json"] if jobs is not None else []),
    )
    return paths


def export_review_hitl(
    project: Project,
    decisions: dict[str, str],
    *,
    agent_run_id: int | None = None,
) -> Path:
    ensure_migration_repo(project)
    payload = {
        "decisions": decisions,
        "agent_run_id": agent_run_id,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }
    write_json(project, "discover/review", "hitl.json", payload)
    return write_stage_manifest(
        project,
        "discover/review",
        run_id=agent_run_id,
        prior_stage="discover/lineage",
        summary={"decision_count": len(decisions)},
        artifacts=["hitl.json"],
    )


def export_review_signoff(
    project: Project,
    *,
    signed_by: str,
    stage_snapshot: dict[str, Any] | None = None,
) -> Path:
    ensure_migration_repo(project)
    payload = {
        "inventory_signed_off": True,
        "signed_by": signed_by,
        "signed_at": datetime.utcnow().isoformat() + "Z",
        "project_id": project.id,
        "sample_slug": project.sample_slug or "",
        "stage": stage_snapshot or {},
    }
    write_json(project, "discover/review", "signoff.json", payload)
    clear_stage_dirs(
        project,
        stages=("decide/board", "decide/retirement", "decide/approve"),
    )
    return write_stage_manifest(
        project,
        "discover/review",
        status="signed_off",
        prior_stage="discover/inventory",
        summary={
            "signed_by": signed_by,
            "signed_at": payload["signed_at"],
            "inventory_count": (stage_snapshot or {}).get("inventory_count"),
            "lineage_edge_count": (stage_snapshot or {}).get("lineage_edge_count"),
            "discover_run_id": (stage_snapshot or {}).get("discover_run_id"),
            "inventory_run_id": (stage_snapshot or {}).get("inventory_run_id"),
        },
        artifacts=["signoff.json", "hitl.json"],
    )


# ---------- Decide exporters ----------


def serialize_disposition_register(
    rows: list[Any],
    *,
    objects_by_id: dict[int, Any] | None = None,
) -> list[dict[str, Any]]:
    objects_by_id = objects_by_id or {}
    out: list[dict[str, Any]] = []
    for d in rows:
        obj = objects_by_id.get(getattr(d, "object_id", None))
        out.append(
            {
                "id": d.id,
                "object_id": d.object_id,
                "object_fqn": getattr(obj, "fully_qualified_name", None) if obj else None,
                "object_type": getattr(obj, "object_type", None) if obj else None,
                "recommendation": d.recommendation,
                "override": d.override,
                "final": d.final,
                "consolidate_into": d.consolidate_into,
                "retirement_state": d.retirement_state,
                "approved": bool(d.approved),
                "evidence": d.evidence or {},
            }
        )
    return out


def export_disposition_register(
    project: Project,
    register: list[dict[str, Any]],
    *,
    summary: dict[str, Any] | None = None,
    run_id: int | None = None,
    status: str = "analyzed",
) -> Path:
    """Board analyze — also mirrors retirement slice for Decide → Retirement."""
    ensure_migration_repo(project)
    prior_review = read_prior_stage(project, "discover/review")
    prior_inv = read_prior_stage(project, "discover/inventory")
    write_json(project, "decide/board", "register.json", register)
    payload_summary = {
        **(summary or {}),
        "register_size": len(register),
        "review_signed_off": bool(
            (prior_review or {}).get("status") == "signed_off"
            or (prior_review or {}).get("summary", {}).get("inventory_signed_off")
        ),
        "inventory_run_id": (prior_inv or {}).get("run_id"),
    }
    write_json(project, "decide/board", "summary.json", payload_summary)
    retirement = [
        r for r in register if (r.get("final") or "") in {"retire", "archive-only"}
    ]
    write_json(project, "decide/retirement", "retirement.json", retirement)
    write_stage_manifest(
        project,
        "decide/retirement",
        run_id=run_id,
        status=status,
        prior_stage="decide/board",
        summary={"retirement_count": len(retirement)},
        artifacts=["retirement.json"],
    )
    return write_stage_manifest(
        project,
        "decide/board",
        run_id=run_id,
        status=status,
        prior_stage="discover/review",
        summary=payload_summary,
        artifacts=["register.json", "summary.json"],
    )


def export_disposition_approval(
    project: Project,
    *,
    approved_by: str,
    register: list[dict[str, Any]],
    benefits: dict[str, Any] | None = None,
) -> Path:
    ensure_migration_repo(project)
    approval = {
        "approved": True,
        "approved_by": approved_by,
        "approved_at": datetime.utcnow().isoformat() + "Z",
        "register_size": len(register),
        "benefits": benefits or {},
    }
    write_json(project, "decide/approve", "approval.json", approval)
    write_json(project, "decide/approve", "register.json", register)
    write_json(project, "decide/board", "register.json", register)
    return write_stage_manifest(
        project,
        "decide/approve",
        status="approved",
        prior_stage="decide/retirement",
        summary=approval,
        artifacts=["approval.json", "register.json"],
    )
