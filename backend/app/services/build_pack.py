"""Generate platform conversion pack from Decide + Align survivors."""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.db import (
    BuildArtifact,
    Disposition,
    InventoryColumn,
    InventoryObject,
    JobNode,
    MappingRow,
    Project,
)

SURVIVOR_DISPOSITIONS = {"migrate", "rebuild"}

# Conversion kind used for artifact generation
KIND_BY_ASSET: dict[str, str] = {
    "table": "table",
    "view": "table",
    "script": "code",
    "procedure": "code",
    "package": "code",
    "function": "code",
    "job": "code",
    "repo": "code",
    "report": "report",
    "dag": "dag",
}

ASSET_LABELS: dict[str, str] = {
    "table": "Tables",
    "view": "Views",
    "script": "Scripts",
    "procedure": "Procedures",
    "package": "Packages",
    "function": "Functions",
    "job": "Jobs / ETL",
    "dag": "DAGs / orchestration",
    "report": "Reports / BI",
    "repo": "Scripts / pipelines",
}

# Target options keyed by conversion kind
TARGET_OPTIONS: dict[str, list[dict[str, str]]] = {
    "table": [
        {"id": "bigquery", "label": "Google BigQuery"},
        {"id": "snowflake", "label": "Snowflake"},
        {"id": "redshift", "label": "Amazon Redshift"},
        {"id": "synapse", "label": "Azure Synapse"},
        {"id": "databricks_sql", "label": "Databricks SQL"},
    ],
    "code": [
        {"id": "dataproc", "label": "GCP Dataproc (PySpark)"},
        {"id": "dataproc_serverless", "label": "Dataproc Serverless"},
        {"id": "dataflow", "label": "GCP Dataflow"},
        {"id": "databricks", "label": "Databricks (Spark)"},
        {"id": "emr", "label": "Amazon EMR"},
        {"id": "glue", "label": "AWS Glue"},
        {"id": "cloud_run", "label": "Cloud Run jobs"},
    ],
    "dag": [
        {"id": "composer", "label": "Cloud Composer (Airflow)"},
        {"id": "mwaa", "label": "Amazon MWAA (Airflow)"},
        {"id": "airflow_k8s", "label": "Airflow on GKE / K8s"},
        {"id": "cloud_scheduler", "label": "Cloud Scheduler + jobs"},
    ],
    "report": [
        {"id": "looker", "label": "Looker"},
        {"id": "looker_studio", "label": "Looker Studio"},
        {"id": "tableau", "label": "Tableau"},
        {"id": "powerbi", "label": "Power BI"},
    ],
}

DEFAULT_TARGETS = {
    "table": "bigquery",
    "view": "bigquery",
    "script": "dataproc",
    "procedure": "dataproc",
    "package": "dataproc",
    "function": "dataproc",
    "job": "dataproc",
    "repo": "dataproc",
    "dag": "composer",
    "report": "looker",
}

SOURCE_LABELS: dict[str, str] = {
    "oracle": "Oracle Database",
    "sql": "SQL warehouse",
    "postgres": "PostgreSQL",
    "teradata": "Teradata",
    "db2": "IBM Db2",
    "sqlserver": "SQL Server",
    "oracle_plsql": "Oracle PL/SQL",
    "spark": "Spark / PySpark",
    "scala_spark": "Scala Spark",
    "shell": "Shell / cron scripts",
    "python": "Python ETL",
    "airflow": "Apache Airflow",
    "control_m": "Control-M",
    "autosys": "AutoSys",
    "scheduler": "Enterprise scheduler",
    "cognos": "Cognos / BI reports",
    "dbt": "dbt",
    "generic": "Legacy (unclassified)",
}

ORACLE_TO_BQ: dict[str, str] = {
    "VARCHAR2": "STRING",
    "VARCHAR": "STRING",
    "CHAR": "STRING",
    "NVARCHAR2": "STRING",
    "NCHAR": "STRING",
    "CLOB": "STRING",
    "NCLOB": "STRING",
    "LONG": "STRING",
    "NUMBER": "NUMERIC",
    "FLOAT": "FLOAT64",
    "BINARY_FLOAT": "FLOAT64",
    "BINARY_DOUBLE": "FLOAT64",
    "DATE": "DATE",
    "TIMESTAMP": "TIMESTAMP",
    "TIMESTAMP(6)": "TIMESTAMP",
    "RAW": "BYTES",
    "BLOB": "BYTES",
    "INTEGER": "INT64",
    "INT": "INT64",
    "SMALLINT": "INT64",
    "BOOLEAN": "BOOL",
}


def _bq_type(oracle_type: str) -> str:
    raw = (oracle_type or "STRING").strip().upper()
    base = re.split(r"[\s(]", raw, maxsplit=1)[0]
    if base in ORACLE_TO_BQ:
        return ORACLE_TO_BQ[base]
    if "TIMESTAMP" in raw:
        return "TIMESTAMP"
    if "NUMBER" in raw or "NUMERIC" in raw or "DECIMAL" in raw:
        return "NUMERIC"
    return "STRING"


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", (name or "obj").lower()).strip("_")
    return s or "obj"


def _dataset_for_entity(entity: str | None, schema: str) -> str:
    if entity:
        return f"sid_{_slug(entity)}"
    if schema:
        return f"legacy_{_slug(schema)}"
    return "landing"


def _asset_type(obj: InventoryObject) -> str:
    ot = (obj.object_type or "generic").lower().strip() or "generic"
    path = (obj.source_path or "").lower()
    fqn = (obj.fully_qualified_name or "").lower()
    # Real DAG inventory (not task scripts living under dags/)
    if ot == "dag" or fqn.startswith("dag.") or fqn.startswith("dag:"):
        return "dag"
    # Spark job files stay code even when nested under a DAG folder
    if ot in {"job", "script"} and (
        "/spark/" in path
        or path.endswith(".py")
        or fqn.startswith("spark.")
        or (obj.extra or {}).get("kind") in {"pyspark", "spark", "spark_submit"}
    ):
        return ot if ot in {"job", "script"} else "script"
    return ot


def _kind_for_asset(asset_type: str) -> str:
    return KIND_BY_ASSET.get(asset_type, "code")


def _classify_kind(obj: InventoryObject) -> str:
    return _kind_for_asset(_asset_type(obj))


def detect_source_tech(obj: InventoryObject) -> str:
    """Infer source technology for a single inventory object."""
    path = (obj.source_path or "").lower()
    name = (obj.name or "").lower()
    fqn = (obj.fully_qualified_name or "").lower()
    ot = _asset_type(obj)
    extra = obj.extra or {}
    hinted = str(extra.get("tech") or extra.get("technology") or "").lower()

    blob = f"{path} {name} {fqn} {hinted}"

    if ot in {"table", "view"}:
        if "postgres" in blob or "pg_" in blob:
            return "postgres"
        if "teradata" in blob or "td_" in blob:
            return "teradata"
        if "db2" in blob:
            return "db2"
        if "sqlserver" in blob or "mssql" in blob:
            return "sqlserver"
        if "oracle" in blob or "ora_" in blob or ".ora" in blob:
            return "oracle"
        return "oracle"

    if ot == "report" or "cognos" in blob or "report_log" in blob:
        return "cognos"
    if "control-m" in blob or "control_m" in blob or "controlm" in blob:
        return "control_m"
    if "autosys" in blob:
        return "autosys"
    if ot == "dag" or fqn.startswith("dag.") or fqn.startswith("dag:") or (
        "dag" in path and "/dags/" in path and ot not in {"script", "job"}
    ):
        if "airflow" in blob or "/dags/" in path or fqn.startswith("dag."):
            return "airflow"
        if "scheduler" in blob:
            return "scheduler"
        return "airflow"
    if ot == "repo":
        if "dbt" in blob:
            return "dbt"
        if "spark" in blob:
            return "spark"
        return "generic"
    if "pyspark" in blob or ("spark" in blob and ".scala" not in path):
        return "spark"
    if ".scala" in path or "scala" in blob:
        return "scala_spark"
    if any(x in path for x in (".pls", ".pkb", ".pks", "plsql", "package")) or ot in {
        "procedure",
        "package",
        "function",
    }:
        return "oracle_plsql"
    if path.endswith((".sh", ".bash", ".ksh")) or "shell" in blob:
        return "shell"
    if "dbt" in blob:
        return "dbt"
    if path.endswith(".py") or "python" in blob:
        return "python"
    if path.endswith(".sql") or ot == "script":
        return "oracle_plsql" if "oracle" in blob or ot == "script" else "sql"
    return "generic"


def _majority(techs: list[str]) -> str:
    if not techs:
        return "generic"
    return Counter(techs).most_common(1)[0][0]


def detect_conversion_lanes(db: Session, project_id: int) -> list[dict[str, Any]]:
    """One lane per discovered asset type (table, script, job, …)."""
    # Ensure DAG / Spark inventory is visible in lane counts before Generate
    try:
        ensure_orchestration_inventory(db, project_id)
        db.flush()
    except Exception:
        pass

    objs = db.query(InventoryObject).filter_by(project_id=project_id).all()
    survivor_ids = {
        d.object_id
        for d in db.query(Disposition)
        .filter_by(project_id=project_id)
        .filter(Disposition.final.in_(list(SURVIVOR_DISPOSITIONS)))
        .all()
    }

    # Always map every discovered asset type; generation still uses survivors only
    scoped = objs
    if not scoped:
        return []

    by_asset: dict[str, list[tuple[InventoryObject, str]]] = {}
    for obj in scoped:
        at = _asset_type(obj)
        tech = detect_source_tech(obj)
        by_asset.setdefault(at, []).append((obj, tech))

    p = db.query(Project).get(project_id)
    saved = (p.build_targets if p and isinstance(p.build_targets, dict) else {}) or {}

    order = [
        "table",
        "view",
        "script",
        "procedure",
        "package",
        "function",
        "job",
        "dag",
        "report",
        "repo",
    ]
    seen = set(by_asset.keys())
    ordered_keys = [k for k in order if k in seen] + sorted(seen - set(order))

    lanes: list[dict[str, Any]] = []
    for asset_type in ordered_keys:
        items = by_asset[asset_type]
        techs = [t for _, t in items]
        source = _majority(techs)
        kind = _kind_for_asset(asset_type)
        options = TARGET_OPTIONS.get(kind) or TARGET_OPTIONS["code"]
        lane_saved = saved.get(asset_type) if isinstance(saved.get(asset_type), dict) else {}
        # Backward compat: old saves keyed by kind
        if not lane_saved and isinstance(saved.get(kind), dict):
            lane_saved = saved.get(kind)  # type: ignore[assignment]
        target = (
            (lane_saved or {}).get("target")
            or DEFAULT_TARGETS.get(asset_type)
            or DEFAULT_TARGETS.get(kind)
            or options[0]["id"]
        )
        valid_ids = {t["id"] for t in options}
        if target not in valid_ids:
            target = options[0]["id"]
        in_scope = sum(1 for o, _ in items if o.id in survivor_ids)
        lanes.append(
            {
                "id": asset_type,
                "kind": kind,
                "asset_type": asset_type,
                "label": ASSET_LABELS.get(asset_type, asset_type.replace("_", " ").title()),
                "source_tech": source,
                "source_label": SOURCE_LABELS.get(source, source.replace("_", " ").title()),
                "source_counts": dict(Counter(techs)),
                "object_types": {asset_type: len(items)},
                "object_count": len(items),
                "in_scope_count": in_scope,
                "target": target,
                "target_options": options,
            }
        )
    return lanes


def resolve_targets(db: Session, project_id: int) -> dict[str, str]:
    """asset_type → target platform id."""
    lanes = detect_conversion_lanes(db, project_id)
    return {lane["asset_type"]: lane["target"] for lane in lanes}


def _table_ddl(
    obj: InventoryObject,
    cols: list[InventoryColumn],
    maps: list[MappingRow],
    disposition: str,
    *,
    source_tech: str,
    target: str,
) -> tuple[str, str, dict[str, Any]]:
    entity = None
    domain = None
    col_maps: dict[str, MappingRow] = {}
    for m in maps:
        if m.legacy_object == obj.fully_qualified_name or m.legacy_object.endswith(
            f".{obj.name}"
        ):
            if m.entity and not entity:
                entity = m.entity
                domain = m.domain
            if m.legacy_column:
                col_maps[m.legacy_column.lower()] = m

    dataset = _dataset_for_entity(entity, obj.schema_name)
    table = _slug(entity or obj.name)
    engine_label = {
        "bigquery": "BigQuery",
        "snowflake": "Snowflake",
        "redshift": "Redshift",
        "synapse": "Synapse",
        "databricks_sql": "Databricks SQL",
    }.get(target, target)
    bq_fqn = f"{dataset}.{table}"

    type_fn = _bq_type
    lines = [
        f"-- {SOURCE_LABELS.get(source_tech, source_tech)} → {engine_label} · disposition={disposition}",
        f"-- Source: {obj.fully_qualified_name}",
        f"-- SID: {domain or '—'} / {entity or 'unmapped'}",
        f"CREATE TABLE IF NOT EXISTS {bq_fqn} (",
    ]
    field_specs: list[dict[str, Any]] = []
    if cols:
        for i, c in enumerate(cols):
            m = col_maps.get(c.name.lower())
            bq_col = _slug(m.attribute) if m and m.attribute else _slug(c.name)
            bq_t = type_fn(c.data_type)
            comment = ""
            if m and m.attribute:
                comment = f"  -- SID {m.entity}.{m.attribute}"
            comma = "," if i < len(cols) - 1 else ""
            lines.append(f"  {bq_col} {bq_t}{comma}{comment}")
            field_specs.append(
                {
                    "source": c.name,
                    "source_type": c.data_type,
                    "target": bq_col,
                    "target_type": bq_t,
                    "sid_attribute": (m.attribute if m else ""),
                }
            )
    else:
        lines.append("  _row_id STRING,")
        lines.append("  _payload JSON")
        field_specs.append({"source": "*", "target": "_payload", "target_type": "JSON"})

    lines.append(");")
    if target == "bigquery":
        lines.append("-- Consider: PARTITION BY / CLUSTER BY based on access patterns")
    content = "\n".join(lines)
    folder = {
        "bigquery": "bigquery/ddl",
        "snowflake": "snowflake/ddl",
        "redshift": "redshift/ddl",
        "synapse": "synapse/ddl",
        "databricks_sql": "databricks/ddl",
    }.get(target, f"{target}/ddl")
    path = f"{folder}/{dataset}/{table}.sql"
    detail = {
        "table_fqn": bq_fqn,
        "bq_table": bq_fqn,
        "dataset": dataset,
        "table": table,
        "sid_entity": entity,
        "sid_domain": domain,
        "columns": field_specs,
        "engine": target,
        "source_tech": source_tech,
    }
    return content, path, detail


def _spark_code(
    obj: InventoryObject,
    disposition: str,
    maps: list[MappingRow],
    *,
    source_tech: str,
    target: str,
) -> tuple[str, str, dict[str, Any]]:
    entity = next((m.entity for m in maps if m.entity), None)
    dest = _slug(entity or obj.name)
    src = obj.fully_qualified_name.replace('"', "")
    runtime = {
        "dataproc": "GCP Dataproc",
        "dataproc_serverless": "Dataproc Serverless",
        "dataflow": "Dataflow (batch template stub)",
        "databricks": "Databricks",
        "emr": "Amazon EMR",
        "glue": "AWS Glue",
    }.get(target, target)
    content = f'''"""{SOURCE_LABELS.get(source_tech, source_tech)} → {runtime}
Source: {src}
Disposition: {disposition}
Generated by Mirage Build from discovered on-prem code/jobs.
"""
from pyspark.sql import SparkSession
from pyspark.sql import functions as F


def main():
    spark = (
        SparkSession.builder.appName("migrate_{_slug(obj.name)}")
        .enableHiveSupport()
        .getOrCreate()
    )
    # TODO: replace with reviewed transform against landing zone
    df = spark.read.format("jdbc").option("dbtable", "{src}").load()
    out = df
    (
        out.write.mode("overwrite")
        .format("bigquery" if "{target}" in {{"dataproc", "dataproc_serverless", "dataflow"}} else "parquet")
        .option("table", "landing.{dest}")
        .save()
    )
    spark.stop()


if __name__ == "__main__":
    main()
'''
    # Fix the broken set membership in generated string - write cleanly
    sink = "bigquery" if target in {"dataproc", "dataproc_serverless", "dataflow"} else "parquet"
    content = f'''"""{SOURCE_LABELS.get(source_tech, source_tech)} → {runtime}
Source: {src}
Disposition: {disposition}
Generated by Mirage Build from discovered on-prem code/jobs.
"""
from pyspark.sql import SparkSession


def main():
    spark = (
        SparkSession.builder.appName("migrate_{_slug(obj.name)}")
        .enableHiveSupport()
        .getOrCreate()
    )
    # TODO: replace with reviewed transform against landing zone
    df = spark.read.format("jdbc").option("dbtable", "{src}").load()
    out = df
    writer = out.write.mode("overwrite").format("{sink}")
    if "{sink}" == "bigquery":
        writer = writer.option("table", "landing.{dest}")
    else:
        writer = writer.option("path", "s3://landing/{dest}/")
    writer.save()
    spark.stop()


if __name__ == "__main__":
    main()
'''
    folder = {
        "dataproc": "dataproc/jobs",
        "dataproc_serverless": "dataproc_serverless/jobs",
        "dataflow": "dataflow/jobs",
        "databricks": "databricks/jobs",
        "emr": "emr/jobs",
        "glue": "glue/jobs",
    }.get(target, f"{target}/jobs")
    path = f"{folder}/{_slug(obj.name)}.py"
    detail = {
        "runtime": target,
        "language": "pyspark",
        "source_path": obj.source_path,
        "sid_entity": entity,
        "source_tech": source_tech,
    }
    return content, path, detail


def _airflow_dag(
    obj: InventoryObject,
    disposition: str,
    *,
    source_tech: str,
    target: str,
) -> tuple[str, str, dict[str, Any]]:
    dag_id = f"mig_{_slug(obj.name)}"
    orch = {
        "composer": "Cloud Composer",
        "mwaa": "Amazon MWAA",
        "airflow_k8s": "Airflow on Kubernetes",
        "cloud_scheduler": "Cloud Scheduler",
    }.get(target, target)
    content = f'''"""{SOURCE_LABELS.get(source_tech, source_tech)} → {orch}
Source: {obj.fully_qualified_name}
Path: {obj.source_path or "—"}
Disposition: {disposition}
"""
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.empty import EmptyOperator

default_args = {{
    "owner": "migration",
    "retries": 1,
    "retry_delay": timedelta(minutes=10),
}}

with DAG(
    dag_id="{dag_id}",
    default_args=default_args,
    start_date=datetime(2024, 1, 1),
    schedule_interval="@daily",
    catchup=False,
    tags=["mirage", "build", "{disposition}", "{target}"],
) as dag:
    start = EmptyOperator(task_id="start")
    land = EmptyOperator(task_id="land_to_warehouse")
    transform = EmptyOperator(task_id="run_transform")
    start >> land >> transform
'''
    folder = {
        "composer": "composer/dags",
        "mwaa": "mwaa/dags",
        "airflow_k8s": "airflow_k8s/dags",
        "cloud_scheduler": "cloud_scheduler/jobs",
    }.get(target, f"{target}/dags")
    path = f"{folder}/{dag_id}.py"
    detail = {
        "orchestrator": target,
        "dag_id": dag_id,
        "source_path": obj.source_path,
        "source_tech": source_tech,
    }
    return content, path, detail


def _report_stub(
    obj: InventoryObject,
    disposition: str,
    *,
    source_tech: str,
    target: str,
) -> tuple[str, str, dict[str, Any]]:
    label = {
        "looker": "Looker",
        "looker_studio": "Looker Studio",
        "tableau": "Tableau",
        "powerbi": "Power BI",
    }.get(target, target)
    content = f"""# {SOURCE_LABELS.get(source_tech, source_tech)} → {label}
# Source report: {obj.fully_qualified_name}
# Disposition: {disposition}
#
# Stub migration brief — replace with reviewed BI rebuild notes.
name: {_slug(obj.name)}
source: {obj.source_path or obj.fully_qualified_name}
target_platform: {target}
datasets: []
measures: []
"""
    path = f"bi/{target}/{_slug(obj.name)}.yml"
    detail = {"bi_platform": target, "source_tech": source_tech, "source_path": obj.source_path}
    return content, path, detail


def ensure_orchestration_inventory(db: Session, project_id: int) -> dict[str, int]:
    """
    Materialize InventoryObject rows for DAGs (and spark jobs referenced on tasks)
    from JobNodes when discovery only created the orchestration graph.
    Auto-dispositions new rows as migrate when the project already has a register.
    """
    existing = {
        (o.fully_qualified_name or "").lower(): o
        for o in db.query(InventoryObject).filter_by(project_id=project_id).all()
    }
    has_register = (
        db.query(Disposition).filter_by(project_id=project_id).limit(1).first()
        is not None
    )
    disposed = {
        d.object_id
        for d in db.query(Disposition).filter_by(project_id=project_id).all()
    }

    added_dags = 0
    added_spark = 0
    jobs = db.query(JobNode).filter_by(project_id=project_id).all()

    for job in jobs:
        params = job.params if isinstance(job.params, dict) else {}
        kind = str(params.get("kind") or "").lower()
        if kind != "dag":
            continue
        dag_id = str(params.get("dag_id") or job.name.replace("dag.", "", 1))
        fqn = f"dag.{dag_id}"
        obj = existing.get(fqn.lower())
        if not obj:
            obj = InventoryObject(
                project_id=project_id,
                discovery_run_id=job.discovery_run_id,
                object_type="dag",
                schema_name="dags",
                name=dag_id,
                fully_qualified_name=fqn,
                source_path=job.script_path or f"dags/{dag_id}/dag.json",
                description=params.get("dag_name")
                or f"Airflow DAG · {dag_id} · {params.get('task_count') or 0} tasks",
                access_count=max(1, int(params.get("task_count") or 1)),
                consumers=list(params.get("tags") or [])[:8],
                profile={
                    "schedule": job.schedule or "",
                    "owner": params.get("owner") or "",
                    "engine": params.get("engine") or "spark",
                },
                retention_required=False,
                extra={
                    "kind": "dag",
                    "dag_id": dag_id,
                    "task_count": params.get("task_count") or 0,
                    "tags": params.get("tags") or [],
                },
            )
            db.add(obj)
            db.flush()
            existing[fqn.lower()] = obj
            added_dags += 1
        # Existing DAG inventory often lacks Decide rows (Decide used to skip object_type=dag)
        if has_register and obj.id not in disposed:
            db.add(
                Disposition(
                    project_id=project_id,
                    object_id=obj.id,
                    recommendation="migrate",
                    final="migrate",
                    evidence={
                        "source": "job_node",
                        "kind": "dag",
                        "note": "Orchestration DAG from discovery graph",
                    },
                )
            )
            disposed.add(obj.id)

    # Also dispose any inventory DAGs not tied to a JobNode (disk inventory / hydrate)
    for obj in list(existing.values()):
        if (obj.object_type or "").lower() != "dag":
            continue
        if not has_register or obj.id in disposed:
            continue
        db.add(
            Disposition(
                project_id=project_id,
                object_id=obj.id,
                recommendation="migrate",
                final="migrate",
                evidence={
                    "source": "inventory",
                    "kind": "dag",
                    "note": "Orchestration DAG from discovery inventory",
                },
            )
        )
        disposed.add(obj.id)

    # Spark / PySpark modules: from task params, script companions, or estate scan
    from app.services.estate import resolve_legacy_root

    project = db.query(Project).get(project_id)
    legacy_root = None
    try:
        if project:
            legacy_root = resolve_legacy_root(project)
    except Exception:
        legacy_root = None

    spark_candidates: list[tuple[str, str, str, Any]] = []
    # (fqn_stem_path, dag_id, name, meta)

    for job in jobs:
        params = job.params if isinstance(job.params, dict) else {}
        if str(params.get("kind") or "").lower() != "task":
            continue
        dag_id = str(params.get("dag_id") or "")
        spark_rel = str(params.get("spark") or "").strip()
        script_path = (job.script_path or "").replace("\\", "/")
        if not spark_rel and script_path:
            # scripts/01_spark_foo.sh → spark/spark_foo.py
            sh = Path(script_path).name
            if sh.endswith(".sh") and "spark" in sh:
                stem = re.sub(r"^\d+_", "", sh[: -len(".sh")])
                spark_rel = f"spark/{stem}.py"
        if not spark_rel or not dag_id:
            continue
        stem = Path(spark_rel).stem
        rel = spark_rel if spark_rel.startswith("dags/") else f"dags/{dag_id}/{spark_rel}"
        spark_candidates.append(
            (
                rel,
                dag_id,
                stem,
                {
                    "task_id": params.get("task_id"),
                    "sources": params.get("sources") or [],
                    "targets": params.get("targets") or [],
                    "discovery_run_id": job.discovery_run_id,
                },
            )
        )

    if legacy_root and (legacy_root / "dags").is_dir():
        for py in sorted((legacy_root / "dags").glob("*/spark/*.py")):
            dag_id = py.parent.parent.name
            rel = str(py.relative_to(legacy_root)).replace("\\", "/")
            spark_candidates.append(
                (
                    rel,
                    dag_id,
                    py.stem,
                    {"discovery_run_id": None, "sources": [], "targets": []},
                )
            )
        # DAG folders on disk even when JobNodes were never persisted
        for dag_dir in sorted((legacy_root / "dags").iterdir()):
            if not dag_dir.is_dir():
                continue
            meta = dag_dir / "dag.json"
            if not meta.exists():
                continue
            dag_id = dag_dir.name
            fqn = f"dag.{dag_id}"
            if fqn.lower() in existing:
                continue
            dag_name = dag_id
            schedule = ""
            owner = ""
            tags: list[str] = []
            task_count = len(list((dag_dir / "scripts").glob("*.sh"))) if (dag_dir / "scripts").is_dir() else 0
            try:
                import json

                raw = json.loads(meta.read_text(encoding="utf-8"))
                dag_name = raw.get("name") or dag_id
                schedule = raw.get("schedule") or ""
                owner = raw.get("owner") or ""
                tags = list(raw.get("tags") or [])
                task_count = len(raw.get("tasks") or []) or task_count
            except Exception:
                pass
            obj = InventoryObject(
                project_id=project_id,
                discovery_run_id=None,
                object_type="dag",
                schema_name="dags",
                name=dag_id,
                fully_qualified_name=fqn,
                source_path=str(meta.relative_to(legacy_root)).replace("\\", "/"),
                description=dag_name or f"Airflow DAG · {dag_id}",
                access_count=max(1, task_count),
                consumers=tags[:8],
                profile={"schedule": schedule, "owner": owner, "engine": "spark"},
                retention_required=False,
                extra={
                    "kind": "dag",
                    "dag_id": dag_id,
                    "task_count": task_count,
                    "tags": tags,
                },
            )
            db.add(obj)
            db.flush()
            existing[fqn.lower()] = obj
            added_dags += 1
            if has_register and obj.id not in disposed:
                db.add(
                    Disposition(
                        project_id=project_id,
                        object_id=obj.id,
                        recommendation="migrate",
                        final="migrate",
                        evidence={
                            "source": "estate_dags",
                            "kind": "dag",
                            "path": obj.source_path,
                        },
                    )
                )
                disposed.add(obj.id)

    seen_spark: set[str] = set()
    for rel, dag_id, stem, meta in spark_candidates:
        fqn = f"spark.{dag_id}.{stem}"
        if fqn.lower() in existing or fqn.lower() in seen_spark:
            continue
        seen_spark.add(fqn.lower())
        obj = InventoryObject(
            project_id=project_id,
            discovery_run_id=meta.get("discovery_run_id"),
            object_type="script",
            schema_name=f"spark.{dag_id}",
            name=stem,
            fully_qualified_name=fqn,
            source_path=rel,
            description=f"Spark / PySpark job · DAG {dag_id}",
            access_count=1,
            consumers=[],
            profile={
                "engine": "spark",
                "sources": meta.get("sources") or [],
                "targets": meta.get("targets") or [],
            },
            retention_required=False,
            extra={
                "kind": "pyspark",
                "dag_id": dag_id,
                "task_id": meta.get("task_id"),
                "sources": meta.get("sources") or [],
                "targets": meta.get("targets") or [],
            },
        )
        db.add(obj)
        db.flush()
        existing[fqn.lower()] = obj
        added_spark += 1
        if has_register and obj.id not in disposed:
            db.add(
                Disposition(
                    project_id=project_id,
                    object_id=obj.id,
                    recommendation="migrate",
                    final="migrate",
                    evidence={
                        "source": "spark_module",
                        "kind": "pyspark",
                        "dag_id": dag_id,
                    },
                )
            )
            disposed.add(obj.id)

    if added_dags or added_spark:
        db.flush()
    return {"dags": added_dags, "spark": added_spark}


def generate_build_pack(
    db: Session,
    project_id: int,
    targets: dict[str, str] | None = None,
    *,
    tool: str | None = None,
    asset_types: list[str] | None = None,
) -> dict[str, Any]:
    """Create/replace Build artifacts. Optionally scope to one Forge convert tool."""
    # Backfill DAG / Spark inventory from orchestration JobNodes when missing
    ensure_orchestration_inventory(db, project_id)

    forge_tool = (tool or "").strip().lower() or None
    scope_types = _resolve_generate_scope(forge_tool, asset_types)

    # Scoped delete — keep other apps' artifacts
    existing = db.query(BuildArtifact).filter_by(project_id=project_id).all()
    if scope_types is None and not forge_tool:
        for a in existing:
            db.delete(a)
    else:
        for a in existing:
            if _artifact_in_scope(a, forge_tool, scope_types):
                db.delete(a)
    db.flush()

    resolved = resolve_targets(db, project_id)
    if targets:
        for k, v in targets.items():
            if v:
                resolved[k] = v

    rows = (
        db.query(Disposition)
        .filter_by(project_id=project_id)
        .filter(Disposition.final.in_(list(SURVIVOR_DISPOSITIONS)))
        .all()
    )
    maps = db.query(MappingRow).filter_by(project_id=project_id).all()
    maps_by_obj: dict[str, list[MappingRow]] = {}
    for m in maps:
        maps_by_obj.setdefault(m.legacy_object, []).append(m)

    created: list[BuildArtifact] = []
    seen_fqn: set[str] = set()
    for d in rows:
        obj = db.query(InventoryObject).get(d.object_id)
        if not obj:
            continue
        asset_type = _asset_type(obj)
        if scope_types is not None and asset_type not in scope_types:
            continue
        fqn_key = (obj.fully_qualified_name or "").lower()
        # Data + tables can both exist for the same FQN
        dedupe_key = f"{forge_tool or 'all'}:{fqn_key}"
        if dedupe_key in seen_fqn:
            continue
        seen_fqn.add(dedupe_key)

        kind = _kind_for_asset(asset_type)
        source_tech = detect_source_tech(obj)
        target = (
            resolved.get(asset_type)
            or resolved.get(kind)
            or DEFAULT_TARGETS.get(asset_type)
            or DEFAULT_TARGETS.get(kind)
            or "bigquery"
        )
        obj_maps = maps_by_obj.get(obj.fully_qualified_name, [])
        if not obj_maps:
            for k, v in maps_by_obj.items():
                if k.endswith(f".{obj.name}") or k == obj.name:
                    obj_maps = v
                    break

        if forge_tool == "data":
            content, path, detail = _data_move_plan(
                obj, d.final, source_tech=source_tech, target=target
            )
            art_kind = "data"
            title = (
                f"Data move · {SOURCE_LABELS.get(source_tech, source_tech)} → "
                f"{target} · {obj.name}"
            )
        elif kind == "table":
            cols = (
                db.query(InventoryColumn)
                .filter_by(object_id=obj.id)
                .order_by(InventoryColumn.id)
                .all()
            )
            content, path, detail = _table_ddl(
                obj, cols, obj_maps, d.final, source_tech=source_tech, target=target
            )
            art_kind = "table"
            title = (
                f"{SOURCE_LABELS.get(source_tech, source_tech)} → {target} · "
                f"{asset_type} · {obj.name}"
            )
        elif kind == "dag":
            content, path, detail = _airflow_dag(
                obj, d.final, source_tech=source_tech, target=target
            )
            art_kind = "dag"
            title = (
                f"{SOURCE_LABELS.get(source_tech, source_tech)} → {target} · "
                f"{asset_type} · {obj.name}"
            )
        elif kind == "report":
            content, path, detail = _report_stub(
                obj, d.final, source_tech=source_tech, target=target
            )
            art_kind = "code"
            title = (
                f"{SOURCE_LABELS.get(source_tech, source_tech)} → {target} · "
                f"{asset_type} · {obj.name}"
            )
        else:
            content, path, detail = _spark_code(
                obj, d.final, obj_maps, source_tech=source_tech, target=target
            )
            art_kind = "code"
            title = (
                f"{SOURCE_LABELS.get(source_tech, source_tech)} → {target} · "
                f"{asset_type} · {obj.name}"
            )

        art = BuildArtifact(
            project_id=project_id,
            kind=art_kind,
            source_fqn=obj.fully_qualified_name,
            source_type=asset_type if forge_tool != "data" else "data",
            source_tech=source_tech,
            disposition=d.final,
            title=title,
            target_platform=target,
            target_path=path,
            content=content,
            detail={
                **detail,
                "asset_type": asset_type,
                "conversion_kind": kind,
                "forge_tool": forge_tool
                or (
                    "tables"
                    if art_kind == "table"
                    else "pipelines"
                    if art_kind == "dag"
                    else "reports"
                    if asset_type == "report"
                    else "scripts"
                ),
            },
            status="proposed",
            confidence=0.82 if obj_maps else 0.65,
        )
        db.add(art)
        created.append(art)

    db.flush()
    return summarize_build(db, project_id)


FORGE_TOOL_ASSET_TYPES: dict[str, list[str]] = {
    "tables": ["table", "view"],
    "scripts": ["script", "procedure", "package", "function", "job", "repo"],
    "pipelines": ["dag"],
    "reports": ["report"],
    "data": ["table", "view"],
}


def _resolve_generate_scope(
    tool: str | None, asset_types: list[str] | None
) -> set[str] | None:
    if asset_types:
        return {str(t).lower().strip() for t in asset_types if t}
    if tool and tool in FORGE_TOOL_ASSET_TYPES:
        return set(FORGE_TOOL_ASSET_TYPES[tool])
    return None


def _artifact_in_scope(
    art: BuildArtifact, tool: str | None, scope_types: set[str] | None
) -> bool:
    detail = art.detail if isinstance(art.detail, dict) else {}
    forge = str(detail.get("forge_tool") or "").lower()
    st = str(art.source_type or "").lower()
    kind = str(art.kind or "").lower()

    if tool == "data":
        return kind == "data" or forge == "data" or st == "data"
    if tool == "tables":
        return kind == "table" and forge != "data" and st != "data"
    if tool == "pipelines":
        return kind == "dag" or st == "dag" or forge == "pipelines"
    if tool == "reports":
        return st == "report" or forge == "reports"
    if tool == "scripts":
        if kind == "dag" or kind == "table" or kind == "data":
            return False
        if st in {"table", "view", "dag", "report", "data"}:
            return False
        if forge in {"tables", "pipelines", "reports", "data"}:
            return False
        return True

    if scope_types is None:
        return True
    # Fallback: match by source_type / kind when no tool label
    if st in scope_types:
        return True
    if kind == "table" and ("table" in scope_types or "view" in scope_types):
        return True
    if kind == "dag" and "dag" in scope_types:
        return True
    if kind == "code" and scope_types & {
        "script",
        "procedure",
        "package",
        "function",
        "job",
        "repo",
        "report",
    }:
        return st in scope_types or not st
    return False


def _data_move_plan(
    obj: InventoryObject,
    disposition: str,
    *,
    source_tech: str,
    target: str,
) -> tuple[str, str, dict[str, Any]]:
    fqn = obj.fully_qualified_name or obj.name
    path = f"data/{obj.schema_name or 'default'}/{obj.name}_load.md"
    content = (
        f"# Data movement · {fqn}\n\n"
        f"- Disposition: `{disposition}`\n"
        f"- Source: `{source_tech}`\n"
        f"- Target: `{target}`\n"
        f"- Mode: historical load + CDC (proposed)\n"
        f"- Object type: `{obj.object_type or 'table'}`\n"
    )
    return content, path, {"mode": "load_cdc", "forge_tool": "data"}


def summarize_build(
    db: Session, project_id: int, artifacts: list[BuildArtifact] | None = None
) -> dict[str, Any]:
    arts = artifacts or db.query(BuildArtifact).filter_by(project_id=project_id).all()
    by_kind = {"table": 0, "code": 0, "dag": 0, "data": 0}
    reviewed = 0
    for a in arts:
        by_kind[a.kind] = by_kind.get(a.kind, 0) + 1
        if a.status in {"reviewed", "approved"}:
            reviewed += 1
    survivors = (
        db.query(Disposition)
        .filter_by(project_id=project_id)
        .filter(Disposition.final.in_(list(SURVIVOR_DISPOSITIONS)))
        .count()
    )
    lanes = detect_conversion_lanes(db, project_id)
    return {
        "total": len(arts),
        "by_kind": by_kind,
        "reviewed": reviewed,
        "survivors": survivors,
        "ready": len(arts) > 0 and (by_kind.get("table", 0) > 0 or survivors == 0),
        "lanes": lanes,
        "narrative": (
            f"{len(arts)} conversion artifacts from {survivors} migrate/rebuild survivors "
            f"({by_kind.get('table', 0)} tables, {by_kind.get('code', 0)} code jobs, "
            f"{by_kind.get('dag', 0)} DAGs)."
        ),
    }
