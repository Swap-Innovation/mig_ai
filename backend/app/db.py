from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(64))  # architect|product_owner|change_board|engineer|viewer
    password_hash: Mapped[str] = mapped_column(String(255))


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(64), default="draft")
    phase: Mapped[str] = mapped_column(String(64), default="0_mobilisation")
    inventory_signed_off: Mapped[bool] = mapped_column(Boolean, default=False)
    disposition_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    mapping_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    build_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    build_targets: Mapped[Any] = mapped_column(JSON, default=dict)
    test_env_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    test_env: Mapped[Any] = mapped_column(JSON, default=dict)
    prod_env_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    prod_env: Mapped[Any] = mapped_column(JSON, default=dict)
    mobilisation_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    mobilisation: Mapped[Any] = mapped_column(JSON, default=list)
    decisions: Mapped[Any] = mapped_column(JSON, default=list)
    freeze_register: Mapped[Any] = mapped_column(JSON, default=dict)
    team: Mapped[Any] = mapped_column(JSON, default=dict)
    hub_spoke_id: Mapped[str] = mapped_column(String(64), default="")
    hub_probe: Mapped[Any] = mapped_column(JSON, default=dict)
    change_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Estate source binding (sample | upload | git)
    legacy_source_type: Mapped[str] = mapped_column(String(64), default="sample")
    legacy_root: Mapped[str] = mapped_column(String(1024), default="")
    git_url: Mapped[str] = mapped_column(String(1024), default="")
    git_branch: Mapped[str] = mapped_column(String(255), default="main")
    git_path_prefix: Mapped[str] = mapped_column(String(512), default="")
    git_commit: Mapped[str] = mapped_column(String(64), default="")
    estate_label: Mapped[str] = mapped_column(String(255), default="")
    # Links DB project ↔ sample-data/projects/<slug>/ (empty = unbound custom)
    sample_slug: Mapped[str] = mapped_column(String(255), default="")
    # True when estate folder was scaffolded by the control plane (safe to delete from disk)
    managed: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class InventoryObject(Base):
    __tablename__ = "inventory_objects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    discovery_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    object_type: Mapped[str] = mapped_column(String(64))  # table|view|job|script|report
    schema_name: Mapped[str] = mapped_column(String(128), default="")
    name: Mapped[str] = mapped_column(String(255), index=True)
    fully_qualified_name: Mapped[str] = mapped_column(String(512), index=True)
    source_path: Mapped[str] = mapped_column(String(512), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    row_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_accessed: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0)
    consumers: Mapped[Any] = mapped_column(JSON, default=list)
    profile: Mapped[Any] = mapped_column(JSON, default=dict)
    retention_required: Mapped[bool] = mapped_column(Boolean, default=False)
    extra: Mapped[Any] = mapped_column(JSON, default=dict)


class InventoryColumn(Base):
    __tablename__ = "inventory_columns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    object_id: Mapped[int] = mapped_column(ForeignKey("inventory_objects.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    data_type: Mapped[str] = mapped_column(String(128), default="VARCHAR")
    nullable: Mapped[bool] = mapped_column(Boolean, default=True)
    is_pk: Mapped[bool] = mapped_column(Boolean, default=False)
    null_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distinct_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sample_values: Mapped[Any] = mapped_column(JSON, default=list)


class LineageEdge(Base):
    __tablename__ = "lineage_edges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    discovery_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    source_fqn: Mapped[str] = mapped_column(String(512))
    target_fqn: Mapped[str] = mapped_column(String(512))
    transformation: Mapped[str] = mapped_column(Text, default="")
    job_name: Mapped[str] = mapped_column(String(255), default="")
    edge_type: Mapped[str] = mapped_column(String(64), default="data")  # data|job


class JobNode(Base):
    __tablename__ = "job_nodes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    discovery_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    schedule: Mapped[str] = mapped_column(String(128), default="")
    sla_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    script_path: Mapped[str] = mapped_column(String(512), default="")
    depends_on: Mapped[Any] = mapped_column(JSON, default=list)
    params: Mapped[Any] = mapped_column(JSON, default=dict)


class Disposition(Base):
    __tablename__ = "dispositions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    object_id: Mapped[int] = mapped_column(ForeignKey("inventory_objects.id"), index=True)
    recommendation: Mapped[str] = mapped_column(String(64))
    override: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    final: Mapped[str] = mapped_column(String(64))
    evidence: Mapped[Any] = mapped_column(JSON, default=dict)
    consolidate_into: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    retirement_state: Mapped[str] = mapped_column(String(64), default="none")
    # none|notified|frozen|silence|archived|decommissioned
    approved: Mapped[bool] = mapped_column(Boolean, default=False)


class MappingRow(Base):
    __tablename__ = "mapping_rows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    legacy_object: Mapped[str] = mapped_column(String(512))
    legacy_column: Mapped[str] = mapped_column(String(255), default="")
    domain: Mapped[str] = mapped_column(String(128), default="")
    entity: Mapped[str] = mapped_column(String(128), default="")
    attribute: Mapped[str] = mapped_column(String(128), default="")
    conformance: Mapped[str] = mapped_column(String(64), default="conformant")
    justification: Mapped[str] = mapped_column(Text, default="")
    citations: Mapped[Any] = mapped_column(JSON, default=list)
    confidence: Mapped[float] = mapped_column(Float, default=0.8)
    status: Mapped[str] = mapped_column(String(64), default="proposed")  # proposed|approved|rejected|gap
    gap_reason: Mapped[str] = mapped_column(Text, default="")


class BuildArtifact(Base):
    """Platform conversion unit: Oracle→BQ table, code→Dataproc, DAG→Airflow."""

    __tablename__ = "build_artifacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)  # table|code|dag
    source_fqn: Mapped[str] = mapped_column(String(512), default="")
    source_type: Mapped[str] = mapped_column(String(64), default="")
    source_tech: Mapped[str] = mapped_column(String(64), default="")
    disposition: Mapped[str] = mapped_column(String(64), default="migrate")
    title: Mapped[str] = mapped_column(String(255), default="")
    target_platform: Mapped[str] = mapped_column(String(64), default="")
    target_path: Mapped[str] = mapped_column(String(512), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[Any] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(64), default="proposed")
    # proposed|reviewed|approved|rejected
    confidence: Mapped[float] = mapped_column(Float, default=0.7)


class BusinessMetadata(Base):
    __tablename__ = "business_metadata"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    entity_key: Mapped[str] = mapped_column(String(255), index=True)
    business_term: Mapped[str] = mapped_column(String(255), default="")
    definition: Mapped[str] = mapped_column(Text, default="")
    owner: Mapped[str] = mapped_column(String(255), default="")
    steward: Mapped[str] = mapped_column(String(255), default="")
    system_of_record: Mapped[str] = mapped_column(String(255), default="")
    criticality: Mapped[str] = mapped_column(String(64), default="analytical")
    sensitivity: Mapped[str] = mapped_column(String(64), default="internal")
    lawful_basis: Mapped[str] = mapped_column(String(255), default="")
    retention_days: Mapped[int] = mapped_column(Integer, default=2555)
    freshness_sla_hours: Mapped[int] = mapped_column(Integer, default=24)
    quality_rules: Mapped[Any] = mapped_column(JSON, default=list)
    consumers: Mapped[Any] = mapped_column(JSON, default=list)
    policy_tags: Mapped[Any] = mapped_column(JSON, default=list)


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    task: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(64), default="queued")
    input_artifact_ids: Mapped[Any] = mapped_column(JSON, default=list)
    prompt_version: Mapped[str] = mapped_column(String(64), default="v1")
    standards_version: Mapped[str] = mapped_column(String(64), default="sid-party-1.0")
    output: Mapped[Any] = mapped_column(JSON, default=dict)
    steps: Mapped[Any] = mapped_column(JSON, default=list)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class DiscoveryRun(Base):
    __tablename__ = "discovery_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    status: Mapped[str] = mapped_column(String(64), default="queued")
    source_type: Mapped[str] = mapped_column(String(64), default="sample")
    legacy_root: Mapped[str] = mapped_column(String(1024), default="")
    summary: Mapped[Any] = mapped_column(JSON, default=dict)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class DiscoveryStep(Base):
    __tablename__ = "discovery_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("discovery_runs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(64), default="running")  # running|success|warning|failed
    message: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[Any] = mapped_column(JSON, default=dict)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ReviewItem(Base):
    __tablename__ = "review_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    agent_run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("agent_runs.id"), nullable=True)
    review_type: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(255))
    payload: Mapped[Any] = mapped_column(JSON, default=dict)
    required_role: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64), default="pending")
    reviewer: Mapped[str] = mapped_column(String(255), default="")
    decision_notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    actor: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(128))
    entity_type: Mapped[str] = mapped_column(String(64), default="")
    entity_id: Mapped[str] = mapped_column(String(128), default="")
    detail: Mapped[Any] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DataProduct(Base):
    __tablename__ = "data_products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    sid_entities: Mapped[Any] = mapped_column(JSON, default=list)
    contract: Mapped[Any] = mapped_column(JSON, default=dict)
    version: Mapped[str] = mapped_column(String(32), default="0.1.0")
    status: Mapped[str] = mapped_column(String(64), default="draft")
    owner: Mapped[str] = mapped_column(String(255), default="")
    dataset_name: Mapped[str] = mapped_column(String(255), default="dp_party_customer_account")
    pipeline_status: Mapped[str] = mapped_column(String(64), default="idle")
    cost_estimate_monthly: Mapped[float] = mapped_column(Float, default=120.0)
    # Catalog / dossier fields
    description: Mapped[str] = mapped_column(Text, default="")
    product_kind: Mapped[str] = mapped_column(String(64), default="party")
    product_tier: Mapped[str] = mapped_column(String(16), default="adp")  # sdp|adp|cdp
    domain: Mapped[str] = mapped_column(String(128), default="")
    system_of_record: Mapped[str] = mapped_column(String(128), default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    freshness_slo_hours: Mapped[int] = mapped_column(Integer, default=24)
    source_agent_run_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    consumers: Mapped[Any] = mapped_column(JSON, default=list)
    input_ports: Mapped[Any] = mapped_column(JSON, default=list)
    output_ports: Mapped[Any] = mapped_column(JSON, default=list)
    docs: Mapped[Any] = mapped_column(JSON, default=list)
    code_links: Mapped[Any] = mapped_column(JSON, default=dict)
    collibra: Mapped[Any] = mapped_column(JSON, default=dict)
    cost_breakdown: Mapped[Any] = mapped_column(JSON, default=dict)
    usage_metrics: Mapped[Any] = mapped_column(JSON, default=dict)


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("data_products.id"), index=True)
    stage: Mapped[str] = mapped_column(String(64))  # ingest|landing|sdp|transform|adp|cdp|policy|reconcile (+ legacy)
    status: Mapped[str] = mapped_column(String(64), default="running")
    detail: Mapped[Any] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ReconciliationResult(Base):
    __tablename__ = "reconciliation_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("data_products.id"), index=True)
    metrics: Mapped[Any] = mapped_column(JSON, default=dict)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CutoverChecklist(Base):
    __tablename__ = "cutover_checklists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("data_products.id"), index=True)
    items: Mapped[Any] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(64), default="open")


settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    # Lightweight SQLite column adds for existing demo DBs
    if settings.database_url.startswith("sqlite"):
        with engine.begin() as conn:
            cols = {
                r[1]
                for r in conn.exec_driver_sql("PRAGMA table_info(projects)").fetchall()
            }
            alters = [
                ("legacy_source_type", "VARCHAR(64) DEFAULT 'sample'"),
                ("legacy_root", "VARCHAR(1024) DEFAULT ''"),
                ("git_url", "VARCHAR(1024) DEFAULT ''"),
                ("git_branch", "VARCHAR(255) DEFAULT 'main'"),
                ("git_path_prefix", "VARCHAR(512) DEFAULT ''"),
                ("git_commit", "VARCHAR(64) DEFAULT ''"),
                ("estate_label", "VARCHAR(255) DEFAULT ''"),
                ("sample_slug", "VARCHAR(255) DEFAULT ''"),
                ("managed", "BOOLEAN DEFAULT 0"),
                ("last_synced_at", "DATETIME"),
                ("mobilisation_ready", "BOOLEAN DEFAULT 0"),
                ("mobilisation", "JSON DEFAULT '[]'"),
                ("decisions", "JSON DEFAULT '[]'"),
                ("freeze_register", "JSON DEFAULT '{}'"),
                ("team", "JSON DEFAULT '{}'"),
                ("hub_spoke_id", "VARCHAR(64) DEFAULT ''"),
                ("hub_probe", "JSON DEFAULT '{}'"),
                ("change_closed", "BOOLEAN DEFAULT 0"),
                ("build_approved", "BOOLEAN DEFAULT 0"),
                ("build_targets", "JSON DEFAULT '{}'"),
                ("test_env_ready", "BOOLEAN DEFAULT 0"),
                ("test_env", "JSON DEFAULT '{}'"),
                ("prod_env_ready", "BOOLEAN DEFAULT 0"),
                ("prod_env", "JSON DEFAULT '{}'"),
            ]
            for name, decl in alters:
                if name not in cols:
                    conn.exec_driver_sql(f"ALTER TABLE projects ADD COLUMN {name} {decl}")
            # Build artifact columns
            try:
                art_cols = {
                    r[1]
                    for r in conn.exec_driver_sql("PRAGMA table_info(build_artifacts)").fetchall()
                }
                if art_cols and "source_tech" not in art_cols:
                    conn.exec_driver_sql(
                        "ALTER TABLE build_artifacts ADD COLUMN source_tech VARCHAR(64) DEFAULT ''"
                    )
            except Exception:
                pass
            agent_cols = {
                r[1]
                for r in conn.exec_driver_sql("PRAGMA table_info(agent_runs)").fetchall()
            }
            if "steps" not in agent_cols:
                conn.exec_driver_sql("ALTER TABLE agent_runs ADD COLUMN steps JSON DEFAULT '[]'")
            # Data product dossier columns
            try:
                dp_cols = {
                    r[1]
                    for r in conn.exec_driver_sql("PRAGMA table_info(data_products)").fetchall()
                }
                dp_alters = [
                    ("description", "TEXT DEFAULT ''"),
                    ("product_kind", "VARCHAR(64) DEFAULT 'party'"),
                    ("product_tier", "VARCHAR(16) DEFAULT 'adp'"),
                    ("domain", "VARCHAR(128) DEFAULT ''"),
                    ("system_of_record", "VARCHAR(128) DEFAULT ''"),
                    ("confidence", "FLOAT DEFAULT 0"),
                    ("freshness_slo_hours", "INTEGER DEFAULT 24"),
                    ("source_agent_run_id", "INTEGER"),
                    ("consumers", "JSON DEFAULT '[]'"),
                    ("input_ports", "JSON DEFAULT '[]'"),
                    ("output_ports", "JSON DEFAULT '[]'"),
                    ("docs", "JSON DEFAULT '[]'"),
                    ("code_links", "JSON DEFAULT '{}'"),
                    ("collibra", "JSON DEFAULT '{}'"),
                    ("cost_breakdown", "JSON DEFAULT '{}'"),
                    ("usage_metrics", "JSON DEFAULT '{}'"),
                ]
                for name, decl in dp_alters:
                    if dp_cols and name not in dp_cols:
                        conn.exec_driver_sql(
                            f"ALTER TABLE data_products ADD COLUMN {name} {decl}"
                        )
            except Exception:
                pass
            # Discovery artifact provenance
            for table, col, decl in [
                ("inventory_objects", "discovery_run_id", "INTEGER"),
                ("lineage_edges", "discovery_run_id", "INTEGER"),
                ("job_nodes", "discovery_run_id", "INTEGER"),
            ]:
                try:
                    tcols = {
                        r[1]
                        for r in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
                    }
                    if tcols and col not in tcols:
                        conn.exec_driver_sql(
                            f"ALTER TABLE {table} ADD COLUMN {col} {decl}"
                        )
                except Exception:
                    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
