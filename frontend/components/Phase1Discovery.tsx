"use client";

import { useEffect, useMemo, useState } from "react";
import { DiscoveryPhase } from "@/components/phases/discovery/DiscoveryPhase";
import type { DiscoveryProps } from "@/components/phases/discovery/types";
import { Kpi } from "@/components/phases/discovery/shared";

const VIEWS: { id: string; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "console", label: "Discovery console" },
  { id: "profiling", label: "Profiling" },
  { id: "inventory", label: "Profiling" }, // legacy alias
  { id: "lineage", label: "Lineage graph" },
  { id: "jobs", label: "Job DAG" },
  { id: "review", label: "Review & sign-off" },
  { id: "assessment", label: "Review & sign-off" },
  { id: "signoff", label: "Review & sign-off" },
];

type Props = DiscoveryProps & {
  /** Workspace mode: hide outer chrome and show a single view */
  embedded?: boolean;
  view?: string;
};

export function Phase1Discovery({
  embedded = false,
  view,
  ...props
}: Props) {
  const initial = view || (embedded ? "profiling" : "sources");
  const [sub, setSub] = useState(initial);

  useEffect(() => {
    if (view && VIEWS.some((t) => t.id === view)) {
      setSub(view);
    }
  }, [view]);

  const tables = useMemo(
    () => props.inventory.filter((o) => o.object_type === "table"),
    [props.inventory]
  );

  const profileStats = useMemo(() => {
    const cols = tables.reduce((n, t) => n + (t.columns?.length || 0), 0);
    return { cols, tables: tables.length };
  }, [tables]);

  const discoveryActive = ["queued", "running"].includes(
    String(props.discoveryRun?.status || "").toLowerCase()
  );

  const activeView = embedded || view ? view || "profiling" : sub;

  if (embedded || view) {
    return (
      <div className="space-y-4 p-5">
        <DiscoveryPhase view={activeView} {...props} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="card flex flex-wrap items-start justify-between gap-4 !py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tm-magenta">
            Phase 1 · Discovery & Assessment
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-tm-ink">
            Legacy estate discovery
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tm-gray-600">
            Build a machine-readable technical inventory from code and runtime — SQL transforms,
            wrapper scripts, scheduler DAGs, profiling metrics, and usage evidence — then obtain
            architectural sign-off before disposition.
          </p>
          <p className="mt-2 text-xs text-tm-gray-500">
            <span className="font-semibold text-tm-ink">Exit criterion:</span> Signed-off inventory,
            lineage, and usage evidence.
            {props.estate?.estate_label ? (
              <>
                {" "}
                · Source: <span className="font-medium text-tm-ink">{props.estate.estate_label}</span>
                {props.estate.file_count != null ? ` (${props.estate.file_count} files)` : ""}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={props.busy} onClick={() => setSub("sources")}>
            Configure source
          </button>
          <button
            className="btn"
            disabled={
              props.busy ||
              discoveryActive ||
              !(props.estate?.exists || props.estate?.legacy_root)
            }
            onClick={() => {
              setSub("console");
              props.onRunDiscovery();
            }}
          >
            {discoveryActive
              ? "Discovery running…"
              : props.inventory.length
                ? "Re-run discovery"
                : "Run discovery"}
          </button>
          <button
            className="btn-secondary"
            disabled={props.busy || !props.inventory.length}
            onClick={props.onRunAssessment}
          >
            Run assessment agent
          </button>
        </div>
      </header>

      {props.msg && (
        <div className="rounded-xl border border-tm-magenta/20 bg-tm-magenta-light px-4 py-3 text-sm text-tm-magenta-dark">
          {props.msg}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Profiling objects" value={props.inventory.length} hint="Tables, scripts, jobs" />
        <Kpi
          label="Tables / columns"
          value={`${profileStats.tables} / ${profileStats.cols}`}
          hint="Column-level profiling"
        />
        <Kpi
          label="Lineage edges"
          value={props.lineage.edges?.length || 0}
          hint="Data + job dependencies"
        />
        <Kpi
          label="Sign-off"
          value={props.project.inventory_signed_off ? "Approved" : "Pending"}
          hint={
            props.project.inventory_signed_off ? "Phase 1 complete" : "Architect / Change Board"
          }
          accent={props.project.inventory_signed_off}
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-tm-gray-200 bg-white p-1 shadow-card">
        {VIEWS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              sub === t.id
                ? "bg-tm-magenta text-white"
                : "text-tm-gray-600 hover:bg-tm-gray-50 hover:text-tm-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <DiscoveryPhase view={sub} {...props} />
    </div>
  );
}
