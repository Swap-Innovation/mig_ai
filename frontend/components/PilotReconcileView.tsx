"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

type Props = {
  project: any;
  product: any | null;
  products: any[];
  pipelineRuns: any[];
  reconcileLatest: any | null;
  reconcilePassed: boolean;
  pilotReady?: boolean;
  busy: boolean;
  embedded?: boolean;
  onSelectProduct?: (productId: number) => void;
  onReconcile: (productId: number | number[]) => void;
};

type Mode = "overview" | "detail";

function PipelineCard({
  title,
  side,
  pipe,
}: {
  title: string;
  side: "legacy" | "migrated";
  pipe: any | null;
}) {
  if (!pipe) {
    return (
      <div className="rounded-xl border border-tm-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-tm-ink">{title}</h4>
        <p className="mt-2 text-xs text-tm-gray-500">
          Run reconciliation to capture {side} pipeline execution.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-tm-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
            {side === "legacy" ? "Legacy pipeline" : "Migrated pipeline"}
          </p>
          <h4 className="text-sm font-semibold text-tm-ink">
            {pipe.label || title}
          </h4>
          <p className="mt-0.5 text-[11px] text-tm-gray-500">{pipe.engine}</p>
        </div>
        <span className="badge-neutral capitalize">{pipe.status || "—"}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-tm-gray-500">Dataset</dt>
          <dd className="font-mono text-[11px]">{pipe.dataset || "—"}</dd>
        </div>
        <div>
          <dt className="text-tm-gray-500">Rows / keys</dt>
          <dd>
            {pipe.row_count ?? "—"} / {pipe.key_count ?? "—"}
          </dd>
        </div>
      </dl>
      {(pipe.sources || []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(pipe.sources || []).map((s: string) => (
            <span key={s} className="badge-neutral !text-[9px]">
              {s}
            </span>
          ))}
        </div>
      )}
      <ol className="mt-3 space-y-1.5">
        {(pipe.stages || []).map((st: any, i: number) => (
          <li
            key={`${st.name}-${i}`}
            className="flex items-start justify-between gap-2 rounded-lg bg-tm-gray-50 px-2.5 py-1.5 text-xs"
          >
            <div>
              <div className="font-semibold capitalize text-tm-ink">{st.name}</div>
              <div className="text-[11px] text-tm-gray-500">{st.detail}</div>
            </div>
            <span className="badge-neutral shrink-0 capitalize">{st.status}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function dedupeProducts(list: any[]): any[] {
  const byName = new Map<string, any>();
  for (const p of list) {
    const key = String(p.name || "").toLowerCase();
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, p);
      continue;
    }
    const rank = (x: any) =>
      String(x.status || "").toLowerCase() === "live"
        ? 3
        : String(x.status || "").toLowerCase() === "approved"
          ? 2
          : 1;
    if (rank(p) > rank(prev) || (rank(p) === rank(prev) && p.id > prev.id)) {
      byName.set(key, p);
    }
  }
  return Array.from(byName.values()).sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

export function PilotReconcileView({
  project,
  product,
  products,
  pipelineRuns,
  reconcileLatest,
  reconcilePassed,
  pilotReady = false,
  busy,
  embedded = false,
  onSelectProduct,
  onReconcile,
}: Props) {
  const [mode, setMode] = useState<Mode>("overview");
  const [history, setHistory] = useState<any[]>([]);
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [overview, setOverview] = useState<any | null>(null);
  const [runIds, setRunIds] = useState<number[]>([]);

  const promotedIds = useMemo(() => {
    const ids = (project?.test_env?.product_ids || []).map(Number).filter(Boolean);
    return ids as number[];
  }, [project?.test_env?.product_ids]);
  const testEnvReady = !!project?.test_env_ready;

  const catalog = useMemo(() => {
    let list = dedupeProducts(products);
    if (promotedIds.length) {
      const set = new Set(promotedIds);
      const promoted = list.filter((p) => set.has(p.id));
      if (promoted.length) list = promoted;
    }
    return list;
  }, [products, promotedIds]);

  const runnable = useMemo(
    () =>
      catalog.filter((p) =>
        ["live", "approved"].includes(String(p.status || "").toLowerCase())
      ),
    [catalog]
  );

  useEffect(() => {
    if (!runnable.length) {
      setRunIds([]);
      return;
    }
    setRunIds((prev) => {
      const valid = new Set(runnable.map((p) => p.id));
      const kept = prev.filter((id) => valid.has(id));
      if (kept.length) return kept;
      if (promotedIds.length) {
        const hit = promotedIds.filter((id) => valid.has(id));
        if (hit.length) return hit;
      }
      return runnable.map((p) => p.id);
    });
  }, [runnable, promotedIds]);

  const refreshOverview = () => {
    if (!project?.id) return;
    void api<any>(`/projects/${project.id}/reconcile/overview`)
      .then((data) => setOverview(data))
      .catch(() => setOverview(null));
  };

  useEffect(() => {
    refreshOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, reconcileLatest?.id, reconcileLatest?.passed, products.length]);

  useEffect(() => {
    if (!project?.id || !product?.id) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    void api<any[]>(`/projects/${project.id}/products/${product.id}/reconcile`)
      .then((rows) => {
        if (!cancelled) setHistory(rows || []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, product?.id, reconcileLatest?.id, reconcileLatest?.passed]);

  // Prefer history for the focused product so detail matches overview click
  const metrics =
    history[0]?.metrics ||
    history[0] ||
    (reconcileLatest?.metrics?.product_id === product?.id ||
    reconcileLatest?.product_id === product?.id
      ? reconcileLatest?.metrics || reconcileLatest
      : null);
  const legacyPipe = metrics?.legacy_pipeline || null;
  const migratedPipe = metrics?.migrated_pipeline || null;
  const checks: any[] = metrics?.checks || [];
  const onlyLegacy = metrics?.keys_only_in_legacy || [];
  const onlyMigrated = metrics?.keys_only_in_migrated || [];

  const trail = useMemo(() => {
    const fromMetrics = metrics?.migrated_run_trail || [];
    if (fromMetrics.length) return fromMetrics;
    return pipelineRuns
      .filter((r) => r.product_id === product?.id && r.stage !== "reconcile")
      .slice(0, 12)
      .map((r) => ({
        id: r.id,
        stage: r.stage,
        status: r.status,
        created_at: r.created_at,
        message: r.detail?.message,
      }));
  }, [metrics, pipelineRuns, product?.id]);

  const summary = overview?.summary || {
    total: catalog.length,
    passed: 0,
    failed: 0,
    pending: catalog.length,
  };
  const overviewRows: any[] = overview?.products || [];

  const allSelected =
    runnable.length > 0 && runIds.length === runnable.length;
  const canBatch =
    testEnvReady &&
    testEnvOrLiveReady(runIds, runnable) &&
    runIds.length > 0;

  const shell = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
    : "space-y-4";

  const runSelected = () => {
    if (!runIds.length) return;
    if (runIds.length === 1) onReconcile(runIds[0]);
    else onReconcile(runIds);
  };

  return (
    <div className={shell}>
      <header
        className={
          embedded
            ? "shrink-0 border-b border-tm-gray-200 px-4 py-3"
            : "card !py-4"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-tm-ink">
              Reconcile · legacy vs migrated
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-tm-gray-600">
              Overview of how each pipeline performed on both sides, plus
              multi-select to reconcile all selected products in one run.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-tm-gray-200 bg-tm-gray-50 p-0.5">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  mode === "overview"
                    ? "bg-tm-magenta text-white"
                    : "text-tm-gray-600"
                }`}
                onClick={() => setMode("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  mode === "detail"
                    ? "bg-tm-magenta text-white"
                    : "text-tm-gray-600"
                }`}
                onClick={() => setMode("detail")}
              >
                Detail
              </button>
            </div>
            <button
              type="button"
              className="btn text-xs"
              disabled={busy || !canBatch}
              title={
                !runIds.length
                  ? "Select at least one live/approved product"
                  : `Reconcile ${runIds.length} pipeline(s)`
              }
              onClick={runSelected}
            >
              {busy
                ? "Running…"
                : runIds.length > 1
                  ? `Reconcile selected (${runIds.length})`
                  : runIds.length === 1
                    ? "Reconcile selected"
                    : "Select pipelines"}
            </button>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <Stat label="Products" value={summary.total} />
          <Stat label="Passed" value={summary.passed} tone="good" />
          <Stat label="Failed" value={summary.failed} tone="bad" />
          <Stat label="Pending" value={summary.pending} />
        </div>
      </header>

      <div
        className={
          embedded ? "min-h-0 flex-1 space-y-4 overflow-auto p-4" : "space-y-4"
        }
      >
        {/* Multi-select runner */}
        <section className="rounded-xl border border-tm-gray-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
              Pipelines to reconcile
            </h4>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-ghost text-[10px]"
                disabled={!runnable.length}
                onClick={() => setRunIds(runnable.map((p) => p.id))}
              >
                Select all runnable
              </button>
              <button
                type="button"
                className="btn-ghost text-[10px]"
                disabled={!runIds.length}
                onClick={() => setRunIds([])}
              >
                Clear
              </button>
              <label className="flex items-center gap-1.5 text-[10px] text-tm-gray-500">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    setRunIds(
                      e.target.checked ? runnable.map((p) => p.id) : []
                    )
                  }
                />
                All runnable ({runnable.length})
              </label>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((p) => {
              const runnableRow = ["live", "approved"].includes(
                String(p.status || "").toLowerCase()
              );
              const checked = runIds.includes(p.id);
              const ov = overviewRows.find((r) => r.product_id === p.id);
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${
                    checked
                      ? "border-tm-magenta/40 bg-tm-magenta-light/40"
                      : "border-tm-gray-200 bg-tm-gray-50"
                  } ${!runnableRow ? "opacity-60" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    disabled={!runnableRow}
                    checked={checked}
                    onChange={() => {
                      if (!runnableRow) return;
                      setRunIds((prev) =>
                        prev.includes(p.id)
                          ? prev.filter((x) => x !== p.id)
                          : [...prev, p.id]
                      );
                      onSelectProduct?.(p.id);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-tm-ink">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-tm-gray-500">
                      {(p.product_tier || "adp").toUpperCase()} · {p.status}
                      {ov?.reconcile_status
                        ? ` · last ${ov.reconcile_status}`
                        : " · not reconciled"}
                    </span>
                  </span>
                </label>
              );
            })}
            {!catalog.length && (
              <p className="text-xs text-tm-gray-500 sm:col-span-3">
                No products yet.
              </p>
            )}
          </div>
        </section>

        {mode === "overview" ? (
          <section className="rounded-xl border border-tm-gray-200 bg-white">
            <div className="border-b border-tm-gray-200 px-4 py-2">
              <h4 className="text-sm font-semibold">
                How legacy and migrated pipelines did
              </h4>
              <p className="text-[11px] text-tm-gray-500">
                One row per product — click to open detail for that pipeline.
              </p>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-tm-gray-50 text-left text-[11px] uppercase tracking-wide text-tm-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Product</th>
                    <th className="px-3 py-2 font-semibold">Verdict</th>
                    <th className="px-3 py-2 font-semibold">Legacy</th>
                    <th className="px-3 py-2 font-semibold">Migrated</th>
                    <th className="px-3 py-2 font-semibold">Δ rows</th>
                    <th className="px-3 py-2 font-semibold">Keys</th>
                    <th className="px-3 py-2 font-semibold">When</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {(overviewRows.length
                    ? overviewRows
                    : catalog.map((p) => ({
                        product_id: p.id,
                        name: p.name,
                        tier: p.product_tier,
                        reconcile_status: "pending",
                      }))
                  ).map((row) => (
                    <tr
                      key={row.product_id}
                      className="cursor-pointer border-t border-tm-gray-100 hover:bg-tm-magenta-light/30"
                      onClick={() => {
                        onSelectProduct?.(row.product_id);
                        setMode("detail");
                      }}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium text-tm-ink">{row.name}</div>
                        <div className="text-[10px] uppercase text-tm-gray-500">
                          {row.tier || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            row.reconcile_status === "passed"
                              ? "badge-success"
                              : row.reconcile_status === "failed"
                                ? "badge-neutral"
                                : "badge-neutral"
                          }
                        >
                          {row.reconcile_status || "pending"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>
                          rows {row.legacy_row_count ?? row.legacy_pipeline?.row_count ?? "—"}
                        </div>
                        <div className="text-tm-gray-500">
                          {row.legacy_pipeline?.status || "—"}
                          {(row.legacy_pipeline?.stages || []).length
                            ? ` · ${row.legacy_pipeline.stages.length} stages`
                            : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>
                          rows{" "}
                          {row.migrated_row_count ??
                            row.migrated_pipeline?.row_count ??
                            "—"}
                        </div>
                        <div className="text-tm-gray-500">
                          {row.migrated_pipeline?.status || "—"}
                          {(row.migrated_pipeline?.stages || []).length
                            ? ` · ${row.migrated_pipeline.stages.length} stages`
                            : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.row_count_delta_pct != null
                          ? `${row.row_count_delta_pct}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.key_set_match == null
                          ? "—"
                          : row.key_set_match
                            ? "match"
                            : "differ"}
                      </td>
                      <td className="px-3 py-2 text-xs text-tm-gray-500">
                        {row.created_at || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-tm-gray-500">
                Detail for{" "}
                <strong className="text-tm-ink">
                  {product?.name || "selected product"}
                </strong>
              </p>
              {catalog.length > 0 && (
                <select
                  className="input !mt-0 max-w-[240px] text-xs"
                  value={product?.id || ""}
                  onChange={(e) => onSelectProduct?.(Number(e.target.value))}
                >
                  {catalog.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.product_tier || "adp").toUpperCase()} · {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <section className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-tm-gray-200 bg-white px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">
                  Verdict
                </div>
                <div
                  className={`mt-1 text-xl font-bold ${
                    metrics
                      ? reconcilePassed
                        ? "text-good"
                        : "text-bad"
                      : "text-tm-gray-400"
                  }`}
                >
                  {metrics ? (reconcilePassed ? "PASSED" : "FAILED") : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-tm-gray-200 bg-white px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">
                  Legacy rows
                </div>
                <div className="mt-1 text-xl font-bold text-tm-ink">
                  {metrics?.legacy_row_count ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-tm-gray-200 bg-white px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">
                  Migrated rows
                </div>
                <div className="mt-1 text-xl font-bold text-tm-ink">
                  {metrics?.product_row_count ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-tm-gray-200 bg-white px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">
                  Δ row count
                </div>
                <div className="mt-1 text-xl font-bold text-tm-ink">
                  {metrics?.row_count_delta_pct != null
                    ? `${metrics.row_count_delta_pct}%`
                    : "—"}
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <PipelineCard title="Legacy" side="legacy" pipe={legacyPipe} />
              <PipelineCard
                title="Migrated"
                side="migrated"
                pipe={migratedPipe}
              />
            </section>

            <section className="rounded-xl border border-tm-gray-200 bg-white">
              <div className="border-b border-tm-gray-200 px-4 py-2">
                <h4 className="text-sm font-semibold">Comparison checks</h4>
              </div>
              <ul className="divide-y divide-tm-gray-100">
                {checks.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-tm-gray-50"
                      onClick={() =>
                        setSelectedCheck((id) => (id === c.id ? null : c.id))
                      }
                    >
                      <div>
                        <div className="font-medium text-tm-ink">{c.label}</div>
                        <div className="text-xs text-tm-gray-500">{c.detail}</div>
                      </div>
                      <span
                        className={c.passed ? "badge-success" : "badge-neutral"}
                      >
                        {c.passed ? "pass" : "fail"}
                      </span>
                    </button>
                    {selectedCheck === c.id && c.id === "key_set" && (
                      <div className="grid gap-3 border-t border-tm-gray-100 bg-tm-gray-50 px-4 py-3 sm:grid-cols-2">
                        <KeyList
                          title={`Only in legacy (${onlyLegacy.length})`}
                          keys={onlyLegacy}
                        />
                        <KeyList
                          title={`Only in migrated (${onlyMigrated.length})`}
                          keys={onlyMigrated}
                        />
                      </div>
                    )}
                  </li>
                ))}
                {!checks.length && (
                  <li className="px-4 py-6 text-sm text-tm-gray-500">
                    No checks yet — run reconciliation for this product.
                  </li>
                )}
              </ul>
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-tm-gray-200 bg-white">
                <div className="border-b border-tm-gray-200 px-4 py-2">
                  <h4 className="text-sm font-semibold">
                    Migrated execution trail
                  </h4>
                </div>
                <ul className="max-h-48 divide-y divide-tm-gray-100 overflow-auto text-sm">
                  {trail.map((r: any) => (
                    <li
                      key={r.id}
                      className="flex justify-between gap-2 px-4 py-2"
                    >
                      <span>
                        <span className="badge-neutral mr-2 capitalize">
                          {r.stage}
                        </span>
                        {r.status}
                      </span>
                      <span className="text-xs text-tm-gray-500">
                        {r.created_at || ""}
                      </span>
                    </li>
                  ))}
                  {!trail.length && (
                    <li className="px-4 py-6 text-tm-gray-500">
                      No migrated runs yet.
                    </li>
                  )}
                </ul>
              </section>
              <section className="rounded-xl border border-tm-gray-200 bg-white">
                <div className="border-b border-tm-gray-200 px-4 py-2">
                  <h4 className="text-sm font-semibold">Reconcile history</h4>
                </div>
                <ul className="max-h-48 divide-y divide-tm-gray-100 overflow-auto text-sm">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="flex justify-between gap-2 px-4 py-2"
                    >
                      <span
                        className={h.passed ? "badge-success" : "badge-neutral"}
                      >
                        {h.passed ? "PASSED" : "FAILED"}
                      </span>
                      <span className="text-xs text-tm-gray-500">
                        {h.created_at || ""}
                      </span>
                    </li>
                  ))}
                  {!history.length && (
                    <li className="px-4 py-6 text-tm-gray-500">
                      No history yet.
                    </li>
                  )}
                </ul>
              </section>
            </div>
          </>
        )}

        {pilotReady && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-good">
            Phase 5 exit criterion met. Continue to Phase 6 for per-product
            cutover when you are ready.
          </div>
        )}
        {!testEnvReady && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">
            Migrate to Test first, then run dual pipeline on the promoted
            products before reconcile. Overview only lists the Test promotion
            set once products are promoted.
          </div>
        )}
      </div>
    </div>
  );
}

function testEnvOrLiveReady(ids: number[], runnable: any[]): boolean {
  if (!ids.length) return false;
  const set = new Set(runnable.map((p) => p.id));
  return ids.every((id) => set.has(id));
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg border border-tm-gray-200 bg-white px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">
        {label}
      </div>
      <div
        className={`mt-0.5 text-lg font-bold ${
          tone === "good"
            ? "text-good"
            : tone === "bad"
              ? "text-bad"
              : "text-tm-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function KeyList({ title, keys }: { title: string; keys: string[] }) {
  return (
    <div>
      <h5 className="text-[10px] font-semibold uppercase text-tm-gray-500">
        {title}
      </h5>
      <ul className="mt-1 max-h-32 overflow-auto font-mono text-[11px] text-tm-gray-700">
        {keys.map((k) => (
          <li key={k}>{k}</li>
        ))}
        {!keys.length && <li className="text-tm-gray-500">None</li>}
      </ul>
    </div>
  );
}
