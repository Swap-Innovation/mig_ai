from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, EmailStr, Field


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
    email: str


class UserOut(BaseModel):
    id: int
    email: str  # demo addresses use *.local
    name: str
    role: str

    class Config:
        from_attributes = True


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    # Bind an existing catalogue estate under sample-data/projects/<sample_id>/
    sample_id: Optional[str] = None
    # Optional slug when scaffolding a new managed estate on disk
    slug: Optional[str] = None
    # When true, write sample-data/projects/<slug>/ and bind it
    scaffold: bool = False


class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    status: str
    phase: str
    inventory_signed_off: bool
    disposition_approved: bool
    mapping_approved: bool
    metadata_complete: bool
    build_approved: bool = False
    build_targets: Any = {}
    test_env_ready: bool = False
    test_env: Any = {}
    prod_env_ready: bool = False
    prod_env: Any = {}
    mobilisation_ready: bool = False
    change_closed: bool = False
    legacy_source_type: str = "sample"
    legacy_root: str = ""
    estate_label: str = ""
    sample_slug: str = ""
    managed: bool = False
    git_url: str = ""
    git_branch: str = "main"
    git_path_prefix: str = ""
    git_commit: str = ""
    last_synced_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryObjectOut(BaseModel):
    id: int
    object_type: str
    schema_name: str
    name: str
    fully_qualified_name: str
    source_path: str
    description: str
    row_count: Optional[int]
    last_accessed: Optional[datetime]
    access_count: int
    consumers: Any
    profile: Any
    retention_required: bool
    extra: Any

    class Config:
        from_attributes = True


class DispositionOut(BaseModel):
    id: int
    object_id: int
    recommendation: str
    override: Optional[str]
    final: str
    evidence: Any
    consolidate_into: Optional[str]
    retirement_state: str
    approved: bool
    object_fqn: Optional[str] = None
    object_type: Optional[str] = None

    class Config:
        from_attributes = True


class DispositionOverride(BaseModel):
    override: str


class MappingOut(BaseModel):
    id: int
    legacy_object: str
    legacy_column: str
    domain: str
    entity: str
    attribute: str
    conformance: str
    justification: str
    citations: Any
    confidence: float
    status: str
    gap_reason: str

    class Config:
        from_attributes = True


class MappingPatch(BaseModel):
    domain: Optional[str] = None
    entity: Optional[str] = None
    attribute: Optional[str] = None
    conformance: Optional[str] = None
    justification: Optional[str] = None
    status: Optional[str] = None
    gap_reason: Optional[str] = None


class MappingBulkReviewIn(BaseModel):
    """Accept or flag many Gaps rows at once."""

    decision: str  # accept | flag
    ids: Optional[list[int]] = None  # None = all pending review rows


class MappingGenerateIn(BaseModel):
    """Workbench mapping agent options."""
    advanced_ai: bool = False
    use_llm: bool = False


class MetadataIn(BaseModel):
    entity_key: str
    business_term: str = ""
    definition: str = ""
    owner: str = ""
    steward: str = ""
    system_of_record: str = ""
    criticality: str = "analytical"
    sensitivity: str = "internal"
    lawful_basis: str = ""
    retention_days: int = 2555
    freshness_sla_hours: int = 24
    quality_rules: list[Any] = Field(default_factory=list)
    consumers: list[Any] = Field(default_factory=list)
    policy_tags: list[Any] = Field(default_factory=list)


class MetadataOut(MetadataIn):
    id: int
    project_id: int

    class Config:
        from_attributes = True


class AgentRunCreate(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class AgentRunOut(BaseModel):
    id: int
    project_id: int
    task: str
    status: str
    output: Any
    steps: Any = []
    confidence: float
    error: str
    prompt_version: str
    standards_version: str
    created_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class GitBindIn(BaseModel):
    url: str
    branch: str = "main"
    path_prefix: str = ""
    token: Optional[str] = None


class SampleBindIn(BaseModel):
    sample_id: Optional[str] = None


class DiscoveryRunIn(BaseModel):
    """Split agentic flows: discover (Activity) vs inventory+lineage (Inventory)."""

    pipeline: str = "discover"  # discover | inventory


class MobilisationItemPatch(BaseModel):
    item_id: str
    done: Optional[bool] = None
    notes: Optional[str] = None
    owner_email: Optional[str] = None
    evidence_url: Optional[str] = None
    status: Optional[str] = None  # open|done|blocked|na
    verified: bool = False  # stamp verified_at now
    verified_at: Optional[str] = None


class MobilisationBulk(BaseModel):
    """Mark all items in a group done, or pass item_ids for selective update."""

    group: Optional[str] = None
    item_ids: Optional[list[str]] = None
    done: bool = True
    accept_demo_evidence: bool = False


class DecisionPatch(BaseModel):
    decision_id: str
    value: Optional[str] = None
    status: Optional[str] = None  # open|decided|deferred
    notes: Optional[str] = None


class FreezePut(BaseModel):
    freeze_start: Optional[str] = None
    freeze_end: Optional[str] = None
    scope_summary: Optional[str] = None
    in_scope_systems: Optional[list[str]] = None
    change_board_ref: Optional[str] = None
    exception_policy: Optional[str] = None
    notified_consumers: Optional[list[str]] = None
    deferred: Optional[bool] = None
    deferred_note: Optional[str] = None


class TeamPatch(BaseModel):
    architect: Optional[str] = None
    product_owner: Optional[str] = None
    data_owner: Optional[str] = None
    data_steward: Optional[str] = None
    change_board: Optional[str] = None
    engineer_lead: Optional[str] = None
    roles: Optional[dict[str, str]] = None  # alternate bulk shape


class HubBindIn(BaseModel):
    spoke_id: str  # landing | conformance | products (or spoke-*)


class GitSyncIn(BaseModel):
    token: Optional[str] = None


class ReviewDecision(BaseModel):
    decision: str  # approve|reject
    notes: str = ""


class ReviewBulkDecision(BaseModel):
    decision: str = "approve"  # approve|reject
    notes: str = ""
    ids: Optional[list[int]] = None  # None = all pending


class ReviewOut(BaseModel):
    id: int
    project_id: int
    agent_run_id: Optional[int]
    review_type: str
    title: str
    payload: Any
    required_role: str
    status: str
    reviewer: str
    decision_notes: str
    created_at: datetime
    decided_at: Optional[datetime]

    class Config:
        from_attributes = True


class BuildArtifactOut(BaseModel):
    id: int
    project_id: int
    kind: str
    source_fqn: str
    source_type: str
    source_tech: str = ""
    disposition: str
    title: str
    target_platform: str
    target_path: str
    content: str
    detail: Any
    status: str
    confidence: float

    class Config:
        from_attributes = True


class BuildArtifactPatch(BaseModel):
    status: Optional[str] = None
    content: Optional[str] = None
    title: Optional[str] = None
    target_platform: Optional[str] = None


class BuildGenerateIn(BaseModel):
    targets: Optional[dict[str, str]] = None  # kind → target platform id


class BuildTargetsIn(BaseModel):
    targets: dict[str, str]  # kind → target platform id
