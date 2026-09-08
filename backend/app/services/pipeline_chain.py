"""Per-product pipeline blueprint: flow depends on SDP / ADP / CDP tier.

Policies are governance metadata (not a chain stage). Transforms sit between
product nodes (or between landing and an SDP).
"""
from __future__ import annotations

from typing import Any, Literal

from app.db import DataProduct, PipelineRun, Project

ProductTier = Literal["sdp", "adp", "cdp"]


def _domain_kind(prod: DataProduct) -> str:
    name = (prod.name or "").lower()
    kind = (getattr(prod, "product_kind", None) or "").lower()
    if "usage" in name or "billing" in name or "usage" in kind or "billing" in kind:
        return "usage_billing"
    if "service" in name or kind == "service":
        return "service"
    if "trouble" in name or kind == "assurance":
        return "assurance"
    return "party"


def infer_product_tier(prod: DataProduct) -> ProductTier:
    """Resolve SDP | ADP | CDP for a catalog product."""
    explicit = (getattr(prod, "product_tier", None) or "").strip().lower()
    if explicit in {"sdp", "adp", "cdp"}:
        return explicit  # type: ignore[return-value]
    name = (prod.name or "").lower()
    if name.startswith("sdp") or name.startswith("sdp ·") or " sdp " in f" {name} ":
        return "sdp"
    if name.startswith("cdp") or "consumer" in name:
        return "cdp"
    # Domain / pilot products are ADPs by default
    return "adp"


def _upstream_sdps(prod: DataProduct, domain: str) -> list[dict[str, Any]]:
    if domain == "usage_billing":
        return [
            {
                "id": "sdp_usage",
                "kind": "product",
                "tier": "sdp",
                "label": "SDP · Billing Usage Events",
                "dataset": "sdp.billing_usage_events",
                "grain": "account_id × usage_date",
            },
            {
                "id": "sdp_invoice",
                "kind": "product",
                "tier": "sdp",
                "label": "SDP · Billing Invoice Header",
                "dataset": "sdp.billing_invoice_hdr",
                "grain": "invoice_id",
            },
        ]
    if domain == "service":
        return [
            {
                "id": "sdp_service",
                "kind": "product",
                "tier": "sdp",
                "label": "SDP · Service Inventory Extract",
                "dataset": "sdp.service_inventory_raw",
                "grain": "service_id",
            }
        ]
    if domain == "assurance":
        return [
            {
                "id": "sdp_tt",
                "kind": "product",
                "tier": "sdp",
                "label": "SDP · Trouble Ticket Extract",
                "dataset": "sdp.trouble_ticket_raw",
                "grain": "ticket_id",
            }
        ]
    return [
        {
            "id": "sdp_cust",
            "kind": "product",
            "tier": "sdp",
            "label": "SDP · CRM Customer Master",
            "dataset": "sdp.crm_customer_master",
            "grain": "cust_id",
        },
        {
            "id": "sdp_acct",
            "kind": "product",
            "tier": "sdp",
            "label": "SDP · CRM Account Master",
            "dataset": "sdp.crm_account_master",
            "grain": "acct_id",
        },
    ]


def _upstream_adp(prod: DataProduct) -> dict[str, Any]:
    return {
        "id": "adp_upstream",
        "kind": "product",
        "tier": "adp",
        "label": f"ADP · {prod.name.replace('CDP · ', '').replace('CDP ', '')}",
        "dataset": prod.dataset_name or "products.dp_domain",
        "grain": "domain product",
    }


def _sources(prod: DataProduct, domain: str) -> list[dict[str, Any]]:
    sor = getattr(prod, "system_of_record", None) or (
        "Billing" if domain == "usage_billing" else "CRM"
    )
    if domain == "usage_billing":
        interfaces = ["bill_usage_evt", "bill_inv_sum"]
    elif domain == "service":
        interfaces = ["si_service_extract"]
    elif domain == "assurance":
        interfaces = ["tt_ticket_extract"]
    else:
        interfaces = ["crm_cust_mstr", "crm_acct_mstr"]
    return [
        {
            "id": "sources",
            "kind": "source",
            "label": f"{sor} SoR",
            "interfaces": interfaces,
        }
    ]


def _policies(prod: DataProduct, result_tags: dict[str, Any] | None = None) -> dict[str, Any]:
    collibra = getattr(prod, "collibra", None) or {}
    contract = prod.contract or {}
    schema = contract.get("schema") if isinstance(contract, dict) else []
    pii_cols = [
        c.get("name")
        for c in (schema or [])
        if isinstance(c, dict) and c.get("pii")
    ]
    return {
        "freshness_slo_hours": getattr(prod, "freshness_slo_hours", None) or 24,
        "quality_rules": (contract.get("quality_rules") if isinstance(contract, dict) else None)
        or [],
        "pii_columns": pii_cols,
        "retention": "7y archive (demo)",
        "dataplex_tags": result_tags or {},
        "collibra": {
            "status": collibra.get("status") or "not_linked",
            "asset_id": collibra.get("asset_id") or "",
            "url": collibra.get("url") or "",
            "domain": collibra.get("domain") or getattr(prod, "domain", None) or "",
        },
        "deprecation_policy": (contract.get("deprecation_policy") if isinstance(contract, dict) else None)
        or "",
    }


def blueprint_for_product(
    prod: DataProduct,
    project: Project | None = None,
    runs: list[PipelineRun] | None = None,
) -> dict[str, Any]:
    """Build a flat, tier-specific pipeline for this data product only."""
    tier = infer_product_tier(prod)
    domain = _domain_kind(prod)
    contract = prod.contract or {}
    slug = (contract.get("name") if isinstance(contract, dict) else None) or "product"
    dataset = prod.dataset_name or f"products.dp_{slug}"
    consumers = list(getattr(prod, "consumers", None) or [])
    pipe_ok = (prod.pipeline_status or "").lower() in {"success", "succeeded"}
    is_live = (prod.status or "").lower() == "live"

    latest: dict[str, Any] = {}
    for r in runs or []:
        stage = (r.stage or "").lower()
        if stage == "conformance":
            stage = "materialize"
        elif stage in {"product", "sdp", "adp", "cdp"}:
            stage = "materialize"
        elif stage == "policy":
            continue
        prev = latest.get(stage)
        if not prev or (r.id or 0) >= (prev.get("id") or 0):
            latest[stage] = {
                "id": r.id,
                "stage": stage,
                "status": r.status,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else None,
                "detail": r.detail or {},
            }

    def node_status(key: str, *, focus: bool = False) -> str:
        hit = latest.get(key)
        if hit:
            return (hit.get("status") or "pending").lower()
        if pipe_ok or is_live:
            return "success"
        if focus and (prod.status or "").lower() in {
            "approved",
            "live",
            "proposed",
            "suggested",
        }:
            return "ready"
        return "pending"

    focus_node = {
        "id": "focus",
        "kind": "product",
        "tier": tier,
        "label": prod.name,
        "dataset": dataset,
        "grain": "focus product",
        "status": node_status("materialize", focus=True),
        "sid_entities": prod.sid_entities or [],
        "consumers": consumers,
        "focus": True,
    }

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, str]] = []

    if tier == "sdp":
        # Sources → Ingest → Landing → Transform → SDP (focus)
        for src in _sources(prod, domain):
            nodes.append({**src, "status": node_status("ingest")})
        nodes.append(
            {
                "id": "ingest",
                "kind": "motion",
                "label": "Ingestion",
                "tool": "CNDI",
                "pattern": "extract → validate → land",
                "status": node_status("ingest"),
            }
        )
        nodes.append(
            {
                "id": "landing",
                "kind": "zone",
                "label": "Landing",
                "dataset": "landing.*",
                "status": node_status("landing"),
            }
        )
        nodes.append(
            {
                "id": "transform",
                "kind": "transform",
                "label": "Transform",
                "tool": "Coding Skills",
                "files": (prod.code_links or {}).get("files")
                or [f"transformations/{slug}_sdp.sql"],
                "status": node_status("transform"),
            }
        )
        nodes.append(focus_node)
        edges = [
            {"from": "sources", "to": "ingest", "via": ""},
            {"from": "ingest", "to": "landing", "via": ""},
            {"from": "landing", "to": "transform", "via": "transform"},
            {"from": "transform", "to": "focus", "via": ""},
        ]
        # Fix source id — only one source node
        if nodes and nodes[0].get("id") == "sources":
            pass
        else:
            # _sources returns id sources
            pass
        title = f"Create SDP · {prod.name}"
        subtitle = (
            "Source → CNDI ingest → landing → transform → this source-aligned data product"
        )

    elif tier == "cdp":
        up = _upstream_adp(prod)
        up["status"] = node_status("materialize")
        nodes.append(up)
        nodes.append(
            {
                "id": "transform",
                "kind": "transform",
                "label": "Transform",
                "tool": "Coding Skills",
                "files": (prod.code_links or {}).get("files")
                or [f"transformations/{slug}_cdp.sql"],
                "status": node_status("transform"),
            }
        )
        nodes.append(focus_node)
        edges = [
            {"from": "adp_upstream", "to": "transform", "via": "transform"},
            {"from": "transform", "to": "focus", "via": ""},
        ]
        title = f"CDP pipeline · {prod.name}"
        subtitle = "Upstream ADP → transform → this consumer data product"

    else:
        # ADP (default): upstream SDPs → Transform → this ADP
        for sdp in _upstream_sdps(prod, domain):
            nodes.append({**sdp, "status": node_status("materialize")})
        nodes.append(
            {
                "id": "transform",
                "kind": "transform",
                "label": "Transform",
                "tool": "Coding Skills",
                "blurb": "SID align · SCD2 · tests · reconcile",
                "files": (prod.code_links or {}).get("files")
                or [
                    f"transformations/{slug}.sql",
                    f"transformations/tests/test_{slug}.sql",
                    f"transformations/reconcile/{slug}.sql",
                ],
                "status": node_status("transform"),
            }
        )
        nodes.append(focus_node)
        sdp_ids = [n["id"] for n in nodes if n.get("tier") == "sdp"]
        edges = [{"from": sid, "to": "transform", "via": "transform"} for sid in sdp_ids]
        edges.append({"from": "transform", "to": "focus", "via": ""})
        title = f"ADP pipeline · {prod.name}"
        subtitle = "Upstream SDPs → transform → this aggregated / domain product"

    # Normalize source node id for SDP chain edges
    if tier == "sdp":
        src_ids = [n["id"] for n in nodes if n.get("kind") == "source"]
        if src_ids:
            edges = [
                {"from": src_ids[0], "to": "ingest", "via": ""},
                {"from": "ingest", "to": "landing", "via": ""},
                {"from": "landing", "to": "transform", "via": "transform"},
                {"from": "transform", "to": "focus", "via": ""},
            ]

    git_url = (project.git_url if project else "") or ""
    return {
        "product_id": prod.id,
        "product_name": prod.name,
        "product_status": prod.status,
        "pipeline_status": prod.pipeline_status,
        "product_tier": tier,
        "tier_label": {
            "sdp": "Source-aligned data product (SDP)",
            "adp": "Aggregated / domain data product (ADP)",
            "cdp": "Consumer data product (CDP)",
        }[tier],
        "dataset_name": dataset,
        "system_of_record": getattr(prod, "system_of_record", None) or "",
        "title": title,
        "subtitle": subtitle,
        "nodes": nodes,
        "edges": edges,
        "focus": focus_node,
        "policies": _policies(prod),
        "transform": {
            "tool": "Coding Skills",
            "files": (prod.code_links or {}).get("files") or [],
            "repo": (prod.code_links or {}).get("repo") or git_url or "migration-repo",
        },
        "ingestion": {
            "tool": "CNDI",
            "pattern": "extract → validate → land → catalogue",
        },
        # Back-compat for older UI (empty / minimal)
        "stages": [
            {
                "id": n["id"],
                "label": n.get("label") or n["id"],
                "tier": n.get("tier") or n.get("kind"),
                "blurb": n.get("blurb") or n.get("pattern") or "",
                "status": n.get("status") or "pending",
            }
            for n in nodes
        ],
    }


def stage_details_from_result(
    result: dict[str, Any],
    prod: DataProduct,
) -> list[dict[str, Any]]:
    """Pipeline runs for the focus product's tier (no policy stage in the chain)."""
    tier = infer_product_tier(prod)
    blueprint = blueprint_for_product(prod)
    landing_uri = result.get("landing_uri")
    landing_counts = result.get("landing_counts") or {}
    product = result.get("product") or {}
    dag = result.get("dag") or {}
    tags = result.get("policy_tags") or {}

    rows: list[dict[str, Any]] = []
    if tier == "sdp":
        rows.extend(
            [
                {
                    "stage": "ingest",
                    "status": "success",
                    "detail": {
                        "tool": "CNDI",
                        "dag": dag,
                        "message": "Ingestion validated and landed batch",
                    },
                },
                {
                    "stage": "landing",
                    "status": "success",
                    "detail": {
                        "uri": landing_uri,
                        "counts": landing_counts,
                        "message": "Landing zone updated",
                    },
                },
            ]
        )
    rows.append(
        {
            "stage": "transform",
            "status": "success",
            "detail": {
                "tool": "Coding Skills",
                "files": blueprint.get("transform", {}).get("files") or [],
                "message": f"Transform into {tier.upper()} completed",
            },
        }
    )
    rows.append(
        {
            "stage": "materialize",
            "status": "success",
            "detail": {
                "tier": tier.upper(),
                "product": product,
                "dataset": product.get("dataset") or prod.dataset_name,
                "message": f"{tier.upper()} published · {prod.name}",
                # Keep legacy aliases for older history readers
                "legacy_alias": "product" if tier == "adp" else tier,
            },
        }
    )
    # Policy applied as run annotation only — not a chain node
    rows.append(
        {
            "stage": "governance",
            "status": "success",
            "detail": {
                "kind": "policy_overlay",
                "tags": tags,
                "message": "Policies applied (governance overlay — not a flow stage)",
                "archive_uri": result.get("archive_uri"),
            },
        }
    )
    return rows
