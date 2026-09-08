"use client";

import type { DiscoveryProps } from "@/components/phases/discovery/types";
import { SourcesView } from "@/components/phases/discovery/SourcesView";
import { ConsoleView } from "@/components/phases/discovery/ConsoleView";
import { InventoryView } from "@/components/phases/discovery/InventoryView";
import { LineageView } from "@/components/phases/discovery/LineageView";
import { ReviewView } from "@/components/phases/discovery/ReviewView";

export function DiscoveryPhase({
  view,
  ...props
}: { view: string } & DiscoveryProps) {
  // Strict split — never fall back across pipelines
  const discoverRun = props.discoveryRunDiscover ?? null;
  const inventoryRun = props.discoveryRunInventory ?? null;

  switch (view) {
    case "sources":
      return (
        <SourcesView
          estate={props.estate}
          samples={props.samples}
          project={props.project}
          inventoryCount={props.inventory?.length || 0}
          discoveryRun={discoverRun}
          busy={props.busy}
          msg={props.msg}
          onBindSample={props.onBindSample}
          onUploadZip={props.onUploadZip}
          onBindGit={props.onBindGit}
          onSyncGit={props.onSyncGit}
          onRunDiscovery={() => props.onRunDiscovery("discover")}
          llmStatus={props.llmStatus}
        />
      );
    case "console":
      return (
        <ConsoleView
          estate={props.estate}
          discoveryRun={discoverRun}
          inventory={props.inventory}
          jobs={props.jobs}
          lineage={props.lineage}
          busy={props.busy}
          onPollDiscovery={props.onPollDiscovery}
          onRunDiscovery={() => props.onRunDiscovery("discover")}
        />
      );
    case "inventory":
    case "profiling":
    case "usage":
      return (
        <InventoryView
          inventory={props.inventory}
          discoveryRun={inventoryRun}
          lineage={props.lineage}
          busy={props.busy}
          msg={props.msg}
          estateBound={!!(
            props.estate?.exists ||
            props.project?.sample_slug ||
            props.project?.legacy_root
          )}
          discoverDone={
            String(discoverRun?.status || "").toLowerCase() === "completed" ||
            (props.discoveryRuns || []).some(
              (r: any) =>
                String((r.summary || {}).pipeline || "discover").toLowerCase() ===
                  "discover" &&
                String(r.status || "").toLowerCase() === "completed"
            )
          }
          onPollDiscovery={props.onPollDiscovery}
          onRunDiscovery={() => props.onRunDiscovery("inventory")}
        />
      );
    case "lineage":
    case "jobs":
      return (
        <LineageView
          project={props.project}
          lineage={props.lineage}
          inventory={props.inventory}
          jobs={props.jobs}
          inventoryReady={
            (props.inventory?.length || 0) > 0 ||
            String(inventoryRun?.status || "").toLowerCase() === "completed"
          }
        />
      );
    case "review":
    case "assessment": // alias
    case "signoff": // alias
      return (
        <ReviewView
          project={props.project}
          inventory={props.inventory}
          jobs={props.jobs}
          lineage={props.lineage}
          assessmentRun={props.assessmentRun}
          agentRuns={props.agentRuns}
          discoveryRunDiscover={discoverRun}
          discoveryRunInventory={inventoryRun}
          discoveryRuns={props.discoveryRuns}
          busy={props.busy}
          sessionRole={props.sessionRole}
          onPollAgents={props.onPollAgents}
          onRunAssessment={props.onRunAssessment}
          onSignOff={props.onSignOff}
        />
      );
    default:
      return <InventoryView inventory={props.inventory} />;
  }
}
