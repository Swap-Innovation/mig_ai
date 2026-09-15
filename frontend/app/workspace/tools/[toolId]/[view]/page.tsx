"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPhase, getTool, toolHref, type PhaseId } from "@/lib/phases";
import { PhaseWorkspace } from "@/components/workspace/PhaseWorkspace";

/** Legacy view ids remapped after nav consolidation. */
const VIEW_ALIASES: Record<string, Record<string, string>> = {
  "1_discovery": {
    inventory: "profiling",
    usage: "profiling",
    jobs: "lineage",
    assessment: "review",
    signoff: "review",
  },
  "2_plan": {
    waves: "approve",
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
  "4_build": {
    code: "scripts",
    dags: "pipelines",
  },
  "5_pilot_product": {
    dualrun: "pipeline",
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

export default function ToolViewPage() {
  const params = useParams();
  const router = useRouter();
  const toolId = String(params.toolId || "");
  const rawView = String(params.view || "");
  const tool = getTool(toolId);

  const phaseId = (tool?.phaseId || "") as PhaseId;
  const phase = phaseId ? getPhase(phaseId) : undefined;
  const aliased = phaseId ? VIEW_ALIASES[phaseId]?.[rawView] : undefined;
  const viewId = aliased || rawView;
  const needsRedirect = Boolean(aliased);

  useEffect(() => {
    if (!tool) {
      router.replace("/workspace/gallery");
      return;
    }
    if (tool.id === "mobilize") {
      router.replace(toolHref("atlas"));
      return;
    }
    // Accelerators moved from Pilot → Build (Mirage Forge)
    if (tool.id === "prove" && rawView === "agents") {
      router.replace(toolHref("forge", "accelerators"));
      return;
    }
    if (needsRedirect) {
      router.replace(toolHref(tool.id, viewId));
    }
  }, [tool, needsRedirect, viewId, router, rawView]);

  if (!tool || !phase) {
    return <div className="p-5 text-sm text-bad">Unknown tool: {toolId}</div>;
  }

  if (needsRedirect || (tool.id === "prove" && rawView === "agents")) {
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
        Unknown view “{rawView}” for {tool.productName}
      </div>
    );
  }

  return <PhaseWorkspace phaseId={phaseId} viewId={viewId} />;
}
