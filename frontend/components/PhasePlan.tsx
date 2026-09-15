"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EstateScopeTree } from "@/components/workspace/EstateScopeTree";
import { api } from "@/lib/api";
import { expandSelectionByDependencies } from "@/lib/dependencySelection";
import { toolHref } from "@/lib/phases";

type Props = {
  view: string;
  project: any;
  inventory: any[];
  lineage?: { nodes?: any[]; edges?: any[]; stats?: any };
  jobs?: any[];
  busy?: boolean;
  sessionRole?: string;
  onRefreshProject: () => Promise<any>;
  onMsg?: (m: string) => void;
};

const WAVE_COLORS = [
  "#e20074",
  "#007aff",
  "#5856d6",
  "#ff9f0a",
  "#34c759",
  "#af52de",
  "#32ade6",
  "#ff2d55",
];

function invById(inventory: any[]) {
  const m = new Map<number, any>();
  for (const o of inventory) m.set(Number(o.id), o);
  return m;
}

function decorateWave(wave: any, objectIds: number[], byId: Map<number, any>) {
  const ids = [...new Set(objectIds.map(Number).filter((id) => !Number.isNaN(id)))];
  const objs = ids.map((id) => byId.get(id)).filter(Boolean);
  const by_type: Record<string, number> = {};
  for (const o of objs) {
    const t = String(o.object_type || "object");
    by_type[t] = (by_type[t] || 0) + 1;
  }
  return {
    ...wave,
    object_ids: ids,
    object_count: ids.length,
    object_fqns: objs
      .map((o) => o.fully_qualified_name || o.name)
      .filter(Boolean)
      .slice(0, 200),
    by_type,
    complexity_score: ids.length,
  };
}

export function PhasePlan({
  view,
  project,
  inventory,
  lineage,
  jobs,
  busy,
  sessionRole,
  onRefreshProject,
  onMsg,
}: Props) {
  const [planPayload, setPlanPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [expandedWave, setExpandedWave] = useState<string | null>(null);

  const canEdit = ["engineer", "architect", "product_owner", "change_board"].includes(
    sessionRole || ""
  );
  const signed = !!project?.inventory_signed_off;
  const approved = !!project?.plan_approved || !!planPayload?.plan_approved;
  const plan = planPayload?.plan;
  const waves: any[] = plan?.waves || [];
  const active = planPayload?.active_wave;
  const byId = useMemo(() => invById(inventory), [inventory]);

  const load = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const data = await api<any>(`/projects/${project.id}/plan`);
      setPlanPayload(data);
    } catch (e: any) {
      onMsg?.(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [project?.id, onMsg]);

  useEffect(() => {
    void load();
  }, [load]);

  const objectWaveMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of waves) {
      for (const id of w.object_ids || []) m.set(Number(id), String(w.id));
    }
    return m;
  }, [waves]);

  const lockedIds = useMemo(
    () => new Set(objectWaveMap.keys()),
    [objectWaveMap]
  );

  function freeIds(): number[] {
    return inventory
      .map((o) => Number(o.id))
      .filter((id) => !lockedIds.has(id));
  }

  function nextWaveId(existing: any[]): string {
    let n = existing.length + 1;
    const used = new Set(existing.map((w) => String(w.id)));
    while (used.has(`wave-${n}`)) n += 1;
    return `wave-${n}`;
  }

  function toggleIds(
    ids: number[],
    mode: "select" | "deselect" | "toggle" = "toggle"
  ) {
    if (approved || !canEdit) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (lockedIds.has(id)) {
          next.delete(id);
          continue;
        }
        if (mode === "select") next.add(id);
        else if (mode === "deselect") next.delete(id);
        else if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function selectEntireEstate() {
    if (approved || !canEdit) return;
    setSelected(new Set(freeIds()));
  }

  function clearSelection() {
    if (approved || !canEdit) return;
    setSelected(new Set());
  }

  function expandByDependencies() {
    if (approved || !canEdit) return;
    if (!selected.size) {
      onMsg?.(
        "Select a seed table, script, or pipeline first — then grow by dependencies."
      );
      return;
    }
    const { ids, added, edgeCount } = expandSelectionByDependencies(
      selected,
      inventory,
      lineage,
      jobs,
      "both"
    );
    if (!edgeCount) {
      onMsg?.(
        "No lineage edges available — run Discover profiling/lineage, then retry."
      );
      return;
    }
    const free = ids.filter((id) => !lockedIds.has(id));
    const newly = free.filter((id) => !selected.has(id)).length;
    if (!added && !newly) {
      onMsg?.("No additional free linked dependencies for the current selection.");
      return;
    }
    setSelected(new Set(free));
    onMsg?.(
      `Grew selection by ${newly || added} linked objects · ${free.length} total (assigned stay locked).`
    );
  }

  async function autoSuggestWaves() {
    if (approved || !canEdit) return;
    const free = freeIds();
    if (!free.length) {
      onMsg?.("All objects are already in waves.");
      return;
    }
    try {
      // Omit target_wave_count — backend picks wave count from estate size + clusters
      const body: any = {};
      if (lockedIds.size > 0) body.object_ids = free;

      const data = await api<any>(`/projects/${project.id}/plan/recommend`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const suggested: any[] = data?.plan?.waves || [];
      if (waves.length && lockedIds.size > 0) {
        const used = new Set(waves.map((w) => String(w.id)));
        const appended = suggested.map((w, i) => {
          let order = waves.length + i + 1;
          let id = `wave-${order}`;
          while (used.has(id)) {
            order += 1;
            id = `wave-${order}`;
          }
          used.add(id);
          return {
            ...w,
            id,
            order,
            name: String(w.name || `Wave ${order}`).replace(
              /Wave\s+\d+/i,
              `Wave ${order}`
            ),
            status: "planned" as const,
          };
        });
        await persistWaves(
          [...waves, ...appended],
          `Auto-suggested ${appended.length} wave(s) from remaining objects (deps + complexity).`
        );
        onMsg?.(
          `Added ${appended.length} suggested wave(s) for ${free.length} remaining objects.`
        );
      } else {
        setPlanPayload(data);
        await onRefreshProject();
        onMsg?.(
          `Mirage suggested ${suggested.length} wave(s) from lineage dependencies and complexity.`
        );
      }
      setSelected(new Set());
    } catch (e: any) {
      onMsg?.(e.message || String(e));
    }
  }

  async function createWaveFromSelection() {
    if (approved || !canEdit) return;
    const ids = [...selected].filter((id) => !lockedIds.has(id));
    if (!ids.length) {
      onMsg?.("Select free objects in the tree, then create a wave.");
      return;
    }
    try {
      const order = waves.length + 1;
      const id = nextWaveId(waves);
      const shell = {
        id,
        name: `Wave ${order}`,
        order,
        status: waves.length === 0 ? "active" : "planned",
        object_ids: [] as number[],
        object_fqns: [] as string[],
        object_count: 0,
        by_type: {} as Record<string, number>,
        recommendation_factors: {},
        complexity_score: 0,
        rationale: `Manual wave from ${ids.length} selected object(s).`,
        notes: "",
      };
      const wave = decorateWave(shell, ids, byId);
      const nextWaves = [...waves, wave];
      await persistWaves(
        nextWaves,
        `Manual plan — ${nextWaves.length} wave(s); ${Math.max(0, inventory.length - nextWaves.reduce((n, w) => n + (w.object_ids || []).length, 0))} still free.`
      );
      setSelected(new Set());
      const remaining = Math.max(0, inventory.length - lockedIds.size - ids.length);
      onMsg?.(
        remaining
          ? `Created ${wave.name} with ${ids.length} objects — they are now inactive. Select the next set (${remaining} free).`
          : `Created ${wave.name} with ${ids.length} objects. Estate fully assigned — review and approve.`
      );
    } catch (e: any) {
      onMsg?.(e.message || String(e));
    }
  }

  async function resetWaves() {
    if (approved || !canEdit) return;
    try {
      await persistWaves([], "Wave plan cleared — select objects or auto-suggest.");
      setSelected(new Set());
      onMsg?.("Waves cleared. Assigned objects are selectable again.");
    } catch (e: any) {
      onMsg?.(e.message || String(e));
    }
  }

  async function persistWaves(
    nextWaves: any[],
    narrative?: string,
    activeWaveId?: string
  ) {
    const assigned = new Set(nextWaves.flatMap((w) => w.object_ids || []));
    const data = await api<any>(`/projects/${project.id}/plan`, {
      method: "PUT",
      body: JSON.stringify({
        plan: {
          ...(plan || {}),
          waves: nextWaves,
          unassigned_object_ids: inventory
            .map((o) => Number(o.id))
            .filter((id) => !assigned.has(id)),
          active_wave_id:
            activeWaveId ||
            plan?.active_wave_id ||
            nextWaves.find((w) => w.status === "active")?.id ||
            nextWaves[0]?.id ||
            "",
          narrative:
            narrative ||
            plan?.narrative ||
            "Plan updated from folder selection.",
        },
      }),
    });
    setPlanPayload(data);
    await onRefreshProject();
    return data;
  }

  async function activate(waveId: string) {
    try {
      const data = await api<any>(
        `/projects/${project.id}/plan/waves/${waveId}/activate`,
        { method: "POST" }
      );
      setPlanPayload(data);
      await onRefreshProject();
      onMsg?.(`Activated ${waveId} — delivery gates reset for this wave`);
    } catch (e: any) {
      onMsg?.(e.message || String(e));
    }
  }

  if (!signed) {
    return (
      <div className="p-5 text-sm text-brand-muted">
        Sign off Discover first — Plan splits the signed inventory into waves.
      </div>
    );
  }

  if (loading && !planPayload) {
    return (
      <div className="p-5 text-sm text-brand-muted">Loading wave plan…</div>
    );
  }

  /* ——— Overview: folder tree + wave build ——— */
  if (view === "overview") {
    const assignedCount = objectWaveMap.size;
    const unassignedCount = Math.max(0, inventory.length - assignedCount);
    const nextWaveNum = waves.length + 1;
    const complete = unassignedCount === 0 && waves.length > 0;
    const progressPct = inventory.length
      ? Math.round((assignedCount / inventory.length) * 100)
      : 0;

    return (
      <div className="horizon-plan flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="horizon-plan-tree relative flex min-h-[240px] min-w-0 flex-1 flex-col overflow-hidden bg-white lg:min-h-0">
          <EstateScopeTree
            inventory={inventory}
            selected={selected}
            disabled={!canEdit || approved || !!busy}
            lockedIds={lockedIds}
            query={q}
            objectWaveMap={objectWaveMap}
            waveColors={WAVE_COLORS}
            waves={waves}
            onToggleIds={toggleIds}
            filterSlot={
              <div className="horizon-plan-filter">
                <input
                  className="input !mt-0 w-full !py-1.5 text-xs"
                  placeholder="Filter folders & files…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn-ghost text-[11px]"
                    disabled={!canEdit || approved || !unassignedCount}
                    onClick={selectEntireEstate}
                  >
                    All free
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-[11px]"
                    disabled={!canEdit || approved || !selected.size}
                    onClick={clearSelection}
                  >
                    Clear
                  </button>
                </div>
              </div>
            }
          />
        </div>

        <aside className="horizon-plan-panel flex w-full shrink-0 flex-col overflow-hidden lg:w-[360px]">
          <header className="horizon-plan-panel-head shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="suite-theme-kicker">Horizon · Plan</p>
                <h2 className="text-[15px] font-semibold tracking-tight text-[#1d1d1f]">
                  {complete ? "Ready to approve" : "Build delivery waves"}
                </h2>
              </div>
              <span className="horizon-plan-progress tabular-nums" title="Assigned">
                {progressPct}%
              </span>
            </div>
            <div className="horizon-plan-meter" aria-hidden>
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <div className="horizon-plan-stats">
              <div>
                <strong className="tabular-nums">{selected.size}</strong>
                <span>selected</span>
              </div>
              <div>
                <strong className="tabular-nums">{assignedCount}</strong>
                <span>in waves</span>
              </div>
              <div>
                <strong className="tabular-nums">{unassignedCount}</strong>
                <span>free</span>
              </div>
            </div>
          </header>

          <div className="horizon-plan-panel-body min-h-0 flex-1 overflow-y-auto">
            <section className="horizon-plan-block">
              <div className="horizon-plan-block-head">
                <h3>Auto-suggest</h3>
              </div>
              <p>
                Mirage chooses wave count from lineage clusters and complexity
                (usage, consumers, volume, retention).
              </p>
              <button
                type="button"
                className="btn w-full text-xs"
                disabled={busy || !canEdit || approved || !unassignedCount}
                onClick={() => void autoSuggestWaves()}
              >
                {assignedCount
                  ? `Suggest remaining · ${unassignedCount}`
                  : "Suggest waves"}
              </button>
            </section>

            <section className="horizon-plan-block">
              <div className="horizon-plan-block-head">
                <h3>Manual · Wave {nextWaveNum}</h3>
              </div>
              <p>
                Select free objects → optionally grow linked deps → create wave
                → they lock → repeat until done.
              </p>
              <button
                type="button"
                className="btn-secondary w-full text-[11px]"
                disabled={busy || !canEdit || approved || !selected.size}
                onClick={expandByDependencies}
                title="Add upstream and downstream linked objects to the selection"
              >
                Include linked dependencies
              </button>
            </section>

            <section className="horizon-plan-waves">
              <div className="horizon-plan-block-head">
                <h3>Waves</h3>
                {waves.length ? (
                  <button
                    type="button"
                    className="btn-ghost text-[11px]"
                    disabled={busy || !canEdit || approved}
                    onClick={() => void resetWaves()}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {waves.length ? (
                <ul className="horizon-plan-wave-list">
                  {waves.map((w, i) => (
                    <li key={w.id}>
                      <span
                        className="horizon-plan-wave-dot"
                        style={{
                          background: WAVE_COLORS[i % WAVE_COLORS.length],
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {w.name || `Wave ${i + 1}`}
                      </span>
                      <span className="tabular-nums text-[#86868b]">
                        {(w.object_ids || []).length}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="horizon-plan-empty">
                  No waves yet — suggest or create from a selection.
                </p>
              )}
            </section>
          </div>

          <footer className="horizon-plan-panel-foot shrink-0">
            {complete ? (
              <p className="horizon-plan-empty text-center">
                Estate fully assigned — use{" "}
                <span className="font-medium text-[#1d1d1f]">Review &amp; approve</span>{" "}
                in the header.
              </p>
            ) : (
              <button
                type="button"
                className="btn w-full text-xs"
                disabled={
                  busy || !canEdit || approved || !selected.size || complete
                }
                onClick={() => void createWaveFromSelection()}
              >
                Create Wave {nextWaveNum}
                {selected.size ? ` · ${selected.size} objects` : ""}
              </button>
            )}
          </footer>
        </aside>
      </div>
    );
  }

  /* ——— Approve: theme-aligned wave-wise review ——— */
  if (view === "approve" || view === "waves") {
    const assignedCount = objectWaveMap.size;
    const unassignedCount = Math.max(0, inventory.length - assignedCount);
    const progressPct = inventory.length
      ? Math.round((assignedCount / inventory.length) * 100)
      : 0;

    return (
      <div className="horizon-approve flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="horizon-approve-head shrink-0">
          <div className="horizon-approve-head-inner">
            <div className="min-w-0 flex-1">
              <p className="suite-theme-kicker">Horizon · Gate</p>
              <h2 className="horizon-approve-title">
                {approved ? "Plan approved" : "Wave plan review"}
              </h2>
              <p className="horizon-approve-copy">
                {plan?.narrative ||
                  "Wave-wise scope from Overview. Expand a wave to inspect objects, then approve."}
              </p>
            </div>
            <div className="horizon-approve-head-actions">
              <span className="horizon-plan-progress tabular-nums" title="Assigned">
                {progressPct}%
              </span>
            </div>
          </div>
          <div className="horizon-plan-meter" aria-hidden>
            <span style={{ width: `${progressPct}%` }} />
          </div>
          <div className="horizon-plan-stats horizon-approve-stats">
            <div>
              <strong className="tabular-nums">{waves.length}</strong>
              <span>waves</span>
            </div>
            <div>
              <strong className="tabular-nums">{assignedCount}</strong>
              <span>assigned</span>
            </div>
            <div>
              <strong className="tabular-nums">{unassignedCount}</strong>
              <span>free</span>
            </div>
          </div>
        </header>

        <div className="horizon-approve-body min-h-0 flex-1 overflow-y-auto">
          {!waves.length ? (
            <div className="horizon-approve-empty">
              <p>No waves yet.</p>
              <a href={toolHref("horizon", "overview")} className="btn text-xs">
                Build on Overview
              </a>
            </div>
          ) : (
            <>
              <section className="horizon-approve-spine" aria-label="Wave overview">
                {waves.map((w, wi) => {
                  const count = (w.object_ids || []).length;
                  const isActive = active?.id === w.id || w.status === "active";
                  const selectedHere = expandedWave === w.id || (!expandedWave && wi === 0);
                  return (
                    <button
                      key={`spine-${w.id}`}
                      type="button"
                      className={`horizon-approve-spine-item ${
                        selectedHere ? "is-selected" : ""
                      } ${isActive ? "is-active" : ""}`}
                      onClick={() => setExpandedWave(w.id)}
                    >
                      <span
                        className="horizon-approve-spine-dot"
                        style={{
                          background: WAVE_COLORS[wi % WAVE_COLORS.length],
                        }}
                      />
                      <span className="horizon-approve-spine-name">
                        {w.name || `Wave ${wi + 1}`}
                      </span>
                      <span className="tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </section>

              <div className="horizon-approve-cards">
                {waves.map((w, wi) => {
                  const open =
                    expandedWave === w.id || (!expandedWave && wi === 0);
                  const objs = (w.object_ids || [])
                    .map((id: number) => byId.get(Number(id)))
                    .filter(Boolean);
                  const isActive =
                    active?.id === w.id || w.status === "active";
                  const factors = w.recommendation_factors || {};
                  const byType = w.by_type || {};
                  return (
                    <article
                      key={w.id}
                      className={`horizon-approve-card ${
                        open ? "is-open" : ""
                      } ${isActive ? "is-active" : ""}`}
                    >
                      <button
                        type="button"
                        className="horizon-approve-card-head"
                        onClick={() =>
                          setExpandedWave(
                            open && expandedWave === w.id ? null : w.id
                          )
                        }
                      >
                        <span
                          className="horizon-approve-card-bar"
                          style={{
                            background: WAVE_COLORS[wi % WAVE_COLORS.length],
                          }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="horizon-approve-card-title-row">
                            <h3>{w.name || `Wave ${wi + 1}`}</h3>
                            <span
                              className={
                                isActive ? "badge-magenta" : "badge-neutral"
                              }
                            >
                              {w.status}
                            </span>
                            <span className="horizon-approve-card-meta tabular-nums">
                              {w.object_count ?? objs.length} objects
                              {w.complexity_score != null
                                ? ` · ${w.complexity_score}`
                                : ""}
                            </span>
                          </div>
                          {w.rationale ? (
                            <p className="horizon-approve-card-rationale">
                              {w.rationale}
                            </p>
                          ) : null}
                          {Object.keys(byType).length ? (
                            <div className="horizon-approve-types">
                              {Object.entries(byType).map(([t, n]) => (
                                <span key={t}>
                                  {t} <strong>{String(n)}</strong>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {approved &&
                        w.status !== "complete" &&
                        !isActive ? (
                          <button
                            type="button"
                            className="btn-secondary shrink-0 text-[11px]"
                            disabled={busy || !canEdit}
                            onClick={(e) => {
                              e.stopPropagation();
                              void activate(w.id);
                            }}
                          >
                            Activate
                          </button>
                        ) : null}
                        <span className="horizon-approve-chevron" aria-hidden>
                          {open ? "▴" : "▾"}
                        </span>
                      </button>

                      {open ? (
                        <div className="horizon-approve-card-body">
                          {Object.keys(factors).length ? (
                            <div className="horizon-approve-factors">
                              {Object.entries(factors).map(([k, v]) => (
                                <span key={k}>
                                  {k.replace(/_/g, " ")}{" "}
                                  <em>{Math.round(Number(v) * 100)}%</em>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <ul className="horizon-approve-objects">
                            {objs.map((o: any) => (
                              <li key={o.id}>
                                <span className="truncate">
                                  {o.fully_qualified_name || o.name}
                                </span>
                                <span className="horizon-approve-obj-type">
                                  {o.object_type}
                                </span>
                              </li>
                            ))}
                            {!objs.length ? (
                              <li className="is-empty">
                                No objects resolved for this wave.
                              </li>
                            ) : null}
                          </ul>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <footer className="horizon-approve-foot shrink-0">
          <a
            href={toolHref("horizon", "overview")}
            className="horizon-plan-link"
          >
            ← Back to Overview
          </a>
          {approved ? <span className="badge-success">Approved</span> : null}
        </footer>
      </div>
    );
  }

  return null;
}
