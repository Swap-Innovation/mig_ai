"use client";

import { useMemo } from "react";
import { SemanticsCanvas } from "@/components/semantics/SemanticsCanvas";
import {
  buildOfflineCatalog,
  buildRepoDiscoveryGraph,
} from "@/lib/kg/adapters";

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
  const stats = lineage?.stats || {};
  const unlinked = (stats.unlinked_tables || []) as string[];
  const linkedN = stats.linked_table_count ?? null;
  const invN = stats.inventory_table_count ?? inventory.filter((o) => o.object_type === "table").length;

  const empty = !(lineage.edges?.length || 0) && !fallbackGraph.nodes.length;

  if (empty) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-white p-8 text-sm text-brand-muted">
        <div className="max-w-lg">
          <p className="font-semibold text-brand-ink">No lineage graph yet</p>
          <p className="mt-2">
            {!inventoryReady
              ? "Lineage is produced when Inventory completes (LineageStitcher). Finish Activity → Find inventory first — edges are stored in the backend."
              : (
                <>
                  The canvas shows only relationships produced by{" "}
                  <span className="font-medium text-brand-slate">LineageStitcher</span> from SQL,
                  scripts, and DAGs — not every catalog table. Re-run{" "}
                  <span className="font-medium text-brand-slate">Find inventory</span> if edges are
                  missing.
                </>
              )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-white">
      {(linkedN != null || unlinked.length > 0) && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-tm-gray-100 px-4 py-2 text-[11px] text-tm-gray-500">
          <span>
            Stitcher-linked tables{" "}
            <span className="font-semibold tabular-nums text-tm-ink">
              {linkedN ?? "—"}
              {invN != null ? ` / ${invN}` : ""}
            </span>
          </span>
          {unlinked.length > 0 ? (
            <span className="truncate" title={unlinked.join(", ")}>
              Catalog-only (hidden): {unlinked.slice(0, 4).join(", ")}
              {unlinked.length > 4 ? ` +${unlinked.length - 4}` : ""}
            </span>
          ) : (
            <span>All inventoried tables appear in at least one edge</span>
          )}
        </div>
      )}
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
        className="!min-h-0 h-full rounded-none border-0 shadow-none"
      />
    </div>
  );
}
