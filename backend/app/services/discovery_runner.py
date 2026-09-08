"""Background discovery execution for large estates (non-blocking HTTP)."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from app.db import AuditEvent, DiscoveryRun, Project, SessionLocal
from app.services.discovery import run_discovery
from app.services.estate import resolve_legacy_root


def execute_discovery_run(
    run_id: int,
    *,
    project_id: int,
    actor: str,
    pipeline: str = "discover",
) -> None:
    db = SessionLocal()
    try:
        run = db.query(DiscoveryRun).get(run_id)
        if not run:
            return
        project = db.query(Project).get(project_id)
        if not project:
            run.status = "failed"
            run.error = "Project not found"
            run.completed_at = datetime.utcnow()
            db.commit()
            return

        # Prefer the estate recorded on the run (inventory is chained from Activity).
        # Fall back to project binding only when the run has no root yet.
        root: Path
        if run.legacy_root and Path(run.legacy_root).expanduser().exists():
            root = Path(run.legacy_root).expanduser().resolve()
        else:
            root = resolve_legacy_root(project)
        if not root.exists():
            run.status = "failed"
            run.error = f"Legacy root not found: {root}"
            run.completed_at = datetime.utcnow()
            db.commit()
            return

        pipe = (pipeline or "discover").strip().lower()
        if pipe not in {"discover", "inventory"}:
            pipe = "discover"

        # Inventory: re-affirm Activity root so we never invent a different estate mid-run
        if pipe == "inventory":
            from app.services.discovery_stage import latest_completed_run

            prior = latest_completed_run(db, project_id, "discover")
            if prior and prior.legacy_root and Path(prior.legacy_root).expanduser().exists():
                root = Path(prior.legacy_root).expanduser().resolve()
                if str(resolve_legacy_root(project).resolve()) != str(root):
                    project.legacy_root = str(root)
                    db.add(project)

        run.status = "running"
        run.legacy_root = str(root)
        run.source_type = project.legacy_source_type or "sample"
        summary0 = dict(run.summary or {})
        summary0["pipeline"] = pipe
        if pipe == "inventory":
            summary0.setdefault("chained_from", "discover/activity")
        run.summary = summary0
        db.commit()

        summary = run_discovery(
            db,
            project_id,
            Path(root),
            discovery_run_id=run_id,
            pipeline=pipe,
        )

        project.phase = "1_discovery"
        db.add(
            AuditEvent(
                project_id=project_id,
                actor=actor,
                action="discovery.run",
                entity_type="discovery_run",
                entity_id=str(run_id),
                detail=summary,
            )
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        run = db.query(DiscoveryRun).get(run_id)
        if run and run.status not in {"completed", "failed"}:
            run.status = "failed"
            run.error = str(exc)
            run.completed_at = datetime.utcnow()
            db.commit()
    finally:
        db.close()
