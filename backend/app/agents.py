"""Mock / pluggable LLM agents producing structured reviewable outputs."""
from __future__ import annotations

from typing import Any

from app.config import get_settings


def _cite(*ids: str) -> list[dict[str, str]]:
    return [{"type": "inventory", "id": i} for i in ids]


def legacy_code_assessment(inventory_summary: dict[str, Any]) -> dict[str, Any]:
    objects = inventory_summary.get("objects", [])
    steps: list[dict[str, Any]] = [
        {
            "name": "load_inventory",
            "status": "success",
            "message": f"Loaded {len(objects)} table objects for assessment",
        },
        {
            "name": "apply_rules",
            "status": "running",
            "message": "Scanning for identity, account, and restartability patterns",
        },
    ]
    findings = []
    for obj in objects[:40]:
        fqn = obj.get("fqn", obj.get("name", ""))
        rules = []
        if "cust" in fqn.lower() or "party" in fqn.lower():
            rules.append("Customer identity must resolve to a single Party")
        if "acct" in fqn.lower():
            rules.append("Account status drives billing eligibility")
        if obj.get("unsound"):
            rules.append("Truncate-reload pattern is non-restartable")
        findings.append(
            {
                "object": fqn,
                "sources": obj.get("sources", []),
                "targets": obj.get("targets", [fqn]),
                "dependencies": obj.get("dependencies", []),
                "candidate_business_rules": rules or ["Preserve primary key semantics"],
                "confidence": 0.92 if rules else 0.75,
                "citations": _cite(fqn),
            }
        )
    steps[1] = {
        "name": "apply_rules",
        "status": "success",
        "message": f"Produced {len(findings)} object findings",
    }
    steps.append(
        {
            "name": "score_confidence",
            "status": "success",
            "message": "Aggregate confidence 0.86; low-confidence items flagged for HITL",
        }
    )
    return {
        "task": "legacy_code_assessment",
        "findings": findings,
        "confidence": 0.86,
        "review_items": [f for f in findings if f["confidence"] < 0.8],
        "steps": steps,
    }


def source_interface_acquisition(ingest_setup: dict[str, Any]) -> dict[str, Any]:
    iface = ingest_setup.get("interface", {})
    columns = iface.get("columns", [])
    pii = [
        c["name"]
        for c in columns
        if any(
            x in c["name"].lower()
            for x in ("email", "phone", "ssn", "name", "address", "dob", "msisdn")
        )
    ]
    gaps = []
    if not iface.get("primary_key"):
        gaps.append("Missing declared primary key")
    if not ingest_setup.get("owner"):
        gaps.append("Ingestion owner not assigned")
    iface_name = iface.get("name", "crm_customer_extract")
    return {
        "task": "source_interface_acquisition",
        "accelerator": "Acquisition AI",
        "tooling": "CNDI",
        "classification": "customer_master",
        "technical_catalogue": {
            "interface_name": iface_name,
            "format": iface.get("format", "csv"),
            "columns": columns,
            "pii_columns": pii,
        },
        "pii_indicators": pii,
        "ingestion_readiness_gaps": gaps,
        "cndi_pipeline": {
            "tool": "CNDI",
            "manifest": f"ingestion/{iface_name}.cndi.yaml",
            "stages": ["extract", "validate", "land_raw", "catalogue_tags"],
        },
        "confidence": 0.9 if not gaps else 0.7,
        "citations": [{"type": "standards", "id": "sid-party-1.0"}],
        "steps": [
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Acquisition AI · bind source interface & column catalogue",
                "detail": {"kind": "terminal", "agent": "AcquisitionAI"},
            },
            {
                "name": "classify_pii",
                "status": "success",
                "message": f"Classified {len(pii)} PII columns · readiness gaps={len(gaps)}",
                "detail": {"agent": "AcquisitionAI"},
            },
            {
                "name": "terminal.log",
                "status": "success",
                "message": "CNDI · draft ingestion pipeline (extract → validate → land_raw)",
                "detail": {"kind": "terminal", "agent": "CNDI"},
            },
            {
                "name": "cndi_manifest",
                "status": "success",
                "message": f"Wrote CNDI manifest stub ingestion/{iface_name}.cndi.yaml",
                "detail": {"agent": "CNDI"},
            },
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Catalogue · apply technical metadata + policy tags for landing zone",
                "detail": {"kind": "terminal", "agent": "AcquisitionAI"},
            },
            {
                "name": "package",
                "status": "success",
                "message": "Acquisition pack ready for HITL review",
                "detail": {"agent": "AcquisitionAI"},
            },
        ],
    }


# Exact column → TM Forum SID (domain, entity, attribute)
SID_HINTS: dict[str, tuple[str, str, str]] = {
    # Party / identity
    "id": ("Common", "RootEntity", "id"),
    "cust_id": ("Party", "Party", "partyId"),
    "customer_id": ("Party", "Party", "partyId"),
    "party_id": ("Party", "Party", "partyId"),
    "cust_name": ("Party", "Party", "partyName"),
    "customer_name": ("Party", "Party", "partyName"),
    "party_name": ("Party", "Party", "partyName"),
    "display_name": ("Party", "Party", "name"),
    "name": ("Party", "Party", "name"),
    "descr": ("Party", "Party", "description"),
    "description": ("Party", "Party", "description"),
    "email": ("Party", "Party", "emailAddress"),
    "email_address": ("Party", "Party", "emailAddress"),
    "phone": ("Party", "Party", "telephoneNumber"),
    "telephone": ("Party", "Party", "telephoneNumber"),
    "phone_number": ("Party", "Party", "telephoneNumber"),
    "role_cd": ("Party", "PartyRole", "roleType"),
    "role_code": ("Party", "PartyRole", "roleType"),
    "role_type": ("Party", "PartyRole", "roleType"),
    "opt_in": ("Party", "Party", "optIn"),
    "score": ("Party", "Party", "score"),
    "acct_cnt": ("Party", "Party", "accountCount"),
    "account_count": ("Party", "Party", "accountCount"),
    # Contact / address
    "address_line": ("Party", "GeographicAddress", "street1"),
    "address": ("Party", "GeographicAddress", "street1"),
    "street": ("Party", "GeographicAddress", "street1"),
    "city": ("Party", "GeographicAddress", "city"),
    "country_cd": ("Party", "GeographicAddress", "country"),
    "country": ("Party", "GeographicAddress", "country"),
    "country_code": ("Party", "GeographicAddress", "country"),
    "postcode": ("Party", "GeographicAddress", "postCode"),
    "postal_cd": ("Party", "GeographicAddress", "postCode"),
    "state": ("Party", "GeographicAddress", "stateOrProvince"),
    # Account
    "acct_id": ("Party", "CustomerAccount", "accountId"),
    "account_id": ("Party", "CustomerAccount", "accountId"),
    "acct_status": ("Party", "CustomerAccount", "accountStatus"),
    "account_status": ("Party", "CustomerAccount", "accountStatus"),
    "status_cd": ("Party", "CustomerAccount", "accountStatus"),
    "status_code": ("Party", "CustomerAccount", "accountStatus"),
    "status": ("Common", "RootEntity", "status"),
    "billing_cycle": ("Party", "CustomerAccount", "billingCycle"),
    "cycle_cd": ("Party", "CustomerAccount", "billingCycle"),
    "balance": ("Party", "CustomerAccount", "balance"),
    "open_dt": ("Party", "CustomerAccount", "openDate"),
    "open_date": ("Party", "CustomerAccount", "openDate"),
    # Resource
    "msisdn": ("Resource", "LogicalResource", "value"),
    "device_id": ("Resource", "PhysicalResource", "resourceId"),
    "resource_id": ("Resource", "LogicalResource", "resourceId"),
    # Usage / bill amounts (defaults; context may override)
    "usage_amt": ("Customer", "CustomerUsage", "usageAmount"),
    "usage_amount": ("Customer", "CustomerUsage", "usageAmount"),
    "usage_qty": ("Customer", "CustomerUsage", "usageQuantity"),
    "usage_quantity": ("Customer", "CustomerUsage", "usageQuantity"),
    "qty": ("Customer", "CustomerUsage", "usageQuantity"),
    "quantity": ("Customer", "CustomerUsage", "usageQuantity"),
    "usage_dt": ("Customer", "CustomerUsage", "usageDate"),
    "usage_date": ("Customer", "CustomerUsage", "usageDate"),
    "usage_uom": ("Customer", "CustomerUsage", "usageUnit"),
    "total_mb": ("Customer", "CustomerUsage", "usageQuantity"),
    "total_min": ("Customer", "CustomerUsage", "usageQuantity"),
    "amount": ("Customer", "CustomerBill", "chargeAmount"),
    "rated_amt": ("Customer", "CustomerUsage", "ratedAmount"),
    "inv_id": ("Customer", "CustomerBill", "invoiceId"),
    "invoice_id": ("Customer", "CustomerBill", "invoiceId"),
    "inv_amt": ("Customer", "CustomerBill", "invoiceAmount"),
    "invoice_amount": ("Customer", "CustomerBill", "invoiceAmount"),
    "bill_amt": ("Customer", "CustomerBill", "invoiceAmount"),
    "charge_amt": ("Customer", "CustomerBill", "chargeAmount"),
    "amount_due": ("Customer", "CustomerBill", "amountDue"),
    "due_dt": ("Customer", "CustomerBill", "dueDate"),
    "due_date": ("Customer", "CustomerBill", "dueDate"),
    "bill_dt": ("Customer", "CustomerBill", "billDate"),
    # Events / audit
    "evt_id": ("Common", "BusinessInteraction", "id"),
    "event_id": ("Common", "BusinessInteraction", "id"),
    "evt_ts": ("Common", "BusinessInteraction", "interactionDate"),
    "event_ts": ("Common", "BusinessInteraction", "interactionDate"),
    "event_time": ("Common", "BusinessInteraction", "interactionDate"),
    "batch_id": ("Common", "BusinessInteraction", "batchId"),
    "channel": ("Common", "BusinessInteraction", "channel"),
    "created_dt": ("Common", "RootEntity", "creationDate"),
    "create_dt": ("Common", "RootEntity", "creationDate"),
    "creation_date": ("Common", "RootEntity", "creationDate"),
    "load_dt": ("Common", "RootEntity", "lastUpdate"),
    "updated_dt": ("Common", "RootEntity", "lastUpdate"),
    "last_update": ("Common", "RootEntity", "lastUpdate"),
    "eff_dt": ("Common", "RootEntity", "validForStart"),
    "effective_dt": ("Common", "RootEntity", "validForStart"),
    "snap_dt": ("Common", "RootEntity", "validForStart"),
    "start_dt": ("Common", "RootEntity", "validForStart"),
    "end_dt": ("Common", "RootEntity", "validForEnd"),
}

# Suffix / token → SID attribute when exact hint misses
_SID_TOKEN_RULES: list[tuple[tuple[str, ...], tuple[str, str, str]]] = [
    (("email",), ("Party", "Party", "emailAddress")),
    (("phone", "tel", "mobile"), ("Party", "Party", "telephoneNumber")),
    (("msisdn", "imsi", "iccid"), ("Resource", "LogicalResource", "value")),
    (("invoice", "inv"), ("Customer", "CustomerBill", "invoiceId")),
    (("billing_cycle", "bill_cycle", "cycle"), ("Party", "CustomerAccount", "billingCycle")),
    (("role",), ("Party", "PartyRole", "roleType")),
    (("channel",), ("Common", "BusinessInteraction", "channel")),
    (("batch",), ("Common", "BusinessInteraction", "batchId")),
    (("city",), ("Party", "GeographicAddress", "city")),
    (("country",), ("Party", "GeographicAddress", "country")),
    (("postcode", "postal", "zip"), ("Party", "GeographicAddress", "postCode")),
    (("address", "street"), ("Party", "GeographicAddress", "street1")),
    (("balance",), ("Party", "CustomerAccount", "balance")),
    (("opt_in", "optin", "consent"), ("Party", "Party", "optIn")),
]


def _object_context(fqn: str) -> str:
    """Coarse SID domain hint from legacy object name."""
    o = (fqn or "").lower()
    if any(x in o for x in ("usage", "cdr", "evt", "event", "rating")):
        return "usage"
    if any(x in o for x in ("bill", "inv", "invoice", "ar_", "finance", "charge")):
        return "bill"
    if any(x in o for x in ("acct", "account")):
        return "account"
    if any(x in o for x in ("resource", "device", "msisdn", "sim")):
        return "resource"
    if any(x in o for x in ("product", "offer", "catalog")):
        return "product"
    if any(x in o for x in ("service", "cfs", "rfs")):
        return "service"
    if any(x in o for x in ("party", "cust", "customer", "crm")):
        return "party"
    return "common"


def _apply_context(
    domain: str, entity: str, attr: str, ctx: str, col: str
) -> tuple[str, str, str]:
    """Refine amount / qty / status / id using table context."""
    c = col.lower()
    if c in {"amount", "amt", "charge_amt", "rated_amt"} or c.endswith("_amt"):
        if ctx == "usage":
            return ("Customer", "CustomerUsage", "usageAmount")
        if ctx == "bill":
            return ("Customer", "CustomerBill", "chargeAmount")
        if ctx == "account":
            return ("Party", "CustomerAccount", "balance")
    if c in {"qty", "quantity", "usage_qty"} or c.endswith("_qty"):
        return ("Customer", "CustomerUsage", "usageQuantity")
    if c in {"evt_ts", "event_ts", "event_time"} and ctx == "usage":
        return ("Customer", "CustomerUsage", "usageDate")
    if c in {"status_cd", "status_code", "status"}:
        if ctx == "account":
            return ("Party", "CustomerAccount", "accountStatus")
        if ctx == "usage":
            return ("Customer", "CustomerUsage", "status")
        if ctx == "bill":
            return ("Customer", "CustomerBill", "status")
        if ctx == "resource":
            return ("Resource", "LogicalResource", "resourceStatus")
        if ctx == "product":
            return ("Product", "Product", "status")
        if ctx == "service":
            return ("Service", "Service", "state")
        if ctx == "party":
            return ("Party", "Party", "status")
    if c == "id":
        if ctx == "party":
            return ("Party", "Party", "partyId")
        if ctx == "account":
            return ("Party", "CustomerAccount", "accountId")
        if ctx == "usage":
            return ("Customer", "CustomerUsage", "id")
        if ctx == "bill":
            return ("Customer", "CustomerBill", "id")
        if ctx == "resource":
            return ("Resource", "LogicalResource", "resourceId")
        if ctx == "product":
            return ("Product", "Product", "productId")
        if ctx == "service":
            return ("Service", "Service", "serviceId")
    if c in {"name", "display_name"} and ctx == "product":
        return ("Product", "Product", "name")
    if c in {"name", "display_name"} and ctx == "service":
        return ("Service", "Service", "name")
    return (domain, entity, attr)


def resolve_sid_mapping(
    column: str, legacy_object: str = ""
) -> tuple[str, str, str, float] | None:
    """Map a legacy column to TM Forum SID using catalogue hints + heuristics."""
    key = (column or "").strip().lower()
    if not key:
        return None
    ctx = _object_context(legacy_object)

    if key in SID_HINTS:
        domain, entity, attr = _apply_context(*SID_HINTS[key], ctx, key)
        return (domain, entity, attr, 0.94)

    # Strip common prefixes/suffixes and retry
    stripped = key
    for prefix in ("src_", "tgt_", "lkp_", "dim_", "fct_", "stg_"):
        if stripped.startswith(prefix):
            stripped = stripped[len(prefix) :]
            break
    for suffix in ("_pk", "_fk", "_key", "_nbr", "_num", "_no", "_code", "_cd"):
        if stripped.endswith(suffix) and stripped not in {
            "status_cd",
            "role_cd",
            "country_cd",
            "cycle_cd",
        }:
            # keep status/role codes for token rules; strip generic keys
            base = stripped[: -len(suffix)]
            if base in SID_HINTS:
                domain, entity, attr = _apply_context(*SID_HINTS[base], ctx, base)
                return (domain, entity, attr, 0.88)
            stripped = base
            break
    if stripped != key and stripped in SID_HINTS:
        domain, entity, attr = _apply_context(*SID_HINTS[stripped], ctx, stripped)
        return (domain, entity, attr, 0.9)

    # Token rules
    for tokens, target in _SID_TOKEN_RULES:
        if any(t in key for t in tokens):
            domain, entity, attr = _apply_context(*target, ctx, key)
            return (domain, entity, attr, 0.86)

    # Structural patterns
    if key.endswith("_id") or key.endswith("_uuid"):
        if "party" in key or "cust" in key:
            return ("Party", "Party", "partyId", 0.9)
        if "acct" in key or "account" in key:
            return ("Party", "CustomerAccount", "accountId", 0.9)
        if "inv" in key or "bill" in key:
            return ("Customer", "CustomerBill", "invoiceId", 0.88)
        if "prod" in key or "offer" in key:
            return ("Product", "Product", "productId", 0.86)
        if "svc" in key or "service" in key:
            return ("Service", "Service", "serviceId", 0.86)
        if any(x in key for x in ("device", "resource", "msisdn", "sim")):
            return ("Resource", "LogicalResource", "resourceId", 0.86)
        if "batch" in key:
            return ("Common", "BusinessInteraction", "batchId", 0.88)
        # Generic technical surrogate → RootEntity.id
        return ("Common", "RootEntity", "id", 0.82)

    if key.endswith(("_dt", "_date", "_ts", "_time", "_at")):
        if any(x in key for x in ("create", "created", "insert")):
            return ("Common", "RootEntity", "creationDate", 0.88)
        if any(x in key for x in ("update", "upd", "load", "modif")):
            return ("Common", "RootEntity", "lastUpdate", 0.86)
        if any(x in key for x in ("due",)):
            return ("Customer", "CustomerBill", "dueDate", 0.88)
        if any(x in key for x in ("usage", "evt", "event")) or ctx == "usage":
            return ("Customer", "CustomerUsage", "usageDate", 0.86)
        if any(x in key for x in ("eff", "start", "open", "snap", "valid")):
            return ("Common", "RootEntity", "validForStart", 0.84)
        if any(x in key for x in ("end", "close", "term", "expir")):
            return ("Common", "RootEntity", "validForEnd", 0.84)
        return ("Common", "BusinessInteraction", "interactionDate", 0.8)

    if key.endswith(("_amt", "_amount", "_bal")) or key in {"amt", "amount"}:
        domain, entity, attr = _apply_context(
            "Customer", "CustomerBill", "chargeAmount", ctx, key
        )
        return (domain, entity, attr, 0.86)

    if key.endswith(("_qty", "_quantity", "_cnt", "_count")) or key in {
        "qty",
        "quantity",
    }:
        if "acct" in key or "account" in key:
            return ("Party", "Party", "accountCount", 0.86)
        return ("Customer", "CustomerUsage", "usageQuantity", 0.86)

    if "status" in key:
        domain, entity, attr = _apply_context(
            "Common", "RootEntity", "status", ctx, "status"
        )
        return (domain, entity, attr, 0.84)

    if key.endswith(("_name",)) or key == "name":
        if ctx == "product":
            return ("Product", "Product", "name", 0.86)
        if ctx == "service":
            return ("Service", "Service", "name", 0.86)
        return ("Party", "Party", "name", 0.82)

    return None


def standards_mapping(schema_cols: list[dict[str, Any]]) -> dict[str, Any]:
    mappings = []
    gaps = []
    for col in schema_cols:
        legacy_obj = col.get("object") or ""
        resolved = resolve_sid_mapping(str(col.get("column") or ""), legacy_obj)
        if resolved:
            domain, entity, attr, confidence = resolved
            mappings.append(
                {
                    "legacy_object": legacy_obj,
                    "legacy_column": col["column"],
                    "domain": domain,
                    "entity": entity,
                    "attribute": attr,
                    "conformance": "conformant",
                    "confidence": confidence,
                    "citations": [
                        {"type": "standards", "id": f"sid:{domain}.{entity}.{attr}"},
                        {
                            "type": "standards",
                            "ref": "TM Forum Information Framework (SID)",
                        },
                        {"type": "inventory", "id": f"{legacy_obj}.{col['column']}"},
                        {"type": "prompt", "id": "standards_mapping@v2"},
                    ],
                    "justification": (
                        f"Column '{col['column']}' aligns to TM Forum SID "
                        f"{domain}.{entity}.{attr}"
                    ),
                }
            )
        else:
            gaps.append(
                {
                    "legacy_object": legacy_obj,
                    "legacy_column": col["column"],
                    "reason": "No approved mapping in TM Forum SID catalogue",
                    "action": "Architecture review required — do not invent enterprise standard",
                }
            )
            mappings.append(
                {
                    "legacy_object": legacy_obj,
                    "legacy_column": col["column"],
                    "domain": "",
                    "entity": "",
                    "attribute": "",
                    "conformance": "gap",
                    "confidence": 0.4,
                    "citations": [
                        {"type": "inventory", "id": f"{legacy_obj}.{col['column']}"},
                        {"type": "policy", "id": "do-not-invent-standards"},
                    ],
                    "justification": "",
                    "status": "gap",
                    "gap_reason": "No approved SID attribute",
                }
            )
    mapped_n = sum(1 for m in mappings if m.get("conformance") != "gap")
    coverage = (mapped_n / len(mappings)) if mappings else 1.0
    return {
        "task": "standards_mapping",
        "mappings": mappings,
        "gaps": gaps,
        "confidence": round(min(0.95, 0.7 + 0.25 * coverage), 2),
        "coverage": round(coverage, 3),
        "review_items": [m for m in mappings if m.get("confidence", 1) < 0.8],
        "steps": [
            {
                "name": "load_standards",
                "status": "success",
                "message": "Loaded TM Forum SID Party / Customer / Product / Service / Resource / Common",
            },
            {
                "name": "map_columns",
                "status": "success",
                "message": (
                    f"Proposed {mapped_n}/{len(mappings)} TM Forum SID mappings "
                    f"({coverage:.0%} coverage)"
                ),
            },
            {
                "name": "flag_gaps",
                "status": "success",
                "message": f"{len(gaps)} gaps queued for architecture review",
            },
        ],
    }


def data_product_identification(
    lineage: dict[str, Any],
    metadata: dict[str, Any],
    mappings: list[dict[str, Any]],
    product_kind: str = "party",
) -> dict[str, Any]:
    kind = (product_kind or "party").lower()
    if kind in {"usage", "billing", "usage_billing"}:
        return {
            "task": "data_product_identification",
            "product_kind": "usage_billing",
            "product_boundary": "Usage & Billing Summary",
            "product_name": "Usage & Billing Summary",
            "system_of_record": metadata.get("system_of_record", "Billing"),
            "owner": metadata.get("owner", ""),
            "sid_entities": ["CustomerUsage", "CustomerBill", "CustomerAccount"],
            "candidate_contract": {
                "name": "usage_billing_summary",
                "version": "0.1.0",
                "schema": [
                    {"name": "account_id", "type": "STRING", "semantic": "CustomerAccount.accountId", "pk": True},
                    {"name": "usage_date", "type": "DATE", "semantic": "CustomerUsage.usageDate", "pk": True},
                    {"name": "usage_quantity", "type": "NUMERIC", "semantic": "CustomerUsage.usageQuantity"},
                    {"name": "usage_amount", "type": "NUMERIC", "semantic": "CustomerUsage.usageAmount"},
                    {"name": "invoice_id", "type": "STRING", "semantic": "CustomerBill.invoiceId"},
                    {"name": "invoice_amount", "type": "NUMERIC", "semantic": "CustomerBill.invoiceAmount"},
                    {"name": "valid_from", "type": "TIMESTAMP", "semantic": "SCD2"},
                    {"name": "is_current", "type": "BOOL", "semantic": "SCD2"},
                ],
                "freshness_slo_hours": 24,
                "quality_rules": [
                    "account_id NOT NULL",
                    "usage_date NOT NULL",
                    "usage_amount >= 0",
                ],
                "deprecation_policy": "Breaking changes require 90-day deprecation window",
                "versioning": "semver",
            },
            "dataset_name": "products.dp_usage_billing_summary",
            "consumers": metadata.get("consumers", ["finance_pack", "usage_workspace"]),
            "quality_rules": ["row_count > 0", "negative_usage = 0"],
            "rationale": "Canonical usage+invoice grain for Wave-1 billing cutover; SoR=Billing",
            "confidence": 0.88,
            "citations": [
                {"type": "standards", "id": "sid-customer-1.0"},
                {"type": "mappings", "id": "usage-billing-wave1"},
            ],
        }

    return {
        "task": "data_product_identification",
        "product_kind": "party",
        "product_boundary": "Party & Customer Account",
        "product_name": "Party & Customer Account",
        "system_of_record": metadata.get("system_of_record", "CRM"),
        "owner": metadata.get("owner", ""),
        "sid_entities": ["Party", "PartyRole", "CustomerAccount"],
        "candidate_contract": {
            "name": "party_customer_account",
            "version": "0.1.0",
            "schema": [
                {"name": "party_id", "type": "STRING", "semantic": "Party.partyId", "pk": True},
                {"name": "party_name", "type": "STRING", "semantic": "Party.partyName"},
                {"name": "email_address", "type": "STRING", "semantic": "Party.emailAddress", "pii": True},
                {"name": "account_id", "type": "STRING", "semantic": "CustomerAccount.accountId", "pk": True},
                {"name": "account_status", "type": "STRING", "semantic": "CustomerAccount.accountStatus",
                 "allowed_values": ["ACTIVE", "SUSPENDED", "CLOSED"]},
                {"name": "billing_cycle", "type": "STRING", "semantic": "CustomerAccount.billingCycle"},
                {"name": "valid_from", "type": "TIMESTAMP", "semantic": "SCD2"},
                {"name": "valid_to", "type": "TIMESTAMP", "semantic": "SCD2"},
                {"name": "is_current", "type": "BOOL", "semantic": "SCD2"},
            ],
            "freshness_slo_hours": 24,
            "quality_rules": [
                "party_id NOT NULL",
                "account_id NOT NULL",
                "account_status IN (ACTIVE,SUSPENDED,CLOSED)",
            ],
            "deprecation_policy": "Breaking changes require 90-day deprecation window",
            "versioning": "semver",
        },
        "dataset_name": "products.dp_party_customer_account",
        "consumers": metadata.get("consumers", ["billing_reports", "crm_360"]),
        "quality_rules": ["row_count > 0", "orphan_accounts = 0"],
        "rationale": "One canonical entity resolved from N legacy customer/account tables; SoR=CRM",
        "confidence": 0.91,
        "citations": [{"type": "standards", "id": "sid-party-1.0"}, {"type": "mappings", "id": "party-wave1"}],
    }


def code_transformation(mapping_approved: bool = True) -> dict[str, Any]:
    sql = """-- Party & Customer Account source-aligned product (SCD2)
WITH src AS (
  SELECT
    c.cust_id AS party_id,
    c.cust_name AS party_name,
    c.email AS email_address,
    a.acct_id AS account_id,
    a.acct_status AS account_status,
    a.billing_cycle,
    CURRENT_TIMESTAMP AS valid_from,
    CAST(NULL AS TIMESTAMP) AS valid_to,
    TRUE AS is_current
  FROM landing.crm_cust_mstr c
  JOIN landing.crm_acct_mstr a ON c.cust_id = a.cust_id
)
MERGE INTO dp_party_customer_account t
USING src s
ON t.party_id = s.party_id AND t.account_id = s.account_id AND t.is_current
WHEN MATCHED AND (
  t.party_name IS DISTINCT FROM s.party_name
  OR t.account_status IS DISTINCT FROM s.account_status
) THEN UPDATE SET is_current = FALSE, valid_to = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN INSERT (
  party_id, party_name, email_address, account_id, account_status,
  billing_cycle, valid_from, valid_to, is_current
) VALUES (
  s.party_id, s.party_name, s.email_address, s.account_id, s.account_status,
  s.billing_cycle, s.valid_from, s.valid_to, s.is_current
);
"""
    tests = """SELECT COUNT(*) = 0 AS orphan_accounts
FROM dp_party_customer_account p
LEFT JOIN landing.crm_cust_mstr c ON p.party_id = c.cust_id
WHERE c.cust_id IS NULL AND p.is_current;
"""
    reconcile = """SELECT
  (SELECT COUNT(DISTINCT cust_id||':'||acct_id) FROM legacy.crm_cust_acct_bridge) AS legacy_keys,
  (SELECT COUNT(*) FROM dp_party_customer_account WHERE is_current) AS product_keys;
"""
    return {
        "task": "code_transformation",
        "pr_summary": "Generate SCD2 merge for Party & Customer Account product",
        "files": {
            "transformations/party_customer_account.sql": sql,
            "transformations/tests/test_party_customer_account.sql": tests,
            "transformations/reconcile/party_customer_account.sql": reconcile,
        },
        "confidence": 0.88 if mapping_approved else 0.5,
        "citations": [{"type": "mappings", "id": "party-wave1"}],
        "review_items": [] if mapping_approved else ["Mappings not approved"],
    }


def contract_and_docs(product: dict[str, Any]) -> dict[str, Any]:
    contract = product.get("candidate_contract") or product.get("contract") or {}
    return {
        "task": "contract_documentation",
        "contract_yaml": {
            "apiVersion": "dataproduct/v1",
            "kind": "DataContract",
            "metadata": {
                "name": contract.get("name", "party_customer_account"),
                "version": contract.get("version", "0.1.0"),
            },
            "spec": contract,
        },
        "glossary_updates": [
            {"term": "Party", "definition": "An individual or organization of interest to the enterprise"},
            {"term": "CustomerAccount", "definition": "A financial account used to manage customer billing relationship"},
        ],
        "lineage_declaration": {
            "product": "dp_party_customer_account",
            "sources": ["landing.crm_cust_mstr", "landing.crm_acct_mstr"],
            "system_of_record": "CRM",
        },
        "migration_notes": "Pilot product replaces scattered customer/account extracts. Truncate-reload marts deferred to retirement.",
        "confidence": 0.94,
        "citations": [{"type": "standards", "id": "sid-party-1.0"}],
    }


def disposition_analyze(payload: dict[str, Any]) -> dict[str, Any]:
    """Multi-agent disposition analysis over inventory objects by type."""
    objects = payload.get("objects") or []
    steps: list[dict[str, Any]] = [
        {
            "name": "UsageProfiler",
            "status": "success",
            "message": f"Profiled usage / consumers for {len(objects)} objects",
        },
        {
            "name": "LineageImpactAgent",
            "status": "success",
            "message": "Mapped downstream dependents from lineage edges",
        },
        {
            "name": "RetentionPolicyAgent",
            "status": "success",
            "message": "Applied retention / archive / sandbox object-type rules",
        },
        {
            "name": "DispositionRecommender",
            "status": "running",
            "message": "Scoring migrate · rebuild · consolidate · archive-only · retire",
        },
    ]

    # Recommendations may already be materialized by the API; echo / refine here
    recommendations = payload.get("recommendations") or []
    if not recommendations:
        for obj in objects:
            otype = (obj.get("object_type") or "table").lower()
            schema = (obj.get("schema") or "").lower()
            name = (obj.get("name") or "").lower()
            access = int(obj.get("access_count") or 0)
            consumers = obj.get("consumers") or []
            dependents = obj.get("dependents") or []
            retention = bool(obj.get("retention_required"))
            fqn = obj.get("fqn") or obj.get("fully_qualified_name") or ""

            if otype == "repo":
                rec, rationale = "migrate", "Git estate root"
            elif otype == "dag":
                rec, rationale = "migrate", "Airflow / orchestration DAG"
            elif otype == "script":
                if dependents or access or consumers or "spark" in (fqn or "").lower():
                    rec, rationale = "migrate", "Active pipeline / Spark script"
                else:
                    rec, rationale = "retire", "Unused script"
            elif schema in {"sandbox", "tmp"} or name.startswith("tmp_"):
                rec, rationale = "retire", "Sandbox / temp object"
            elif schema in {"archive", "archive_src"} or "hist_" in name:
                rec, rationale = "archive-only", "Historical archive"
            elif access == 0 and not consumers and not dependents:
                rec, rationale = (
                    ("archive-only", "Retention only")
                    if retention
                    else ("retire", "No consumption")
                )
            elif obj.get("unsound"):
                rec, rationale = "rebuild", "Unsound / non-restartable logic"
            elif obj.get("duplicate_of"):
                rec, rationale = "consolidate", f"Duplicate of {obj.get('duplicate_of')}"
            else:
                rec, rationale = "migrate", "Actively consumed"

            recommendations.append(
                {
                    "fqn": fqn,
                    "object_type": otype,
                    "recommendation": rec,
                    "rationale": rationale,
                }
            )

    by_rec: dict[str, int] = {}
    by_type: dict[str, int] = {}
    for r in recommendations:
        by_rec[r["recommendation"]] = by_rec.get(r["recommendation"], 0) + 1
        by_type[r.get("object_type") or "table"] = (
            by_type.get(r.get("object_type") or "table", 0) + 1
        )

    steps[3] = {
        "name": "DispositionRecommender",
        "status": "success",
        "message": (
            f"Recommended {len(recommendations)} dispositions · "
            + ", ".join(f"{k}={v}" for k, v in sorted(by_rec.items()))
        ),
    }

    return {
        "task": "disposition_analyze",
        "recommendations": recommendations,
        "by_recommendation": by_rec,
        "by_object_type": by_type,
        "confidence": 0.88,
        "steps": steps,
        "review_items": [
            r
            for r in recommendations
            if r["recommendation"] in {"retire", "archive-only", "rebuild"}
        ],
    }


TASK_RUNNERS = {
    "legacy_code_assessment": lambda payload: legacy_code_assessment(payload),
    "source_interface_acquisition": lambda payload: source_interface_acquisition(payload),
    "standards_mapping": lambda payload: standards_mapping(payload.get("columns", [])),
    "data_product_identification": lambda payload: data_product_identification(
        payload.get("lineage", {}),
        payload.get("metadata", {}),
        payload.get("mappings", []),
        payload.get("product_kind", "party"),
    ),
    "code_transformation": lambda payload: code_transformation(
        payload.get("mapping_approved", True)
    ),
    "contract_documentation": lambda payload: contract_and_docs(payload),
    "disposition_analyze": lambda payload: disposition_analyze(payload),
}


def run_agent_task(task: str, payload: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    runner = TASK_RUNNERS.get(task)
    if not runner:
        raise ValueError(f"Unknown agent task: {task}")
    result = runner(payload)
    result["prompt_version"] = "v2"
    result["standards_version"] = "sid-tmforum-1.2"
    if "steps" not in result or not result.get("steps"):
        result["steps"] = _default_accelerator_steps(task, result)
    from app.services.llm import enrich_with_llm

    return enrich_with_llm(task, result, payload)


def _default_accelerator_steps(task: str, result: dict[str, Any]) -> list[dict[str, Any]]:
    """Rich process steps for Pilot accelerators (CNDI / Model AI / Coding Skills / docs)."""
    catalogs: dict[str, list[dict[str, Any]]] = {
        "source_interface_acquisition": [
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Acquisition AI · catalogue source interface & PII",
                "detail": {"kind": "terminal", "agent": "AcquisitionAI"},
            },
            {
                "name": "terminal.log",
                "status": "success",
                "message": "CNDI · generate ingestion pipeline (extract → validate → land)",
                "detail": {"kind": "terminal", "agent": "CNDI"},
            },
            {
                "name": "cndi_manifest",
                "status": "success",
                "message": "CNDI manifest + technical metadata pack ready",
                "detail": {"agent": "CNDI"},
            },
        ],
        "data_product_identification": [
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Data Product Builder · load Align metadata & mappings",
                "detail": {"kind": "terminal", "agent": "DataProductBuilder"},
            },
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Model AI · propose product boundary & semantic model",
                "detail": {"kind": "terminal", "agent": "ModelAI"},
            },
            {
                "name": "model_ai",
                "status": "success",
                "message": f"Candidate product · {result.get('product_name') or result.get('product_boundary') or 'data product'}",
                "detail": {"agent": "ModelAI"},
            },
        ],
        "code_transformation": [
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Coding Skills · generate transform, tests & reconcile SQL",
                "detail": {"kind": "terminal", "agent": "CodingSkills"},
            },
            {
                "name": "pipelines",
                "status": "success",
                "message": f"Wrote {len((result.get('files') or {}))} pipeline artifacts to migration-repo",
                "detail": {"agent": "CodingSkills"},
            },
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Open PR pack for HITL review",
                "detail": {"kind": "terminal", "agent": "CodingSkills"},
            },
        ],
        "contract_documentation": [
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Contract & Docs · assemble product contract YAML",
                "detail": {"kind": "terminal", "agent": "ContractDocs"},
            },
            {
                "name": "glossary",
                "status": "success",
                "message": f"Glossary updates · {len(result.get('glossary_updates') or [])} terms",
                "detail": {"agent": "ContractDocs"},
            },
            {
                "name": "terminal.log",
                "status": "success",
                "message": "Publish catalogue + lineage declaration for product, code & metadata",
                "detail": {"kind": "terminal", "agent": "ContractDocs"},
            },
        ],
    }
    return catalogs.get(
        task,
        [
            {"name": "prepare", "status": "success", "message": f"Prepared payload for {task}"},
            {"name": "execute", "status": "success", "message": f"Completed accelerator {task}"},
            {
                "name": "package",
                "status": "success",
                "message": f"Confidence {result.get('confidence', 0)}",
            },
        ],
    )
