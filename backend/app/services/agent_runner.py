"""Background agent execution with progressive step updates for UI polling."""
from __future__ import annotations

import time
from datetime import datetime
from pathlib import Path
from typing import Any

from app.agents import run_agent_task
from app.config import get_settings
from app.db import AgentRun, AuditEvent, ReviewItem, SessionLocal
from app.services import data_products as dp_svc

ACCELERATOR_TASKS = {
    "source_interface_acquisition",
    "data_product_identification",
    "code_transformation",
    "contract_documentation",
}


def _term(agent: str, line: str, *, status: str = "success") -> dict[str, Any]:
    return {
        "name": "terminal.log",
        "status": status,
        "message": line,
        "detail": {
            "kind": "terminal",
            "agent": agent,
            "ts": datetime.utcnow().isoformat() + "Z",
        },
    }


def _push(run: AgentRun, db, steps: list[dict[str, Any]], entry: dict[str, Any]) -> None:
    steps.append(entry)
    run.steps = list(steps)
    db.commit()


# Live preamble shown in Accelerator terminal before the task body runs
_ACCEL_PREAMBLE: dict[str, list[tuple[str, str]]] = {
    "source_interface_acquisition": [
        ("AcquisitionAI", "▶ AcquisitionAI · catalogue source interface & PII"),
        ("CNDI", "▶ CNDI · generate ingestion pipeline (extract → validate → land)"),
        ("CNDI", "  writing technical metadata pack…"),
    ],
    "data_product_identification": [
        ("DataProductBuilder", "▶ Data Product Builder · load Align metadata & mappings"),
        ("ModelAI", "▶ ModelAI · propose product boundary & semantic model"),
        ("ModelAI", "  scoring candidate entities…"),
    ],
    "code_transformation": [
        ("CodingSkills", "▶ Coding Skills · generate transform, tests & reconcile SQL"),
        ("CodingSkills", "  writing pipeline artifacts to migration-repo…"),
    ],
    "contract_documentation": [
        ("ContractDocs", "▶ Contract Docs · draft product contract & catalogue docs"),
        ("ContractDocs", "  packaging reviewable documentation pack…"),
    ],
}


def execute_agent_run(
    run_id: int,
    task: str,
    payload: dict[str, Any],
    *,
    actor: str,
    project_id: int,
) -> None:
    db = SessionLocal()
    settings = get_settings()
    try:
        run = db.query(AgentRun).get(run_id)
        if not run:
            return
        run.status = "running"
        steps: list[dict[str, Any]] = [
            {
                "name": "queued",
                "status": "success",
                "message": f"Agent task '{task}' accepted",
            },
            {
                "name": "prepare_context",
                "status": "running",
                "message": "Loading inventory / payload context",
            },
        ]
        run.steps = list(steps)
        db.commit()
        time.sleep(0.35)

        steps[1] = {
            "name": "prepare_context",
            "status": "success",
            "message": "Context ready",
        }
        run.steps = list(steps)
        db.commit()

        # Stream accelerator terminal lines before the heavy execute
        if task in _ACCEL_PREAMBLE:
            for agent, line in _ACCEL_PREAMBLE[task]:
                _push(run, db, steps, _term(agent, line, status="running"))
                time.sleep(0.28)

        steps.append(
            {
                "name": "execute",
                "status": "running",
                "message": f"Running agent ({settings.llm_mode})",
                "detail": {"agent": task},
            }
        )
        run.steps = list(steps)
        db.commit()
        time.sleep(0.35)

        output = run_agent_task(task, payload)
        agent_steps = output.get("steps") or []
        steps[-1] = {
            "name": "execute",
            "status": "success",
            "message": f"Agent produced confidence {output.get('confidence', 0)}",
            "detail": {"agent": task},
        }
        run.steps = list(steps)
        db.commit()

        for s in agent_steps:
            entry: dict[str, Any] = {
                "name": s.get("name", "step"),
                "status": s.get("status", "success"),
                "message": s.get("message", ""),
            }
            if s.get("detail"):
                entry["detail"] = s["detail"]
            elif entry["name"] == "terminal.log":
                entry["detail"] = {
                    "kind": "terminal",
                    "agent": task,
                    "ts": datetime.utcnow().isoformat() + "Z",
                }
            _push(run, db, steps, entry)
            if task in ACCELERATOR_TASKS:
                time.sleep(0.2)

        _push(
            run,
            db,
            steps,
            _term(
                "Accelerator",
                "✓ packaged reviewable output",
            )
            if task in ACCELERATOR_TASKS
            else {
                "name": "package",
                "status": "success",
                "message": "Packaged reviewable output",
            },
        )

        run.output = output
        run.steps = steps
        run.confidence = float(output.get("confidence", 0))
        run.status = "completed"
        run.completed_at = datetime.utcnow()

        role = "architect"
        if task in {"data_product_identification", "contract_documentation"}:
            role = "product_owner"
        if task == "code_transformation":
            role = "engineer"
            from app.db import Project as ProjectModel
            from app.services.project_workspace import resolve_migration_repo

            project = db.query(ProjectModel).get(project_id)
            repo = resolve_migration_repo(project)
            for rel, content in (output.get("files") or {}).items():
                # Prefer pilot/pipeline or build/code for transformation artifacts
                path = repo / rel
                if "/" not in rel.replace("\\", "/"):
                    path = repo / "pilot" / "pipeline" / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8")

        db.add(
            ReviewItem(
                project_id=project_id,
                agent_run_id=run.id,
                review_type=task,
                title=f"Review {task} output",
                payload=output,
                required_role=role,
            )
        )

        if task == "legacy_code_assessment":
            from app.services.discovery_stage import ensure_hitl_items_from_findings

            ensure_hitl_items_from_findings(
                db,
                project_id,
                list(output.get("findings") or []),
                agent_run_id=run.id,
            )

        if task == "data_product_identification":
            dp_svc.upsert_from_identification(
                db,
                project_id,
                output,
                run_id=run.id,
                status="proposed",
            )
        elif task == "code_transformation":
            dp_svc.attach_code_links(db, project_id, output)
        elif task == "contract_documentation":
            dp_svc.attach_docs(db, project_id, output)

        db.add(
            AuditEvent(
                project_id=project_id,
                actor=actor,
                action=f"agent.{task}",
                entity_type="agent_run",
                entity_id=str(run.id),
                detail={"confidence": run.confidence},
            )
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001
        run = db.query(AgentRun).get(run_id)
        if run:
            failed = list(run.steps or [])
            failed.append(_term("Accelerator", f"✗ failed · {exc}", status="failed"))
            run.steps = failed
            run.status = "failed"
            run.output = {"error": str(exc)}
            db.commit()
    finally:
        db.close()
