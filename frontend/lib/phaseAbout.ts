import type { PhaseId } from "@/lib/phases";

export type PhaseAbout = {
  summary: string;
  why: string;
  how: string[];
  exit: string;
};

export const PRODUCT_ABOUT = {
  title: "About Lumina",
  body:
    "Lumina is a control plane for legacy → cloud data estate migration. It walks stakeholders through discovery, disposition, SID mapping & metadata (Align), platform conversion (Build), LLM-assisted pilot delivery, and a Party & Customer Account product on a GCP-shaped stack — not a lift-and-shift of every table.",
};

export const PHASE_ABOUT: Record<PhaseId, PhaseAbout> = {
  "0_mobilisation": {
    summary: "Confirm access, environments, tooling, and change freeze before discovery.",
    why: "Mobilisation removes blockers so discovery and later gates run against real estates, not slideware assumptions.",
    how: [
      "Access — tick items and attach notes / evidence / verified-by",
      "Decisions — accept demo defaults or record Wave-1 §10 answers",
      "Team / RACI — name architect + data owner (demo seed OK)",
      "Change freeze — fill register and Publish (or defer with CB note)",
      "UDP Hub — bind landing/conformance/products spoke and Run probe (optional unless REQUIRE_HUB_PROBE)",
      "Environments / Tooling — complete remaining checklist",
      "Ready — pass hard auto-checks, then sign-off to open Discovery",
    ],
    exit: "Team can read source and deploy to non-production.",
  },
  "1_discovery": {
    summary:
      "Build a signed-off technical inventory from SQL, scripts, schedules, catalog, profiling, and usage evidence.",
    why: "Disposition and mapping are only as good as the evidence. Discovery turns estate sources into inventory, lineage, jobs, and usage that gates can approve.",
    how: [
      "Confirm the connected source, then Start discovery (multi-agent leaf→root scan)",
      "Watch agents under Activity (structure, SQL, scripts, DAGs, lineage, inventory)",
      "Review Inventory, Lineage, and Profiling; run Assessment; Sign off",
    ],
    exit: "Signed-off inventory, lineage, and usage evidence.",
  },
  "2_disposition": {
    summary:
      "Classify each object as migrate, rebuild, consolidate, archive-only, or retire — with evidence.",
    why: "Not everything should move. Disposition prevents migrating dead weight and forces retirement / consolidation decisions early.",
    how: [
      "Compute recommendations from usage, lineage, and retention signals",
      "Override on the Board with role-gated controls; advance Retirement",
      "Review the benefits case on Approve and Change Board–approve the register",
    ],
    exit: "Approved disposition register and retirement schedule.",
  },
  "3_mapping": {
    summary:
      "Map legacy columns to TM Forum SID, then attach owner, definition, and classification on the same Align space.",
    why: "Enterprise standards stop shadow schemas; catalogue ownership makes Wave-1 authoritative. Gaps and missing owners stay explicit.",
    how: [
      "Run mapping on the Workbench; clear Gaps",
      "Entities lists every TM Forum SID entity from those mappings — seed/edit owner, definition, classification",
      "Approve reviews the pack overview and locks mapping; Complete → Build from Entities",
    ],
    exit:
      "Mapping pack approved and in-scope entities have owner, definition, and classification.",
  },
  "4_metadata": {
    summary:
      "Folded into Align — entity ownership and classification live under SID Mapping & Business Metadata.",
    why: "Catalogue completeness remains a gate for pilot delivery; it is no longer a separate delivery-plan space.",
    how: [
      "Open Align → Entities",
      "Edit ownership and classification",
      "Complete the Align gate when readiness passes",
    ],
    exit: "Every in-scope entity has owner, definition, and classification (via Align).",
  },
  "4_build": {
    summary:
      "Convert migrate/rebuild survivors to BigQuery DDL, Dataproc/Spark jobs, and Composer Airflow DAGs.",
    why: "Semantic Align is not enough — engineers need platform-ready artifacts from Discover → Decide → Align.",
    how: [
      "Generate the conversion pack from survivors",
      "Review Tables (Oracle→BQ), Code (→Dataproc), and DAGs (→Airflow)",
      "Approve the pack to unlock Pilot",
    ],
    exit: "Conversion pack generated and architect-approved.",
  },
  "5_pilot_product": {
    summary:
      "Deliver the Party & Customer Account data product with HITL reviews, contract, pipeline, and reconcile — using the Build pack.",
    why: "The pilot proves the control plane end-to-end: agents propose, humans approve, GCP-shaped stubs land and reconcile.",
    how: [
      "Launch Acquisition / Product / Transform / Contract agents against Build outputs",
      "Approve pending items in Reviews with the matching persona",
      "Inspect Product rows + contract; run Pipeline and Reconcile",
    ],
    exit: "Reconciled against legacy within agreed tolerance.",
  },
  "6_migrate": {
    summary:
      "Migrate to Production — promote Pilot-reconciled products, switch consumers, freeze legacy, Change Board sign-off.",
    why: "Wave migration is per product, not a big-bang estate switch — production cutover needs dual-run evidence and explicit consumer acceptance.",
    how: [
      "Promote selected products from Pilot (Test) into Production",
      "Track each consumer to switched (or blocked) on the production contract",
      "Apply legacy freeze for retire / archive / consolidate objects",
      "Change Board signs off; journey continues to Retire",
    ],
    exit: "Each product cut over with consumer and Change Board sign-off.",
  },
  "7_decommission": {
    summary: "Archive legacy jobs, release infrastructure, close the change with benefits evidence.",
    why: "Migration is incomplete until legacy cost and risk are actually removed.",
    how: [
      "Archive retired jobs and confirm silence periods",
      "Record hypercare notes and benefits realisation",
      "Close the change record",
    ],
    exit: "Legacy jobs archived, infrastructure released, change closed.",
  },
};
