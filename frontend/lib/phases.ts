export type PhaseId =
  | "0_mobilisation"
  | "1_discovery"
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
      { id: "hub", label: "UDP Hub", group: "Prepare" },
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
    defaultView: "inventory",
    views: [
      { id: "sources", label: "Source", group: "Prepare" },
      { id: "console", label: "Activity", group: "Prepare" },
      { id: "inventory", label: "Inventory", group: "Review" },
      { id: "lineage", label: "Lineage", group: "Review" },
      { id: "review", label: "Review", group: "Approve" },
    ],
  },
  {
    id: "2_disposition",
    number: 2,
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
    number: 3,
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
    number: 4,
    title: "Platform Conversion",
    short: "Build",
    focus: "Oracle→BigQuery, on-prem code→Dataproc, DAGs→Composer Airflow",
    exitCriterion:
      "Conversion pack generated from migrate/rebuild survivors and architect-approved",
    status: "available",
    defaultView: "tables",
    views: [
      { id: "tables", label: "Tables", group: "Convert" },
      { id: "code", label: "Code", group: "Convert" },
      { id: "dags", label: "DAGs", group: "Convert" },
      { id: "approve", label: "Approve", group: "Gate" },
    ],
  },
  {
    id: "5_pilot_product",
    number: 5,
    title: "Pilot Data Product",
    short: "Pilot",
    focus: "Party & Customer Account product with contract and LLM-assisted delivery",
    exitCriterion: "Reconciled against legacy within agreed tolerance",
    status: "available",
    defaultView: "agents",
    views: [
      { id: "agents", label: "Accelerators", group: "Deliver" },
      { id: "reviews", label: "Reviews", group: "Deliver" },
      { id: "product", label: "Product", group: "Deliver" },
      { id: "test_env", label: "Migrate to Test", group: "Deliver" },
      { id: "pipeline", label: "Run dual pipeline", group: "Deliver" },
      { id: "reconcile", label: "Reconcile", group: "Gate" },
    ],
  },
  {
    id: "6_migrate",
    number: 6,
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
    number: 7,
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

export function phaseHref(phaseId: PhaseId, view?: string): string {
  // Metadata space folded into Align
  if (phaseId === "4_metadata") {
    return `/workspace/phase/3_mapping/${alignViewFromMetadata(view)}`;
  }
  const phase = getPhase(phaseId);
  let v = view || phase?.defaultView || "overview";
  // Legacy discovery approve routes → merged Review
  if (phaseId === "1_discovery" && (v === "assessment" || v === "signoff")) {
    v = "review";
  }
  // Consumers folded into Retirement; Benefits folded into Approve
  if (phaseId === "2_disposition") {
    if (v === "consumers") v = "retirement";
    if (v === "benefits") v = "approve";
  }
  // Agent → Workbench; Scorecard/Catalogue/Completeness → Align views
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
  return `/workspace/phase/${phaseId}/${v}`;
}


/** Prefer Sources when unbound / empty inventory; Inventory when discovery has objects. */
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
  if (inv > 0) return "inventory";
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
  if (project.inventory_signed_off && !project.disposition_approved) return "2_disposition";
  if (project.phase === "4_build" || project.phase?.startsWith("5")) return "4_build";
  if (project.phase === "4_metadata" || project.phase?.startsWith("3")) return "3_mapping";
  if (project.phase?.startsWith("2")) return "2_disposition";
  // Treat mobilisation as already complete (nav no longer exposes Setup)
  return "1_discovery";
}
