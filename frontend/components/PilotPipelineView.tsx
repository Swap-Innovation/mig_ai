"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { phaseHref } from "@/lib/phases";

type Props = {
  project: any;
  product: any | null;
  products: any[];
  pipelineRuns: any[];
  busy: boolean;
  embedded?: boolean;
  reconcilePassed?: boolean;
  testEnvReady?: boolean;
  onSelectProduct?: (productId: number) => void;
  onPipeline: (productId: number | number[]) => void;
  onReconcile?: (productId: number | number[]) => void;
};

type Blueprint = {
  product_tier?: string;
  tier_label?: string;
  title?: string;
  subtitle?: string;
  nodes?: any[];
  edges?: any[];
  focus?: any;
  policies?: any;
  transform?: any;
  dataset_name?: string;
  system_of_record?: string;
  product_name?: string;
  pipeline_status?: string;
  product_status?: string;
};

function statusClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "succeeded") return "badge-magenta";
  if (s === "ready") return "badge-neutral";
  return "badge-neutral";
}

function nodeStyle(node: any, selected: boolean): string {
  const s = String(node.status || "").toLowerCase();
  const isTransform = node.kind === "transform";
  if (selected) return "border-tm-magenta bg-tm-magenta text-white";
  if (node.focus)
    return "border-tm-magenta/60 bg-tm-magenta-light text-tm-magenta-dark ring-1 ring-tm-magenta/30";
  if (isTransform)
    return "border-dashed border-tm-gray-300 bg-white text-tm-gray-600";
  if (s === "success" || s === "succeeded")
    return "border-tm-gray-300 bg-white text-tm-ink";
  return "border-tm-gray-200 bg-tm-gray-50 text-tm-gray-500";
}

export function PilotPipelineView({
  project,
  product,
  products,
  pipelineRuns,
  busy,
  embedded = false,
  reconcilePassed = false,
  testEnvReady = false,
  onSelectProduct,
  onPipeline,
  onReconcile,
}: Props) {
  const router = useRouter();
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [selectedId, setSelectedId] = useState<string>("focus");
  const [loadErr, setLoadErr] = useState("");
  const [showPolicies, setShowPolicies] = useState(true);
  const [runIds, setRunIds] = useState<number[]>([]);

  const promotedIds = useMemo(() => {
    const ids = (project?.test_env?.product_ids || []).map(Number).filter(Boolean);
    return ids as number[];
  }, [project?.test_env?.product_ids]);

  const sdpProducts = useMemo(() => {
    const list = products
      .filter((p) => String(p.product_tier || "").toLowerCase() === "sdp")
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    // Dedupe by name — keep preferred live/approved, else highest id
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
    let out = Array.from(byName.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );
    // Prefer Test-promoted SDPs when available
    if (promotedIds.length) {
      const set = new Set(promotedIds);
      const promoted = out.filter((p) => set.has(p.id));
      if (promoted.length) out = promoted;
    }
    return out;
  }, [products, promotedIds]);

  // Default selection: promoted Test set, else all listed SDPs
  useEffect(() => {
    if (!sdpProducts.length) {
      setRunIds([]);
      return;
    }
    setRunIds((prev) => {
      const valid = new Set(sdpProducts.map((p) => p.id));
      const kept = prev.filter((id) => valid.has(id));
      if (kept.length) return kept;
      if (promotedIds.length) {
        const hit = promotedIds.filter((id) => valid.has(id));
        if (hit.length) return hit;
      }
      return sdpProducts.map((p) => p.id);
    });
  }, [sdpProducts, promotedIds]);

  const focusProduct = useMemo(() => {
    if (
      product &&
      String(product.product_tier || "").toLowerCase() === "sdp" &&
      sdpProducts.some((p) => p.id === product.id)
    ) {
      return product;
    }
    const fromRun = sdpProducts.find((p) => runIds.includes(p.id));
    return fromRun || sdpProducts[0] || null;
  }, [product, sdpProducts, runIds]);

  const toggleRunId = (id: number) => {
    setRunIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      return next;
    });
    onSelectProduct?.(id);
  };

  const selectAll = () => setRunIds(sdpProducts.map((p) => p.id));
  const clearAll = () => setRunIds([]);

  const allSelected =
    sdpProducts.length > 0 && runIds.length === sdpProducts.length;

  useEffect(() => {
    if (
      focusProduct &&
      onSelectProduct &&
      (!product || String(product.product_tier || "").toLowerCase() !== "sdp")
    ) {
      onSelectProduct(focusProduct.id);
    }
  }, [focusProduct?.id, product?.product_tier, onSelectProduct]);

  useEffect(() => {
    if (!project?.id || !focusProduct?.id) {
      setBlueprint(null);
      return;
    }
    let cancelled = false;
    void api<Blueprint>(
      `/projects/${project.id}/products/${focusProduct.id}/pipeline/blueprint`
    )
      .then((bp) => {
        if (!cancelled) {
          setBlueprint(bp);
          setSelectedId("focus");
          setLoadErr("");
        }
      })
      .catch((e: any) => {
        if (!cancelled) setLoadErr(e?.message || "Failed to load blueprint");
      });
    return () => {
      cancelled = true;
    };
  }, [
    project?.id,
    focusProduct?.id,
    focusProduct?.pipeline_status,
    pipelineRuns.length,
  ]);

  const nodes = blueprint?.nodes || [];
  const selected =
    nodes.find((n) => n.id === selectedId) ||
    nodes.find((n) => n.focus) ||
    nodes[0];
  const policies = blueprint?.policies || {};

  const materializeRuns = useMemo(
    () =>
      pipelineRuns.filter((r) =>
        [
          "materialize",
          "product",
          "sdp",
          "transform",
          "ingest",
          "landing",
          "governance",
        ].includes(String(r.stage || "").toLowerCase())
      ),
    [pipelineRuns]
  );

  const canRun = runIds.length > 0 && testEnvReady;

  const createdCount = sdpProducts.filter((p) =>
    ["live", "approved"].includes(String(p.status || "").toLowerCase())
  ).length;

  const dualChecks = [
    {
      label: "SDP live on target",
      done: focusProduct?.status === "live",
    },
    {
      label: "SDP pipeline success",
      done: focusProduct?.pipeline_status === "success",
    },
    {
      label: "Latest reconcile within tolerance",
      done: reconcilePassed,
    },
    {
      label: "Ready for dual-run evidence",
      done: !!focusProduct && focusProduct.status === "live",
    },
  ];

  const shell = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
    : "space-y-4";

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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-tm-ink">
                {blueprint?.title ||
                  (focusProduct
                    ? `Run dual pipeline · ${focusProduct.name}`
                    : "Run dual pipeline")}
              </h3>
              <span className="badge-magenta">Dual-run</span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-tm-gray-600">
              Multi-select SDPs (or select all) and run{" "}
              <strong>legacy + migrated</strong> dual pipelines on Test in one
              go. Promote to Test first, then run here, then Reconcile.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setShowPolicies((v) => !v)}
            >
              {showPolicies ? "Hide policies" : "Show policies"}
            </button>
            <button
              type="button"
              className="btn text-xs"
              disabled={busy || !canRun}
              title={
                !testEnvReady
                  ? "Migrate to Test environment first"
                  : runIds.length === 0
                    ? "Select at least one SDP pipeline"
                    : `Run dual pipeline for ${runIds.length} SDP(s)`
              }
              onClick={() => {
                if (!runIds.length) return;
                if (runIds.length === 1) onPipeline(runIds[0]);
                else onPipeline(runIds);
              }}
            >
              {!testEnvReady
                ? "Migrate to Test first"
                : runIds.length === 0
                  ? "Select pipelines"
                  : runIds.length === 1
                    ? "Run dual pipeline"
                    : `Run dual pipeline (${runIds.length})`}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-tm-gray-500">
          {runIds.length}/{sdpProducts.length} pipelines selected ·{" "}
          {createdCount}/{sdpProducts.length} live/approved
          {focusProduct ? (
            <>
              {" · "}inspecting{" "}
              <strong className="text-tm-ink">{focusProduct.name}</strong>
              {" · "}
              <code>{blueprint?.dataset_name || focusProduct.dataset_name}</code>
            </>
          ) : null}
        </p>
        {loadErr && <p className="mt-2 text-xs text-warn">{loadErr}</p>}
        {!testEnvReady && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn">
            <span>
              Dual pipeline is gated until products are promoted to the Test
              environment.
            </span>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() =>
                router.push(phaseHref("5_pilot_product", "test_env"))
              }
            >
              Open Migrate to Test
            </button>
          </div>
        )}
      </header>

      <div
        className={
          embedded ? "min-h-0 flex-1 space-y-4 overflow-auto p-4" : "space-y-4"
        }
      >
        {/* Multi-select SDP pipelines */}
        <section className="rounded-xl border border-tm-gray-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
              Pipelines to run
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-ghost text-[10px]"
                disabled={!sdpProducts.length}
                onClick={selectAll}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn-ghost text-[10px]"
                disabled={!runIds.length}
                onClick={clearAll}
              >
                Clear
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-tm-gray-500">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) =>
                    e.target.checked ? selectAll() : clearAll()
                  }
                />
                All ({sdpProducts.length})
              </label>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sdpProducts.map((p) => {
              const checked = runIds.includes(p.id);
              const inspecting = focusProduct?.id === p.id;
              const done = ["live", "approved"].includes(
                String(p.status || "").toLowerCase()
              );
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                    checked
                      ? "border-tm-magenta/40 bg-tm-magenta-light/40"
                      : "border-tm-gray-200 bg-tm-gray-50"
                  } ${inspecting ? "ring-1 ring-tm-magenta/40" : ""}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={() => toggleRunId(p.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-tm-ink">
                      {p.name}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-tm-gray-500">
                      {p.dataset_name}
                    </span>
                    <span className="mt-1 block text-[10px] text-tm-gray-500">
                      {done ? "live/approved" : p.status}
                      {inspecting ? " · inspecting" : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn-ghost shrink-0 !px-1.5 text-[10px]"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectProduct?.(p.id);
                    }}
                  >
                    View
                  </button>
                </label>
              );
            })}
            {!sdpProducts.length && (
              <p className="text-xs text-tm-gray-500 sm:col-span-2 lg:col-span-3">
                No SDPs yet — refresh products to seed the Wave-1 SDP catalog.
              </p>
            )}
          </div>
        </section>

        {/* SDP flow */}
        <section className="rounded-xl border border-tm-gray-200 bg-tm-gray-50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
              Dual pipeline flow
            </h4>
            <p className="text-[10px] text-tm-gray-500">
              Sources → ingest → landing → transform → SDP on Test · policies on
              the side
            </p>
          </div>
          {!focusProduct ? (
            <p className="text-sm text-tm-gray-500">
              Select an SDP from the backlog to see its create pipeline.
            </p>
          ) : (
            <div className="flex flex-wrap items-stretch gap-2">
              {nodes.map((n, i) => (
                <div key={n.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(n.id)}
                    className={`min-w-[100px] max-w-[160px] rounded-lg border px-2.5 py-2 text-left transition ${nodeStyle(
                      n,
                      selectedId === n.id
                    )}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">
                        {n.focus
                          ? "SDP"
                          : n.kind === "transform"
                            ? "XFORM"
                            : n.kind === "source"
                              ? "SRC"
                              : n.kind === "motion"
                                ? "INGEST"
                                : n.kind === "zone"
                                  ? "LAND"
                                  : n.kind}
                      </span>
                      {n.focus ? (
                        <span className="text-[9px] opacity-80">focus</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold leading-snug">
                      {n.label}
                    </div>
                    <div className="mt-0.5 text-[9px] capitalize opacity-70">
                      {n.status || "pending"}
                    </div>
                  </button>
                  {i < nodes.length - 1 && (
                    <span
                      className="shrink-0 text-[10px] font-medium text-tm-gray-400"
                      aria-hidden
                    >
                      {nodes[i + 1]?.kind === "transform" ||
                      n.kind === "transform"
                        ? "⋯"
                        : "→"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Node detail */}
          <section className="card space-y-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-tm-ink">
                {selected?.label || "Node"}
              </h4>
              <span className={`${statusClass(selected?.status)} capitalize`}>
                {selected?.status || "—"}
              </span>
            </div>
            {selected?.dataset && (
              <p className="font-mono text-[11px] text-tm-gray-500">
                {selected.dataset}
              </p>
            )}
            {selected?.grain && (
              <p className="text-xs text-tm-gray-600">Grain: {selected.grain}</p>
            )}
            {selected?.pattern && (
              <p className="font-mono text-[11px] text-tm-gray-600">
                {selected.pattern}
              </p>
            )}
            {selected?.blurb && (
              <p className="text-xs text-tm-gray-600">{selected.blurb}</p>
            )}
            {selected?.tool && (
              <p className="text-xs text-tm-gray-600">Tool: {selected.tool}</p>
            )}
            {(selected?.files || []).length > 0 && (
              <ul className="space-y-1">
                {selected.files.map((f: string) => (
                  <li key={f}>
                    <code className="text-[11px] text-tm-gray-700">{f}</code>
                  </li>
                ))}
              </ul>
            )}
            {(selected?.sid_entities || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.sid_entities.map((e: string) => (
                  <span key={e} className="badge-magenta !text-[9px]">
                    {e}
                  </span>
                ))}
              </div>
            )}
            {(selected?.consumers || []).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.consumers.map((c: string) => (
                  <span key={c} className="badge-neutral !text-[9px]">
                    {c}
                  </span>
                ))}
              </div>
            )}
            {(selected?.interfaces || []).length > 0 && (
              <p className="font-mono text-[10px] text-tm-gray-500">
                {selected.interfaces.join(" · ")}
              </p>
            )}
            {selected?.kind === "transform" && (
              <p className="text-xs text-tm-gray-500">
                Transforms sit between data products (or landing → SDP). They are
                motion, not products.
              </p>
            )}
          </section>

          {/* Policies rail — not in the flow */}
          {showPolicies && (
            <section className="card space-y-3 lg:col-span-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-tm-ink">
                    Policies & governance
                  </h4>
                  <p className="text-[11px] text-tm-gray-500">
                    Attached to the focus product — not a step in the pipeline
                    flow.
                  </p>
                </div>
                <span className="badge-neutral">
                  Collibra · {policies.collibra?.status || "not_linked"}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <PolicyStat
                  label="Freshness SLO"
                  value={`${policies.freshness_slo_hours ?? "—"}h`}
                />
                <PolicyStat
                  label="Retention"
                  value={policies.retention || "—"}
                />
                <PolicyStat
                  label="PII columns"
                  value={
                    (policies.pii_columns || []).length
                      ? (policies.pii_columns || []).join(", ")
                      : "None flagged"
                  }
                />
              </div>
              {(policies.quality_rules || []).length > 0 && (
                <div>
                  <h5 className="text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
                    Quality rules
                  </h5>
                  <ul className="mt-1 list-inside list-disc text-xs text-tm-gray-600">
                    {(policies.quality_rules || []).map((r: string) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {policies.deprecation_policy ? (
                <p className="text-xs text-tm-gray-600">
                  Deprecation: {policies.deprecation_policy}
                </p>
              ) : null}
              {policies.collibra?.url ? (
                <a
                  className="btn-ghost text-xs"
                  href={policies.collibra.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Collibra {policies.collibra.asset_id || ""}
                </a>
              ) : (
                <p className="text-xs text-tm-gray-500">
                  Catalogue sync is stubbed until the product is live / Contract
                  Docs has run.
                </p>
              )}
            </section>
          )}
        </div>

        {/* Dual-run (merged) */}
        <section className="rounded-xl border border-tm-gray-200 bg-white">
          <div className="border-b border-tm-gray-200 px-4 py-3">
            <h4 className="text-sm font-semibold text-tm-ink">
              Dual-run window
            </h4>
            <p className="mt-0.5 text-xs text-tm-gray-500">
              Keep legacy and cloud products in parallel until reconcile stays
              within tolerance — then Phase 6 cutover.
            </p>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <ol className="space-y-2 text-sm">
              {dualChecks.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center justify-between rounded-lg bg-tm-gray-50 px-3 py-2"
                >
                  <span>{s.label}</span>
                  <span className={s.done ? "badge-success" : "badge-neutral"}>
                    {s.done ? "ready" : "open"}
                  </span>
                </li>
              ))}
            </ol>
            <div className="space-y-3 text-sm">
              {reconcilePassed && focusProduct?.status === "live" ? (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-good">
                  Dual-run evidence sufficient for Phase 6 cutover rehearsal.
                </div>
              ) : (
                <p className="text-xs text-warn">
                  Create this SDP, then reconcile, before treating dual-run as
                  green.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn text-xs"
                  disabled={busy || !canRun}
                  onClick={() => {
                    if (!runIds.length) return;
                    if (runIds.length === 1) onPipeline(runIds[0]);
                    else onPipeline(runIds);
                  }}
                >
                  {runIds.length > 1
                    ? `Run dual pipeline (${runIds.length})`
                    : "Run dual pipeline"}
                </button>
                {onReconcile && (
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    disabled={
                      busy || !focusProduct || focusProduct.status !== "live"
                    }
                    onClick={() =>
                      focusProduct && onReconcile(focusProduct.id)
                    }
                  >
                    Run reconcile
                  </button>
                )}
              </div>
              <p className="text-xs text-tm-gray-500">
                Active SDP:{" "}
                <strong>{focusProduct?.name || "none"}</strong> ·{" "}
                <code>{focusProduct?.dataset_name || "—"}</code>
              </p>
            </div>
          </div>
        </section>

        {/* Run history */}
        <section className="rounded-xl border border-tm-gray-200">
          <div className="border-b border-tm-gray-200 px-4 py-2">
            <h4 className="text-sm font-semibold">Run history</h4>
            <p className="text-[11px] text-tm-gray-500">
              Stages for this product’s typed pipeline (governance overlay listed
              separately from the flow).
            </p>
          </div>
          <ul className="max-h-48 divide-y divide-tm-gray-100 overflow-auto text-sm">
            {materializeRuns.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge-neutral capitalize">{r.stage}</span>
                  <span className="capitalize text-tm-gray-600">{r.status}</span>
                  {r.detail?.message && (
                    <span className="text-xs text-tm-gray-500">
                      {r.detail.message}
                    </span>
                  )}
                </div>
                <span className="text-xs text-tm-gray-500">
                  {r.created_at || ""}
                </span>
              </li>
            ))}
            {!materializeRuns.length && (
              <li className="px-4 py-6 text-tm-gray-500">
                No runs yet for this product.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function PolicyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-tm-gray-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-medium text-tm-ink">{value}</div>
    </div>
  );
}
