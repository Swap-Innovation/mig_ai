"""Data product catalog serialization, dossier enrichment, and demo suggestions."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.db import DataProduct, Project


def serialize_product(p: DataProduct) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "sid_entities": p.sid_entities or [],
        "contract": p.contract or {},
        "version": p.version,
        "status": p.status,
        "owner": p.owner or "",
        "dataset_name": p.dataset_name,
        "pipeline_status": p.pipeline_status,
        "cost_estimate_monthly": p.cost_estimate_monthly,
        "description": getattr(p, "description", None) or "",
        "product_kind": getattr(p, "product_kind", None) or "party",
        "product_tier": getattr(p, "product_tier", None) or "adp",
        "domain": getattr(p, "domain", None) or "",
        "system_of_record": getattr(p, "system_of_record", None) or "",
        "confidence": float(getattr(p, "confidence", None) or 0),
        "freshness_slo_hours": int(getattr(p, "freshness_slo_hours", None) or 24),
        "source_agent_run_id": getattr(p, "source_agent_run_id", None),
        "consumers": getattr(p, "consumers", None) or [],
        "input_ports": getattr(p, "input_ports", None) or [],
        "output_ports": getattr(p, "output_ports", None) or [],
        "docs": getattr(p, "docs", None) or [],
        "code_links": getattr(p, "code_links", None) or {},
        "collibra": getattr(p, "collibra", None) or {},
        "cost_breakdown": getattr(p, "cost_breakdown", None) or {},
        "usage_metrics": getattr(p, "usage_metrics", None) or {},
    }


def _slug(name: str) -> str:
    return (
        (name or "product")
        .lower()
        .replace("&", "and")
        .replace(" ", "_")
        .replace("-", "_")
    )


def dossier_from_identification(
    output: dict[str, Any],
    *,
    project: Project | None = None,
    run_id: int | None = None,
) -> dict[str, Any]:
    """Build dossier fields from Semantic modeling / data_product_identification output."""
    contract = output.get("candidate_contract") or output.get("contract") or {}
    name = (
        output.get("product_name")
        or output.get("product_boundary")
        or "Party & Customer Account"
    )
    kind = (output.get("product_kind") or "party").lower()
    slug = (contract.get("name") if isinstance(contract, dict) else None) or _slug(name)
    dataset = output.get("dataset_name") or f"products.dp_{slug}"
    consumers = output.get("consumers") or []
    sor = output.get("system_of_record") or "CRM"
    freshness = int(
        (contract.get("freshness_slo_hours") if isinstance(contract, dict) else None) or 24
    )
    confidence = float(output.get("confidence") or 0.85)
    cost = 120.0 if kind == "party" else 180.0 if "usage" in kind or "billing" in kind else 95.0

    landing_sources = []
    if kind in {"usage", "billing", "usage_billing"}:
        landing_sources = [
            "landing.billing_usage_daily",
            "landing.billing_invoice_hdr",
        ]
        domain = "Billing"
    else:
        landing_sources = ["landing.crm_cust_mstr", "landing.crm_acct_mstr"]
        domain = "Customer"

    input_ports = [
        {
            "name": src.split(".")[-1],
            "direction": "input",
            "protocol": "batch/gcs",
            "path": src,
            "schema_version": "0.1.0",
            "sla": f"{freshness}h",
            "pii": "email" in src or "cust" in src,
            "tool": "IngestPipeline",
        }
        for src in landing_sources
    ]
    output_ports = [
        {
            "name": dataset.split(".")[-1] if "." in dataset else dataset,
            "direction": "output",
            "protocol": "bigquery",
            "path": dataset,
            "schema_version": (contract.get("version") if isinstance(contract, dict) else None)
            or "0.1.0",
            "sla": f"{freshness}h",
            "pii": True,
            "tool": "BigQuery",
        },
        {
            "name": f"{slug}_contract",
            "direction": "output",
            "protocol": "odcs/yaml",
            "path": f"products/{slug}.yaml",
            "schema_version": "0.1.0",
            "sla": "n/a",
            "pii": False,
            "tool": "Contract Docs",
        },
    ]

    git_base = (project.git_url if project and project.git_url else "").rstrip("/")
    branch = (project.git_branch if project and project.git_branch else "main") or "main"
    prefix = (
        (project.git_path_prefix if project and project.git_path_prefix else "").strip("/")
        or "migration-repo"
    )
    mr_url = f"{git_base}/-/merge_requests" if git_base else ""
    code_links = {
        "repo": git_base or "migration-repo (local)",
        "branch": branch,
        "prefix": prefix,
        "mr_url": mr_url,
        "mr_status": "not_opened",
        "files": [
            f"transformations/{slug}.sql",
            f"transformations/tests/test_{slug}.sql",
            f"transformations/reconcile/{slug}.sql",
        ],
        "commit": (project.git_commit if project else "") or "",
    }

    collibra_domain = domain
    collibra = {
        "asset_id": "",
        "asset_name": name,
        "domain": collibra_domain,
        "status": "not_linked",
        "url": "",
        "last_sync": None,
        "steward": output.get("owner") or "",
    }

    docs = [
        {
            "title": f"{name} · consumer guide",
            "kind": "guide",
            "path": f"docs/products/{slug}/CONSUMER.md",
            "generated_by": "ContractDocs",
            "status": "pending",
        },
        {
            "title": f"{name} · runbook",
            "kind": "runbook",
            "path": f"docs/products/{slug}/RUNBOOK.md",
            "generated_by": "ContractDocs",
            "status": "pending",
        },
    ]

    return {
        "name": name,
        "description": output.get("rationale")
        or f"Canonical {name} product proposed by Semantic modeling.",
        "product_kind": kind,
        "product_tier": (
            str(output.get("product_tier") or "adp").lower()
            if str(output.get("product_tier") or "adp").lower()
            in {"sdp", "adp", "cdp"}
            else "adp"
        ),
        "domain": domain,
        "system_of_record": sor,
        "confidence": confidence,
        "freshness_slo_hours": freshness,
        "source_agent_run_id": run_id,
        "consumers": consumers,
        "sid_entities": output.get("sid_entities") or [],
        "contract": contract if isinstance(contract, dict) else {},
        "owner": output.get("owner") or "",
        "dataset_name": dataset,
        "version": (contract.get("version") if isinstance(contract, dict) else None) or "0.1.0",
        "cost_estimate_monthly": cost,
        "input_ports": input_ports,
        "output_ports": output_ports,
        "docs": docs,
        "code_links": code_links,
        "collibra": collibra,
        "cost_breakdown": {
            "landing": round(cost * 0.25, 1),
            "transform": round(cost * 0.45, 1),
            "serve": round(cost * 0.30, 1),
            "currency": "USD",
        },
        "usage_metrics": {
            "query_count_7d": 0,
            "row_reads_7d": 0,
            "last_access": None,
            "top_consumers": [],
        },
    }


def apply_dossier(prod: DataProduct, dossier: dict[str, Any], *, status: str | None = None) -> None:
    """Copy dossier dict onto ORM row."""
    mapping = [
        "description",
        "product_kind",
        "product_tier",
        "domain",
        "system_of_record",
        "confidence",
        "freshness_slo_hours",
        "source_agent_run_id",
        "consumers",
        "sid_entities",
        "contract",
        "owner",
        "dataset_name",
        "version",
        "cost_estimate_monthly",
        "input_ports",
        "output_ports",
        "docs",
        "code_links",
        "collibra",
        "cost_breakdown",
        "usage_metrics",
    ]
    for key in mapping:
        if key in dossier and dossier[key] is not None:
            setattr(prod, key, dossier[key])
    if status:
        prod.status = status
    if "name" in dossier and dossier["name"]:
        prod.name = dossier["name"]


def upsert_from_identification(
    db: Session,
    project_id: int,
    output: dict[str, Any],
    *,
    run_id: int | None = None,
    status: str = "proposed",
) -> DataProduct:
    project = db.query(Project).get(project_id)
    dossier = dossier_from_identification(output, project=project, run_id=run_id)
    name = dossier["name"]
    existing = (
        db.query(DataProduct).filter_by(project_id=project_id, name=name).first()
    )
    if not existing:
        existing = DataProduct(project_id=project_id, name=name, status=status)
        db.add(existing)
    apply_dossier(existing, dossier, status=status)
    return existing


def attach_code_links(
    db: Session,
    project_id: int,
    output: dict[str, Any],
) -> None:
    files = output.get("files") or {}
    paths = list(files.keys()) if isinstance(files, dict) else []
    if not paths:
        return
    products = db.query(DataProduct).filter_by(project_id=project_id).all()
    # Prefer party product; else first approved/live/proposed
    target = None
    for p in products:
        if "party" in (p.name or "").lower() or (p.product_kind or "") == "party":
            target = p
            break
    if not target and products:
        target = products[0]
    if not target:
        return
    project = db.query(Project).get(project_id)
    git_base = (project.git_url if project and project.git_url else "").rstrip("/")
    links = dict(target.code_links or {})
    links["files"] = paths
    links["mr_status"] = "ready_for_review"
    links["pr_summary"] = output.get("pr_summary") or ""
    if git_base:
        links["repo"] = git_base
        links["mr_url"] = f"{git_base}/-/merge_requests/new"
        links["file_urls"] = {
            rel: f"{git_base}/-/blob/{links.get('branch') or 'main'}/{rel}" for rel in paths
        }
    else:
        links["file_urls"] = {rel: f"migration-repo/{rel}" for rel in paths}
    target.code_links = links


def attach_docs(
    db: Session,
    project_id: int,
    output: dict[str, Any],
) -> None:
    products = db.query(DataProduct).filter_by(project_id=project_id).all()
    if not products:
        return
    # Update all products that lack generated docs, prefer matching contract name
    contract = output.get("contract_yaml") or {}
    meta = (contract.get("metadata") or {}) if isinstance(contract, dict) else {}
    cname = (meta.get("name") or "").lower()
    targets = [
        p
        for p in products
        if cname
        and (
            cname in ((p.contract or {}).get("name") or "").lower()
            or cname in (p.dataset_name or "").lower()
        )
    ] or products[:1]

    for prod in targets:
        slug = _slug((prod.contract or {}).get("name") or prod.name)
        docs = [
            {
                "title": f"{prod.name} · data contract",
                "kind": "contract",
                "path": f"products/{slug}.yaml",
                "generated_by": "ContractDocs",
                "status": "generated",
                "preview": output.get("contract_yaml"),
            },
            {
                "title": f"{prod.name} · consumer guide",
                "kind": "guide",
                "path": f"docs/products/{slug}/CONSUMER.md",
                "generated_by": "ContractDocs",
                "status": "generated",
                "preview": output.get("migration_notes") or "",
            },
            {
                "title": f"{prod.name} · glossary updates",
                "kind": "glossary",
                "path": f"docs/products/{slug}/GLOSSARY.json",
                "generated_by": "ContractDocs",
                "status": "generated",
                "preview": output.get("glossary_updates") or [],
            },
            {
                "title": f"{prod.name} · lineage declaration",
                "kind": "lineage",
                "path": f"docs/products/{slug}/LINEAGE.json",
                "generated_by": "ContractDocs",
                "status": "generated",
                "preview": output.get("lineage_declaration") or {},
            },
        ]
        prod.docs = docs
        collibra = dict(prod.collibra or {})
        if collibra.get("status") in {"", None, "not_linked"}:
            collibra.update(
                {
                    "status": "pending",
                    "asset_name": prod.name,
                    "domain": prod.domain or collibra.get("domain") or "Customer",
                }
            )
            prod.collibra = collibra


SUGGESTED_CATALOG: list[dict[str, Any]] = [
    {
        "product_name": "Service Inventory Snapshot",
        "product_kind": "service",
        "product_boundary": "Service Inventory Snapshot",
        "system_of_record": "Service Inventory",
        "owner": "",
        "sid_entities": ["Service", "Resource", "ResourceSpecification"],
        "rationale": "Wave-2 candidate: consolidate service/resource extracts into one inventory grain for network ops.",
        "confidence": 0.82,
        "consumers": ["network_ops", "assurance_desk"],
        "dataset_name": "products.dp_service_inventory_snapshot",
        "candidate_contract": {
            "name": "service_inventory_snapshot",
            "version": "0.1.0",
            "schema": [
                {"name": "service_id", "type": "STRING", "pk": True},
                {"name": "resource_id", "type": "STRING", "pk": True},
                {"name": "service_state", "type": "STRING"},
                {"name": "valid_from", "type": "TIMESTAMP"},
                {"name": "is_current", "type": "BOOL"},
            ],
            "freshness_slo_hours": 12,
            "quality_rules": ["service_id NOT NULL", "resource_id NOT NULL"],
            "deprecation_policy": "Breaking changes require 90-day deprecation window",
            "versioning": "semver",
        },
    },
    {
        "product_name": "Trouble Ticket 360",
        "product_kind": "assurance",
        "product_boundary": "Trouble Ticket 360",
        "system_of_record": "Care / TT",
        "owner": "",
        "sid_entities": ["TroubleTicket", "Party"],
        "rationale": "Wave-2 candidate: unify care tickets with party keys for 360 care desktop.",
        "confidence": 0.76,
        "consumers": ["care_desktop"],
        "dataset_name": "products.dp_trouble_ticket_360",
        "candidate_contract": {
            "name": "trouble_ticket_360",
            "version": "0.1.0",
            "schema": [
                {"name": "ticket_id", "type": "STRING", "pk": True},
                {"name": "party_id", "type": "STRING"},
                {"name": "severity", "type": "STRING"},
                {"name": "opened_at", "type": "TIMESTAMP"},
                {"name": "closed_at", "type": "TIMESTAMP"},
            ],
            "freshness_slo_hours": 1,
            "quality_rules": ["ticket_id NOT NULL"],
            "deprecation_policy": "Breaking changes require 90-day deprecation window",
            "versioning": "semver",
        },
    },
]


def ensure_suggested_catalog(db: Session, project_id: int) -> list[DataProduct]:
    """Ensure Wave-2 suggested products exist for catalog demos (idempotent)."""
    project = db.query(Project).get(project_id)
    created: list[DataProduct] = []
    for spec in SUGGESTED_CATALOG:
        name = spec["product_name"]
        existing = (
            db.query(DataProduct).filter_by(project_id=project_id, name=name).first()
        )
        if existing:
            if not getattr(existing, "product_tier", None):
                existing.product_tier = "adp"
            if not (existing.input_ports or existing.output_ports):
                dossier = dossier_from_identification(spec, project=project)
                apply_dossier(existing, dossier, status=existing.status or "suggested")
                existing.cost_estimate_monthly = 95.0 if "Service" in name else 70.0
                existing.product_tier = "adp"
            continue
        dossier = dossier_from_identification(spec, project=project)
        prod = DataProduct(project_id=project_id, name=name, status="suggested")
        apply_dossier(prod, dossier, status="suggested")
        prod.product_tier = "adp"
        prod.cost_estimate_monthly = 95.0 if "Service" in name else 70.0
        usage = dict(prod.usage_metrics or {})
        usage.update(
            {
                "query_count_7d": 0,
                "row_reads_7d": 0,
                "top_consumers": list(prod.consumers or [])[:3],
            }
        )
        prod.usage_metrics = usage
        db.add(prod)
        created.append(prod)

    # Seed Wave-1 SDP catalog — Pipeline primary focus is creating SDPs
    sdp_catalog = [
        {
            "product_name": "CRM Customer Master",
            "product_tier": "sdp",
            "product_kind": "party",
            "system_of_record": "CRM",
            "dataset_name": "sdp.crm_customer_master",
            "sid_entities": ["Party"],
            "rationale": "Source-aligned customer master at CRM grain (cust_id).",
            "confidence": 0.92,
            "consumers": [],
            "candidate_contract": {
                "name": "sdp_crm_customer_master",
                "version": "0.1.0",
                "schema": [
                    {"name": "cust_id", "type": "STRING", "pk": True, "pii": False},
                    {"name": "cust_name", "type": "STRING"},
                    {"name": "email", "type": "STRING", "pii": True},
                ],
                "freshness_slo_hours": 24,
                "quality_rules": ["cust_id NOT NULL"],
            },
        },
        {
            "product_name": "CRM Account Master",
            "product_tier": "sdp",
            "product_kind": "party",
            "system_of_record": "CRM",
            "dataset_name": "sdp.crm_account_master",
            "sid_entities": ["CustomerAccount"],
            "rationale": "Source-aligned account master at CRM grain (acct_id).",
            "confidence": 0.91,
            "consumers": [],
            "candidate_contract": {
                "name": "sdp_crm_account_master",
                "version": "0.1.0",
                "schema": [
                    {"name": "acct_id", "type": "STRING", "pk": True},
                    {"name": "cust_id", "type": "STRING"},
                    {"name": "acct_status", "type": "STRING"},
                    {"name": "billing_cycle", "type": "STRING"},
                ],
                "freshness_slo_hours": 24,
                "quality_rules": ["acct_id NOT NULL", "cust_id NOT NULL"],
            },
        },
        {
            "product_name": "Billing Usage Events",
            "product_tier": "sdp",
            "product_kind": "usage_billing",
            "system_of_record": "Billing",
            "dataset_name": "sdp.billing_usage_events",
            "sid_entities": ["CustomerUsage"],
            "rationale": "Source-aligned usage events at account × day grain.",
            "confidence": 0.88,
            "consumers": [],
            "candidate_contract": {
                "name": "sdp_billing_usage_events",
                "version": "0.1.0",
                "schema": [
                    {"name": "account_id", "type": "STRING", "pk": True},
                    {"name": "usage_date", "type": "DATE", "pk": True},
                    {"name": "usage_quantity", "type": "NUMERIC"},
                    {"name": "usage_amount", "type": "NUMERIC"},
                ],
                "freshness_slo_hours": 24,
                "quality_rules": ["account_id NOT NULL", "usage_date NOT NULL"],
            },
        },
        {
            "product_name": "Billing Invoice Header",
            "product_tier": "sdp",
            "product_kind": "usage_billing",
            "system_of_record": "Billing",
            "dataset_name": "sdp.billing_invoice_hdr",
            "sid_entities": ["CustomerBill"],
            "rationale": "Source-aligned invoice headers from Billing SoR.",
            "confidence": 0.87,
            "consumers": [],
            "candidate_contract": {
                "name": "sdp_billing_invoice_hdr",
                "version": "0.1.0",
                "schema": [
                    {"name": "invoice_id", "type": "STRING", "pk": True},
                    {"name": "account_id", "type": "STRING"},
                    {"name": "invoice_amount", "type": "NUMERIC"},
                ],
                "freshness_slo_hours": 24,
                "quality_rules": ["invoice_id NOT NULL"],
            },
        },
        {
            "product_name": "Service Inventory Extract",
            "product_tier": "sdp",
            "product_kind": "service",
            "system_of_record": "Service Inventory",
            "dataset_name": "sdp.service_inventory_raw",
            "sid_entities": ["Service", "Resource"],
            "rationale": "Source-aligned service/resource extract for Wave-2 SDP.",
            "confidence": 0.84,
            "consumers": [],
            "candidate_contract": {
                "name": "sdp_service_inventory_raw",
                "version": "0.1.0",
                "schema": [
                    {"name": "service_id", "type": "STRING", "pk": True},
                    {"name": "resource_id", "type": "STRING", "pk": True},
                    {"name": "service_state", "type": "STRING"},
                ],
                "freshness_slo_hours": 12,
                "quality_rules": ["service_id NOT NULL"],
            },
        },
        {
            "product_name": "Trouble Ticket Extract",
            "product_tier": "sdp",
            "product_kind": "assurance",
            "system_of_record": "Care / TT",
            "dataset_name": "sdp.trouble_ticket_raw",
            "sid_entities": ["TroubleTicket"],
            "rationale": "Source-aligned trouble ticket extract for care desk.",
            "confidence": 0.82,
            "consumers": [],
            "candidate_contract": {
                "name": "sdp_trouble_ticket_raw",
                "version": "0.1.0",
                "schema": [
                    {"name": "ticket_id", "type": "STRING", "pk": True},
                    {"name": "party_id", "type": "STRING"},
                    {"name": "severity", "type": "STRING"},
                ],
                "freshness_slo_hours": 1,
                "quality_rules": ["ticket_id NOT NULL"],
            },
        },
    ]
    # Rename legacy prefixed SDP / drop demo CDP from pipeline focus
    rename_map = {
        "SDP · CRM Customer Master": "CRM Customer Master",
        "CDP · Billing Reports View": None,  # keep row but leave as cdp; pipeline hides it
    }
    for old_name, new_name in rename_map.items():
        row = (
            db.query(DataProduct)
            .filter_by(project_id=project_id, name=old_name)
            .first()
        )
        if row and new_name:
            clash = (
                db.query(DataProduct)
                .filter_by(project_id=project_id, name=new_name)
                .first()
            )
            if not clash:
                row.name = new_name
            row.product_tier = "sdp"

    for spec in sdp_catalog:
        name = spec["product_name"]
        existing = (
            db.query(DataProduct).filter_by(project_id=project_id, name=name).first()
        )
        if existing:
            existing.product_tier = "sdp"
            if not (existing.input_ports or existing.output_ports):
                dossier = dossier_from_identification(spec, project=project)
                apply_dossier(existing, dossier, status=existing.status or "suggested")
                existing.product_tier = "sdp"
            continue
        dossier = dossier_from_identification(spec, project=project)
        prod = DataProduct(
            project_id=project_id,
            name=name,
            status="suggested",
            product_tier="sdp",
        )
        apply_dossier(prod, dossier, status="suggested")
        prod.product_tier = "sdp"
        prod.cost_estimate_monthly = 40.0
        db.add(prod)
        created.append(prod)

    # Backfill tier on existing products missing the column value
    for p in db.query(DataProduct).filter_by(project_id=project_id).all():
        if not (getattr(p, "product_tier", None) or "").strip():
            from app.services.pipeline_chain import infer_product_tier

            p.product_tier = infer_product_tier(p)

    return created


def backfill_usage_for_live(prod: DataProduct) -> None:
    if (prod.status or "") != "live":
        return
    metrics = dict(prod.usage_metrics or {})
    if metrics.get("query_count_7d"):
        return
    consumers = list(prod.consumers or [])
    metrics.update(
        {
            "query_count_7d": 1280,
            "row_reads_7d": 4_200_000,
            "last_access": "today",
            "top_consumers": [
                {"name": c, "queries": 400 - i * 80} for i, c in enumerate(consumers[:3])
            ]
            or [{"name": "billing_reports", "queries": 520}],
        }
    )
    prod.usage_metrics = metrics
    collibra = dict(prod.collibra or {})
    if collibra.get("status") in {"pending", "not_linked", "", None}:
        collibra.update(
            {
                "asset_id": f"AST-{prod.id or 1000:04d}",
                "status": "synced",
                "url": f"https://collibra.example/asset/AST-{prod.id or 1000:04d}",
                "last_sync": "demo",
            }
        )
        prod.collibra = collibra
