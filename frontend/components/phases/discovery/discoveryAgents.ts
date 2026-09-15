"use client";

/**
 * Split agentic flows:
 *   Activity  → discover pipeline (scan)
 *   Profiling → inventory pipeline (catalog + lineage)
 */

export type DiscoveryPipeline = "discover" | "inventory";

export const DISCOVER_STAGES: { id: string; agent: string; label: string }[] = [
  { id: "plan", agent: "DiscoveryCoordinator", label: "Plan" },
  { id: "structure", agent: "StructureAnalyst", label: "Structure" },
  { id: "sql", agent: "SqlLeafScanner", label: "SQL" },
  { id: "scripts", agent: "ScriptScanner", label: "Scripts" },
  { id: "orch", agent: "OrchestrationScanner", label: "Orchestration" },
  { id: "meta", agent: "CatalogUsageHarvester", label: "Catalog" },
];

export const INVENTORY_STAGES: { id: string; agent: string; label: string }[] = [
  { id: "inventory", agent: "InventoryProfiler", label: "Profiling" },
  { id: "lineage", agent: "LineageStitcher", label: "Lineage" },
];

export const DISCOVER_AGENTS = new Set(DISCOVER_STAGES.map((s) => s.agent));
export const INVENTORY_AGENTS = new Set([
  ...INVENTORY_STAGES.map((s) => s.agent),
  "EstateParser",
]);

/** @deprecated Use DISCOVER_STAGES or INVENTORY_STAGES */
export const DISCOVERY_STAGES = [...DISCOVER_STAGES, ...INVENTORY_STAGES];

export function pipelineOf(run: any | null | undefined): DiscoveryPipeline | null {
  const p = String(run?.summary?.pipeline || run?.pipeline || "").toLowerCase();
  if (p === "inventory") return "inventory";
  if (p === "discover") return "discover";
  // Legacy monolithic runs stay off Activity so INV/STITCH don't appear there
  return null;
}

export function pickLatestRun(
  runs: any[] | undefined,
  pipeline: DiscoveryPipeline
): any | null {
  const list = runs || [];
  return list.find((r) => pipelineOf(r) === pipeline) || null;
}

export function agentOf(step: any): string {
  return step?.detail?.agent || "DiscoveryCoordinator";
}

export function isTerminalStep(step: any): boolean {
  return step?.name === "terminal.log" || step?.detail?.kind === "terminal";
}

export function stageStatus(
  agent: string,
  steps: any[],
  runStatus: string,
  stages: { agent: string }[] = DISCOVERY_STAGES
): "pending" | "running" | "done" | "failed" | "warning" {
  const mine = (steps || []).filter(
    (s) => agentOf(s) === agent && !isTerminalStep(s)
  );
  if (!mine.length) {
    if (["queued", "running"].includes(runStatus) && steps?.length) {
      const last = steps.filter((s) => !isTerminalStep(s)).slice(-1)[0];
      const lastAgent = agentOf(last || {});
      const lastIdx = stages.findIndex((s) => s.agent === lastAgent);
      const myIdx = stages.findIndex((s) => s.agent === agent);
      if (myIdx >= 0 && lastIdx >= 0 && myIdx <= lastIdx) return "done";
    }
    return "pending";
  }
  if (mine.some((s) => s.status === "failed")) return "failed";
  if (mine.some((s) => s.status === "running")) return "running";
  if (mine.some((s) => s.status === "warning")) return "warning";
  return "done";
}

export function terminalLinesFromRun(
  discoveryRun: any | null,
  allowedAgents?: Set<string>
) {
  const summary = discoveryRun?.summary || {};
  const steps: any[] = discoveryRun?.steps || [];
  const fromSummary = (summary.terminal_log || []) as {
    ts?: string;
    agent?: string;
    line: string;
  }[];
  const raw = fromSummary.length
    ? fromSummary
    : steps.filter(isTerminalStep).map((s) => ({
        ts: s.created_at,
        agent: agentOf(s),
        line: String(s.message || ""),
      }));
  if (!allowedAgents?.size) return raw;
  return raw.filter((row) => {
    const a = String(row.agent || "");
    if (!a) return true;
    return allowedAgents.has(a);
  });
}
