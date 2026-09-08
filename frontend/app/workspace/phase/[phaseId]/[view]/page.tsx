"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  alignViewFromMetadata,
  getPhase,
  phaseHref,
  type PhaseId,
} from "@/lib/phases";
import { PhaseWorkspace } from "@/components/workspace/PhaseWorkspace";

/** Legacy view ids remapped after nav consolidation. */
const VIEW_ALIASES: Record<string, Record<string, string>> = {
  "1_discovery": {
    profiling: "inventory",
    usage: "inventory",
    jobs: "lineage",
    assessment: "review",
    signoff: "review",
  },
  "2_disposition": {
    consumers: "retirement",
    evidence: "board",
    overview: "board",
    benefits: "approve",
  },
  "3_mapping": {
    agents: "workbench",
    extensions: "workbench",
    overview: "workbench",
    scorecard: "approve",
    catalogue: "entities",
    completeness: "approve",
    gate: "approve",
  },
  "6_migrate": {
    overview: "checklist",
  },
  "7_decommission": {
    overview: "archive",
    retirement: "archive",
    benefits: "archive",
  },
};

export default function PhaseViewPage() {
  const params = useParams();
  const router = useRouter();
  const rawPhaseId = String(params.phaseId || "") as PhaseId;
  const rawView = String(params.view || "");

  // Metadata folded into Align — hard redirect
  const phaseId: PhaseId =
    rawPhaseId === "4_metadata" ? "3_mapping" : rawPhaseId;
  const rawViewForPhase =
    rawPhaseId === "4_metadata" ? alignViewFromMetadata(rawView) : rawView;

  const phase = getPhase(phaseId);
  const aliased = VIEW_ALIASES[phaseId]?.[rawViewForPhase];
  const viewId = aliased || rawViewForPhase;
  const needsRedirect =
    rawPhaseId === "4_metadata" || Boolean(aliased);

  useEffect(() => {
      if (needsRedirect) {
      router.replace(phaseHref(phaseId, viewId));
    }
  }, [needsRedirect, phaseId, viewId, router]);

  if (!phase) {
    return <div className="p-5 text-sm text-bad">Unknown phase: {rawPhaseId}</div>;
  }

  if (needsRedirect) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-brand-muted">
        Opening…
      </div>
    );
  }

  const known = phase.views.some((v) => v.id === viewId);
  if (!known) {
    return (
      <div className="p-5 text-sm text-bad">
        Unknown view “{rawView}” for {phase.title}
      </div>
    );
  }

  return <PhaseWorkspace phaseId={phaseId} viewId={viewId} />;
}
