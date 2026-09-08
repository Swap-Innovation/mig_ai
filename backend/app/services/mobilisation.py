"""Phase 0 mobilisation — checklist, decisions, freeze register, team RACI."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any

DEFAULT_CHECKLIST: list[dict[str, Any]] = [
    {
        "id": "source_read",
        "group": "access",
        "label": "Read access to legacy warehouse / DW repos",
        "hint": "Service account or read role on production mirrors and Git DW repos",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": True,
    },
    {
        "id": "scheduler_read",
        "group": "access",
        "label": "Read access to scheduler / DAG definitions",
        "hint": "Airflow/Control-M export or Git-backed DAG repo cloneable",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": True,
    },
    {
        "id": "usage_logs",
        "group": "access",
        "label": "Query and report usage logs available",
        "hint": "Representative observation window (≥90 days preferred)",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": True,
    },
    {
        "id": "landing_zone",
        "group": "environments",
        "label": "Cloud landing zone provisioned",
        "hint": "Non-prod project, network connectivity, IAM baselines",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": False,
    },
    {
        "id": "nonprod_deploy",
        "group": "environments",
        "label": "Team can deploy to non-production",
        "hint": "CI identity can push to staging GCS / BQ / Composer stubs",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": False,
    },
    {
        "id": "secrets_store",
        "group": "environments",
        "label": "Secrets held in managed store (demo stub OK)",
        "hint": "No standing human access to production credentials",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": False,
    },
    {
        "id": "control_plane",
        "group": "tooling",
        "label": "Lumina control plane + migration-repo layout ready",
        "hint": "standards/, inventory/, products/ folders present",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": False,
    },
    {
        "id": "ci_hooks",
        "group": "tooling",
        "label": "CI hooks for discovery and agent reviews",
        "hint": "Pipeline can call discovery/run and surface review items",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": False,
    },
    {
        "id": "scope_agreed",
        "group": "freeze",
        "label": "Wave-1 scope agreed with Change Board",
        "hint": "Subject areas / marts in first wave documented",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": False,
    },
    {
        "id": "change_freeze",
        "group": "freeze",
        "label": "Change freeze window published",
        "hint": "Enhancements deferred; freeze on migration-scope legacy objects",
        "done": False,
        "status": "open",
        "notes": "",
        "owner_email": "",
        "verified_at": None,
        "evidence_url": "",
        "requires_evidence": False,
    },
]

# Proposal §10 — decisions required before / during mobilisation
DEFAULT_DECISIONS: list[dict[str, Any]] = [
    {
        "id": "wave1_scope",
        "question": "Scope of the first wave — which subject areas, marts, or source systems?",
        "value": "",
        "status": "open",  # open | decided | deferred
        "required_for_ready": True,
        "decided_by": "",
        "decided_at": None,
        "notes": "",
    },
    {
        "id": "target_platform",
        "question": "Target cloud data platform services (warehouse engine; single vs multi-engine)?",
        "value": "",
        "status": "open",
        "required_for_ready": False,
        "decided_by": "",
        "decided_at": None,
        "notes": "",
    },
    {
        "id": "reference_model",
        "question": "Reference model and version to adopt (and API exposure now or later)?",
        "value": "",
        "status": "open",
        "required_for_ready": True,
        "decided_by": "",
        "decided_at": None,
        "notes": "",
    },
    {
        "id": "usage_window",
        "question": "Usage observation window and evidence threshold that justifies retirement?",
        "value": "",
        "status": "open",
        "required_for_ready": True,
        "decided_by": "",
        "decided_at": None,
        "notes": "",
    },
    {
        "id": "parallel_run",
        "question": "Parallel-run duration and reconciliation tolerance per product?",
        "value": "",
        "status": "open",
        "required_for_ready": False,
        "decided_by": "",
        "decided_at": None,
        "notes": "",
    },
    {
        "id": "ownership_model",
        "question": "Data ownership model and who appoints Data Product Owners?",
        "value": "",
        "status": "open",
        "required_for_ready": False,
        "decided_by": "",
        "decided_at": None,
        "notes": "",
    },
    {
        "id": "archive_policy",
        "question": "Archive retention policy and system of record for archived legacy data?",
        "value": "",
        "status": "open",
        "required_for_ready": False,
        "decided_by": "",
        "decided_at": None,
        "notes": "",
    },
]

EVIDENCE_FIELDS = ("notes", "owner_email", "verified_at", "evidence_url", "status")

# Change-freeze register (replaces bare “change freeze published” tick)
DEFAULT_FREEZE: dict[str, Any] = {
    "freeze_start": "",
    "freeze_end": "",
    "scope_summary": "",
    "in_scope_systems": [],
    "change_board_ref": "",
    "exception_policy": "",
    "published": False,
    "published_at": None,
    "published_by": "",
    "notified_consumers": [],
    "deferred": False,
    "deferred_note": "",
}

# Named Wave-1 RACI seats (emails)
TEAM_ROLE_DEFS: list[dict[str, str]] = [
    {"id": "architect", "label": "Solution architect", "raci": "A"},
    {"id": "product_owner", "label": "Product owner", "raci": "A"},
    {"id": "data_owner", "label": "Data owner", "raci": "A"},
    {"id": "data_steward", "label": "Data steward", "raci": "R"},
    {"id": "change_board", "label": "Change board", "raci": "C"},
    {"id": "engineer_lead", "label": "Engineer lead", "raci": "R"},
]

TEAM_REQUIRED_FOR_READY = ("architect", "data_owner")

DEFAULT_TEAM: dict[str, str] = {r["id"]: "" for r in TEAM_ROLE_DEFS}

DEMO_TEAM_SEED: dict[str, str] = {
    "architect": "architect@demo.local",
    "product_owner": "owner@demo.local",
    "data_owner": "dataowner@demo.local",
    "data_steward": "steward@demo.local",
    "change_board": "board@demo.local",
    "engineer_lead": "engineer@demo.local",
}


def ensure_checklist(raw: Any) -> list[dict[str, Any]]:
    """Merge persisted checklist with defaults so new items appear on upgrade."""
    by_id = {i["id"]: dict(i) for i in (raw or []) if isinstance(i, dict) and i.get("id")}
    out: list[dict[str, Any]] = []
    for item in DEFAULT_CHECKLIST:
        existing = by_id.get(item["id"])
        merged = deepcopy(item)
        if existing:
            merged["done"] = bool(existing.get("done"))
            for f in EVIDENCE_FIELDS:
                if existing.get(f) is not None:
                    merged[f] = existing.get(f)
            # Keep status in sync with done when status absent
            if merged.get("done") and merged.get("status") == "open":
                merged["status"] = "done"
            if merged.get("status") == "done":
                merged["done"] = True
            if merged.get("status") in {"blocked", "na"}:
                merged["done"] = merged.get("status") == "na" or bool(existing.get("done"))
                if merged.get("status") == "na":
                    merged["done"] = True
        out.append(merged)
    return out


def apply_item_patch(item: dict[str, Any], patch: dict[str, Any], actor: str) -> dict[str, Any]:
    out = dict(item)
    if "done" in patch and patch["done"] is not None:
        out["done"] = bool(patch["done"])
        if out["done"] and out.get("status") in (None, "open"):
            out["status"] = "done"
        if not out["done"] and out.get("status") == "done":
            out["status"] = "open"
    if "status" in patch and patch["status"] is not None:
        st = str(patch["status"])
        if st not in {"open", "done", "blocked", "na"}:
            st = "open"
        out["status"] = st
        out["done"] = st in {"done", "na"}
    for f in ("notes", "owner_email", "evidence_url"):
        if f in patch and patch[f] is not None:
            out[f] = str(patch[f])
    if patch.get("verified"):
        out["verified_at"] = datetime.utcnow().isoformat() + "Z"
        if not out.get("owner_email"):
            out["owner_email"] = actor
        if out.get("status") == "open":
            out["status"] = "done"
            out["done"] = True
    elif "verified_at" in patch:
        out["verified_at"] = patch["verified_at"]
    return out


def checklist_complete(items: list[dict[str, Any]]) -> bool:
    if not items:
        return False
    for i in items:
        st = i.get("status") or ("done" if i.get("done") else "open")
        if st in {"done", "na"}:
            continue
        if st == "blocked":
            return False
        if not i.get("done"):
            return False
    return True


def evidence_gaps(items: list[dict[str, Any]]) -> list[str]:
    """Items that require evidence but lack verified_at (soft warning for Ready)."""
    gaps = []
    for i in items:
        if not i.get("requires_evidence"):
            continue
        st = i.get("status") or ("done" if i.get("done") else "open")
        if st == "na":
            continue
        if st in {"done"} or i.get("done"):
            if not i.get("verified_at") and not i.get("evidence_url") and not i.get("notes"):
                gaps.append(i["id"])
    return gaps


def group_progress(items: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    groups: dict[str, dict[str, int]] = {}
    for i in items:
        g = str(i.get("group") or "other")
        slot = groups.setdefault(g, {"total": 0, "done": 0})
        slot["total"] += 1
        st = i.get("status") or ("done" if i.get("done") else "open")
        if st in {"done", "na"} or i.get("done"):
            slot["done"] += 1
    return groups


def ensure_decisions(raw: Any, *, project_name: str = "", sample_slug: str = "") -> list[dict[str, Any]]:
    by_id = {d["id"]: dict(d) for d in (raw or []) if isinstance(d, dict) and d.get("id")}
    out: list[dict[str, Any]] = []
    for d in DEFAULT_DECISIONS:
        existing = by_id.get(d["id"])
        merged = deepcopy(d)
        if existing:
            for k in ("value", "status", "decided_by", "decided_at", "notes"):
                if existing.get(k) is not None:
                    merged[k] = existing[k]
        out.append(merged)
    return out


def demo_decision_defaults(project_name: str = "", sample_slug: str = "") -> dict[str, str]:
    billing = "billing" in f"{sample_slug} {project_name}".lower()
    if billing:
        scope = "Billing & usage marts — bill_usage_evt, mart_usage_360, bill_inv_sum (Wave-1)"
    else:
        scope = "Party & Customer Account — CRM customer/account masters and 360 marts (Wave-1)"
    return {
        "wave1_scope": scope,
        "target_platform": "GCP-shaped: GCS landing → BigQuery product · single warehouse engine (demo stubs)",
        "reference_model": "TM Forum SID subset v1.1 (Party / Customer / Resource) — API exposure later",
        "usage_window": "90-day observation · near-zero access + no retention obligation → retire candidate",
        "parallel_run": "14-day dual-run · 0.1% row-count tolerance · exact key-set match",
        "ownership_model": "Data Product Owner appointed by Change Board; Data Owner + Steward per entity",
        "archive_policy": "7-year archive retention · GCS archive bucket as SoR for retired objects",
    }


def apply_decision_defaults(
    decisions: list[dict[str, Any]],
    *,
    actor: str,
    project_name: str = "",
    sample_slug: str = "",
) -> list[dict[str, Any]]:
    defaults = demo_decision_defaults(project_name, sample_slug)
    now = datetime.utcnow().isoformat() + "Z"
    out = []
    for d in decisions:
        row = dict(d)
        if row.get("status") == "open" and not row.get("value"):
            row["value"] = defaults.get(row["id"], "")
            row["status"] = "decided"
            row["decided_by"] = actor
            row["decided_at"] = now
            row["notes"] = row.get("notes") or "Accepted demo defaults"
        out.append(row)
    return out


def patch_decision(decisions: list[dict[str, Any]], decision_id: str, patch: dict[str, Any], actor: str) -> list[dict[str, Any]]:
    out = []
    found = False
    for d in decisions:
        row = dict(d)
        if row["id"] == decision_id:
            found = True
            if "value" in patch and patch["value"] is not None:
                row["value"] = str(patch["value"])
            if "notes" in patch and patch["notes"] is not None:
                row["notes"] = str(patch["notes"])
            if "status" in patch and patch["status"] is not None:
                st = str(patch["status"])
                if st not in {"open", "decided", "deferred"}:
                    st = "open"
                row["status"] = st
                if st in {"decided", "deferred"}:
                    row["decided_by"] = actor
                    row["decided_at"] = datetime.utcnow().isoformat() + "Z"
                if st == "open":
                    row["decided_by"] = ""
                    row["decided_at"] = None
            elif row.get("value") and row.get("status") == "open":
                row["status"] = "decided"
                row["decided_by"] = actor
                row["decided_at"] = datetime.utcnow().isoformat() + "Z"
        out.append(row)
    if not found:
        raise KeyError(decision_id)
    return out


def decisions_ready(decisions: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """Minimum decisions must be decided (or deferred with value/notes)."""
    missing = []
    for d in decisions:
        if not d.get("required_for_ready"):
            continue
        st = d.get("status") or "open"
        if st == "decided" and d.get("value"):
            continue
        if st == "deferred" and (d.get("notes") or d.get("value")):
            continue
        missing.append(d["id"])
    return (len(missing) == 0, missing)


def ensure_freeze(raw: Any, *, project_name: str = "", sample_slug: str = "") -> dict[str, Any]:
    out = deepcopy(DEFAULT_FREEZE)
    if isinstance(raw, dict):
        for k in DEFAULT_FREEZE:
            if k in raw and raw[k] is not None:
                out[k] = raw[k]
        if isinstance(out.get("in_scope_systems"), str):
            out["in_scope_systems"] = [
                s.strip() for s in out["in_scope_systems"].split(",") if s.strip()
            ]
        if not isinstance(out.get("in_scope_systems"), list):
            out["in_scope_systems"] = []
        if not isinstance(out.get("notified_consumers"), list):
            out["notified_consumers"] = []
    return out


def demo_freeze_defaults(project_name: str = "", sample_slug: str = "") -> dict[str, Any]:
    billing = "billing" in f"{sample_slug} {project_name}".lower()
    start = datetime.utcnow().date()
    end = start + timedelta(days=45)
    if billing:
        scope = (
            "Wave-1 billing & usage: freeze schema/DDL and mart rebuilds for "
            "bill_usage_evt, mart_usage_360, bill_inv_sum"
        )
        systems = ["bill_usage_evt", "mart_usage_360", "bill_inv_sum", "usage_etl_dags"]
    else:
        scope = (
            "Wave-1 Party & Customer: freeze enhancements on CRM masters and "
            "customer_360 / account_360 marts"
        )
        systems = ["crm_customer", "crm_account", "customer_360", "account_360", "party_etl_dags"]
    return {
        "freeze_start": start.isoformat(),
        "freeze_end": end.isoformat(),
        "scope_summary": scope,
        "in_scope_systems": systems,
        "change_board_ref": "CB-WAVE1-DEMO-001",
        "exception_policy": (
            "P1 production defects only with Change Board waiver; "
            "no new features in freeze window"
        ),
        "notified_consumers": ["finance-reporting@demo.local", "crm-ops@demo.local"],
        "deferred": False,
        "deferred_note": "",
    }


def apply_freeze_patch(freeze: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(freeze)
    for k in (
        "freeze_start",
        "freeze_end",
        "scope_summary",
        "change_board_ref",
        "exception_policy",
        "deferred_note",
    ):
        if k in patch and patch[k] is not None:
            out[k] = str(patch[k])
    if "deferred" in patch and patch["deferred"] is not None:
        out["deferred"] = bool(patch["deferred"])
        if out["deferred"]:
            out["published"] = False
    for list_key in ("in_scope_systems", "notified_consumers"):
        if list_key in patch and patch[list_key] is not None:
            val = patch[list_key]
            if isinstance(val, str):
                out[list_key] = [s.strip() for s in val.split(",") if s.strip()]
            elif isinstance(val, list):
                out[list_key] = [str(s).strip() for s in val if str(s).strip()]
            else:
                out[list_key] = []
    return out


def apply_freeze_defaults(
    freeze: dict[str, Any],
    *,
    project_name: str = "",
    sample_slug: str = "",
) -> dict[str, Any]:
    defaults = demo_freeze_defaults(project_name, sample_slug)
    out = dict(freeze)
    for k, v in defaults.items():
        if k in ("deferred", "deferred_note"):
            continue
        cur = out.get(k)
        empty = cur in (None, "", []) or (isinstance(cur, list) and not cur)
        if empty:
            out[k] = v
    out["deferred"] = False
    out["deferred_note"] = ""
    return out


def publish_freeze(freeze: dict[str, Any], *, actor: str) -> dict[str, Any]:
    out = dict(freeze)
    if out.get("deferred") and (out.get("deferred_note") or "").strip():
        # Explicit deferral path — not a publish
        out["published"] = False
        out["published_at"] = None
        out["published_by"] = ""
        return out
    if not (out.get("scope_summary") or "").strip():
        raise ValueError("scope_summary is required to publish freeze")
    if not (out.get("freeze_start") or "").strip() or not (out.get("freeze_end") or "").strip():
        raise ValueError("freeze_start and freeze_end are required to publish")
    out["deferred"] = False
    out["deferred_note"] = ""
    out["published"] = True
    out["published_at"] = datetime.utcnow().isoformat() + "Z"
    out["published_by"] = actor
    return out


def mark_freeze_checklist(items: list[dict[str, Any]], *, published: bool, deferred: bool) -> list[dict[str, Any]]:
    """Sync checklist ticks when freeze is published or deferred with note."""
    if not (published or deferred):
        return items
    out = []
    for it in items:
        row = dict(it)
        if row.get("id") in {"change_freeze", "scope_agreed"}:
            row["done"] = True
            row["status"] = "done"
            if published and not row.get("notes"):
                row["notes"] = "Synced from freeze register publish"
            if deferred and not row.get("notes"):
                row["notes"] = "Freeze deferred — Change Board note on register"
        out.append(row)
    return out


def freeze_ready(freeze: dict[str, Any]) -> tuple[bool, str]:
    if freeze.get("published"):
        return True, "published"
    if freeze.get("deferred") and (freeze.get("deferred_note") or "").strip():
        return True, "deferred"
    return False, "not_published"


def ensure_team(raw: Any, *, seed_demo: bool = False) -> dict[str, str]:
    out = dict(DEFAULT_TEAM)
    if isinstance(raw, dict):
        for k in DEFAULT_TEAM:
            if raw.get(k) is not None:
                out[k] = str(raw[k]).strip()
    if seed_demo and not any(out.values()):
        out = dict(DEMO_TEAM_SEED)
    return out


def apply_team_patch(team: dict[str, str], patch: dict[str, Any]) -> dict[str, str]:
    out = dict(team)
    roles = patch.get("roles") if isinstance(patch.get("roles"), dict) else patch
    for k in DEFAULT_TEAM:
        if k in roles and roles[k] is not None:
            out[k] = str(roles[k]).strip()
    return out


def apply_team_defaults(team: dict[str, str]) -> dict[str, str]:
    out = dict(team)
    for k, v in DEMO_TEAM_SEED.items():
        if not (out.get(k) or "").strip():
            out[k] = v
    return out


def team_ready(team: dict[str, str]) -> tuple[bool, list[str]]:
    missing = [r for r in TEAM_REQUIRED_FOR_READY if not (team.get(r) or "").strip()]
    return (len(missing) == 0, missing)


def team_roster(team: dict[str, str]) -> list[dict[str, Any]]:
    return [
        {
            **role,
            "email": team.get(role["id"], "") or "",
        }
        for role in TEAM_ROLE_DEFS
    ]


def ready_checks(
    *,
    items: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    estate_bound: bool,
    freeze: dict[str, Any] | None = None,
    team: dict[str, str] | None = None,
    hub_spoke_id: str = "",
    hub_probe: dict[str, Any] | None = None,
    require_hub: bool | None = None,
) -> dict[str, Any]:
    from app.services.udp_hub import hub_probe_required, probe_ok

    checks = []
    cl_ok = checklist_complete(items)
    checks.append(
        {
            "id": "checklist",
            "label": "Mobilisation checklist complete",
            "passed": cl_ok,
            "detail": group_progress(items),
            "fix_view": "access",
        }
    )
    gaps = evidence_gaps(items)
    checks.append(
        {
            "id": "evidence",
            "label": "Access items have notes, URL, or verified timestamp",
            "passed": len(gaps) == 0,
            "detail": {"gaps": gaps},
            "soft": True,
            "fix_view": "access",
        }
    )
    dec_ok, missing = decisions_ready(decisions)
    checks.append(
        {
            "id": "decisions",
            "label": "Minimum Wave-1 decisions recorded",
            "passed": dec_ok,
            "detail": {"missing": missing},
            "fix_view": "decisions",
        }
    )
    fr = freeze if isinstance(freeze, dict) else ensure_freeze({})
    fr_ok, fr_mode = freeze_ready(fr)
    checks.append(
        {
            "id": "freeze",
            "label": "Change freeze published (or deferred with Change Board note)",
            "passed": fr_ok,
            "detail": {"mode": fr_mode, "published": bool(fr.get("published"))},
            "fix_view": "freeze",
        }
    )
    tm = team if isinstance(team, dict) else ensure_team({})
    tm_ok, tm_missing = team_ready(tm)
    checks.append(
        {
            "id": "team",
            "label": "Team RACI has architect and data owner",
            "passed": tm_ok,
            "detail": {"missing": tm_missing},
            "fix_view": "team",
        }
    )
    checks.append(
        {
            "id": "estate",
            "label": "Sample estate bound or legacy source configured",
            "passed": estate_bound,
            "detail": {},
            "fix_view": "sources",
            "fix_phase": "1_discovery",
        }
    )
    hub_req = hub_probe_required() if require_hub is None else bool(require_hub)
    spoke_bound = bool((hub_spoke_id or "").strip())
    p_ok = probe_ok(hub_probe)
    hub_actual = spoke_bound and p_ok
    checks.append(
        {
            "id": "hub",
            "label": (
                "UDP Hub spoke bound and probe OK"
                if hub_req
                else "UDP Hub spoke bound and probe OK (optional)"
            ),
            "passed": hub_actual,
            "detail": {
                "spoke_bound": spoke_bound,
                "probe_ok": p_ok,
                "hub_spoke_id": hub_spoke_id or "",
                "required": hub_req,
            },
            "soft": not hub_req,
            "fix_view": "hub",
        }
    )
    hard = [c for c in checks if not c.get("soft")]
    return {
        "checks": checks,
        "passed": all(c["passed"] for c in hard),
        "soft_warnings": [c["id"] for c in checks if c.get("soft") and not c["passed"]],
    }
