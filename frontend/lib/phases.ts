export type PhaseId =
  | "0_mobilisation"
  | "1_discovery"
  | "2_plan"
  | "2_disposition"
  | "3_mapping"
  | "4_metadata"
  | "4_build"
  | "5_pilot_product"
  | "6_migrate"
  | "7_decommission";

export type PhaseView = {
  id: string;
  label: string;
  group: string;
};

export type PhaseDef = {
  id: PhaseId;
  number: number;
  title: string;
  short: string;
  focus: string;
  exitCriterion: string;
  status: "available" | "locked" | "planned";
  defaultView: string;
  views: PhaseView[];
};

/** Delivery plan aligned to the Legacy→Cloud proposal (Phases 0–7). */
export const PHASES: PhaseDef[] = [
  {
    id: "0_mobilisation",
    number: 0,
    title: "Mobilisation",
    short: "Setup",
    focus: "Access, environments, tooling, change freeze",
    exitCriterion: "Team can read source and deploy to non-production",
    status: "available",
    defaultView: "access",
    views: [
      { id: "access", label: "Access", group: "Prepare" },
      { id: "environments", label: "Environments", group: "Prepare" },
      { id: "hub", label: "Platform Hub", group: "Prepare" },
      { id: "tooling", label: "Tooling", group: "Prepare" },
      { id: "decisions", label: "Decisions", group: "Prepare" },
      { id: "team", label: "Team / RACI", group: "Prepare" },
      { id: "freeze", label: "Change freeze", group: "Prepare" },
      { id: "ready", label: "Ready", group: "Gate" },
    ],
  },
  {
    id: "1_discovery",
    number: 1,
    title: "Discovery & Assessment",
    short: "Discover",
    focus: "Technical inventory from SQL, scripts, and schedules; lineage & profiling",
    exitCriterion: "Signed-off inventory and lineage",
    status: "available",
    defaultView: "sources",
    views: [
      { id: "sources", label: "Source", group: "Prepare" },
      { id: "console", label: "Activity", group: "Prepare" },
      { id: "profiling", label: "Profiling", group: "Review" },
      { id: "lineage", label: "Lineage", group: "Review" },
      { id: "review", label: "Review", group: "Approve" },
    ],
  },
  {
    id: "2_plan",
    number: 2,
    title: "Wave Plan",
    short: "Plan",
    focus: "Folder-tree migrate scope, suggest or assign waves, approve object-level plan",
    exitCriterion: "Approved wave plan with an active wave for Decide→Retire",
    status: "available",
    defaultView: "overview",
    views: [
      { id: "overview", label: "Overview", group: "Plan" },
      { id: "approve", label: "Approve", group: "Gate" },
    ],
  },
  {
    id: "2_disposition",
    number: 3,
    title: "Disposition",
    short: "Decide",
    focus: "Migrate, consolidate, rebuild, retire, or archive-only",
    exitCriterion: "Approved disposition register and retirement schedule",
    status: "available",
    defaultView: "board",
    views: [
      { id: "board", label: "Board", group: "Decide" },
      { id: "retirement", label: "Retirement", group: "Decide" },
      { id: "approve", label: "Approve", group: "Gate" },
    ],
  },
  {
    id: "3_mapping",
    number: 4,
    title: "SID Mapping & Business Metadata",
    short: "Align",
    focus: "SID column mapping, entity ownership, and catalogue readiness",
    exitCriterion:
      "Mapping pack approved and in-scope entities have owner, definition, classification",
    status: "available",
    defaultView: "workbench",
    views: [
      { id: "workbench", label: "Workbench", group: "Map" },
      { id: "gaps", label: "Gaps", group: "Map" },
      { id: "entities", label: "Entities", group: "Describe" },
      { id: "approve", label: "Approve", group: "Gate" },
    ],
  },
  {
    // Kept for redirects / API phase strings; hidden from left nav (folded into Align).
    id: "4_metadata",
    number: 4,
    title: "Business Metadata",
    short: "Metadata",
    focus: "Owner, definition, classification, retention, consumers",
    exitCriterion: "Every in-scope entity has owner, definition, classification",
    status: "available",
    defaultView: "entities",
    views: [
      { id: "entities", label: "Entities", group: "Edit" },
      { id: "catalogue", label: "Catalogue", group: "Edit" },
      { id: "completeness", label: "Completeness", group: "Gate" },
    ],
  },
  {
    id: "4_build",
    number: 5,
    title: "Platform Conversion",
    short: "Build",
    focus: "Forge apps catalog → convert each in-scope app → approve build → Pilot",
    exitCriterion:
      "In-scope conversion artifacts generated and build pack architect-approved",
    status: "available",
    defaultView: "suite",
    views: [
      { id: "suite", label: "Forge apps", group: "Build" },
      { id: "tables", label: "Tables", group: "Convert" },
      { id: "scripts", label: "Scripts", group: "Convert" },
      { id: "pipelines", label: "Pipelines", group: "Convert" },
      { id: "reports", label: "Reports", group: "Convert" },
      { id: "data", label: "Data", group: "Convert" },
      { id: "approve", label: "Approve pack", group: "Gate" },
      { id: "accelerators", label: "Accelerators", group: "Accelerate" },
      { id: "cataloguer", label: "Source Cataloguer", group: "Accelerate" },
      { id: "composer", label: "Product Composer", group: "Accelerate" },
      { id: "transform", label: "Code Transform", group: "Accelerate" },
      { id: "contracts", label: "Contract & Docs", group: "Accelerate" },
    ],
  },
  {
    id: "5_pilot_product",
    number: 6,
    title: "Pilot Data Product",
    short: "Pilot",
    focus: "HITL reviews, product contract, dual-run, and reconcile",
    exitCriterion: "Reconciled against legacy within agreed tolerance",
    status: "available",
    defaultView: "reviews",
    views: [
      { id: "reviews", label: "Reviews", group: "Deliver" },
      { id: "product", label: "Product", group: "Deliver" },
      { id: "test_env", label: "Migrate to Test", group: "Deliver" },
      { id: "pipeline", label: "Run dual pipeline", group: "Deliver" },
      { id: "reconcile", label: "Reconcile", group: "Gate" },
    ],
  },
  {
    id: "6_migrate",
    number: 7,
    title: "Migrate to Production",
    short: "Migrate",
    focus: "Promote Pilot products to production with consumer switch and legacy freeze",
    exitCriterion: "Each product cut over with consumer and Change Board sign-off",
    status: "available",
    defaultView: "checklist",
    views: [
      { id: "checklist", label: "Checklist", group: "Cutover" },
      { id: "consumers", label: "Consumers", group: "Cutover" },
      { id: "freeze", label: "Freeze", group: "Cutover" },
      { id: "signoff", label: "Sign-off", group: "Gate" },
    ],
  },
  {
    id: "7_decommission",
    number: 8,
    title: "Decommission & Hypercare",
    short: "Retire",
    focus: "Archive legacy jobs, release infrastructure, close change",
    exitCriterion: "Legacy jobs archived, infrastructure released, change closed",
    status: "available",
    defaultView: "archive",
    views: [
      { id: "archive", label: "Archive", group: "Close" },
      { id: "hypercare", label: "Hypercare", group: "Close" },
      { id: "close", label: "Close", group: "Gate" },
    ],
  },
];

/** Phases shown in left rail / home — Setup + Metadata (folded into Align) hidden. */
export const NAV_PHASES: PhaseDef[] = PHASES.filter(
  (p) => p.id !== "0_mobilisation" && p.id !== "4_metadata"
);

/** Mirage Suite product tools (gallery + focused workspaces). */
export type SuiteToolId =
  | "mobilize"
  | "atlas"
  | "horizon"
  | "verdict"
  | "compass"
  | "forge"
  | "prove"
  | "transit"
  | "sunset";

export type SuiteToolDef = {
  id: SuiteToolId;
  sequence: number;
  /** Delivery stage verb — what the user is doing (Discover, Decide, …). */
  stageName: string;
  productName: string;
  shortName: string;
  tagline: string;
  phaseId: PhaseId;
  entryView: string;
  capabilities: string[];
  /** Shown in Suite Gallery journey by default */
  gallery: boolean;
  /**
   * Nested tool bands inside this stage (e.g. Forge Convert + Accelerators).
   * Gallery shows these as chips — not as flat app-store tiles.
   */
  nestedSuite?: { label: string; count: number }[];
  /** Product team that owns this stage tool (multi-team delivery). */
  ownedBy?: string;
  /** Short gate contract shown on the Stage map tile. */
  gateLabel?: string;
};

export const SUITE_TOOLS: SuiteToolDef[] = [
  {
    id: "mobilize",
    sequence: 0,
    stageName: "Mobilize",
    productName: "Mirage Mobilize",
    shortName: "Mobilize",
    tagline: "Access, RACI, freeze, and Hub readiness",
    phaseId: "0_mobilisation",
    entryView: "access",
    capabilities: ["Access checklist", "Team RACI", "Change freeze", "Platform Hub probe"],
    gallery: false,
  },
  {
    id: "atlas",
    sequence: 1,
    stageName: "Discover",
    productName: "Mirage Atlas",
    shortName: "Atlas",
    tagline: "Profiling, lineage, assessment, and HITL review",
    phaseId: "1_discovery",
    entryView: "sources",
    capabilities: ["Estate bind", "Profiling", "Lineage", "HITL Accept / Flag"],
    gallery: true,
    ownedBy: "Discovery engineering",
    gateLabel: "Signed-off inventory and lineage",
  },
  {
    id: "horizon",
    sequence: 2,
    stageName: "Plan",
    productName: "Mirage Horizon",
    shortName: "Horizon",
    tagline: "Folder-tree migrate scope, suggest or assign waves, approve object-level plan",
    phaseId: "2_plan",
    entryView: "overview",
    capabilities: ["Folder tree select", "Auto-suggest", "Manual waves", "Approve"],
    gallery: true,
    ownedBy: "Wave planning",
    gateLabel: "Approved wave plan · active wave set",
  },
  {
    id: "verdict",
    sequence: 3,
    stageName: "Decide",
    productName: "Mirage Verdict",
    shortName: "Verdict",
    tagline: "Disposition register and benefits case (per active wave)",
    phaseId: "2_disposition",
    entryView: "board",
    capabilities: ["Disposition board", "Retirement path", "Benefits / approve"],
    gallery: true,
    ownedBy: "Disposition & benefits",
    gateLabel: "Approved disposition register",
  },
  {
    id: "compass",
    sequence: 4,
    stageName: "Align",
    productName: "Mirage Compass",
    shortName: "Compass",
    tagline: "SID mapping and business metadata",
    phaseId: "3_mapping",
    entryView: "workbench",
    capabilities: ["SID workbench", "Gaps", "Entity ownership", "Align gate"],
    gallery: true,
    ownedBy: "Standards & metadata",
    gateLabel: "Mapping + ownership complete",
  },
  {
    id: "forge",
    sequence: 5,
    stageName: "Build",
    productName: "Mirage Forge",
    shortName: "Forge",
    tagline: "Convert in-scope apps, approve build, then Pilot",
    phaseId: "4_build",
    entryView: "suite",
    capabilities: [
      "Forge apps catalog",
      "Per-app convert",
      "Pack approve",
      "Accelerators",
    ],
    gallery: true,
    nestedSuite: [
      { label: "Convert", count: 5 },
      { label: "Accelerators", count: 4 },
    ],
    ownedBy: "Platform conversion",
    gateLabel: "Conversion pack approved",
  },
  {
    id: "prove",
    sequence: 6,
    stageName: "Pilot",
    productName: "Mirage Prove",
    shortName: "Prove",
    tagline: "HITL reviews, dual-run pipeline, and reconcile",
    phaseId: "5_pilot_product",
    entryView: "reviews",
    capabilities: ["Reviews", "Product", "Dual-run", "Reconcile"],
    gallery: true,
    ownedBy: "Pilot delivery",
    gateLabel: "Reconciled within tolerance",
  },
  {
    id: "transit",
    sequence: 7,
    stageName: "Migrate",
    productName: "Mirage Transit",
    shortName: "Transit",
    tagline: "Promote, consumers, freeze, and production sign-off",
    phaseId: "6_migrate",
    entryView: "checklist",
    capabilities: ["Cutover checklist", "Consumer switch", "Legacy freeze", "Sign-off"],
    gallery: true,
    ownedBy: "Production cutover",
    gateLabel: "Production sign-off recorded",
  },
  {
    id: "sunset",
    sequence: 8,
    stageName: "Retire",
    productName: "Mirage Sunset",
    shortName: "Sunset",
    tagline: "Archive, hypercare, and close change",
    phaseId: "7_decommission",
    entryView: "archive",
    capabilities: ["Archive", "Hypercare", "Change close"],
    gallery: true,
    ownedBy: "Decommission & hypercare",
    gateLabel: "Change closed · next wave or done",
  },
];

export const GALLERY_TOOLS = SUITE_TOOLS.filter((t) => t.gallery);

/** Nested migration tools inside Mirage Forge (Build). */
export type ForgeMigrateToolId =
  | "tables"
  | "scripts"
  | "pipelines"
  | "reports"
  | "data";

export type ForgeMigrateTool = {
  id: ForgeMigrateToolId;
  sequence: number;
  name: string;
  shortName: string;
  tagline: string;
  focus: string;
  capabilities: string[];
  /** PhaseBuild / route view id */
  viewId: string;
  ownedBy: string;
  gateLabel: string;
};

export const FORGE_MIGRATE_TOOLS: ForgeMigrateTool[] = [
  {
    id: "tables",
    sequence: 1,
    name: "Table Migration",
    shortName: "Tables",
    tagline: "Warehouse tables and views → analytical store DDL",
    focus: "Oracle / Teradata / Snowflake objects to BigQuery, Snowflake, or lakehouse tables",
    capabilities: ["DDL generate", "Type map", "Partition / cluster", "View rewrite"],
    viewId: "tables",
    ownedBy: "Table conversion",
    gateLabel: "DDL pack ready for survivors",
  },
  {
    id: "scripts",
    sequence: 2,
    name: "Script Migration",
    shortName: "Scripts",
    tagline: "Shell, Spark, PL/SQL, and job scripts → managed compute",
    focus: "On-prem scripts and procedures converted for Dataproc / Spark / cloud runtimes",
    capabilities: ["Spark jobs", "Shell wrappers", "Procedures", "Package bodies"],
    viewId: "scripts",
    ownedBy: "Code conversion",
    gateLabel: "Script / job pack generated",
  },
  {
    id: "pipelines",
    sequence: 3,
    name: "Pipeline Migration",
    shortName: "Pipelines",
    tagline: "Airflow DAGs and schedules → Composer / MWAA",
    focus: "Orchestration graphs discovered under legacy/dags, retargeted to cloud Airflow",
    capabilities: ["DAG rewrite", "Operator map", "Schedule ports", "Dependency edges"],
    viewId: "pipelines",
    ownedBy: "Orchestration conversion",
    gateLabel: "DAG pack retargeted",
  },
  {
    id: "reports",
    sequence: 4,
    name: "Report Migration",
    shortName: "Reports",
    tagline: "BI / reporting assets → cloud semantic or export targets",
    focus: "Report definitions and extract jobs aligned to migrated marts and products",
    capabilities: ["Report inventory", "Consumer map", "Export jobs", "Semantic bind"],
    viewId: "reports",
    ownedBy: "Reporting conversion",
    gateLabel: "Report assets mapped",
  },
  {
    id: "data",
    sequence: 5,
    name: "Data Migration",
    shortName: "Data",
    tagline: "Historical load, CDC, and backfill for in-scope tables",
    focus: "Move estate data for migrate/rebuild survivors — bulk load, CDC, and cutover windows",
    capabilities: ["Bulk load", "CDC / sync", "Backfill windows", "Volume estimate"],
    viewId: "data",
    ownedBy: "Data movement",
    gateLabel: "Load / CDC plan ready",
  },
];

export function getForgeMigrateTool(id: string): ForgeMigrateTool | undefined {
  return FORGE_MIGRATE_TOOLS.find((t) => t.id === id || t.viewId === id);
}

/** Post-conversion accelerators inside Mirage Forge (Build). */
export type ForgeAcceleratorToolId =
  | "cataloguer"
  | "composer"
  | "transform"
  | "contracts";

export type ForgeAcceleratorTool = {
  id: ForgeAcceleratorToolId;
  sequence: number;
  name: string;
  shortName: string;
  tagline: string;
  focus: string;
  capabilities: string[];
  viewId: string;
  /** Backend agent task id */
  taskId: string;
  role: string;
  toolLabel: string;
  defaultPayload: Record<string, unknown> | null;
  ownedBy: string;
  gateLabel: string;
};

export const FORGE_ACCELERATOR_TOOLS: ForgeAcceleratorTool[] = [
  {
    id: "cataloguer",
    sequence: 1,
    name: "Source Cataloguer",
    shortName: "Cataloguer",
    tagline: "Technical metadata + ingestion pipeline draft",
    focus: "Creates landing/catalogue metadata and drafts extract → validate → land",
    capabilities: ["Interface bind", "Landing draft", "Validate rules", "Catalogue"],
    viewId: "cataloguer",
    taskId: "source_interface_acquisition",
    role: "Ingest pipeline · metadata + landing",
    toolLabel: "Ingest pipeline",
    ownedBy: "Ingest accelerators",
    gateLabel: "Interface + landing draft produced",
    defaultPayload: {
      interface: {
        name: "crm_customer_extract",
        format: "csv",
        primary_key: "cust_id",
        columns: [
          { name: "cust_id" },
          { name: "cust_name" },
          { name: "email" },
          { name: "phone" },
        ],
      },
      owner: "Pat Product Owner",
    },
  },
  {
    id: "composer",
    sequence: 2,
    name: "Product Composer",
    shortName: "Composer",
    tagline: "Propose data products and semantic boundaries",
    focus: "Builds product candidates from Align metadata, mappings, and lineage",
    capabilities: ["Product boundaries", "Semantic model", "Owner seed", "Scope"],
    viewId: "composer",
    taskId: "data_product_identification",
    role: "Semantic modeling · product boundaries",
    toolLabel: "Semantic modeling",
    ownedBy: "Product accelerators",
    gateLabel: "Product candidates proposed",
    defaultPayload: {},
  },
  {
    id: "transform",
    sequence: 3,
    name: "Code Transformation",
    shortName: "Transform",
    tagline: "Generate transforms, tests, and reconcile SQL",
    focus: "Writes pipeline code into the migration repository from the Build pack",
    capabilities: ["Transforms", "Tests", "Reconcile SQL", "Repo write"],
    viewId: "transform",
    taskId: "code_transformation",
    role: "Code generator · pipelines & transforms",
    toolLabel: "Code generator",
    ownedBy: "Transform accelerators",
    gateLabel: "Transform / reconcile pack written",
    defaultPayload: {},
  },
  {
    id: "contracts",
    sequence: 4,
    name: "Contract & Docs",
    shortName: "Contracts",
    tagline: "Contracts, catalogue copy, and product documentation",
    focus: "Publishes contracts and docs for products and converted artifacts",
    capabilities: ["Contracts", "Catalogue", "Product docs", "Version"],
    viewId: "contracts",
    taskId: "contract_documentation",
    role: "Contracts · catalogue · product docs",
    toolLabel: "Contract docs",
    ownedBy: "Contract accelerators",
    gateLabel: "Contracts and docs published",
    defaultPayload: null,
  },
];

export const FORGE_ACCELERATOR_TASKS = FORGE_ACCELERATOR_TOOLS.map((t) => t.taskId);

export function getForgeAcceleratorTool(
  id: string
): ForgeAcceleratorTool | undefined {
  return FORGE_ACCELERATOR_TOOLS.find(
    (t) => t.id === id || t.viewId === id || t.taskId === id
  );
}

/** Post-gate landing — suite journey returns here with updated tool status. */
export const SUITE_GALLERY_HREF = "/workspace/gallery";

export function getTool(id: string): SuiteToolDef | undefined {
  return SUITE_TOOLS.find((t) => t.id === id);
}

export function getToolByPhase(phaseId: PhaseId | string): SuiteToolDef | undefined {
  if (phaseId === "4_metadata") return getTool("compass");
  // Suite journey starts at Discover — mobilisation folds into Atlas
  if (phaseId === "0_mobilisation") return getTool("atlas");
  return SUITE_TOOLS.find((t) => t.phaseId === phaseId);
}

export function toolHref(toolId: SuiteToolId | string, view?: string): string {
  const tool = getTool(toolId);
  if (!tool) return "/workspace/gallery";
  // Default to the first segment (step 1) for every tool stage.
  const phase = getPhase(tool.phaseId);
  const firstView = phase?.views[0]?.id;
  const v = view || firstView || tool.entryView || phase?.defaultView;
  return `/workspace/tools/${tool.id}/${v}`;
}

/** Active delivery wave from project.wave_plan (after Plan approve). */
export function activeWaveSummary(project: any): {
  id: string;
  name: string;
  object_count: number;
  status: string;
} | null {
  const plan = project?.wave_plan;
  if (!plan || !project?.plan_approved) return null;
  const waves: any[] = plan.waves || [];
  if (!waves.length) return null;
  const wid = (plan.active_wave_id || "").trim();
  const wave =
    (wid && waves.find((w) => w.id === wid)) ||
    waves.find((w) => w.status === "active") ||
    waves[0];
  if (!wave) return null;
  return {
    id: String(wave.id || ""),
    name: String(wave.name || wave.id || "Wave"),
    object_count: Number(wave.object_count ?? (wave.object_ids || []).length) || 0,
    status: String(wave.status || ""),
  };
}

/** Tool completion / progress from project gate flags. */
export type ToolGateStatus = "not_started" | "in_progress" | "complete" | "locked";

export function toolStatus(
  tool: SuiteToolDef,
  project: any,
  continueId?: PhaseId
): ToolGateStatus {
  const cont = continueId || continuePhaseId(project);
  const contIdx = phaseIndex(cont);
  const toolIdx = phaseIndex(tool.phaseId);

  const complete =
    (tool.phaseId === "0_mobilisation" && !!project?.mobilisation_ready) ||
    (tool.phaseId === "1_discovery" && !!project?.inventory_signed_off) ||
    (tool.phaseId === "2_plan" && !!project?.plan_approved) ||
    (tool.phaseId === "2_disposition" && !!project?.disposition_approved) ||
    (tool.phaseId === "3_mapping" &&
      !!project?.mapping_approved &&
      !!project?.metadata_complete) ||
    (tool.phaseId === "4_build" && !!project?.build_approved) ||
    (tool.phaseId === "5_pilot_product" &&
      (!!project?.test_env_ready || project?.phase === "6_migrate" || toolIdx < contIdx)) ||
    (tool.phaseId === "6_migrate" &&
      !!(project?.prod_env?.signoff?.signed_at || project?.phase === "7_decommission")) ||
    (tool.phaseId === "7_decommission" &&
      (!!project?.change_closed || project?.status === "closed"));

  if (complete) return "complete";
  if (toolIdx > contIdx) return "locked";
  if (tool.phaseId === cont || toolIdx === contIdx) return "in_progress";
  if (toolIdx < contIdx) return "in_progress";
  return "not_started";
}
export function phaseIndex(phase: string): number {
  const i = PHASES.findIndex((p) => p.id === phase);
  return i < 0 ? 0 : i;
}

export function getPhase(id: string): PhaseDef | undefined {
  return PHASES.find((p) => p.id === id);
}

/** Map legacy Metadata views onto Align. */
export function alignViewFromMetadata(view?: string): string {
  const v = view || "entities";
  if (v === "catalogue" || v === "overview") return "entities";
  if (v === "completeness" || v === "gate") return "approve";
  if (v === "entities" || v === "approve" || v === "workbench" || v === "gaps") {
    return v;
  }
  return "entities";
}

/** Normalize legacy / alias view ids onto the canonical phase view. */
export function resolvePhaseView(phaseId: PhaseId, view?: string): string {
  const phase = getPhase(phaseId === "4_metadata" ? "3_mapping" : phaseId);
  let v = view || phase?.defaultView || "overview";
  if (phaseId === "4_metadata") {
    return alignViewFromMetadata(v);
  }
  if (phaseId === "1_discovery" && (v === "assessment" || v === "signoff")) {
    v = "review";
  }
  if (phaseId === "1_discovery" && (v === "inventory" || v === "usage")) {
    v = "profiling";
  }
  if (phaseId === "2_disposition") {
    if (v === "consumers") v = "retirement";
    if (v === "benefits") v = "approve";
  }
  if (phaseId === "3_mapping") {
    if (v === "agents" || v === "extensions" || v === "overview") v = "workbench";
    if (v === "scorecard") v = "approve";
    if (v === "catalogue") v = "entities";
    if (v === "completeness" || v === "gate") v = "approve";
  }
  if (phaseId === "6_migrate") {
    if (v === "overview") v = "checklist";
  }
  if (phaseId === "7_decommission") {
    if (v === "retirement" || v === "overview" || v === "benefits") v = "archive";
  }
  return v;
}

/** Suite tool routes (preferred). Legacy /workspace/phase/* redirects here. */
export function phaseHref(phaseId: PhaseId, view?: string): string {
  if (phaseId === "4_metadata") {
    return toolHref("compass", alignViewFromMetadata(view));
  }
  const tool = getToolByPhase(phaseId);
  const v = resolvePhaseView(phaseId, view);
  if (tool) return toolHref(tool.id, v);
  return `/workspace/phase/${phaseId}/${v}`;
}


/** Prefer Sources when unbound / empty catalog; Profiling when discovery has objects. */
export function resolveDiscoveryView(
  project: any,
  opts?: { inventoryCount?: number; estateBound?: boolean }
): string {
  const bound =
    opts?.estateBound ??
    !!(
      project?.sample_slug ||
      project?.legacy_root ||
      project?.estate_label ||
      (project?.phase && project.phase !== "0_mobilisation" && project.phase !== "draft")
    );
  const inv = opts?.inventoryCount ?? 0;
  if (!bound) return "sources";
  if (inv > 0) return "profiling";
  return "sources";
}

export function groupViews(views: PhaseView[]): { group: string; views: PhaseView[] }[] {
  const order: string[] = [];
  const map = new Map<string, PhaseView[]>();
  for (const v of views) {
    if (!map.has(v.group)) {
      order.push(v.group);
      map.set(v.group, []);
    }
    map.get(v.group)!.push(v);
  }
  return order.map((group) => ({ group, views: map.get(group)! }));
}

/** Infer the phase the user should continue from project gate flags. */
export function continuePhaseId(project: any): PhaseId {
  // Phase 0 Setup is out of the demo path — start at Discovery when not further along
  if (!project) return "1_discovery";
  if (project.change_closed || project.status === "closed") return "7_decommission";
  if (project.status === "pilot_complete" || project.phase === "7_decommission") {
    return "7_decommission";
  }
  if (project.phase === "6_migrate") return "6_migrate";
  if (project.build_approved) return "5_pilot_product";
  if (project.metadata_complete && !project.build_approved) return "4_build";
  // Align covers mapping + metadata until both gates pass
  if (project.disposition_approved && !project.metadata_complete) return "3_mapping";
  // Plan sits between Discover and Decide; legacy estates that already decided skip Plan
  if (project.inventory_signed_off && !project.disposition_approved) {
    if (!project.plan_approved) return "2_plan";
    return "2_disposition";
  }
  if (project.phase === "4_build" || project.phase?.startsWith("5")) return "4_build";
  if (project.phase === "4_metadata" || project.phase?.startsWith("3")) return "3_mapping";
  if (project.phase === "2_plan") return "2_plan";
  if (project.phase === "2_disposition" || project.phase?.startsWith("2")) {
    return project.plan_approved || project.disposition_approved
      ? "2_disposition"
      : "2_plan";
  }  // Treat mobilisation as already complete (nav no longer exposes Setup)
  return "1_discovery";
}
