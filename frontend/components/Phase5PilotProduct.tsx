"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentRunsPanel } from "@/components/AgentRunsPanel";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";
import {
  DiscoveryTerminal,
  type TerminalLine,
} from "@/components/phases/discovery/DiscoveryTerminal";
import { PilotProductCatalog } from "@/components/PilotProductCatalog";
import { PilotPipelineView } from "@/components/PilotPipelineView";
import { PilotReconcileView } from "@/components/PilotReconcileView";
import { PilotTestEnvView } from "@/components/PilotTestEnvView";
import { api } from "@/lib/api";

type SubTab =
  | "overview"
  | "agents"
  | "reviews"
  | "product"
  | "test_env"
  | "pipeline"
  | "reconcile";

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Accelerators" },
  { id: "reviews", label: "Review inbox" },
  { id: "product", label: "Product & contract" },
  { id: "test_env", label: "Migrate to Test" },
  { id: "pipeline", label: "Run dual pipeline" },
  { id: "reconcile", label: "Reconciliation" },
];

const ACCELERATOR_TASKS = [
  "source_interface_acquisition",
  "data_product_identification",
  "code_transformation",
  "contract_documentation",
] as const;

const AGENT_TASKS: {
  id: (typeof ACCELERATOR_TASKS)[number];
  title: string;
  role: string;
  blurb: string;
  tool: string;
  payload?: any;
}[] = [
  {
    id: "source_interface_acquisition",
    title: "Acquisition AI",
    role: "CNDI · metadata + ingestion pipeline",
    blurb:
      "Creates technical metadata and generates the ingestion pipeline with the CNDI tool (extract → validate → land → catalogue).",
    tool: "CNDI",
    payload: {
      interface: {
        name: "crm_customer_extract",
        format: "csv",
        primary_key: "cust_id",
        columns: [
          { name: "cust_id" },
          { name: "cust_name" },
          { name: "email" },
          { name: "phone" },
        ],
      },
      owner: "Pat Product Owner",
    },
  },
  {
    id: "data_product_identification",
    title: "Data Product Builder",
    role: "Model AI · products & semantic modeling",
    blurb:
      "Creates data products and performs semantic modeling with Model AI from Align metadata, mappings, and lineage.",
    tool: "Model AI",
    payload: {},
  },
  {
    id: "code_transformation",
    title: "Code Transformation",
    role: "Coding Skills · pipelines & transforms",
    blurb:
      "Calls Coding Skills to generate transform pipelines, tests, and reconcile SQL into migration-repo.",
    tool: "Coding Skills",
    payload: {},
  },
  {
    id: "contract_documentation",
    title: "Contract & Docs",
    role: "Contracts · catalogue · product docs",
    blurb:
      "Generates contracts and documentation for data products, code artifacts, and the business catalogue.",
    tool: "Contract Docs",
    payload: null,
  },
];

function terminalLinesFromAcceleratorRun(run: any | null): TerminalLine[] {
  if (!run) return [];
  const steps = run.steps || run.output?.steps || [];
  const lines: TerminalLine[] = [];
  for (const s of steps) {
    const isTerm =
      s?.name === "terminal.log" || s?.detail?.kind === "terminal";
    if (isTerm) {
      lines.push({
        ts: s.detail?.ts || s.created_at,
        agent: s.detail?.agent || run.task || "Accelerator",
        line: s.message || "",
      });
      continue;
    }
    if (s?.message) {
      const mark =
        s.status === "failed" ? "✗" : s.status === "running" ? "…" : "·";
      lines.push({
        agent: s.detail?.agent || run.task || "Accelerator",
        line: `${mark} ${s.message}`,
      });
    }
  }
  if (!lines.length && run.status) {
    lines.push({
      agent: run.task || "Accelerator",
      line: `Status ${run.status} · conf ${Math.round((run.confidence || 0) * 100)}%`,
    });
  }
  return lines;
}

type Props = {
  project: any;
  metadataComplete: boolean;
  buildApproved?: boolean;
  agentRuns: any[];
  reviews: any[];
  products: any[];
  productRows: any[];
  pipelineRuns: any[];
  reconcileLatest: any | null;
  busy: boolean;
  msg: string;
  sessionRole: string;
  onRunAgent: (task: string, payload: any) => void | Promise<any>;
  onPollAgents: () => void;
  onReview: (id: number, decision: "approve" | "reject") => void;
  onBulkReview?: (decision: "approve" | "reject") => void;
  onPipeline: (productId: number | number[]) => void;
  onReconcile: (productId: number | number[]) => void;
  onPromoteTestEnv?: (productIds: number[]) => void | Promise<any>;
  onSelectProduct?: (productId: number) => void;
  selectedProductId?: number | null;
  /** Workspace mode: hide outer chrome and show a single view */
  embedded?: boolean;
  view?: string;
};

export function Phase5PilotProduct({
  project,
  metadataComplete,
  buildApproved = false,
  agentRuns,
  reviews,
  products,
  productRows,
  pipelineRuns,
  reconcileLatest,
  busy,
  msg,
  sessionRole,
  onRunAgent,
  onPollAgents,
  onReview,
  onBulkReview,
  onPipeline,
  onReconcile,
  onPromoteTestEnv,
  onSelectProduct,
  selectedProductId,
  embedded = false,
  view,
}: Props) {
  const gatesOpen = metadataComplete && buildApproved;
  const initialView =
    view === "dualrun" ? "pipeline" : (view as SubTab | undefined);
  const initial = initialView || (embedded ? "agents" : "overview");
  const [sub, setSub] = useState<SubTab>(
    SUBTABS.some((t) => t.id === initial) ? (initial as SubTab) : "agents"
  );
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [accelRun, setAccelRun] = useState<any | null>(null);
  const product =
    products.find((p) => p.id === selectedProductId) || products[0] || null;
  const pendingReviews = useMemo(
    () => reviews.filter((r) => r.status === "pending"),
    [reviews]
  );
  const selectedReview =
    selectedReviewId != null
      ? reviews.find((r) => r.id === selectedReviewId) || null
      : null;

  // Keep accelerator terminal synced to latest matching run from workspace polls
  useEffect(() => {
    const isAccel = (task: string) =>
      (ACCELERATOR_TASKS as readonly string[]).includes(task);
    // Optimistic seed (id < 0) — wait for POST to replace it
    if (accelRun && Number(accelRun.id) < 0) return;
    if (!accelRun?.id) {
      const latest = agentRuns.find((r) => isAccel(r.task));
      if (latest) setAccelRun(latest);
      return;
    }
    const fresh = agentRuns.find((r) => r.id === accelRun.id);
    if (fresh) setAccelRun(fresh);
  }, [agentRuns, accelRun?.id]);

  const accelActive = ["queued", "running"].includes(
    String(accelRun?.status || "").toLowerCase()
  );

  useEffect(() => {
    if (
      !accelActive ||
      !accelRun?.id ||
      accelRun.id < 0 ||
      !project?.id
    )
      return;
    let cancelled = false;
    const tick = async () => {
      try {
        const detail = await api<any>(
          `/projects/${project.id}/agents/runs/${accelRun.id}`
        );
        if (cancelled) return;
        setAccelRun(detail);
        onPollAgents();
      } catch {
        /* ignore transient poll errors */
      }
    };
    void tick();
    const id = window.setInterval(tick, 900);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [accelActive, accelRun?.id, project?.id, onPollAgents]);

  const terminalLines = useMemo(
    () => terminalLinesFromAcceleratorRun(accelRun),
    [accelRun]
  );

  useEffect(() => {
    if (view === "dualrun") {
      setSub("pipeline");
      return;
    }
    if (view && SUBTABS.some((t) => t.id === view)) {
      setSub(view as SubTab);
    }
  }, [view]);

  const reconcilePassed =
    reconcileLatest?.passed ?? reconcileLatest?.metrics?.passed ?? false;

  const pilotReady =
    metadataComplete &&
    product?.status === "live" &&
    reconcilePassed;

  const fullBleed =
    embedded &&
    (sub === "agents" ||
      sub === "reviews" ||
      sub === "product" ||
      sub === "test_env" ||
      sub === "pipeline" ||
      sub === "reconcile");

  const gateBanner = !gatesOpen ? (
    <div
      className={
        fullBleed
          ? "shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-warn"
          : "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn"
      }
    >
      {!metadataComplete
        ? "Complete Align before running pilot accelerators."
        : "Approve the Build conversion pack (Tables / Code / DAGs) before running pilot accelerators."}
    </div>
  ) : null;

  const msgBanner = msg ? (
    <div
      className={
        fullBleed
          ? "shrink-0 border-b border-tm-magenta/20 bg-tm-magenta-light px-4 py-2 text-sm text-tm-magenta-dark"
          : "rounded-xl border border-tm-magenta/20 bg-tm-magenta-light px-4 py-3 text-sm text-tm-magenta-dark"
      }
    >
      {msg}
    </div>
  ) : null;

  return (
    <div
      className={
        fullBleed
          ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white"
          : embedded
            ? "space-y-4 p-5"
            : "space-y-4"
      }
    >
      {!fullBleed && products.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
            Active product
          </span>
          <select
            className="input !mt-0 max-w-xs"
            value={product?.id || ""}
            onChange={(e) => onSelectProduct?.(Number(e.target.value))}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.status}
              </option>
            ))}
          </select>
        </div>
      )}
      {!embedded && (
        <>
      <header className="card flex flex-wrap items-start justify-between gap-4 !py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tm-magenta">
            Phase 5 · Pilot Data Product
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-tm-ink">
            Party &amp; Customer Account
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tm-gray-600">
            LLM-assisted delivery under human review: acquisition, product identification, code
            transformation, and contract generation — then land the pilot on a GCP-shaped stack
            (GCS → conformance → BigQuery product) and reconcile against legacy within tolerance.
          </p>
          <p className="mt-2 text-xs text-tm-gray-500">
            <span className="font-semibold text-tm-ink">Exit criterion:</span> Reconciled against
            legacy within agreed tolerance (0.1% row count · exact key sets).
          </p>
        </div>
        {product && (
          <div className="rounded-xl border border-tm-gray-200 bg-tm-gray-50 px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-tm-gray-500">Pilot status</div>
            <div className="mt-1 font-semibold capitalize text-tm-ink">{product.status}</div>
            <div className="text-xs text-tm-gray-500">pipeline: {product.pipeline_status}</div>
          </div>
        )}
      </header>

      {gateBanner}
      {msgBanner}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Agent runs" value={agentRuns.length} hint="Structured LLM outputs" />
        <Kpi label="Pending reviews" value={pendingReviews.length} hint="HITL inbox" />
        <Kpi
          label="Product"
          value={product ? product.status : "none"}
          hint={product?.dataset_name || "dp_party_customer_account"}
        />
        <Kpi
          label="Reconcile"
          value={reconcileLatest ? (reconcilePassed ? "PASSED" : "FAILED") : "—"}
          hint="Pilot exit gate"
          accent={reconcilePassed}
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
            {t.id === "reviews" && pendingReviews.length > 0 && (
              <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[10px]">
                {pendingReviews.length}
              </span>
            )}
          </button>
        ))}
      </div>
        </>
      )}

      {embedded && fullBleed && (
        <>
          {gateBanner}
          {msgBanner}
        </>
      )}

      {sub === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card lg:col-span-2 space-y-4">
            <h3 className="text-base font-semibold">Phase 5 checklist</h3>
            <Check done={!!metadataComplete} title="Align metadata gate passed" />
            <Check done={!!buildApproved} title="Build conversion pack approved" />
            <Check
              done={agentRuns.some((r) => r.task === "data_product_identification")}
              title="Data Product Builder agent completed"
            />
            <Check
              done={reviews.some(
                (r) =>
                  r.review_type === "data_product_identification" && r.status === "approved"
              )}
              title="Product Owner approved product boundary / contract"
            />
            <Check
              done={agentRuns.some((r) => r.task === "code_transformation")}
              title="Transformation PR artifacts generated"
            />
            <Check done={product?.status === "live"} title="GCP-shaped pipeline landed product rows" />
            <Check done={reconcilePassed} title="Parallel-run reconciliation passed" />
          </div>
          <div className="card space-y-3 text-sm text-tm-gray-600">
            <h3 className="text-base font-semibold text-tm-ink">Operating rules (HITL)</h3>
            <ul className="space-y-2 text-xs">
              <li>Structured JSON first; citations + confidence required</li>
              <li>Low confidence → review item, not auto-apply</li>
              <li>Architect / Product Owner approvals before promote</li>
              <li>No secrets or unrestricted production extracts in prompts</li>
              <li>Ingestion executes only reviewed Git configurations</li>
            </ul>
            {pilotReady && (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-good">
                Pilot exit met — proceed to Phase 6 cutover when ready.
              </div>
            )}
          </div>
        </div>
      )}

      {sub === "agents" && (
        <div
          className={
            embedded
              ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
              : "flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-tm-gray-200"
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
            <div>
              <h3 className="text-sm font-semibold text-tm-ink">Accelerators</h3>
              <p className="mt-1 text-xs text-tm-gray-500">
                Run CNDI acquisition, Model AI product building, Coding Skills
                pipelines, and contract/docs generation. Live process streams in
                the terminal below.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {AGENT_TASKS.map((t, idx) => {
                const last = agentRuns.find((r) => r.task === t.id);
                const runningThis =
                  accelActive && accelRun?.task === t.id;
                return (
                  <div key={`${t.id}-${idx}`} className="card space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-tm-ink">
                          {t.title}
                        </div>
                        <span className="rounded border border-brand-line bg-tm-gray-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
                          {t.tool}
                        </span>
                      </div>
                      <div className="text-xs text-tm-magenta">{t.role}</div>
                      <p className="mt-2 text-xs text-tm-gray-600">{t.blurb}</p>
                    </div>
                    {last && (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="badge-neutral">{last.status}</span>
                        <span className="badge-magenta">
                          conf {Math.round((last.confidence || 0) * 100)}%
                        </span>
                        {last.output?.llm_mode && (
                          <span className="badge-neutral">
                            llm:{last.output.llm_mode}
                          </span>
                        )}
                      </div>
                    )}
                    <button
                      className="btn w-full"
                      disabled={busy || !gatesOpen || accelActive}
                      title={
                        !gatesOpen
                          ? "Complete Align and approve Build first"
                          : accelActive
                            ? "Wait for the current accelerator to finish"
                            : `Run ${t.title}`
                      }
                      onClick={() => {
                        const payload =
                          t.payload === null
                            ? {
                                candidate_contract:
                                  product?.contract || {
                                    name: "party_customer_account",
                                    version: "0.1.0",
                                  },
                              }
                            : { ...(t.payload || {}) };
                        // Optimistic seed so the terminal opens immediately
                        setAccelRun({
                          id: -1,
                          task: t.id,
                          status: "queued",
                          steps: [
                            {
                              name: "terminal.log",
                              status: "running",
                              message: `▶ ${t.tool} · starting ${t.title}`,
                              detail: {
                                kind: "terminal",
                                agent: t.tool.replace(/\s+/g, ""),
                              },
                            },
                          ],
                        });
                        void Promise.resolve(onRunAgent(t.id, payload))
                          .then((runRow: any) => {
                            if (runRow?.id) setAccelRun(runRow);
                          })
                          .catch(() => {
                            setAccelRun((prev: any) =>
                              prev && Number(prev.id) < 0 ? null : prev
                            );
                          });
                      }}
                    >
                      {runningThis ? "Running…" : `Run ${t.title}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <AgentRunsPanel
              title="Recent accelerator runs"
              runs={agentRuns}
              taskFilter={[...ACCELERATOR_TASKS]}
              onPoll={onPollAgents}
              selectedId={accelRun?.id}
              onSelect={(r) => setAccelRun(r)}
              emptyHint="No accelerator runs yet. Launch one above — process appears in the terminal."
            />
          </div>
          <DiscoveryTerminal
            title="Accelerator terminal"
            lines={terminalLines}
            active={accelActive}
            emptyHint="Accelerator stdout streams here (CNDI · Model AI · Coding Skills · Contract Docs)…"
            defaultHeight={220}
          />
        </div>
      )}

      {sub === "reviews" && (
        <div
          className={
            embedded
              ? "flex min-h-0 flex-1 flex-row overflow-hidden"
              : "flex min-h-[480px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DataToolbar
              countLabel={`${reviews.length} reviews · ${pendingReviews.length} pending`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-tm-gray-500">
                    Signed in as <strong>{sessionRole}</strong>
                  </span>
                  {pendingReviews.length > 0 && onBulkReview ? (
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={busy}
                      title="Approve all pending review items you are allowed to decide"
                      onClick={() => onBulkReview("approve")}
                    >
                      Approve all ({pendingReviews.length})
                    </button>
                  ) : null}
                </div>
              }
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-4">Title</th>
                    <th className="table-th">Type</th>
                    <th className="table-th">Requires</th>
                    <th className="table-th px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr
                      key={r.id}
                      className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                        selectedReview?.id === r.id ? "bg-tm-magenta-light/60" : ""
                      }`}
                      onClick={() => setSelectedReviewId(r.id)}
                    >
                      <td className="table-td px-4 text-sm font-medium">{r.title}</td>
                      <td className="table-td">
                        <span className="badge-magenta">{r.review_type}</span>
                      </td>
                      <td className="table-td text-xs">{r.required_role}</td>
                      <td className="table-td px-4">
                        <span
                          className={`badge ${
                            r.status === "approved"
                              ? "badge-success"
                              : r.status === "rejected"
                                ? "bg-rose-50 text-bad"
                                : "badge-neutral"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!reviews.length && (
                    <tr>
                      <td className="table-td px-4 text-tm-gray-500" colSpan={4}>
                        No reviews yet — run agents to create review items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <InspectorPanel
            open={!!selectedReview}
            title={selectedReview?.title || "Review"}
            onClose={() => setSelectedReviewId(null)}
          >
            {selectedReview ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="badge-magenta">{selectedReview.review_type}</span>
                  <span className="badge-neutral">
                    requires {selectedReview.required_role}
                  </span>
                  <span
                    className={`badge ${
                      selectedReview.status === "approved"
                        ? "badge-success"
                        : selectedReview.status === "rejected"
                          ? "bg-rose-50 text-bad"
                          : "badge-neutral"
                    }`}
                  >
                    {selectedReview.status}
                  </span>
                </div>
                {selectedReview.status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      className="btn text-xs"
                      disabled={busy}
                      onClick={() => onReview(selectedReview.id, "approve")}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      disabled={busy}
                      onClick={() => onReview(selectedReview.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                )}
                {selectedReview.reviewer && (
                  <p className="text-xs text-tm-gray-500">
                    Decided by {selectedReview.reviewer}
                    {selectedReview.decision_notes
                      ? ` — ${selectedReview.decision_notes}`
                      : ""}
                  </p>
                )}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                    Payload
                  </h4>
                  <pre className="mt-2 max-h-[50vh] overflow-auto rounded-lg bg-tm-gray-50 p-2 text-[11px] text-tm-gray-700">
                    {JSON.stringify(selectedReview.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <p className="text-sm text-tm-gray-500">Select a review to inspect.</p>
            )}
          </InspectorPanel>
        </div>
      )}

      {sub === "product" && (
        <PilotProductCatalog
          embedded={embedded}
          products={products}
          productRows={productRows}
          selectedProductId={selectedProductId ?? product?.id}
          onSelectProduct={onSelectProduct}
          sessionRole={sessionRole}
          busy={busy}
          onPipeline={onPipeline}
          testEnvReady={!!project?.test_env_ready}
          promotedProductIds={
            (project?.test_env?.product_ids || []).map(Number).filter(Boolean)
          }
        />
      )}

      {sub === "test_env" && (
        <PilotTestEnvView
          embedded={embedded}
          project={project}
          products={products}
          busy={busy}
          onPromoteTestEnv={
            onPromoteTestEnv ||
            (async () => {
              /* no-op when not wired */
            })
          }
        />
      )}

      {sub === "pipeline" && (
        <PilotPipelineView
          embedded={embedded}
          project={project}
          product={
            product && String(product.product_tier || "").toLowerCase() === "sdp"
              ? product
              : products.find(
                  (p) => String(p.product_tier || "").toLowerCase() === "sdp"
                ) || product
          }
          products={products}
          pipelineRuns={pipelineRuns.filter((r) => {
            const focus =
              product &&
              String(product.product_tier || "").toLowerCase() === "sdp"
                ? product
                : products.find(
                    (p) => String(p.product_tier || "").toLowerCase() === "sdp"
                  );
            return !focus || r.product_id === focus.id;
          })}
          busy={busy}
          reconcilePassed={reconcilePassed}
          testEnvReady={!!project?.test_env_ready}
          onSelectProduct={onSelectProduct}
          onPipeline={onPipeline}
          onReconcile={onReconcile}
        />
      )}

      {sub === "reconcile" && (
        <PilotReconcileView
          embedded={embedded}
          project={project}
          product={product}
          products={products}
          pipelineRuns={pipelineRuns}
          reconcileLatest={reconcileLatest}
          reconcilePassed={reconcilePassed}
          pilotReady={pilotReady}
          busy={busy}
          onSelectProduct={onSelectProduct}
          onReconcile={onReconcile}
        />
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
      <div className="mt-1 text-2xl font-bold capitalize text-tm-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-tm-gray-500">{hint}</div>}
    </div>
  );
}
