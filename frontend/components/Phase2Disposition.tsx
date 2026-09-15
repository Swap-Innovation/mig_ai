"use client";

import { useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";

type SubTab =
  | "overview"
  | "board"
  | "evidence"
  | "retirement"
  | "approve";

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "board", label: "Disposition board" },
  { id: "evidence", label: "Evidence drawer" },
  { id: "retirement", label: "Retirement workflow" },
  { id: "approve", label: "Change Board" },
];

const CATEGORIES = [
  "migrate",
  "rebuild",
  "consolidate",
  "archive-only",
  "retire",
] as const;

const CATEGORY_META: Record<
  string,
  { label: string; blurb: string; tone: string }
> = {
  migrate: {
    label: "Migrate",
    blurb: "Actively consumed with sound logic — translate to the target platform.",
    tone: "bg-sky-50 text-sky-800 border-sky-200",
  },
  rebuild: {
    label: "Rebuild",
    blurb: "Actively consumed but unsound / non-restartable — re-implement from SoR.",
    tone: "bg-amber-50 text-amber-900 border-amber-200",
  },
  consolidate: {
    label: "Consolidate",
    blurb: "Duplicate or near-duplicate — merge into a single target entity.",
    tone: "bg-violet-50 text-violet-900 border-violet-200",
  },
  "archive-only": {
    label: "Archive-only",
    blurb: "Not actively consumed; retention/audit obligations apply.",
    tone: "bg-tm-gray-100 text-tm-gray-700 border-tm-gray-300",
  },
  retire: {
    label: "Retire",
    blurb: "No consumption, no retention obligation, no downstream dependency.",
    tone: "bg-rose-50 text-rose-900 border-rose-200",
  },
};

const RETIREMENT_STEPS = [
  { id: "notified", label: "Notify consumers" },
  { id: "frozen", label: "Freeze" },
  { id: "silence", label: "Silence period" },
  { id: "archived", label: "Archive" },
  { id: "decommissioned", label: "Decommission" },
];

type Props = {
  project: any;
  dispositions: any[];
  benefits: any | null;
  inventorySignedOff: boolean;
  planApproved?: boolean;
  busy: boolean;
  msg: string;
  sessionRole: string;
  onCompute: () => void;
  onAnalyze?: () => void;
  onOverride: (id: number, override: string) => void;
  onAdvanceRetirement: (id: number) => void;
  onNotifyConsumers?: () => void;
  onFreezeScope?: () => void;
  onApprove: () => void;
  /** Workspace mode: hide outer chrome and show a single view */
  embedded?: boolean;
  view?: string;
};

export function Phase2Disposition({
  project,
  dispositions,
  benefits,
  inventorySignedOff,
  planApproved = true,
  busy,
  msg,
  sessionRole,
  onCompute,
  onAnalyze,
  onOverride,
  onAdvanceRetirement,
  onNotifyConsumers,
  onFreezeScope,
  onApprove,
  embedded = false,
  view,
}: Props) {
  const initial = (view as SubTab) || (embedded ? "board" : "overview");
  const [sub, setSub] = useState<SubTab>(initial);
  const [filter, setFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!view) return;
    let mapped = view;
    if (view === "consumers") mapped = "retirement";
    if (view === "benefits") mapped = "approve";
    if (SUBTABS.some((t) => t.id === mapped)) {
      setSub(mapped as SubTab);
    }
  }, [view]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of dispositions) {
      c[d.final] = (c[d.final] || 0) + 1;
    }
    return c;
  }, [dispositions]);

  const filtered = useMemo(() => {
    return dispositions.filter((d) => {
      if (filter !== "all" && d.final !== filter) return false;
      if (!q) return true;
      return String(d.object_fqn || "")
        .toLowerCase()
        .includes(q.toLowerCase());
    });
  }, [dispositions, filter, q]);

  const selected =
    selectedId != null
      ? dispositions.find((d) => d.id === selectedId) || null
      : null;

  const retirees = dispositions.filter((d) =>
    ["retire", "archive-only"].includes(d.final)
  );

  const canApprove = [
    "change_board",
    "architect",
    "product_owner",
    "engineer",
  ].includes(sessionRole);
  const canOverride = [
    "engineer",
    "architect",
    "change_board",
    "product_owner",
  ].includes(sessionRole);
  const runAnalyze = onAnalyze || onCompute;

  return (
    <div className={embedded ? "space-y-4 p-5" : "space-y-4"}>
      {!embedded && (
        <>
      <header className="card flex flex-wrap items-start justify-between gap-4 !py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tm-magenta">
            Phase 2 · Disposition
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-tm-ink">
            Migrate, consolidate, rebuild, or retire
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tm-gray-600">
            Migration cost is driven by object count — the cheapest object is the one not
            migrated. Score every inventory object from usage, lineage, and retention evidence,
            then obtain Change Board approval of the disposition register.
          </p>
          <p className="mt-2 text-xs text-tm-gray-500">
            <span className="font-semibold text-tm-ink">Exit criterion:</span> Approved
            disposition register and retirement schedule.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            disabled={busy || !inventorySignedOff || !planApproved}
            onClick={runAnalyze}
            title={
              !inventorySignedOff
                ? "Complete Discover sign-off first"
                : !planApproved
                  ? "Approve Plan waves first — Decide runs on the active wave"
                  : "Run disposition agents across inventory object types"
            }
          >
            {dispositions.length ? "Re-analyze" : "Analyze"}
          </button>
        </div>
      </header>

      {!inventorySignedOff && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">
          Discovery Review sign-off is required. Decide scores the signed inventory /
          lineage pack from Discover and writes the register under this project&apos;s{" "}
          <code className="text-xs">migration-repo/decide/</code>.
        </div>
      )}
      {inventorySignedOff && !planApproved && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">
          Approve a wave plan in Plan (Mirage Horizon) first. Decide analyzes only the
          active wave scope.
        </div>
      )}
      {inventorySignedOff && planApproved && !dispositions.length && (
        <div className="rounded-xl border border-tm-gray-200 bg-tm-gray-50 px-4 py-3 text-sm text-tm-gray-600">
          Ready to Analyze — input comes from Discovery (
          <code className="text-xs">discover/inventory</code> +{" "}
          <code className="text-xs">discover/lineage</code>
          ), scoped to the active Plan wave. Results land in{" "}
          <code className="text-xs">migration-repo/decide/board/register.json</code> for
          Retirement and Approve.
        </div>
      )}

      {msg && (
        <div className="rounded-xl border border-tm-magenta/20 bg-tm-magenta-light px-4 py-3 text-sm text-tm-magenta-dark">
          {msg}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              setFilter(cat);
              setSub("board");
            }}
            className={`card border text-left transition hover:border-tm-magenta/40 ${CATEGORY_META[cat].tone}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
              {CATEGORY_META[cat].label}
            </div>
            <div className="mt-1 text-2xl font-bold">{counts[cat] || 0}</div>
          </button>
        ))}
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
            <h3 className="text-base font-semibold">Phase 2 checklist</h3>
            <Check done={!!inventorySignedOff} title="Phase 1 inventory pack signed off" />
            <Check done={dispositions.length > 0} title="Disposition agents analyzed inventory (Analyze)" />
            <Check
              done={dispositions.some((d) => d.override)}
              title="Human overrides reviewed where needed (optional)"
            />
            <Check
              done={retirees.some((d) => d.retirement_state !== "none")}
              title="Retirement workflow started for retire / archive-only objects"
            />
            <Check done={!!benefits} title="Benefits case available (objects not migrated)" />
            <Check
              done={!!project.disposition_approved}
              title="Change Board approved disposition register"
            />
          </div>
          <div className="card space-y-3">
            <h3 className="text-base font-semibold">Decision categories</h3>
            <ul className="space-y-3 text-sm text-tm-gray-600">
              {CATEGORIES.map((cat) => (
                <li key={cat} className={`rounded-lg border px-3 py-2 ${CATEGORY_META[cat].tone}`}>
                  <div className="font-semibold">{CATEGORY_META[cat].label}</div>
                  <div className="mt-0.5 text-xs opacity-90">{CATEGORY_META[cat].blurb}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sub === "board" && (
        <div
          className={
            embedded
              ? "-m-5 flex min-h-[calc(100vh-11rem)] flex-col"
              : "space-y-4"
          }
        >
          {!embedded && (
            <div className="grid gap-3 xl:grid-cols-5">
              {CATEGORIES.map((cat) => {
                const items = filtered.filter((d) => d.final === cat);
                return (
                  <div
                    key={cat}
                    className="rounded-xl border border-tm-gray-200 bg-tm-gray-50 p-2 shadow-card"
                  >
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-wide text-tm-ink">
                        {CATEGORY_META[cat].label}
                      </span>
                      <span className="badge-neutral">{items.length}</span>
                    </div>
                    <ul className="max-h-[200px] space-y-2 overflow-auto">
                      {items.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(d.id);
                              setSub("evidence");
                            }}
                            className="w-full rounded-lg border border-tm-gray-200 bg-white p-2.5 text-left transition hover:border-tm-magenta"
                          >
                            <div className="text-[12px] font-medium leading-snug text-tm-ink">
                              {d.object_fqn}
                            </div>
                            <div className="mt-1 text-[10px] text-tm-gray-500">
                              access {d.evidence?.access_count ?? 0}
                              {d.consolidate_into ? ` → ${d.consolidate_into}` : ""}
                            </div>
                          </button>
                        </li>
                      ))}
                      {!items.length && (
                        <li className="px-1 py-4 text-center text-xs text-tm-gray-400">
                          Empty
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          <div
            className={
              embedded
                ? "flex min-h-0 flex-1 flex-row"
                : "flex min-h-[420px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
            }
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <DataToolbar
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Filter by object…"
                filters={
                  <select
                    className="input !mt-0 !h-9 max-w-[180px] !py-1.5 text-xs"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All dispositions</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_META[c].label}
                      </option>
                    ))}
                  </select>
                }
                countLabel={`${filtered.length} objects`}
                actions={
                  <button
                    type="button"
                    className="btn text-xs"
                    disabled={busy || !inventorySignedOff || !planApproved}
                    onClick={runAnalyze}
                    title={
                      !inventorySignedOff
                        ? "Complete Discovery sign-off first"
                        : !planApproved
                          ? "Approve Plan waves first"
                          : "Run UsageProfiler · LineageImpact · RetentionPolicy · DispositionRecommender"
                    }
                  >
                    {busy
                      ? "Analyzing…"
                      : dispositions.length
                        ? "Re-analyze"
                        : "Analyze"}
                  </button>
                }
              />
              {embedded && dispositions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-b border-brand-line bg-white px-3 py-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setFilter(filter === cat ? "all" : cat)}
                      className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                        filter === cat
                          ? "bg-brand-500/10 text-brand-600"
                          : "text-tm-gray-600 hover:bg-tm-gray-50 hover:text-tm-ink"
                      }`}
                    >
                      {CATEGORY_META[cat].label}{" "}
                      <span className="tabular-nums text-tm-gray-400">
                        {counts[cat] || 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-auto bg-white">
                {!dispositions.length ? (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-2 px-6 text-center">
                    <p className="text-sm font-semibold text-tm-ink">
                      Decide board is empty
                    </p>
                    <p className="max-w-md text-xs leading-relaxed text-tm-gray-500">
                      Use Analyze in the toolbar to score inventory objects by type. You can
                      override any recommendation afterward.
                    </p>
                    {!inventorySignedOff ? (
                      <p className="text-[11px] text-amber-800">
                        Discovery inventory sign-off is required first.
                      </p>
                    ) : null}
                  </div>
                ) : (
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-tm-gray-50">
                    <tr>
                      <th className="table-th px-4">Object</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">Recommended</th>
                      <th className="table-th">Final</th>
                      <th className="table-th">Rationale</th>
                      <th className="table-th px-4">Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => (
                      <tr
                        key={d.id}
                        className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                          selected?.id === d.id ? "bg-tm-magenta-light/60" : ""
                        }`}
                        onClick={() => setSelectedId(d.id)}
                      >
                        <td className="table-td px-4 font-medium text-tm-ink">
                          {d.object_fqn}
                        </td>
                        <td className="table-td">
                          <span className="badge-neutral">
                            {d.object_type || d.evidence?.object_type || "table"}
                          </span>
                        </td>
                        <td className="table-td">
                          <DispBadge value={d.recommendation} />
                        </td>
                        <td className="table-td">
                          <DispBadge value={d.final} />
                        </td>
                        <td className="table-td max-w-xs text-sm text-tm-gray-600">
                          <span className="line-clamp-2">{d.evidence?.rationale}</span>
                        </td>
                        <td
                          className="table-td px-4"
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <select
                            className="input !mt-0 !h-9 !min-w-[8.5rem] !py-1.5 text-xs"
                            disabled={!canOverride || busy}
                            value={
                              (CATEGORIES as readonly string[]).includes(d.final)
                                ? d.final
                                : d.recommendation
                            }
                            title={
                              canOverride
                                ? "Override agent recommendation"
                                : "Requires engineer, architect, product owner, or change board"
                            }
                            onChange={(e) => {
                              e.stopPropagation();
                              const next = e.target.value;
                              if (next && next !== d.final) onOverride(d.id, next);
                            }}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr>
                        <td className="table-td px-4 text-tm-gray-500" colSpan={6}>
                          No objects match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                )}
              </div>
            </div>

            <InspectorPanel
              open={!!selected}
              title={selected?.object_fqn || "Disposition"}
              onClose={() => setSelectedId(null)}
            >
              {selected ? (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <DispBadge value={selected.final} />
                    {selected.override && (
                      <span className="badge-neutral">
                        overridden from {selected.recommendation}
                      </span>
                    )}
                    {selected.approved && (
                      <span className="badge-success">register approved</span>
                    )}
                  </div>
                  <p className="text-xs text-tm-gray-700">{selected.evidence?.rationale}</p>
                  <dl className="grid grid-cols-1 gap-2 text-xs">
                    <Meta label="Access count" value={selected.evidence?.access_count ?? 0} />
                    <Meta
                      label="Last accessed"
                      value={selected.evidence?.last_accessed || "—"}
                    />
                    <Meta
                      label="Consumers"
                      value={(selected.evidence?.consumers || []).join(", ") || "—"}
                    />
                    <Meta
                      label="Dependents"
                      value={(selected.evidence?.dependents || []).join(", ") || "none"}
                    />
                    <Meta
                      label="Retention required"
                      value={selected.evidence?.retention_required ? "Yes" : "No"}
                    />
                    <Meta
                      label="Consolidate into"
                      value={selected.consolidate_into || "—"}
                    />
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-tm-gray-500">Select a row to inspect.</p>
              )}
            </InspectorPanel>
          </div>
        </div>
      )}

      {sub === "evidence" && (
        <div
          className={
            embedded
              ? "-m-5 flex min-h-[calc(100vh-11rem)] flex-row"
              : "flex min-h-[520px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
          }
        >
          <div className="flex min-h-0 w-[280px] shrink-0 flex-col border-r border-brand-line">
            <div className="border-b border-brand-line px-3 py-2.5 text-sm font-semibold">
              Select object
            </div>
            <ul className="min-h-0 flex-1 overflow-auto">
              {dispositions.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`flex w-full items-center justify-between border-b border-tm-gray-50 px-3 py-2.5 text-left text-sm hover:bg-tm-gray-50 ${
                      selected?.id === d.id ? "bg-tm-magenta-light/50" : ""
                    }`}
                  >
                    <span className="truncate font-mono text-xs">{d.object_fqn}</span>
                    <DispBadge value={d.final} />
                  </button>
                </li>
              ))}
              {!dispositions.length && (
                <li className="px-3 py-6 text-xs text-tm-gray-500">
                  Analyze to inspect evidence.
                </li>
              )}
            </ul>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <div className="font-mono text-sm font-semibold text-tm-magenta">
                    {selected.object_fqn}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <DispBadge value={selected.final} />
                    {selected.override && (
                      <span className="badge-neutral">
                        overridden from {selected.recommendation}
                      </span>
                    )}
                    {selected.approved && (
                      <span className="badge-success">register approved</span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-tm-gray-700">{selected.evidence?.rationale}</p>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Meta label="Access count" value={selected.evidence?.access_count ?? 0} />
                  <Meta
                    label="Last accessed"
                    value={selected.evidence?.last_accessed || "—"}
                  />
                  <Meta
                    label="Consumers"
                    value={(selected.evidence?.consumers || []).join(", ") || "—"}
                  />
                  <Meta
                    label="Dependents"
                    value={(selected.evidence?.dependents || []).join(", ") || "none"}
                  />
                  <Meta
                    label="Retention required"
                    value={selected.evidence?.retention_required ? "Yes" : "No"}
                  />
                  <Meta
                    label="Consolidate into"
                    value={selected.consolidate_into || "—"}
                  />
                </dl>
                <div className="rounded-lg bg-tm-gray-50 p-3 text-xs text-tm-gray-600">
                  Evidence is derived from Phase 1 usage logs, lineage dependents, retention
                  flags, and unsound-logic markers (e.g. truncate-reload marts).
                </div>
              </div>
            ) : (
              <p className="text-sm text-tm-gray-500">
                Select an object to inspect evidence.
              </p>
            )}
          </div>
        </div>
      )}

      {sub === "retirement" && (
        <div className="-m-5 flex min-h-[calc(100vh-11rem)] flex-col bg-white">
          <div className="shrink-0 space-y-3 border-b border-brand-line px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-tm-ink">Retirement schedule</h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-tm-gray-500">
                  For retire / archive-only objects: notify consumers → freeze legacy → silence
                  window → archive → decommission. Full close-out continues in Phase 7; here you
                  start and track the schedule before Change Board approval.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn text-xs"
                  disabled={
                    busy ||
                    !retirees.length ||
                    !retirees.some((d) => !d.retirement_state || d.retirement_state === "none")
                  }
                  title="Mark queued candidates as notified"
                  onClick={() => onNotifyConsumers?.()}
                >
                  Notify consumers
                </button>
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={
                    busy ||
                    !retirees.length ||
                    !retirees.some((d) => d.retirement_state === "notified")
                  }
                  title="Freeze notified retirement candidates"
                  onClick={() => onFreezeScope?.()}
                >
                  Freeze scope
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RETIREMENT_STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-md bg-tm-gray-50 px-2.5 py-1 text-[12px] font-medium text-tm-gray-600"
                >
                  <span className="tabular-nums text-tm-gray-400">{i + 1}</span>
                  {s.label}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-tm-gray-500">
              <span>
                Candidates{" "}
                <strong className="tabular-nums text-tm-ink">{retirees.length}</strong>
              </span>
              <span>
                Queued{" "}
                <strong className="tabular-nums text-tm-ink">
                  {
                    retirees.filter(
                      (d) => !d.retirement_state || d.retirement_state === "none"
                    ).length
                  }
                </strong>
              </span>
              <span>
                In progress{" "}
                <strong className="tabular-nums text-tm-ink">
                  {
                    retirees.filter((d) =>
                      ["notified", "frozen", "silence", "archived"].includes(
                        d.retirement_state
                      )
                    ).length
                  }
                </strong>
              </span>
              <span>
                Decommissioned{" "}
                <strong className="tabular-nums text-tm-ink">
                  {
                    retirees.filter((d) => d.retirement_state === "decommissioned")
                      .length
                  }
                </strong>
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {!dispositions.length ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-semibold text-tm-ink">No disposition register yet</p>
                <p className="max-w-md text-xs text-tm-gray-500">
                  Run Analyze on the Board first. Retirement candidates appear when objects are
                  scored retire or archive-only.
                </p>
              </div>
            ) : !retirees.length ? (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-semibold text-tm-ink">No retirement candidates</p>
                <p className="max-w-md text-xs text-tm-gray-500">
                  Nothing is marked retire or archive-only. Override an object on the Board if it
                  should enter this schedule.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-4">Object</th>
                    <th className="table-th">Disposition</th>
                    <th className="table-th">Consumers</th>
                    <th className="table-th">State</th>
                    <th className="table-th">Progress</th>
                    <th className="table-th px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {retirees.map((d) => {
                    const stepIdx = RETIREMENT_STEPS.findIndex(
                      (s) => s.id === d.retirement_state
                    );
                    const stateLabel =
                      !d.retirement_state || d.retirement_state === "none"
                        ? "queued"
                        : d.retirement_state;
                    const consumers = (d.evidence?.consumers || []) as string[];
                    const canAdvance = [
                      "engineer",
                      "architect",
                      "change_board",
                      "data_owner",
                    ].includes(sessionRole);
                    const nextLabel =
                      stepIdx < 0
                        ? "Notify"
                        : stepIdx >= RETIREMENT_STEPS.length - 1
                          ? "Done"
                          : `→ ${RETIREMENT_STEPS[stepIdx + 1].label}`;
                    const nextIsDecommission =
                      RETIREMENT_STEPS[stepIdx + 1]?.id === "decommissioned";
                    const advanceBlocked =
                      busy ||
                      d.retirement_state === "decommissioned" ||
                      !canAdvance ||
                      (nextIsDecommission &&
                        !["data_owner", "change_board"].includes(sessionRole));

                    return (
                      <tr key={d.id} className="hover:bg-tm-magenta-light/40">
                        <td className="table-td px-4 font-medium text-tm-ink">
                          {d.object_fqn}
                        </td>
                        <td className="table-td">
                          <DispBadge value={d.final} />
                        </td>
                        <td className="table-td text-sm text-tm-gray-600">
                          {consumers.length
                            ? consumers.slice(0, 3).join(", ") +
                              (consumers.length > 3 ? ` +${consumers.length - 3}` : "")
                            : "—"}
                        </td>
                        <td className="table-td text-sm capitalize text-tm-ink">
                          {stateLabel}
                        </td>
                        <td className="table-td">
                          <div className="flex gap-1" title={stateLabel}>
                            {RETIREMENT_STEPS.map((s, i) => (
                              <span
                                key={s.id}
                                className={`h-1.5 w-5 rounded-sm ${
                                  i <= stepIdx ? "bg-brand-500" : "bg-tm-gray-200"
                                }`}
                                title={s.label}
                              />
                            ))}
                          </div>
                        </td>
                        <td className="table-td px-4">
                          {d.retirement_state === "decommissioned" ? (
                            <span className="text-xs font-medium text-emerald-700">
                              Complete
                            </span>
                          ) : stepIdx < 0 ? (
                            <span className="text-xs text-tm-gray-500">
                              Use Notify above
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn-ghost text-xs"
                              disabled={advanceBlocked}
                              title={
                                nextIsDecommission &&
                                !["data_owner", "change_board"].includes(sessionRole)
                                  ? "Decommission requires Data Owner or Change Board"
                                  : nextLabel
                              }
                              onClick={() => onAdvanceRetirement(d.id)}
                            >
                              Advance {nextLabel}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {retirees.some((d) => (d.evidence?.consumers || []).length > 0) ? (
            <div className="shrink-0 border-t border-brand-line bg-tm-gray-50/80 px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
                Named consumers on retirement evidence
              </p>
              <p className="mt-1 text-xs text-tm-gray-600">
                {Array.from(
                  new Set(
                    retirees.flatMap((d) => (d.evidence?.consumers || []) as string[])
                  )
                ).join(" · ") || "—"}
              </p>
            </div>
          ) : null}
        </div>
      )}

      {sub === "approve" && (
        <BenefitsDashboard
          benefits={benefits}
          dispositions={dispositions}
          counts={counts}
          retirees={retirees}
          dispositionApproved={!!project.disposition_approved}
        />
      )}
    </div>
  );
}

function BenefitsDashboard({
  benefits,
  dispositions,
  counts,
  retirees,
  dispositionApproved,
}: {
  benefits: any | null;
  dispositions: any[];
  counts: Record<string, number>;
  retirees: any[];
  dispositionApproved: boolean;
}) {
  const total = benefits?.register_size ?? dispositions.length;
  const survivors =
    benefits?.survivors ?? (counts.migrate || 0) + (counts.rebuild || 0);
  const notMigrated =
    benefits?.objects_not_migrated ??
    (counts.retire || 0) + (counts["archive-only"] || 0) + (counts.consolidate || 0);
  const monthly = Number(benefits?.estimated_monthly_infra_saved_usd ?? notMigrated * 85);
  const annual = Number(benefits?.estimated_annual_infra_saved_usd ?? monthly * 12);
  const avoidPct = Number(benefits?.avoid_pct ?? (total ? (notMigrated / total) * 100 : 0));
  const migratePct = Number(benefits?.migrate_pct ?? (total ? (survivors / total) * 100 : 0));
  const mix =
    (benefits?.mix as { disposition: string; count: number; pct: number }[]) ||
    CATEGORIES.filter((c) => counts[c])
      .map((c) => ({
        disposition: c,
        count: counts[c] || 0,
        pct: total ? Math.round(((counts[c] || 0) / total) * 1000) / 10 : 0,
      }));
  const byType = (benefits?.by_object_type || {}) as Record<string, number>;
  const retStates = (benefits?.retirement_states || {}) as Record<string, number>;
  const maxMix = Math.max(1, ...mix.map((m) => m.count));

  const gateNote = dispositionApproved ? (
    <div className="badge-success w-fit text-xs">
      Disposition register approved — use Suite Gallery in the header
    </div>
  ) : (
    <p className="max-w-sm text-xs text-tm-gray-500">
      Use <span className="font-medium text-tm-ink">Approve → Gallery</span> in the
      page header to freeze the register and update the suite journey.
    </p>
  );

  if (!total) {
    return (
      <div className="-m-5 flex min-h-[calc(100vh-11rem)] flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-sm font-semibold text-tm-ink">Benefits case not ready</p>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-tm-gray-500">
          Run Analyze on the Board to score inventory. This gate shows avoidance
          value, disposition mix, and Change Board approval.
        </p>
        <div className="mt-4">{gateNote}</div>
      </div>
    );
  }

  return (
    <div className="-m-5 flex min-h-[calc(100vh-11rem)] flex-col bg-tm-gray-50">
      <div className="shrink-0 border-b border-brand-line bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-tm-ink">
              Benefits &amp; Change Board approval
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-tm-gray-500">
              What we migrate vs avoid, illustrative run-rate savings, retirement
              coverage — then approve the register to unlock Align.
            </p>
          </div>
          {gateNote}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-4">
          {/* KPI strip */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashKpi
              label="Register size"
              value={String(total)}
              hint="Objects with a disposition"
            />
            <DashKpi
              label="Not migrated"
              value={`${notMigrated}`}
              hint={`${avoidPct.toFixed(avoidPct % 1 ? 1 : 0)}% of register · retire / archive / consolidate`}
              tone="good"
            />
            <DashKpi
              label="Survivors"
              value={String(survivors)}
              hint={`${migratePct.toFixed(migratePct % 1 ? 1 : 0)}% migrate / rebuild for Wave-1`}
            />
            <DashKpi
              label="Est. annual avoidance"
              value={`$${annual.toLocaleString()}`}
              hint={`$${monthly.toLocaleString()}/mo · $${benefits?.unit_cost_usd ?? 85}/object illustrative`}
              tone="accent"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Mix chart */}
            <section className="rounded-lg border border-brand-line bg-white p-4 lg:col-span-3">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[12px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  Disposition mix
                </h4>
                <span className="text-[11px] tabular-nums text-tm-gray-400">{total} objects</span>
              </div>
              <div className="mt-4 space-y-3">
                {mix.map((m) => {
                  const meta = CATEGORY_META[m.disposition];
                  const width = Math.max(4, (m.count / maxMix) * 100);
                  return (
                    <div key={m.disposition}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-tm-ink">
                          {meta?.label || m.disposition}
                        </span>
                        <span className="tabular-nums text-tm-gray-600">
                          {m.count}
                          <span className="ml-2 text-[11px] text-tm-gray-400">
                            {m.pct}%
                          </span>
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-sm bg-tm-gray-100">
                        <div
                          className="h-full rounded-sm bg-brand-500/80"
                          style={{ width: `${width}%` }}
                          title={`${m.count} · ${m.pct}%`}
                        />
                      </div>
                      {meta?.blurb ? (
                        <p className="mt-1 text-[11px] leading-snug text-tm-gray-500">
                          {meta.blurb}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Stacked overview bar */}
              <div className="mt-5 border-t border-brand-line pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  Avoid vs migrate
                </p>
                <div className="flex h-3 overflow-hidden rounded-sm bg-tm-gray-100">
                  <div
                    className="bg-emerald-600/80"
                    style={{ width: `${avoidPct}%` }}
                    title={`Not migrated ${avoidPct}%`}
                  />
                  <div
                    className="bg-sky-600/70"
                    style={{ width: `${migratePct}%` }}
                    title={`Survivors ${migratePct}%`}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-tm-gray-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-emerald-600/80" />
                    Avoid migration {avoidPct}%
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-sm bg-sky-600/70" />
                    Survivors {migratePct}%
                  </span>
                </div>
              </div>
            </section>

            {/* Side panels */}
            <div className="flex flex-col gap-4 lg:col-span-2">
              <section className="rounded-lg border border-brand-line bg-white p-4">
                <h4 className="text-[12px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  By object type
                </h4>
                <ul className="mt-3 space-y-2">
                  {Object.entries(byType).length ? (
                    Object.entries(byType)
                      .sort((a, b) => b[1] - a[1])
                      .map(([t, n]) => (
                        <li
                          key={t}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="capitalize text-tm-ink">{t}</span>
                          <span className="tabular-nums font-medium text-tm-gray-700">
                            {n}
                          </span>
                        </li>
                      ))
                  ) : (
                    <li className="text-xs text-tm-gray-500">No type breakdown</li>
                  )}
                </ul>
              </section>

              <section className="rounded-lg border border-brand-line bg-white p-4">
                <h4 className="text-[12px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  Retirement pipeline
                </h4>
                <p className="mt-1 text-[11px] text-tm-gray-500">
                  {retirees.length} retire / archive-only candidates
                </p>
                <ul className="mt-3 space-y-2">
                  {[
                    ["none", "Queued"],
                    ["notified", "Notified"],
                    ["frozen", "Frozen"],
                    ["silence", "Silence"],
                    ["archived", "Archived"],
                    ["decommissioned", "Decommissioned"],
                  ].map(([id, label]) => (
                    <li
                      key={id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-tm-ink">{label}</span>
                      <span className="tabular-nums font-medium text-tm-gray-700">
                        {retStates[id] || 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          {/* Narrative / case */}
          <section className="rounded-lg border border-brand-line bg-white p-4">
            <h4 className="text-[12px] font-semibold uppercase tracking-wide text-tm-gray-500">
              Change Board narrative
            </h4>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-tm-ink">
              {benefits?.narrative ||
                "Cheapest object is the one not migrated — Analyze the register to refresh this case."}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md bg-tm-gray-50 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  Monthly avoidance
                </div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-tm-ink">
                  ${monthly.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md bg-tm-gray-50 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  Annual avoidance
                </div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-tm-ink">
                  ${annual.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md bg-tm-gray-50 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  Unit assumption
                </div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums text-tm-ink">
                  ${benefits?.unit_cost_usd ?? 85}
                  <span className="ml-1 text-xs font-normal text-tm-gray-500">
                    / object / mo
                  </span>
                </div>
              </div>
              <div className="rounded-md bg-tm-gray-50 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  Register status
                </div>
                <div className="mt-0.5 text-sm font-semibold text-tm-ink">
                  {dispositionApproved ? "Approved" : "Pending approval"}
                </div>
                <p className="mt-1 text-[11px] text-tm-gray-500">
                  {survivors} survivors · {retirees.length} retirement candidates
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function DashKpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "accent" | "good";
}) {
  const shell =
    tone === "accent"
      ? "border-brand-500/25 bg-brand-500/[0.04]"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-brand-line bg-white";
  return (
    <div className={`rounded-lg border px-4 py-3 ${shell}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-tm-ink">
        {value}
      </div>
      {hint ? <div className="mt-1 text-[11px] leading-snug text-tm-gray-500">{hint}</div> : null}
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

function Meta({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-tm-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">{label}</div>
      <div className="mt-0.5 break-all font-medium">{String(value)}</div>
    </div>
  );
}

function DispBadge({ value }: { value: string }) {
  const tone =
    CATEGORY_META[value]?.tone || "bg-tm-gray-100 text-tm-gray-700 border-tm-gray-200";
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {CATEGORY_META[value]?.label || value}
    </span>
  );
}
