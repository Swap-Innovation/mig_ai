"""Platform Hub / hub–spoke landing-zone stub for mobilisation demos."""
from __future__ import annotations

import random
import time
from datetime import datetime
from typing import Any

from app.config import get_settings

SPOKE_ALIASES = {
    "landing": "spoke-landing",
    "conformance": "spoke-conformance",
    "products": "spoke-products",
    "spoke-landing": "spoke-landing",
    "spoke-conformance": "spoke-conformance",
    "spoke-products": "spoke-products",
}

ADAPTER_IDS = ("gcs", "bq", "composer")


def _spokes() -> list[dict[str, Any]]:
    return [
        {
            "id": "spoke-landing",
            "alias": "landing",
            "label": "Landing zone",
            "project": "lz-landing-nonprod",
            "purpose": "Raw ingress (GCS)",
            "iam": [
                {"principal": "sa-ingest@demo.local", "role": "roles/storage.objectCreator"},
                {"principal": "group:migration-engineers", "role": "roles/viewer"},
            ],
        },
        {
            "id": "spoke-conformance",
            "alias": "conformance",
            "label": "Conformance",
            "project": "lz-conform-nonprod",
            "purpose": "Standards-aligned transforms",
            "iam": [
                {"principal": "sa-transform@demo.local", "role": "roles/bigquery.dataEditor"},
                {"principal": "group:architects", "role": "roles/bigquery.dataViewer"},
            ],
        },
        {
            "id": "spoke-products",
            "alias": "products",
            "label": "Data products",
            "project": "lz-products-nonprod",
            "purpose": "Published contracts",
            "iam": [
                {"principal": "sa-product@demo.local", "role": "roles/bigquery.dataOwner"},
                {"principal": "group:data-owners", "role": "roles/bigquery.dataViewer"},
                {"principal": "group:consumers", "role": "roles/bigquery.dataViewer"},
            ],
        },
    ]


def normalize_spoke_id(raw: str | None) -> str:
    key = (raw or "").strip().lower()
    if not key:
        return ""
    if key not in SPOKE_ALIASES:
        raise ValueError(
            f"Unknown spoke '{raw}'. Use landing, conformance, or products."
        )
    return SPOKE_ALIASES[key]


def hub_probe_required() -> bool:
    settings = get_settings()
    if settings.require_hub_probe:
        return True
    # LLM_MODE=openai implies real platform path — require probe
    return (settings.llm_mode or "").lower() == "openai"


def probe_ok(probe: dict[str, Any] | None) -> bool:
    if not isinstance(probe, dict) or not probe:
        return False
    if probe.get("ok") is True:
        return True
    adapters = probe.get("adapters") or {}
    if not adapters:
        return False
    return all(isinstance(a, dict) and a.get("reachable") for a in adapters.values())


def run_hub_probe(*, spoke_id: str = "", actor: str = "") -> dict[str, Any]:
    """Stub latency + adapter reachability (gcs / bq / composer)."""
    t0 = time.perf_counter()
    # Deterministic-ish stub timings for demo
    adapters: dict[str, Any] = {}
    for aid in ADAPTER_IDS:
        latency_ms = round(8 + random.random() * 40, 1)
        adapters[aid] = {
            "reachable": True,
            "latency_ms": latency_ms,
            "mode": "gcp_stub",
            "detail": f"{aid} stub OK",
        }
    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    return {
        "ok": True,
        "probed_at": datetime.utcnow().isoformat() + "Z",
        "probed_by": actor or "",
        "spoke_id": spoke_id or "",
        "total_latency_ms": elapsed,
        "adapters": adapters,
        "hub_state": "ready",
    }


def udp_hub_status(
    project_id: int | None = None,
    *,
    hub_spoke_id: str = "",
    hub_probe: dict[str, Any] | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    spokes = _spokes()
    bound = (hub_spoke_id or "").strip()
    for sp in spokes:
        sp["bound"] = sp["id"] == bound
    probe = hub_probe if isinstance(hub_probe, dict) else {}
    hub = {
        "name": "platform-hub-nonprod",
        "region": "europe-west2",
        "state": "ready",
        "services": [
            {"id": "dataplex", "label": "Dataplex catalogue", "status": "stub"},
            {"id": "composer", "label": "Cloud Composer", "status": "stub"},
            {"id": "bq", "label": "BigQuery", "status": "stub"},
            {"id": "gcs", "label": "Cloud Storage", "status": "stub"},
            {"id": "secret_manager", "label": "Secret Manager", "status": "stub"},
        ],
    }
    perimeter = {
        "vpc_sc": "stub-perimeter",
        "cmek": "projects/platform-hub/locations/europe-west2/keyRings/platform/cryptoKeys/data",
        "no_standing_human_prod_access": True,
        "secrets_in_store_only": True,
    }
    return {
        "hub": hub,
        "spokes": spokes,
        "perimeter": perimeter,
        "project_id": project_id,
        "hub_spoke_id": bound,
        "bound_spoke": next((s for s in spokes if s["id"] == bound), None),
        "last_probe": probe or None,
        "probe_ok": probe_ok(probe),
        "require_hub_probe": hub_probe_required(),
        "llm_mode": settings.llm_mode,
        "notes": [
            "Hub holds shared platform services; spokes isolate landing / conformance / products.",
            "Least-privilege IAM — no standing human access to production data.",
            "Demo uses gcp_stub adapters; swap for real GCP when landing zone is live.",
            "Bind a spoke then Run probe before Discovery when REQUIRE_HUB_PROBE=1 or LLM_MODE=openai.",
        ],
    }
