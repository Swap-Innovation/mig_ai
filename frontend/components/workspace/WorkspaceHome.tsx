"use client";

import Link from "next/link";
import {
  continuePhaseId,
  getPhase,
  phaseHref,
  NAV_PHASES,
  resolveDiscoveryView,
  type PhaseId,
} from "@/lib/phases";
import { PageHeader, StatusStrip } from "@/components/shell/PageHeader";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { useEffect } from "react";

export function WorkspaceHome() {
  const {
    project,
    projects,
    pid,
    inventory,
    agentRuns,
    discoveryRun,
    selectProject,
    loadPhase1,
    loadPhase5,
  } = useWorkspace();

  useEffect(() => {
    loadPhase1();
    loadPhase5();
  }, [pid, loadPhase1, loadPhase5]);

  const next = continuePhaseId(project);
  const nextPhase = getPhase(next);
  const nextView =
    next === "1_discovery"
      ? resolveDiscoveryView(project, {
          inventoryCount: inventory.length,
          estateBound: !!(
            project?.sample_slug ||
            project?.legacy_root ||
            project?.estate_label
          ),
        })
      : undefined;
  const gates = [
    { id: "Discover", ok: !!project?.inventory_signed_off },
    { id: "Decide", ok: !!project?.disposition_approved },
    {
      id: "Align",
      ok: !!project?.mapping_approved && !!project?.metadata_complete,
    },
    { id: "Build", ok: !!project?.build_approved },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={project?.name || "Migration workspace"}
        subtitle="Home · pick up the next delivery gate"
        actions={
          <Link href={phaseHref(next, nextView)} className="btn">
            Continue · {nextPhase?.short || "Discover"}
          </Link>
        }
      />
      <StatusStrip
        items={[
          { label: "Phase", value: project?.phase?.replace(/_/g, " ") || "—" },
          { label: "Projects", value: projects.length },
          { label: "Inventory", value: inventory.length },
          { label: "Agent runs", value: agentRuns.length },
          {
            label: "Discovery",
            value: discoveryRun?.status || "idle",
          },
        ]}
      />

      <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="pane rounded-md p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Next action</h2>
          <p className="mt-2 text-sm text-brand-muted">
            {nextPhase?.focus || "Open Discovery to bind an estate and build inventory."}
          </p>
          <p className="mt-3 text-xs text-brand-muted">
            Exit criterion: {nextPhase?.exitCriterion}
          </p>
          <Link href={phaseHref(next, nextView)} className="btn mt-4 inline-flex">
            Open {nextPhase?.title}
          </Link>

          <div className="mt-6 flex flex-wrap gap-2">
            {gates.map((g) => (
              <span
                key={g.id}
                className={g.ok ? "badge-success" : "badge-neutral"}
              >
                {g.id} {g.ok ? "done" : "open"}
              </span>
            ))}
          </div>
        </section>

        <section className="pane rounded-md p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Project spaces</h2>
          <p className="mt-1 text-xs text-brand-muted">
            Synced with sample-data/projects and the control-plane API. Use the top bar to
            create or delete.
          </p>
          <ul className="mt-3 space-y-1">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => selectProject(p.id)}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-tm-gray-50 ${
                    p.id === project?.id ? "bg-tm-gray-50 font-semibold" : ""
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {p.name}
                    {p.sample_slug ? (
                      <span className="ml-2 font-mono text-[10px] font-normal text-brand-muted">
                        {p.sample_slug}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-brand-muted">
                    {p.id === project?.id ? "active" : "open"}
                  </span>
                </button>
              </li>
            ))}
            {!projects.length ? (
              <li className="px-2 py-2 text-sm text-brand-muted">No projects yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="pane rounded-md p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Delivery spaces</h2>
          <p className="mt-1 text-xs text-brand-muted">
            One space at a time. Open a phase to see its views in the left rail.
          </p>
          <ul className="mt-3 space-y-1">
            {NAV_PHASES.map((p) => (
              <li key={p.id}>
                <Link
                  href={phaseHref(p.id as PhaseId)}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-tm-gray-50"
                >
                  <span>
                    <span className="mr-2 font-mono text-xs text-brand-muted">{p.number}</span>
                    {p.short}
                  </span>
                  <span className="text-[11px] text-brand-muted">{p.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="pane rounded-md p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Recent activity</h2>
          <ul className="mt-3 divide-y divide-brand-line text-sm">
            {discoveryRun && (
              <li className="flex justify-between py-2">
                <span>Discovery run #{discoveryRun.id}</span>
                <span className="badge-neutral">{discoveryRun.status}</span>
              </li>
            )}
            {agentRuns.slice(0, 5).map((r) => (
              <li key={r.id} className="flex justify-between py-2">
                <span className="font-medium">{r.task}</span>
                <span className="text-xs text-brand-muted">
                  {r.status} · {Math.round((r.confidence || 0) * 100)}%
                </span>
              </li>
            ))}
            {!discoveryRun && !agentRuns.length && (
              <li className="py-2 text-brand-muted">No runs yet — start Phase 1 Discovery.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
