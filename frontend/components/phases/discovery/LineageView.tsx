"use client";

import { useMemo } from "react";
import { SemanticsCanvas } from "@/components/semantics/SemanticsCanvas";
import {
  buildOfflineCatalog,
  buildRepoDiscoveryGraph,
} from "@/lib/kg/adapters";
import { AtlasEmpty, AtlasPage } from "@/components/phases/discovery/shared";

type Props = {
  project?: any | null;
  lineage: { nodes?: any[]; edges?: any[]; stats?: any };
  inventory?: any[];
  jobs?: any[];
  inventoryReady?: boolean;
};

/** Full-bleed lineage graph driven by LineageStitcher edges (not full catalog dump). */
export function LineageView({
  project = null,
  lineage,
  inventory = [],
  jobs = [],
  inventoryReady = false,
}: Props) {
  const input = useMemo(
    () => ({
      project: project
        ? {
            id: project.id,
            name: project.name,
            sample_slug: project.sample_slug,
            estate_label: project.estate_label,
          }
        : null,
      lineage,
      inventory,
      jobs,
    }),
    [project, lineage, inventory, jobs]
  );

  const fallbackGraph = useMemo(() => buildRepoDiscoveryGraph(input), [input]);
  const offlineCatalog = useMemo(() => buildOfflineCatalog(input), [input]);

  const empty = !(lineage.edges?.length || 0) && !fallbackGraph.nodes.length;

  if (empty) {
    return (
      <AtlasPage fill>
        <AtlasEmpty
          title="No lineage graph yet"
          detail={
            !inventoryReady
              ? "Lineage is produced when Profiling completes (LineageStitcher). Finish Activity → Run profiling first."
              : "The canvas shows relationships from LineageStitcher (SQL, scripts, DAGs) — not every catalog table. Re-run profiling if edges are missing."
          }
        />
      </AtlasPage>
    );
  }

  return (
    <AtlasPage fill>
      <SemanticsCanvas
        key={`repo-graph-${project?.id || "none"}-${lineage.edges?.length || 0}`}
        title={`${project?.name || "Project"} · lineage`}
        initialQueryCode="R1"
        fallbackGraph={fallbackGraph}
        offlineCatalog={offlineCatalog}
        products={[]}
        showContractsLink={false}
        hideCatalogWhenOffline
        variant="viewer"
        className="!min-h-0 h-full rounded-none border-0 shadow-none bg-transparent"
      />
    </AtlasPage>
  );
}
