"""Seed a managed project legacy/ with Spark DAG mock estate for Discover demos."""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

DAGS: list[dict[str, Any]] = [
    {
        "id": "crm_party_daily",
        "name": "CRM Party Daily (Spark)",
        "description": "Party master, addresses, and identity bridge via Spark ETL",
        "schedule": "0 2 * * *",
        "owner": "etl.party@demo.local",
        "tags": ["crm", "party", "spark"],
        "scripts": [
            {
                "id": "spark_party_dim",
                "name": "Spark · Build party dimensions",
                "sources": [
                    "stg_party_raw",
                    "stg_party_addr",
                    "stg_party_contact",
                    "ref_country",
                    "ref_party_type",
                ],
                "targets": ["dim_party", "dim_party_addr"],
            },
            {
                "id": "spark_party_id_bridge",
                "name": "Spark · Party identity bridge",
                "sources": [
                    "dim_party",
                    "stg_party_id_map",
                    "ref_id_type",
                    "stg_party_hist",
                    "audit_batch",
                ],
                "targets": ["bridge_party_id"],
            },
            {
                "id": "spark_party_rel_mart",
                "name": "Spark · Party relationship mart",
                "sources": [
                    "dim_party",
                    "dim_party_addr",
                    "bridge_party_id",
                    "stg_party_rel",
                    "ref_rel_type",
                ],
                "targets": ["fact_party_rel", "mart_party_360"],
            },
        ],
    },
    {
        "id": "crm_account_daily",
        "name": "CRM Account Daily (Spark)",
        "description": "Account, product holdings, and customer-account bridge",
        "schedule": "30 2 * * *",
        "owner": "etl.account@demo.local",
        "tags": ["crm", "account", "spark"],
        "scripts": [
            {
                "id": "spark_account_dim",
                "name": "Spark · Account dimension",
                "sources": [
                    "stg_acct_raw",
                    "stg_acct_status",
                    "ref_acct_type",
                    "ref_brand",
                    "dim_party",
                ],
                "targets": ["dim_account", "dim_account_status"],
            },
            {
                "id": "spark_acct_product",
                "name": "Spark · Account product holdings",
                "sources": [
                    "dim_account",
                    "stg_prod_hold",
                    "ref_product",
                    "ref_prod_family",
                ],
                "targets": ["bridge_acct_product"],
            },
            {
                "id": "spark_cust_acct_bridge",
                "name": "Spark · Customer–account bridge",
                "sources": [
                    "dim_party",
                    "dim_account",
                    "stg_cust_acct",
                    "ref_role_type",
                    "bridge_party_id",
                ],
                "targets": ["bridge_cust_acct", "mart_acct_360"],
            },
        ],
    },
    {
        "id": "usage_spark_hourly",
        "name": "Usage Events Hourly (Spark)",
        "description": "Hourly usage CDR ingest and aggregation on Spark",
        "schedule": "15 * * * *",
        "owner": "etl.usage@demo.local",
        "tags": ["usage", "spark", "hourly"],
        "scripts": [
            {
                "id": "spark_usage_load",
                "name": "Spark · Load usage events",
                "sources": [
                    "stg_usage_cdr",
                    "stg_usage_session",
                    "ref_uom",
                    "ref_network_cell",
                    "dim_account",
                ],
                "targets": ["fact_usage_evt", "fact_usage_session"],
            },
            {
                "id": "spark_usage_agg",
                "name": "Spark · Usage hourly aggregates",
                "sources": [
                    "fact_usage_evt",
                    "fact_usage_session",
                    "dim_account",
                    "ref_uom",
                    "bridge_acct_product",
                ],
                "targets": ["agg_usage_hourly"],
            },
        ],
    },
    {
        "id": "billing_finance_daily",
        "name": "Billing & Finance Daily (Spark)",
        "description": "Invoice, payment, and finance mart builds",
        "schedule": "0 4 * * *",
        "owner": "etl.finance@demo.local",
        "tags": ["billing", "finance", "spark"],
        "scripts": [
            {
                "id": "spark_invoice_fact",
                "name": "Spark · Invoice facts",
                "sources": [
                    "stg_invoice_hdr",
                    "stg_invoice_line",
                    "dim_account",
                    "ref_charge_type",
                    "ref_currency",
                ],
                "targets": ["fact_invoice", "fact_invoice_line"],
            },
            {
                "id": "spark_payment_fact",
                "name": "Spark · Payment facts",
                "sources": [
                    "stg_payment",
                    "fact_invoice",
                    "dim_account",
                    "ref_pay_method",
                    "ref_currency",
                ],
                "targets": ["fact_payment"],
            },
            {
                "id": "spark_finance_mart",
                "name": "Spark · Finance 360 mart",
                "sources": [
                    "fact_invoice",
                    "fact_invoice_line",
                    "fact_payment",
                    "dim_account",
                    "agg_usage_hourly",
                ],
                "targets": ["mart_finance_360", "mart_ar_aging"],
            },
        ],
    },
    {
        "id": "risk_compliance_weekly",
        "name": "Risk & Compliance Weekly (Spark)",
        "description": "Weekly risk scoring and compliance snapshot",
        "schedule": "0 6 * * 1",
        "owner": "etl.risk@demo.local",
        "tags": ["risk", "compliance", "spark"],
        "scripts": [
            {
                "id": "spark_risk_score",
                "name": "Spark · Risk score factors",
                "sources": [
                    "mart_acct_360",
                    "mart_finance_360",
                    "agg_usage_hourly",
                    "stg_risk_signal",
                    "ref_risk_band",
                ],
                "targets": ["fact_risk_score", "bridge_risk_factor"],
            },
            {
                "id": "spark_compliance_snap",
                "name": "Spark · Compliance snapshot",
                "sources": [
                    "fact_risk_score",
                    "bridge_risk_factor",
                    "dim_party",
                    "dim_account",
                    "ref_reg_rule",
                ],
                "targets": ["snap_compliance_weekly"],
            },
        ],
    },
]

_TABLE_META: dict[str, tuple[str, str, int]] = {
    "stg_party_raw": ("staging", "Raw party extract from CRM", 1200000),
    "stg_party_addr": ("staging", "Raw party addresses", 1800000),
    "stg_party_contact": ("staging", "Raw party contacts", 900000),
    "stg_party_id_map": ("staging", "External party id map", 1500000),
    "stg_party_hist": ("staging", "Party change history", 4000000),
    "stg_party_rel": ("staging", "Party relationships", 600000),
    "stg_acct_raw": ("staging", "Raw account extract", 800000),
    "stg_acct_status": ("staging", "Account status events", 2200000),
    "stg_prod_hold": ("staging", "Product holdings feed", 3100000),
    "stg_cust_acct": ("staging", "Customer–account links", 950000),
    "stg_usage_cdr": ("staging", "Usage CDR landing", 85000000),
    "stg_usage_session": ("staging", "Usage session landing", 42000000),
    "stg_invoice_hdr": ("staging", "Invoice headers", 420000),
    "stg_invoice_line": ("staging", "Invoice lines", 2100000),
    "stg_payment": ("staging", "Payment events", 680000),
    "stg_risk_signal": ("staging", "Risk signal feed", 150000),
    "audit_batch": ("staging", "ETL batch audit", 50000),
    "ref_country": ("ref", "Country codes", 250),
    "ref_party_type": ("ref", "Party types", 12),
    "ref_id_type": ("ref", "Identity types", 18),
    "ref_rel_type": ("ref", "Relationship types", 24),
    "ref_acct_type": ("ref", "Account types", 20),
    "ref_brand": ("ref", "Brand codes", 8),
    "ref_product": ("ref", "Product catalogue", 4200),
    "ref_prod_family": ("ref", "Product families", 45),
    "ref_role_type": ("ref", "Cust-acct roles", 10),
    "ref_uom": ("ref", "Usage units of measure", 15),
    "ref_network_cell": ("ref", "Network cell sites", 120000),
    "ref_charge_type": ("ref", "Charge types", 80),
    "ref_currency": ("ref", "Currencies", 40),
    "ref_pay_method": ("ref", "Payment methods", 16),
    "ref_risk_band": ("ref", "Risk bands", 6),
    "ref_reg_rule": ("ref", "Regulatory rules", 55),
    "dim_party": ("legacy", "Party dimension", 1100000),
    "dim_party_addr": ("legacy", "Party address dimension", 1600000),
    "bridge_party_id": ("legacy", "Party identity bridge", 1400000),
    "fact_party_rel": ("legacy", "Party relationship facts", 580000),
    "mart_party_360": ("legacy", "Party 360 mart", 1100000),
    "dim_account": ("legacy", "Account dimension", 780000),
    "dim_account_status": ("legacy", "Account status SCD", 2000000),
    "bridge_acct_product": ("legacy", "Account–product bridge", 3000000),
    "bridge_cust_acct": ("legacy", "Customer–account bridge", 920000),
    "mart_acct_360": ("legacy", "Account 360 mart", 780000),
    "fact_usage_evt": ("legacy", "Usage event facts", 80000000),
    "fact_usage_session": ("legacy", "Usage session facts", 40000000),
    "agg_usage_hourly": ("legacy", "Usage hourly aggregates", 12000000),
    "fact_invoice": ("legacy", "Invoice facts", 400000),
    "fact_invoice_line": ("legacy", "Invoice line facts", 2000000),
    "fact_payment": ("legacy", "Payment facts", 650000),
    "mart_finance_360": ("legacy", "Finance 360 mart", 780000),
    "mart_ar_aging": ("legacy", "AR aging mart", 780000),
    "fact_risk_score": ("legacy", "Risk score facts", 780000),
    "bridge_risk_factor": ("legacy", "Risk factor bridge", 3900000),
    "snap_compliance_weekly": ("legacy", "Weekly compliance snapshot", 780000),
}


def _sql_for(script: dict[str, Any]) -> str:
    sources = script["sources"]
    targets = script["targets"]
    lines = [
        f"-- Spark job: {script['id']}",
        f"-- Sources: {', '.join(sources)}",
        f"-- Targets: {', '.join(targets)}",
        "",
    ]
    from_clause = sources[0]
    joins = ""
    for i, src in enumerate(sources[1:], start=1):
        joins += (
            f"\nJOIN {src} s{i} ON s{i}.id = s0.party_id "
            f"OR s{i}.id = s0.acct_id OR s{i}.id = s0.id"
        )
    for t in targets:
        lines.append(
            f"INSERT INTO {t} (id, party_id, acct_id, status_cd, amount, qty, evt_ts, batch_id)"
        )
        lines.append(
            "SELECT s0.id, s0.party_id, s0.acct_id, s0.status_cd, s0.amount, s0.qty, s0.evt_ts, s0.batch_id"
        )
        lines.append(f"FROM {from_clause} s0{joins}")
        lines.append("WHERE s0.evt_ts >= CURRENT_DATE - 7;")
        lines.append("")
    return "\n".join(lines) + "\n"


def _shell_for(dag_id: str, script: dict[str, Any], sql_rel: str, py_rel: str) -> str:
    return f"""#!/bin/bash
set -euo pipefail
# Spark submit wrapper — {dag_id} / {script['id']}
: "${{SPARK_HOME:?}}" "${{DWH_WAREHOUSE:?}}" "${{DWH_BATCH_ID:?}}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAG_DIR="$(cd "${{SCRIPT_DIR}}/.." && pwd)"
spark-submit \\
  --master yarn \\
  --deploy-mode cluster \\
  --name "{dag_id}.{script['id']}" \\
  --conf spark.sql.shuffle.partitions=200 \\
  --conf spark.executor.memory=8g \\
  "${{DAG_DIR}}/{py_rel}" \\
  --sql "${{DAG_DIR}}/{sql_rel}" \\
  --batch-id "${{DWH_BATCH_ID}}" \\
  --warehouse "${{DWH_WAREHOUSE}}"
"""


def _spark_py(script: dict[str, Any]) -> str:
    srcs = ", ".join(repr(s) for s in script["sources"])
    tgts = ", ".join(repr(t) for t in script["targets"])
    return f'''"""Spark job — {script["id"]} ({script["name"]})."""
from pyspark.sql import SparkSession

SOURCES = [{srcs}]
TARGETS = [{tgts}]


def main() -> None:
    spark = SparkSession.builder.appName("{script["id"]}").getOrCreate()
    print("sources", SOURCES)
    print("targets", TARGETS)
    spark.stop()


if __name__ == "__main__":
    main()
'''


def seed_spark_dag_estate(legacy_root: Path, *, project_name: str = "DWH") -> dict[str, int]:
    """Write 5 Spark DAGs (2–3 jobs each) with SQL lineage + catalog under legacy/."""
    root = Path(legacy_root)
    root.mkdir(parents=True, exist_ok=True)
    for sub in ("dags", "catalog", "scheduler", "usage", "scripts", "sql"):
        (root / sub).mkdir(parents=True, exist_ok=True)

    # Clear prior DAG tree so re-seed is deterministic
    dags_root = root / "dags"
    if dags_root.exists():
        import shutil

        for child in list(dags_root.iterdir()):
            if child.is_dir():
                shutil.rmtree(child)

    all_tables: set[str] = set()
    scheduler_jobs: list[dict[str, Any]] = []
    script_count = 0

    for dag in DAGS:
        dag_dir = dags_root / dag["id"]
        (dag_dir / "scripts").mkdir(parents=True)
        (dag_dir / "sql").mkdir(parents=True)
        (dag_dir / "spark").mkdir(parents=True)
        tasks: list[dict[str, Any]] = []
        prev = None
        for i, script in enumerate(dag["scripts"], start=1):
            all_tables.update(script["sources"])
            all_tables.update(script["targets"])
            sql_name = f"{script['id']}.sql"
            sh_name = f"{i:02d}_{script['id']}.sh"
            py_name = f"{script['id']}.py"
            sql_rel = f"sql/{sql_name}"
            sh_rel = f"scripts/{sh_name}"
            py_rel = f"spark/{py_name}"
            (dag_dir / sql_rel).write_text(_sql_for(script), encoding="utf-8")
            sh_path = dag_dir / sh_rel
            sh_path.write_text(
                _shell_for(dag["id"], script, sql_rel, py_rel), encoding="utf-8"
            )
            sh_path.chmod(0o755)
            (dag_dir / py_rel).write_text(_spark_py(script), encoding="utf-8")
            script_count += 1
            depends = [prev] if prev else []
            tasks.append(
                {
                    "id": script["id"],
                    "name": script["name"],
                    "script": sh_rel,
                    "sql": [sql_rel],
                    "spark": py_rel,
                    "depends_on": depends,
                    "sla_minutes": 90 if "hourly" in dag["id"] else 180,
                    "params": {
                        "engine": "spark",
                        "sources": script["sources"],
                        "targets": script["targets"],
                    },
                    "writes": script["targets"],
                }
            )
            prev = script["id"]
            scheduler_jobs.append(
                {
                    "name": f"{dag['id']}.{script['id']}",
                    "schedule": dag["schedule"],
                    "sla_minutes": 90 if "hourly" in dag["id"] else 180,
                    "script": f"dags/{dag['id']}/{sh_rel}",
                    "depends_on": [f"{dag['id']}.{depends[0]}"] if depends else [],
                    "params": {"engine": "spark"},
                }
            )
        (dag_dir / "dag.json").write_text(
            json.dumps(
                {
                    "id": dag["id"],
                    "name": dag["name"],
                    "description": dag["description"],
                    "schedule": dag["schedule"],
                    "owner": dag["owner"],
                    "tags": dag["tags"],
                    "timezone": "UTC",
                    "engine": "spark",
                    "tasks": tasks,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

    tables = []
    for name in sorted(all_tables):
        schema, desc, rows = _TABLE_META.get(name, ("legacy", name, 10000))
        tables.append(
            {
                "schema": schema,
                "name": name,
                "description": desc,
                "row_count": rows,
                "columns": [
                    {"name": "id", "type": "VARCHAR", "pk": True, "null_rate": 0},
                    {"name": "party_id", "type": "VARCHAR", "null_rate": 0.02},
                    {"name": "acct_id", "type": "VARCHAR", "null_rate": 0.02},
                    {"name": "status_cd", "type": "VARCHAR", "null_rate": 0.01},
                    {"name": "amount", "type": "DECIMAL", "null_rate": 0.05},
                    {"name": "qty", "type": "DECIMAL", "null_rate": 0.05},
                    {"name": "evt_ts", "type": "TIMESTAMP", "null_rate": 0},
                    {"name": "batch_id", "type": "VARCHAR", "null_rate": 0},
                ],
                "profile": {
                    "update_frequency": "hourly" if "usage" in name else "daily"
                },
                "consumers": ["dwh_analytics", "migration_wave1"],
            }
        )
    (root / "catalog" / "tables.json").write_text(
        json.dumps({"tables": tables}, indent=2) + "\n", encoding="utf-8"
    )
    (root / "scheduler" / "scheduler.json").write_text(
        json.dumps({"jobs": scheduler_jobs}, indent=2) + "\n", encoding="utf-8"
    )
    (root / "repo.json").write_text(
        json.dumps(
            {
                "remote": f"https://git.corp.example/dw/{project_name.lower().replace(' ', '-')}-spark-etl.git",
                "default_branch": "main",
                "warehouse": {
                    "engine": "spark+oracle",
                    "environment": "on-prem",
                    "databases": ["staging", "ref", "legacy"],
                    "orchestration": "airflow DAGs; each task spark-submits jobs",
                },
                "layout": {
                    "dags": "dags/",
                    "catalog": "catalog/",
                    "usage": "usage/",
                },
                "discovery": {
                    "scan": ["dags", "catalog", "usage"],
                    "notes": "5 DAGs × 2–3 Spark scripts; each script 4–5 sources → 1–2 targets.",
                },
                "stats": {
                    "dags": len(DAGS),
                    "spark_scripts": script_count,
                    "tables": len(all_tables),
                },
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    qpath = root / "usage" / "query_log.csv"
    with qpath.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["query_id", "user", "table_name", "access_count", "last_accessed"])
        for i, name in enumerate(sorted(all_tables)):
            w.writerow(
                [f"q{i:04d}", "analyst@demo.local", name, 10 + (i * 3) % 90, "2026-09-01"]
            )
    rpath = root / "usage" / "report_log.csv"
    with rpath.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["report_id", "name", "tables", "owner"])
        w.writerow(["r001", "Party 360", "mart_party_360;dim_party", "cx@demo.local"])
        w.writerow(["r002", "Account 360", "mart_acct_360;dim_account", "crm@demo.local"])
        w.writerow(
            ["r003", "Finance AR", "mart_finance_360;mart_ar_aging", "finance@demo.local"]
        )

    # Remove empty placeholders that hide real assets
    for keep in (root / "scripts" / ".gitkeep", root / "sql" / ".gitkeep"):
        if keep.exists():
            keep.unlink()

    return {
        "dags": len(DAGS),
        "spark_scripts": script_count,
        "tables": len(all_tables),
    }
