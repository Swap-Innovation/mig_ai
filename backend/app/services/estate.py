"""Bind a legacy estate (sample, ZIP upload, or Git clone) to a project workspace."""
from __future__ import annotations

import shutil
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import Project


def workspace_root(project_id: int) -> Path:
    settings = get_settings()
    base = Path(settings.sample_projects_root).resolve().parent / "workspaces" / str(project_id)
    base.mkdir(parents=True, exist_ok=True)
    return base


def estate_dir(project_id: int) -> Path:
    path = workspace_root(project_id) / "estate"
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_legacy_root(project: Project) -> Path:
    settings = get_settings()
    if project.legacy_root:
        root = Path(project.legacy_root)
        if root.exists():
            return root
    return Path(settings.sample_legacy_path)


def list_sample_projects() -> list[dict[str, Any]]:
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
            import json

            meta = json.loads(meta_path.read_text())
        legacy = child / "legacy"
        out.append(
            {
                "id": child.name,
                "name": meta.get("name", child.name),
                "description": meta.get("description", ""),
                "wave": meta.get("wave", 1),
                "status": meta.get("status", ""),
                "managed": bool(meta.get("managed")),
                "legacy_path": str(legacy) if legacy.exists() else "",
                "has_legacy": legacy.exists(),
            }
        )
    return out


# Canonical discovery folder markers (git-shaped + sample-shaped aliases)
READINESS_MARKERS: list[dict[str, Any]] = [
    {
        "id": "orchestration",
        "label": "dags / scheduler",
        "paths": ["dags", "scheduler", "legacy/dags", "legacy/scheduler"],
    },
    {
        "id": "scripts",
        "label": "scripts",
        "paths": ["scripts", "etl", "legacy/scripts"],
    },
    {
        "id": "sql",
        "label": "sql",
        "paths": ["sql", "ddl", "legacy/sql"],
    },
    {
        "id": "catalog",
        "label": "catalog",
        "paths": ["catalog", "legacy/catalog"],
    },
    {
        "id": "usage",
        "label": "usage",
        "paths": ["usage", "legacy/usage"],
    },
]


def _dir_file_count(path: Path) -> int:
    if not path.is_dir():
        return 0
    return sum(
        1
        for p in path.rglob("*")
        if p.is_file() and not any(x.startswith(".") for x in p.parts)
    )


def _resolve_marker_dir(root: Path, rel_paths: list[str]) -> Path | None:
    for rel in rel_paths:
        cand = root / rel
        if cand.is_dir():
            return cand
        # Also accept marker as immediate child name match anywhere one level
    # If root itself is "legacy", paths without legacy/ prefix
    for rel in rel_paths:
        name = rel.split("/")[-1]
        cand = root / name
        if cand.is_dir():
            return cand
    return None


def compute_readiness(root: Path) -> dict[str, Any]:
    markers: list[dict[str, Any]] = []
    if not root.exists():
        for m in READINESS_MARKERS:
            markers.append(
                {
                    "id": m["id"],
                    "label": m["label"],
                    "paths": m["paths"],
                    "present": False,
                    "file_count": 0,
                    "matched_path": None,
                }
            )
        return {
            "markers": markers,
            "score": {"present": 0, "total": len(markers), "ready": False},
            "discovery_hint": "Estate root not found — bind a sample, ZIP, or Git source",
        }

    for m in READINESS_MARKERS:
        matched = _resolve_marker_dir(root, m["paths"])
        present = matched is not None
        markers.append(
            {
                "id": m["id"],
                "label": m["label"],
                "paths": m["paths"],
                "present": present,
                "file_count": _dir_file_count(matched) if matched else 0,
                "matched_path": matched.relative_to(root).as_posix() if matched else None,
            }
        )

    by_id = {x["id"]: x for x in markers}
    present_n = sum(1 for x in markers if x["present"])
    has_sql = by_id["sql"]["present"]
    has_scripts = by_id["scripts"]["present"] or by_id["orchestration"]["present"]
    has_evidence = by_id["catalog"]["present"] or by_id["usage"]["present"]
    ready = bool(has_sql and has_scripts and has_evidence)

    missing = [x["label"] for x in markers if not x["present"]]
    if ready:
        hint = "Ready to run discovery"
    elif not root.exists():
        hint = "Bind an estate to continue"
    elif missing:
        hint = f"Incomplete — missing: {', '.join(missing[:3])}" + (
            f" (+{len(missing) - 3})" if len(missing) > 3 else ""
        )
    else:
        hint = "Estate present but readiness unclear"

    return {
        "markers": markers,
        "score": {"present": present_n, "total": len(markers), "ready": ready},
        "discovery_hint": hint,
    }


def estate_status(project: Project) -> dict[str, Any]:
    root = resolve_legacy_root(project)
    exists = root.exists()
    readiness = compute_readiness(root) if exists else {
        "markers": [
            {
                "id": m["id"],
                "label": m["label"],
                "paths": m["paths"],
                "present": False,
                "file_count": 0,
                "matched_path": None,
            }
            for m in READINESS_MARKERS
        ],
        "score": {"present": 0, "total": len(READINESS_MARKERS), "ready": False},
        "discovery_hint": "Not bound yet — connect a sample, ZIP, or Git estate",
    }

    return {
        "project_id": project.id,
        "sample_slug": getattr(project, "sample_slug", "") or "",
        "legacy_source_type": project.legacy_source_type or "sample",
        "legacy_root": str(root) if exists else (project.legacy_root or ""),
        "estate_label": project.estate_label or "",
        "git_url": project.git_url or "",
        "git_branch": project.git_branch or "main",
        "git_path_prefix": project.git_path_prefix or "",
        "git_commit": project.git_commit or "",
        "last_synced_at": project.last_synced_at.isoformat() if project.last_synced_at else None,
        "exists": exists,
        "file_count": _count_files(root) if exists else 0,
        "tree_preview": preview_tree(root, max_entries=80) if exists else [],
        "readiness": readiness,
        "discovery_hint": readiness.get("discovery_hint", ""),
    }


def bind_sample(db: Session, project: Project, sample_id: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    sid = sample_id or settings.sample_project_id
    sample = Path(settings.sample_projects_root) / sid
    legacy = sample / "legacy"
    if not legacy.exists():
        # Fallback to configured sample legacy path
        legacy = Path(settings.sample_legacy_path)
        if not legacy.exists():
            raise HTTPException(404, f"Sample project '{sid}' legacy folder not found")
        sid = settings.sample_project_id

    # sample_slug = migration-repo home under sample-data/projects/<slug>/.
    # Binding a catalogue sample must only re-point legacy_root — never steal
    # another estate's folder (e.g. managed DWH-M writing into billing-usage-wave1).
    owned_slug = (project.sample_slug or "").strip()
    managed = bool(project.managed)
    if managed and owned_slug:
        workspace_slug = owned_slug
    elif managed and not owned_slug:
        conflict = (
            db.query(Project)
            .filter(Project.sample_slug == sid, Project.id != project.id)
            .first()
        )
        if conflict:
            raise HTTPException(
                409,
                f"Sample '{sid}' already bound to project {conflict.id} ({conflict.name})",
            )
        workspace_slug = sid
    elif owned_slug:
        # Keep existing home (scaffold / prior attach); only change legacy source
        workspace_slug = owned_slug
    else:
        # Blank project: keep empty slug → migration-repo under workspaces/<id>/
        workspace_slug = ""

    project.legacy_source_type = "sample"
    project.legacy_root = str(legacy.resolve())
    project.sample_slug = workspace_slug
    project.estate_label = (
        f"Sample: {sid}"
        if not workspace_slug or workspace_slug == sid
        else f"Sample: {sid} → workspace {workspace_slug}"
    )
    project.git_url = ""
    project.git_commit = ""
    project.last_synced_at = datetime.utcnow()
    project.inventory_signed_off = False
    from app.services.discovery_stage import clear_discovery_artifacts
    from app.services.project_workspace import (
        clear_stage_dirs,
        ensure_migration_repo,
        export_source_binding,
    )

    cleared = clear_discovery_artifacts(db, project.id)
    ensure_migration_repo(project)
    disk = clear_stage_dirs(project)
    export_source_binding(project, source_sample_id=sid)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        **estate_status(project),
        "source_sample_id": sid,
        "workspace_slug": workspace_slug,
        "cleared_artifacts": cleared,
        "cleared_stage_files": disk,
    }


def bind_zip(db: Session, project: Project, upload: UploadFile) -> dict[str, Any]:
    if not upload.filename or not upload.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Upload a .zip archive of the legacy estate")
    dest = estate_dir(project.id)
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    zip_path = workspace_root(project.id) / "upload.zip"
    with zip_path.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(dest)
    except zipfile.BadZipFile as exc:
        raise HTTPException(400, f"Invalid ZIP: {exc}") from exc

    # If ZIP has a single top-level folder, use that as root when it looks like an estate
    children = [c for c in dest.iterdir() if not c.name.startswith(".")]
    root = dest
    if len(children) == 1 and children[0].is_dir():
        candidate = children[0]
        if _looks_like_estate(candidate) or not _looks_like_estate(dest):
            root = candidate

    project.legacy_source_type = "upload"
    project.legacy_root = str(root.resolve())
    project.estate_label = f"Upload: {upload.filename}"
    project.git_url = ""
    project.git_commit = ""
    project.last_synced_at = datetime.utcnow()
    project.inventory_signed_off = False
    from app.services.discovery_stage import clear_discovery_artifacts
    from app.services.project_workspace import (
        clear_stage_dirs,
        ensure_migration_repo,
        export_source_binding,
    )

    cleared = clear_discovery_artifacts(db, project.id)
    ensure_migration_repo(project)
    disk = clear_stage_dirs(project)
    export_source_binding(project)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        **estate_status(project),
        "extracted_files": _count_files(root),
        "cleared_artifacts": cleared,
        "cleared_stage_files": disk,
        "migration_repo": str(ensure_migration_repo(project)),
    }


def bind_git(
    db: Session,
    project: Project,
    url: str,
    branch: str = "main",
    path_prefix: str = "",
    token: str | None = None,
) -> dict[str, Any]:
    if not url.strip():
        raise HTTPException(400, "Git URL is required")
    clone_dir = workspace_root(project.id) / "git"
    if clone_dir.exists():
        shutil.rmtree(clone_dir)
    clone_dir.mkdir(parents=True, exist_ok=True)

    auth_url = url
    if token and url.startswith("https://"):
        # Insert token without logging it into project fields
        rest = url[len("https://") :]
        auth_url = f"https://x-access-token:{token}@{rest}"

    try:
        subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, auth_url, str(clone_dir)],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except subprocess.CalledProcessError as exc:
        raise HTTPException(
            400,
            f"Git clone failed: {(exc.stderr or exc.stdout or str(exc))[:500]}",
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(500, "git is not installed on the API host") from exc
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(400, "Git clone timed out") from exc

    commit = ""
    try:
        commit = subprocess.check_output(
            ["git", "-C", str(clone_dir), "rev-parse", "--short", "HEAD"],
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        pass

    root = clone_dir
    if path_prefix:
        root = clone_dir / path_prefix
        if not root.exists():
            raise HTTPException(400, f"path_prefix '{path_prefix}' not found in clone")

    project.legacy_source_type = "git"
    project.legacy_root = str(root.resolve())
    project.git_url = url
    project.git_branch = branch
    project.git_path_prefix = path_prefix
    project.git_commit = commit
    project.estate_label = f"Git: {url}@{branch}" + (f"/{path_prefix}" if path_prefix else "")
    project.last_synced_at = datetime.utcnow()
    project.inventory_signed_off = False
    from app.services.discovery_stage import clear_discovery_artifacts
    from app.services.project_workspace import (
        clear_stage_dirs,
        ensure_migration_repo,
        export_source_binding,
    )

    cleared = clear_discovery_artifacts(db, project.id)
    ensure_migration_repo(project)
    disk = clear_stage_dirs(project)
    export_source_binding(project)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {
        **estate_status(project),
        "commit": commit,
        "cleared_artifacts": cleared,
        "cleared_stage_files": disk,
        "migration_repo": str(ensure_migration_repo(project)),
    }


def sync_git(db: Session, project: Project, token: str | None = None) -> dict[str, Any]:
    """Re-clone using the project's stored Git URL / branch / path prefix."""
    if (project.legacy_source_type or "") != "git" or not (project.git_url or "").strip():
        raise HTTPException(400, "Project has no Git estate binding to sync")
    return bind_git(
        db,
        project,
        url=project.git_url,
        branch=project.git_branch or "main",
        path_prefix=project.git_path_prefix or "",
        token=token,
    )


def preview_tree(root: Path, max_entries: int = 80) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    if not root.exists():
        return entries
    for path in sorted(root.rglob("*")):
        if any(part.startswith(".") for part in path.parts):
            continue
        rel = path.relative_to(root).as_posix()
        entries.append(
            {
                "path": rel,
                "type": "dir" if path.is_dir() else "file",
                "size": path.stat().st_size if path.is_file() else None,
            }
        )
        if len(entries) >= max_entries:
            entries.append({"path": "…", "type": "truncated", "size": None})
            break
    return entries


def _looks_like_estate(path: Path) -> bool:
    markers = ("sql", "scripts", "scheduler", "catalog", "usage", "ddl", "etl")
    names = {c.name.lower() for c in path.iterdir() if c.is_dir() or c.is_file()}
    return bool(names & set(markers)) or any(path.rglob("*.sql"))


def _count_files(root: Path) -> int:
    if not root.exists():
        return 0
    return sum(1 for p in root.rglob("*") if p.is_file() and not any(x.startswith(".") for x in p.parts))
