"use client";

import { useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";

type SubTab = "overview" | "retirement" | "archive" | "benefits" | "hypercare" | "close";

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "retirement", label: "Retirement schedule" },
  { id: "archive", label: "Archive & release" },
  { id: "benefits", label: "Benefits realised" },
  { id: "hypercare", label: "Hypercare" },
  { id: "close", label: "Close change" },
];

const RETIREMENT_STEPS = [
  "notified",
  "frozen",
  "silence",
  "archived",
  "decommissioned",
];

type Props = {
  project: any;
  cutoverComplete: boolean;
  dispositions: any[];
  benefits: any | null;
  audit: any[];
  hypercare?: any | null;
  busy: boolean;
  msg: string;
  sessionRole: string;
  onAdvanceRetirement: (id: number) => void;
  onCloseChange?: () => void;
  /** Workspace mode: hide outer chrome and show a single view */
  embedded?: boolean;
  view?: string;
};

export function Phase7Decommission({
  project,
  cutoverComplete,
  dispositions,
  benefits,
  audit,
  hypercare,
  busy,
  msg,
  sessionRole,
  onAdvanceRetirement,
  onCloseChange,
  embedded = false,
  view,
}: Props) {
  const initial = (view as SubTab) || (embedded ? "archive" : "overview");
  const [sub, setSub] = useState<SubTab>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const canAdvance = ["change_board", "architect", "data_owner"].includes(sessionRole);

  useEffect(() => {
    if (view && SUBTABS.some((t) => t.id === view)) {
      setSub(view as SubTab);
    }
  }, [view]);

  const retirees = useMemo(
    () =>
      dispositions.filter((d) => ["retire", "archive-only"].includes(d.final)),
    [dispositions]
  );

  const filteredRetirees = useMemo(() => {
    if (!q) return retirees;
    const needle = q.toLowerCase();
    return retirees.filter((d) =>
      String(d.object_fqn || "").toLowerCase().includes(needle)
    );
  }, [retirees, q]);

  const selected =
    selectedId != null ? retirees.find((d) => d.id === selectedId) || null : null;

  const decommissioned = retirees.filter(
    (d) => d.retirement_state === "decommissioned"
  ).length;
  const archived = retirees.filter((d) =>
    ["archived", "decommissioned"].includes(d.retirement_state)
  ).length;

  const journeyClosed =
    project.change_closed ||
    project.status === "closed" ||
    project.status === "pilot_complete" ||
    project.phase === "7_decommission";

  return (
    <div className={embedded ? "space-y-4 p-5" : "space-y-4"}>
      {!embedded && (
        <>
      <header className="card flex flex-wrap items-start justify-between gap-4 !py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tm-magenta">
            Phase 7 · Decommission &amp; Hypercare
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-tm-ink">
            Archive, release, close
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tm-gray-600">
            Complete controlled retirement for unused objects, retain archive-only assets under
            policy, release legacy infrastructure/licenses, run hypercare on the pilot product, and
            close the migration change.
          </p>
          <p className="mt-2 text-xs text-tm-gray-500">
            <span className="font-semibold text-tm-ink">Exit criterion:</span> Legacy jobs archived,
            infrastructure released, change closed.
          </p>
        </div>
        {journeyClosed && (
          <div className="rounded-xl bg-tm-magenta px-4 py-3 text-sm font-semibold text-white">
            Wave-1 journey complete
          </div>
        )}
      </header>

      {!cutoverComplete && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">
          Complete Phase 6 cutover checklist (including Change Board sign-off) to enter formal
          decommission. You can still advance retirement states for the demo.
        </div>
      )}

      {msg && (
        <div className="rounded-xl border border-tm-magenta/20 bg-tm-magenta-light px-4 py-3 text-sm text-tm-magenta-dark">
          {msg}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Retirement candidates" value={retirees.length} />
        <Kpi label="Archived+" value={archived} hint="archived or decommissioned" />
        <Kpi label="Decommissioned" value={decommissioned} />
        <Kpi
          label="Est. monthly saved"
          value={
            benefits
              ? `$${Number(benefits.estimated_monthly_infra_saved_usd).toLocaleString()}`
              : "—"
          }
          accent
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-tm-gray-200 bg-white p-1 shadow-card">
        {SUBTABS.map((t) => (
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
        </>
      )}

      {sub === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card lg:col-span-2 space-y-4">
            <h3 className="text-base font-semibold">Phase 7 checklist</h3>
            <Check done={cutoverComplete} title="Phase 6 cutover signed off" />
            <Check done={retirees.length > 0} title="Retirement schedule populated" />
            <Check done={archived > 0} title="At least one object archived to low-cost storage" />
            <Check
              done={decommissioned === retirees.length && retirees.length > 0}
              title="All retire candidates decommissioned"
            />
            <Check done={journeyClosed} title="Migration change closed / pilot complete" />
          </div>
          <div className="card text-sm text-tm-gray-600">
            <h3 className="text-base font-semibold text-tm-ink">Silence period</h3>
            <p className="mt-2 text-xs leading-relaxed">
              Before decommission: notify → freeze → observe silence. If a consumer reappears,
              restore from archive. Showcase advances states with demo buttons.
            </p>
          </div>
        </div>
      )}

      {sub === "retirement" && (
        <div
          className={
            embedded
              ? "-m-5 flex min-h-[calc(100vh-11rem)] flex-row"
              : "flex min-h-[420px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DataToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Filter retirement schedule…"
              countLabel={`${filteredRetirees.length} objects · ${decommissioned} decommissioned`}
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-4">Object</th>
                    <th className="table-th">Disposition</th>
                    <th className="table-th">State</th>
                    <th className="table-th px-4">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRetirees.map((d) => {
                    const idx = RETIREMENT_STEPS.indexOf(d.retirement_state);
                    return (
                      <tr
                        key={d.id}
                        className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                          selectedId === d.id ? "bg-tm-magenta-light/60" : ""
                        }`}
                        onClick={() => setSelectedId(d.id)}
                      >
                        <td className="table-td px-4 font-mono text-xs">{d.object_fqn}</td>
                        <td className="table-td text-sm">{d.final}</td>
                        <td className="table-td text-sm">{d.retirement_state}</td>
                        <td className="table-td px-4">
                          <div className="flex gap-1">
                            {RETIREMENT_STEPS.map((s, i) => (
                              <span
                                key={s}
                                title={s}
                                className={`h-2 w-5 rounded-full ${
                                  i <= idx ? "bg-tm-magenta" : "bg-tm-gray-200"
                                }`}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredRetirees.length && (
                    <tr>
                      <td className="table-td px-4 text-tm-gray-500" colSpan={4}>
                        No retire/archive objects — complete Phase 2 disposition first.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <InspectorPanel
            open={!!selected}
            title={selected?.object_fqn || "Retirement"}
            onClose={() => setSelectedId(null)}
          >
            {selected ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="badge-neutral">{selected.final}</span>
                  <span className="badge-magenta">{selected.retirement_state}</span>
                </div>
                <p className="text-xs text-tm-gray-600">
                  Notify → freeze → silence → archive → decommission. Advance only with Change
                  Board / Architect.
                </p>
                <button
                  className="btn text-xs"
                  disabled={
                    busy ||
                    !canAdvance ||
                    selected.retirement_state === "decommissioned"
                  }
                  onClick={() => onAdvanceRetirement(selected.id)}
                >
                  Advance retirement
                </button>
              </div>
            ) : null}
          </InspectorPanel>
        </div>
      )}

      {sub === "archive" && (
        <div
          className={
            embedded
              ? "-m-5 flex min-h-[calc(100vh-11rem)] flex-row"
              : "flex min-h-[420px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DataToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Filter archive candidates…"
              countLabel={`${filteredRetirees.length} · ${archived} archived+`}
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-4">Object</th>
                    <th className="table-th">Disposition</th>
                    <th className="table-th px-4">State</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRetirees.map((d) => (
                    <tr
                      key={d.id}
                      className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                        selectedId === d.id ? "bg-tm-magenta-light/60" : ""
                      }`}
                      onClick={() => setSelectedId(d.id)}
                    >
                      <td className="table-td px-4 font-mono text-xs">{d.object_fqn}</td>
                      <td className="table-td">
                        <span className="badge-neutral">{d.final}</span>
                      </td>
                      <td className="table-td px-4">
                        <span className="badge-magenta">{d.retirement_state}</span>
                      </td>
                    </tr>
                  ))}
                  {!filteredRetirees.length && (
                    <tr>
                      <td className="table-td px-4 text-tm-gray-500" colSpan={3}>
                        No archive candidates yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <InspectorPanel
            open={!!selected}
            title={selected?.object_fqn || "Archive"}
            onClose={() => setSelectedId(null)}
          >
            {selected ? (
              <div className="space-y-2 text-xs text-tm-gray-600">
                <p>
                  {selected.final === "archive-only"
                    ? "Retention obligation — keep in archive, not production warehouse."
                    : "No obligation — eligible for full decommission after silence."}
                </p>
                <p className="rounded bg-tm-gray-50 p-2">
                  Lands in low-cost object storage stub <code>archive/</code> with retention tags.
                </p>
                <button
                  className="btn text-xs"
                  disabled={
                    busy ||
                    !canAdvance ||
                    selected.retirement_state === "decommissioned"
                  }
                  onClick={() => onAdvanceRetirement(selected.id)}
                >
                  Advance state
                </button>
              </div>
            ) : null}
          </InspectorPanel>
        </div>
      )}

      {sub === "benefits" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              label="Not migrated"
              value={benefits?.objects_not_migrated ?? "—"}
            />
            <Kpi
              label="Monthly saved (est.)"
              value={
                benefits
                  ? `$${Number(benefits.estimated_monthly_infra_saved_usd).toLocaleString()}`
                  : "—"
              }
              accent
            />
            <Kpi label="Decommissioned" value={decommissioned} />
          </div>
          <div className="card text-sm text-tm-gray-600">
            <p>{benefits?.narrative || "Compute Phase 2 dispositions to populate benefits."}</p>
            {benefits?.by_disposition && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {Object.entries(benefits.by_disposition).map(([k, v]) => (
                  <li
                    key={k}
                    className="flex justify-between rounded-lg bg-tm-gray-50 px-3 py-2"
                  >
                    <span>{k}</span>
                    <strong>{String(v)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {sub === "hypercare" && (
        <div className="card space-y-3">
          <h3 className="text-base font-semibold">Hypercare watchlist</h3>
          <p className="text-sm text-tm-gray-600">
            Monitor the pilot product for freshness SLO breaches, reconciliation drift, and
            consumer incidents during the post-cutover window.
          </p>
          {(hypercare?.metrics || []).length > 0 ? (
            <div className="space-y-3">
              {hypercare.metrics.map((m: any) => (
                <div key={m.product_id} className="rounded-lg border border-tm-gray-200 p-3">
                  <div className="text-sm font-semibold">{m.product_name}</div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {[
                      ["Freshness SLO (24h)", m.freshness_slo],
                      ["Reconciliation", m.reconcile_passed ? "Passed" : "Open"],
                      ["Contract consumers", m.consumer_contract],
                      ["PII policy tags", m.pii_tags],
                      ["Cost attribution", m.cost_attribution],
                    ].map(([label, status]) => (
                      <li key={String(label)} className="flex justify-between rounded bg-tm-gray-50 px-3 py-1.5">
                        <span>{label}</span>
                        <span className="badge-success">{status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {hypercare?.infra && (
                <div className="rounded-lg bg-tm-gray-50 px-3 py-2 text-xs text-tm-gray-600">
                  Jobs archived {hypercare.infra.jobs_archived}/{hypercare.infra.jobs_total} ·{" "}
                  {hypercare.infra.licence_release_notes}
                </div>
              )}
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {[
                { label: "Freshness SLO (24h)", status: "Healthy" },
                { label: "Contract consumers", status: "On new contract" },
                { label: "PII policy tags", status: "Enforced" },
                { label: "Cost attribution", status: "Within estimate" },
              ].map((r) => (
                <li
                  key={r.label}
                  className="flex items-center justify-between rounded-lg bg-tm-gray-50 px-3 py-2"
                >
                  <span>{r.label}</span>
                  <span className="badge-success">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sub === "close" && (
        <div className="card max-w-2xl space-y-4">
          <h3 className="text-base font-semibold">Close migration change</h3>
          <p className="text-sm text-tm-gray-600">
            After product cutovers complete, Change Board closes the migration change — archive
            evidence on record, infrastructure release noted, status set to <code>closed</code>.
          </p>
          <div className="rounded-xl bg-tm-gray-50 p-4 text-sm">
            <div>
              Current phase: <strong>{project.phase}</strong>
            </div>
            <div>
              Status: <strong>{project.status}</strong>
            </div>
            <div>
              Change closed: <strong>{project.change_closed ? "Yes" : "No"}</strong>
            </div>
          </div>
          {project.change_closed || project.status === "closed" ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-tm-magenta px-4 py-3 font-semibold text-white">
                Migration change closed — Wave showcase complete.
              </div>
              <p className="text-xs text-tm-gray-500">
                Smaller governed estate · SID-aligned product · defensible lineage · retirement
                evidence on record.
              </p>
            </div>
          ) : cutoverComplete ? (
            <button
              className="btn"
              disabled={busy || !["change_board", "architect"].includes(sessionRole)}
              onClick={() => onCloseChange?.()}
            >
              {["change_board", "architect"].includes(sessionRole)
                ? "Close migration change"
                : "Requires Change Board / Architect"}
            </button>
          ) : (
            <p className="text-sm text-warn">
              Finish remaining Phase 6 checklist items (especially Change Board sign-off) to close
              the change.
            </p>
          )}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
              Recent audit events
            </h4>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-tm-gray-600">
              {audit.slice(0, 12).map((a) => (
                <li key={a.id} className="rounded bg-tm-gray-50 px-2 py-1">
                  {a.created_at} · {a.actor} · {a.action}
                </li>
              ))}
              {!audit.length && <li>No audit events yet.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Check({ done, title }: { done: boolean; title: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          done ? "bg-tm-magenta" : "bg-tm-gray-300"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-tm-ink" : "text-tm-gray-500"}>{title}</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`card ${accent ? "border-tm-magenta/40 bg-tm-magenta-light/40" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-tm-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-tm-gray-500">{hint}</div>}
    </div>
  );
}
