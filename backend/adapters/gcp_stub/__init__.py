"""GCP-shaped adapters: GCS (MinIO), BigQuery (DuckDB/memory), Composer, Dataplex tags."""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import duckdb

from app.config import get_settings

_WAREHOUSE: dict[str, Any] = {
    "landing": {},
    "conformance": {},
    "products": {},
    "archive": {},
}
_POLICY_TAGS: dict[str, list[str]] = {}
_DAG_RUNS: list[dict[str, Any]] = []
# Per-product dual-run materializations (legacy + migrated) keyed by product_id
_PRODUCT_RUNS: dict[int, dict[str, Any]] = {}


def _table_slug(dataset_name: str | None, product_name: str, product_id: int) -> str:
    raw = (dataset_name or "").strip() or f"p{product_id}_{(product_name or 'product')}"
    slug = re.sub(r"[^a-zA-Z0-9_]", "_", raw)
    return slug[:80] or f"p{product_id}"


def resolve_product_kind(product_kind: str | None, product_name: str | None) -> str:
    k = (product_kind or "").strip().lower()
    if k in {"usage_billing", "billing", "usage"}:
        return "usage_billing"
    if k in {"service"}:
        return "service"
    if k in {"assurance", "ticket", "trouble"}:
        return "assurance"
    n = (product_name or "").lower()
    if "usage" in n or "billing" in n or "invoice" in n:
        return "usage_billing"
    if "service" in n or "inventory" in n:
        return "service"
    if "ticket" in n or "trouble" in n:
        return "assurance"
    return "party"


class GCSStub:
    def __init__(self) -> None:
        settings = get_settings()
        self.root = Path("/tmp/migrate_gcs_stub")
        self.root.mkdir(parents=True, exist_ok=True)
        self.endpoint = settings.gcs_endpoint

    def write_object(self, bucket: str, key: str, data: bytes | str) -> str:
        path = self.root / bucket / key
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, str):
            path.write_text(data, encoding="utf-8")
        else:
            path.write_bytes(data)
        return f"gs://{bucket}/{key}"

    def list_objects(self, bucket: str, prefix: str = "") -> list[str]:
        base = self.root / bucket
        if not base.exists():
            return []
        return [
            str(p.relative_to(self.root / bucket))
            for p in base.rglob("*")
            if p.is_file() and str(p.relative_to(base)).startswith(prefix)
        ]


class BigQueryStub:
    """In-memory DuckDB labeled as BigQuery datasets."""

    def __init__(self) -> None:
        self.con = duckdb.connect(database=":memory:")
        self.con.execute("CREATE SCHEMA IF NOT EXISTS landing")
        self.con.execute("CREATE SCHEMA IF NOT EXISTS conformance")
        self.con.execute("CREATE SCHEMA IF NOT EXISTS products")

    def ensure_product_table(self, kind: str = "party") -> None:
        if kind == "usage_billing":
            self.con.execute(
                """
                CREATE TABLE IF NOT EXISTS products.dp_usage_billing_summary (
                  account_id VARCHAR,
                  usage_date DATE,
                  usage_quantity DOUBLE,
                  usage_amount DOUBLE,
                  invoice_id VARCHAR,
                  invoice_amount DOUBLE,
                  valid_from TIMESTAMP,
                  is_current BOOLEAN
                )
                """
            )
            return
        self.con.execute(
            """
            CREATE TABLE IF NOT EXISTS products.dp_party_customer_account (
              party_id VARCHAR,
              party_name VARCHAR,
              email_address VARCHAR,
              account_id VARCHAR,
              account_status VARCHAR,
              billing_cycle VARCHAR,
              valid_from TIMESTAMP,
              valid_to TIMESTAMP,
              is_current BOOLEAN
            )
            """
        )

    def load_landing_sample(self, kind: str = "party") -> dict[str, int]:
        if kind == "usage_billing":
            self.con.execute(
                """
                CREATE OR REPLACE TABLE landing.bill_usage_evt AS
                SELECT * FROM (VALUES
                    ('A100', DATE '2026-08-01', 120.0, 45.5, 'INV-1'),
                    ('A100', DATE '2026-08-02', 80.0, 30.0, 'INV-1'),
                    ('A200', DATE '2026-08-01', 200.0, 90.0, 'INV-2'),
                    ('A300', DATE '2026-08-01', 50.0, 18.5, 'INV-3')
                ) t(acct_id, usage_dt, usage_qty, usage_amt, inv_id)
                """
            )
            self.con.execute(
                """
                CREATE OR REPLACE TABLE landing.bill_inv_sum AS
                SELECT * FROM (VALUES
                    ('INV-1', 'A100', 75.5),
                    ('INV-2', 'A200', 90.0),
                    ('INV-3', 'A300', 18.5)
                ) t(inv_id, acct_id, inv_amt)
                """
            )
            self.con.execute(
                """
                CREATE OR REPLACE TABLE landing.legacy_usage_bridge AS
                SELECT * FROM (VALUES
                    ('A100', DATE '2026-08-01'),
                    ('A100', DATE '2026-08-02'),
                    ('A200', DATE '2026-08-01'),
                    ('A300', DATE '2026-08-01')
                ) t(acct_id, usage_dt)
                """
            )
            return {"bill_usage_evt": 4, "bill_inv_sum": 3}

        self.con.execute(
            """
            CREATE OR REPLACE TABLE landing.crm_cust_mstr AS
            SELECT * FROM (VALUES
                ('C001', 'Acme Telecom Ltd', 'billing@acme.example', '555-0100'),
                ('C002', 'Beta Mobile', 'ops@beta.example', '555-0200'),
                ('C003', 'Gamma Consumer', 'user@gamma.example', '555-0300')
            ) t(cust_id, cust_name, email, phone)
            """
        )
        self.con.execute(
            """
            CREATE OR REPLACE TABLE landing.crm_acct_mstr AS
            SELECT * FROM (VALUES
                ('A100', 'C001', 'ACTIVE', 'MONTHLY'),
                ('A101', 'C001', 'SUSPENDED', 'MONTHLY'),
                ('A200', 'C002', 'ACTIVE', 'ANNUAL'),
                ('A300', 'C003', 'ACTIVE', 'MONTHLY')
            ) t(acct_id, cust_id, acct_status, billing_cycle)
            """
        )
        self.con.execute(
            """
            CREATE OR REPLACE TABLE landing.legacy_bridge AS
            SELECT * FROM (VALUES
                ('C001','A100'),('C001','A101'),('C002','A200'),('C003','A300')
            ) t(cust_id, acct_id)
            """
        )
        return {"crm_cust_mstr": 3, "crm_acct_mstr": 4}

    def run_conformance_and_product(self, kind: str = "party") -> dict[str, Any]:
        self.ensure_product_table(kind)
        if kind == "usage_billing":
            self.con.execute("DELETE FROM products.dp_usage_billing_summary")
            self.con.execute(
                """
                INSERT INTO products.dp_usage_billing_summary
                SELECT
                  u.acct_id,
                  u.usage_dt,
                  u.usage_qty,
                  u.usage_amt,
                  u.inv_id,
                  i.inv_amt,
                  CURRENT_TIMESTAMP,
                  TRUE
                FROM landing.bill_usage_evt u
                LEFT JOIN landing.bill_inv_sum i ON u.inv_id = i.inv_id
                """
            )
            count = self.con.execute(
                "SELECT COUNT(*) FROM products.dp_usage_billing_summary WHERE is_current"
            ).fetchone()[0]
            return {"rows_loaded": count, "dataset": "products.dp_usage_billing_summary"}

        self.con.execute("DELETE FROM products.dp_party_customer_account")
        self.con.execute(
            """
            INSERT INTO products.dp_party_customer_account
            SELECT
              c.cust_id,
              c.cust_name,
              c.email,
              a.acct_id,
              a.acct_status,
              a.billing_cycle,
              CURRENT_TIMESTAMP,
              NULL,
              TRUE
            FROM landing.crm_cust_mstr c
            JOIN landing.crm_acct_mstr a ON c.cust_id = a.cust_id
            """
        )
        count = self.con.execute(
            "SELECT COUNT(*) FROM products.dp_party_customer_account WHERE is_current"
        ).fetchone()[0]
        return {"rows_loaded": count, "dataset": "products.dp_party_customer_account"}

    def reconcile(
        self,
        tolerance_pct: float = 0.1,
        kind: str = "party",
        *,
        product_id: int | None = None,
        product_name: str | None = None,
        dataset_name: str | None = None,
        product_kind: str | None = None,
        migrated_stages: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        # Prefer per-product dual-run store when available
        if product_id is not None and product_id in _PRODUCT_RUNS:
            return self._reconcile_product_store(
                product_id,
                tolerance_pct,
                migrated_stages=migrated_stages,
            )
        resolved = resolve_product_kind(product_kind or kind, product_name)
        if resolved == "usage_billing":
            return self._reconcile_usage_billing(tolerance_pct)
        if resolved in {"service", "assurance"}:
            # Fall back to shared party tables if product was never dual-run
            return self._reconcile_party(tolerance_pct)
        return self._reconcile_party(tolerance_pct)

    def _reconcile_product_store(
        self,
        product_id: int,
        tolerance_pct: float,
        *,
        migrated_stages: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        store = _PRODUCT_RUNS[product_id]
        legacy_rows: list[dict[str, Any]] = store.get("legacy_rows") or []
        migrated_rows: list[dict[str, Any]] = store.get("migrated_rows") or []
        key_field = store.get("key_field") or "biz_key"
        legacy_keys = {str(r.get(key_field)) for r in legacy_rows}
        product_keys = {str(r.get(key_field)) for r in migrated_rows}
        legacy = len(legacy_rows)
        product = len(migrated_rows)
        delta_pct = abs(legacy - product) / max(legacy, 1) * 100
        only_legacy = sorted(legacy_keys - product_keys)[:25]
        only_product = sorted(product_keys - legacy_keys)[:25]
        key_match = legacy_keys == product_keys
        passed = delta_pct <= tolerance_pct and key_match
        kind = store.get("kind") or "party"
        dataset = store.get("dataset") or f"products.p{product_id}"
        legacy_dataset = store.get("legacy_dataset") or f"landing.legacy_p{product_id}"
        name = store.get("product_name") or f"Product {product_id}"
        stages = migrated_stages or store.get("migrated_stages") or [
            {"name": "ingest", "status": "success", "detail": "CNDI validate + land"},
            {"name": "transform", "status": "success", "detail": "SID align"},
            {"name": "publish", "status": "success", "detail": f"{product} current rows"},
        ]
        return {
            "legacy_row_count": legacy,
            "product_row_count": product,
            "row_count_delta_pct": round(delta_pct, 4),
            "key_set_match": key_match,
            "keys_only_in_legacy": only_legacy,
            "keys_only_in_migrated": only_product,
            "tolerance_pct": tolerance_pct,
            "passed": passed,
            "product_kind": kind,
            "product_id": product_id,
            "control_totals": {"rows": product},
            "legacy_pipeline": {
                "label": f"Legacy · {name}",
                "engine": "on-prem / SoR batch extract",
                "status": "success",
                "dataset": legacy_dataset,
                "sources": store.get("sources") or [store.get("system_of_record") or "SoR"],
                "stages": [
                    {"name": "extract", "status": "success", "detail": "SoR nightly extract"},
                    {"name": "stage", "status": "success", "detail": f"Load {legacy_dataset}"},
                    {"name": "publish", "status": "success", "detail": f"{legacy} bridge keys"},
                ],
                "row_count": legacy,
                "key_count": len(legacy_keys),
            },
            "migrated_pipeline": {
                "label": f"Migrated · {name}",
                "engine": "CNDI → landing → transform → product",
                "status": "success" if product else "pending",
                "dataset": dataset,
                "sources": store.get("sources") or [],
                "stages": stages,
                "row_count": product,
                "key_count": len(product_keys),
            },
            "checks": [
                {
                    "id": "row_count",
                    "label": "Row count within tolerance",
                    "passed": delta_pct <= tolerance_pct,
                    "legacy": legacy,
                    "migrated": product,
                    "detail": f"Δ {round(delta_pct, 4)}% (tol {tolerance_pct}%)",
                },
                {
                    "id": "key_set",
                    "label": "Business key set match",
                    "passed": key_match,
                    "legacy": len(legacy_keys),
                    "migrated": len(product_keys),
                    "detail": f"only_legacy={len(only_legacy)} · only_migrated={len(only_product)}",
                },
            ],
        }

    def _reconcile_usage_billing(self, tolerance_pct: float) -> dict[str, Any]:
        legacy = self.con.execute(
            "SELECT COUNT(*) FROM landing.legacy_usage_bridge"
        ).fetchone()[0]
        product = self.con.execute(
            "SELECT COUNT(*) FROM products.dp_usage_billing_summary WHERE is_current"
        ).fetchone()[0]
        delta_pct = abs(legacy - product) / max(legacy, 1) * 100
        legacy_keys = {
            r[0]
            for r in self.con.execute(
                "SELECT acct_id||':'||CAST(usage_dt AS VARCHAR) FROM landing.legacy_usage_bridge"
            ).fetchall()
        }
        product_keys = {
            r[0]
            for r in self.con.execute(
                "SELECT account_id||':'||CAST(usage_date AS VARCHAR) FROM products.dp_usage_billing_summary WHERE is_current"
            ).fetchall()
        }
        only_legacy = sorted(legacy_keys - product_keys)[:25]
        only_product = sorted(product_keys - legacy_keys)[:25]
        key_match = legacy_keys == product_keys
        passed = delta_pct <= tolerance_pct and key_match
        return {
            "legacy_row_count": legacy,
            "product_row_count": product,
            "row_count_delta_pct": round(delta_pct, 4),
            "key_set_match": key_match,
            "keys_only_in_legacy": only_legacy,
            "keys_only_in_migrated": only_product,
            "tolerance_pct": tolerance_pct,
            "passed": passed,
            "product_kind": "usage_billing",
            "control_totals": {"usage_rows": product},
            "legacy_pipeline": {
                "label": "Legacy Billing extract",
                "engine": "on-prem / mainframe-style batch",
                "status": "success",
                "dataset": "landing.legacy_usage_bridge",
                "sources": ["bill_usage_evt", "bill_inv_sum"],
                "stages": [
                    {"name": "extract", "status": "success", "detail": "Billing SoR nightly extract"},
                    {"name": "stage", "status": "success", "detail": "Load legacy_usage_bridge"},
                    {"name": "publish", "status": "success", "detail": f"{legacy} bridge keys"},
                ],
                "row_count": legacy,
                "key_count": len(legacy_keys),
            },
            "migrated_pipeline": {
                "label": "Migrated Usage & Billing SDP/ADP",
                "engine": "CNDI → landing → transform → product",
                "status": "success" if product else "pending",
                "dataset": "products.dp_usage_billing_summary",
                "sources": ["sdp.billing_usage_events", "sdp.billing_invoice_hdr"],
                "stages": [
                    {"name": "ingest", "status": "success", "detail": "CNDI validate + land"},
                    {"name": "sdp", "status": "success", "detail": "Source-aligned usage + invoice"},
                    {"name": "transform", "status": "success", "detail": "SID align + SCD2"},
                    {"name": "publish", "status": "success", "detail": f"{product} current rows"},
                ],
                "row_count": product,
                "key_count": len(product_keys),
            },
            "checks": [
                {
                    "id": "row_count",
                    "label": "Row count within tolerance",
                    "passed": delta_pct <= tolerance_pct,
                    "legacy": legacy,
                    "migrated": product,
                    "detail": f"Δ {round(delta_pct, 4)}% (tol {tolerance_pct}%)",
                },
                {
                    "id": "key_set",
                    "label": "Business key set match",
                    "passed": key_match,
                    "legacy": len(legacy_keys),
                    "migrated": len(product_keys),
                    "detail": f"only_legacy={len(only_legacy)} · only_migrated={len(only_product)}",
                },
            ],
        }

    def _reconcile_party(self, tolerance_pct: float) -> dict[str, Any]:
        legacy = self.con.execute(
            "SELECT COUNT(*) FROM landing.legacy_bridge"
        ).fetchone()[0]
        product = self.con.execute(
            "SELECT COUNT(*) FROM products.dp_party_customer_account WHERE is_current"
        ).fetchone()[0]
        delta_pct = abs(legacy - product) / max(legacy, 1) * 100
        legacy_keys = {
            r[0]
            for r in self.con.execute(
                "SELECT cust_id||':'||acct_id FROM landing.legacy_bridge"
            ).fetchall()
        }
        product_keys = {
            r[0]
            for r in self.con.execute(
                "SELECT party_id||':'||account_id FROM products.dp_party_customer_account WHERE is_current"
            ).fetchall()
        }
        only_legacy = sorted(legacy_keys - product_keys)[:25]
        only_product = sorted(product_keys - legacy_keys)[:25]
        key_match = legacy_keys == product_keys
        null_email = self.con.execute(
            "SELECT COUNT(*) FROM products.dp_party_customer_account WHERE email_address IS NULL AND is_current"
        ).fetchone()[0]
        passed = delta_pct <= tolerance_pct and key_match and null_email == 0
        return {
            "legacy_row_count": legacy,
            "product_row_count": product,
            "row_count_delta_pct": round(delta_pct, 4),
            "key_set_match": key_match,
            "keys_only_in_legacy": only_legacy,
            "keys_only_in_migrated": only_product,
            "null_email_count": null_email,
            "tolerance_pct": tolerance_pct,
            "passed": passed,
            "product_kind": "party",
            "control_totals": {"active_accounts": product},
            "legacy_pipeline": {
                "label": "Legacy CRM cust/acct bridge",
                "engine": "on-prem ETL / Informatica-style",
                "status": "success",
                "dataset": "landing.legacy_bridge",
                "sources": ["crm_cust_mstr", "crm_acct_mstr"],
                "stages": [
                    {"name": "extract", "status": "success", "detail": "CRM SoR extract"},
                    {"name": "join", "status": "success", "detail": "cust ↔ acct bridge"},
                    {"name": "publish", "status": "success", "detail": f"{legacy} bridge keys"},
                ],
                "row_count": legacy,
                "key_count": len(legacy_keys),
            },
            "migrated_pipeline": {
                "label": "Migrated Party & Customer Account",
                "engine": "CNDI → landing → SDP → transform → ADP",
                "status": "success" if product else "pending",
                "dataset": "products.dp_party_customer_account",
                "sources": ["sdp.crm_customer_master", "sdp.crm_account_master"],
                "stages": [
                    {"name": "ingest", "status": "success", "detail": "CNDI validate + land"},
                    {"name": "sdp", "status": "success", "detail": "CRM Customer + Account SDPs"},
                    {"name": "transform", "status": "success", "detail": "SID Party/Account SCD2"},
                    {"name": "publish", "status": "success", "detail": f"{product} current rows"},
                ],
                "row_count": product,
                "key_count": len(product_keys),
            },
            "checks": [
                {
                    "id": "row_count",
                    "label": "Row count within tolerance",
                    "passed": delta_pct <= tolerance_pct,
                    "legacy": legacy,
                    "migrated": product,
                    "detail": f"Δ {round(delta_pct, 4)}% (tol {tolerance_pct}%)",
                },
                {
                    "id": "key_set",
                    "label": "Business key set match",
                    "passed": key_match,
                    "legacy": len(legacy_keys),
                    "migrated": len(product_keys),
                    "detail": f"only_legacy={len(only_legacy)} · only_migrated={len(only_product)}",
                },
                {
                    "id": "null_email",
                    "label": "No null emails on current rows",
                    "passed": null_email == 0,
                    "legacy": "n/a",
                    "migrated": null_email,
                    "detail": f"null_email_count={null_email}",
                },
            ],
        }

    def query_product(
        self,
        mask_pii: bool = False,
        kind: str = "party",
        *,
        product_id: int | None = None,
    ) -> list[dict[str, Any]]:
        if product_id is not None and product_id in _PRODUCT_RUNS:
            rows = list(_PRODUCT_RUNS[product_id].get("migrated_rows") or [])
            if mask_pii:
                for r in rows:
                    if r.get("email") or r.get("email_address"):
                        if "email" in r:
                            r["email"] = "***@***"
                        if "email_address" in r:
                            r["email_address"] = "***@***"
            return rows
        table = (
            "products.dp_usage_billing_summary"
            if kind == "usage_billing"
            else "products.dp_party_customer_account"
        )
        try:
            result = self.con.execute(f"SELECT * FROM {table} WHERE is_current")
        except Exception:
            return []
        cols = [c[0] for c in result.description]
        rows = [dict(zip(cols, row)) for row in result.fetchall()]
        if mask_pii:
            for r in rows:
                if r.get("email_address"):
                    r["email_address"] = "***@***"
        return rows

    def materialize_product_dual_run(
        self,
        *,
        product_id: int,
        product_name: str,
        dataset_name: str | None = None,
        product_kind: str | None = None,
        system_of_record: str | None = None,
        product_tier: str | None = None,
    ) -> dict[str, Any]:
        """Create product-scoped legacy + migrated rows for dual-run / reconcile."""
        kind = resolve_product_kind(product_kind, product_name)
        slug = _table_slug(dataset_name, product_name, product_id)
        dataset = dataset_name or f"products.{slug}"
        legacy_dataset = f"landing.legacy_{slug}"
        # Deterministic row counts so each product differs but stays stable
        n = 3 + (int(product_id) % 5)
        sources = [dataset] if dataset else [product_name]
        legacy_rows: list[dict[str, Any]] = []
        migrated_rows: list[dict[str, Any]] = []
        key_field = "biz_key"

        if kind == "usage_billing":
            key_field = "biz_key"
            for i in range(n):
                acct = f"A{100 + (product_id % 50) + i}"
                day = f"2026-08-0{(i % 9) + 1}"
                key = f"{acct}:{day}"
                legacy_rows.append({"biz_key": key, "account_id": acct, "usage_date": day})
                migrated_rows.append(
                    {
                        "biz_key": key,
                        "account_id": acct,
                        "usage_date": day,
                        "usage_quantity": 50.0 + i * 10,
                        "usage_amount": 18.5 + i * 5,
                        "invoice_id": f"INV-{product_id}-{i}",
                        "is_current": True,
                    }
                )
        elif kind == "service":
            for i in range(n):
                sid = f"SVC-{product_id}-{i+1:03d}"
                rid = f"RES-{i+1:03d}"
                key = f"{sid}:{rid}"
                legacy_rows.append({"biz_key": key, "service_id": sid, "resource_id": rid})
                migrated_rows.append(
                    {
                        "biz_key": key,
                        "service_id": sid,
                        "resource_id": rid,
                        "service_state": "ACTIVE",
                        "is_current": True,
                    }
                )
        elif kind == "assurance":
            for i in range(n):
                tid = f"TT-{product_id}-{i+1:04d}"
                legacy_rows.append({"biz_key": tid, "ticket_id": tid})
                migrated_rows.append(
                    {
                        "biz_key": tid,
                        "ticket_id": tid,
                        "party_id": f"C{(i % 3) + 1:03d}",
                        "severity": "open" if i else "closed",
                        "is_current": True,
                    }
                )
        else:
            # party / CRM style — customer or account grain by name
            name_l = (product_name or "").lower()
            if "account" in name_l:
                for i in range(n):
                    acct = f"A{100 + product_id % 40 + i}"
                    cust = f"C{(i % 3) + 1:03d}"
                    key = f"{cust}:{acct}"
                    legacy_rows.append(
                        {
                            "biz_key": key,
                            "acct_id": acct,
                            "cust_id": cust,
                            "acct_status": "ACTIVE",
                            "billing_cycle": "MONTHLY",
                        }
                    )
                    migrated_rows.append(
                        {
                            "biz_key": key,
                            "acct_id": acct,
                            "cust_id": cust,
                            "acct_status": "ACTIVE",
                            "billing_cycle": "MONTHLY",
                            "is_current": True,
                        }
                    )
            else:
                for i in range(n):
                    cust = f"C{product_id % 90 + i + 1:03d}"
                    legacy_rows.append(
                        {
                            "biz_key": cust,
                            "cust_id": cust,
                            "cust_name": f"Customer {cust}",
                            "email": f"user{cust.lower()}@example.com",
                        }
                    )
                    migrated_rows.append(
                        {
                            "biz_key": cust,
                            "cust_id": cust,
                            "cust_name": f"Customer {cust}",
                            "email": f"user{cust.lower()}@example.com",
                            "is_current": True,
                        }
                    )

        migrated_stages = [
            {"name": "ingest", "status": "success", "detail": "CNDI validate + land"},
            {
                "name": "sdp" if (product_tier or "").lower() == "sdp" else "transform",
                "status": "success",
                "detail": f"{(product_tier or 'sdp').upper()} materialize · {dataset}",
            },
            {"name": "publish", "status": "success", "detail": f"{len(migrated_rows)} current rows"},
        ]
        store = {
            "product_id": product_id,
            "product_name": product_name,
            "kind": kind,
            "dataset": dataset,
            "legacy_dataset": legacy_dataset,
            "system_of_record": system_of_record or "SoR",
            "sources": sources,
            "key_field": key_field,
            "legacy_rows": legacy_rows,
            "migrated_rows": migrated_rows,
            "migrated_stages": migrated_stages,
            "materialized_at": datetime.utcnow().isoformat() + "Z",
        }
        _PRODUCT_RUNS[product_id] = store
        # Also refresh shared DuckDB samples for party/billing ADPs (back-compat)
        if kind == "usage_billing":
            self.load_landing_sample("usage_billing")
            self.run_conformance_and_product("usage_billing")
        elif kind == "party":
            self.load_landing_sample("party")
            self.run_conformance_and_product("party")
        return {
            "rows_loaded": len(migrated_rows),
            "legacy_rows": len(legacy_rows),
            "dataset": dataset,
            "legacy_dataset": legacy_dataset,
            "product_kind": kind,
            "product_id": product_id,
        }

class ComposerStub:
    def trigger_dag(self, dag_id: str, conf: dict[str, Any] | None = None) -> dict[str, Any]:
        run = {
            "dag_id": dag_id,
            "run_id": f"{dag_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "status": "success",
            "conf": conf or {},
            "started_at": datetime.utcnow().isoformat(),
        }
        _DAG_RUNS.append(run)
        return run

    def list_runs(self) -> list[dict[str, Any]]:
        return list(_DAG_RUNS)


class DataplexStub:
    def apply_tags(self, fqn: str, tags: list[str]) -> dict[str, Any]:
        _POLICY_TAGS[fqn] = tags
        return {"fqn": fqn, "tags": tags}

    def get_tags(self, fqn: str) -> list[str]:
        return _POLICY_TAGS.get(fqn, [])

    def all_tags(self) -> dict[str, list[str]]:
        return dict(_POLICY_TAGS)


# Singletons for process lifetime
gcs = GCSStub()
bq = BigQueryStub()
composer = ComposerStub()
dataplex = DataplexStub()


def _product_kind(product_name: str) -> str:
    return resolve_product_kind(None, product_name)


def run_full_pipeline(
    project_id: int,
    product_name: str,
    *,
    product_id: int | None = None,
    dataset_name: str | None = None,
    product_kind: str | None = None,
    system_of_record: str | None = None,
    product_tier: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    kind = resolve_product_kind(product_kind, product_name)
    prefix = kind if kind != "party" else "crm"
    landing_uri = gcs.write_object(
        "landing",
        f"project_{project_id}/{prefix}/dt={datetime.utcnow():%Y%m%d}/extract.json",
        json.dumps(
            {
                "source": system_of_record or kind,
                "product": product_name,
                "product_id": product_id,
                "batch": "demo",
            }
        ),
    )
    dag_id = f"{kind}_pipeline_p{product_id or project_id}"
    dag = composer.trigger_dag(
        dag_id,
        {
            "project_id": project_id,
            "product": product_name,
            "product_id": product_id,
            "kind": kind,
            "dataset": dataset_name,
        },
    )
    if product_id is not None:
        product_result = bq.materialize_product_dual_run(
            product_id=product_id,
            product_name=product_name,
            dataset_name=dataset_name,
            product_kind=kind,
            system_of_record=system_of_record,
            product_tier=product_tier,
        )
        landing_counts = {
            "legacy": product_result.get("legacy_rows"),
            "migrated": product_result.get("rows_loaded"),
        }
        tag_fqn = f"{product_result.get('dataset')}.biz_key"
    else:
        landing_counts = bq.load_landing_sample(kind if kind in {"party", "usage_billing"} else "party")
        product_result = bq.run_conformance_and_product(
            kind if kind in {"party", "usage_billing"} else "party"
        )
        tag_fqn = (
            "products.dp_usage_billing_summary.account_id"
            if kind == "usage_billing"
            else "products.dp_party_customer_account.email_address"
        )
    tags = [
        f"domain:{kind}",
        f"retention:{settings.archive_retention_years}y",
        f"product:{product_name}",
    ]
    if kind == "party":
        tags.extend(["PII", "sensitivity:personal"])
    dataplex.apply_tags(tag_fqn, tags)
    archive_uri = gcs.write_object(
        "archive",
        f"project_{project_id}/retired/readme.txt",
        "Retired duplicate extracts archived per disposition register.\n",
    )
    store = _PRODUCT_RUNS.get(product_id or -1) or {}
    return {
        "landing_uri": landing_uri,
        "landing_counts": landing_counts,
        "dag": dag,
        "product": product_result,
        "archive_uri": archive_uri,
        "policy_tags": dataplex.all_tags(),
        "product_kind": kind,
        "product_id": product_id,
        "dataset_name": dataset_name or product_result.get("dataset"),
        "dual_run": {
            "legacy_dataset": store.get("legacy_dataset") or product_result.get("legacy_dataset"),
            "migrated_dataset": store.get("dataset") or product_result.get("dataset"),
            "legacy_rows": len(store.get("legacy_rows") or []),
            "migrated_rows": len(store.get("migrated_rows") or []),
        },
    }
