"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";
import { PilotProductCatalog } from "@/components/PilotProductCatalog";
import { PilotPipelineView } from "@/components/PilotPipelineView";
import { PilotReconcileView } from "@/components/PilotReconcileView";
import { PilotTestEnvView } from "@/components/PilotTestEnvView";
import { toolHref } from "@/lib/phases";

type SubTab =
  | "overview"
  | "reviews"
  | "product"
  | "test_env"
  | "pipeline"
  | "reconcile";

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "reviews", label: "Review inbox" },
  { id: "product", label: "Product & contract" },
  { id: "test_env", label: "Migrate to Test" },
  { id: "pipeline", label: "Run dual pipeline" },
  { id: "reconcile", label: "Reconciliation" },
];

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
  onRunAgent?: (task: string, payload: any) => void | Promise<any>;
  onPollAgents?: () => void;
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
  agentRuns: _agentRuns,
  reviews,
  products,
  productRows,
  pipelineRuns,
  reconcileLatest,
  busy,
  msg,
  sessionRole,
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
    view === "dualrun" || view === "agents"
      ? view === "dualrun"
        ? "pipeline"
        : "reviews"
      : (view as SubTab | undefined);
  const initial = initialView || (embedded ? "reviews" : "overview");
  const [sub, setSub] = useState<SubTab>(
    SUBTABS.some((t) => t.id === initial) ? (initial as SubTab) : "reviews"
  );
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
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

  useEffect(() => {
    if (view === "dualrun") {
      setSub("pipeline");
      return;
    }
    if (view === "agents") {
      setSub("reviews");
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
    (sub === "reviews" ||
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
        ? "Complete Align before Pilot delivery."
        : "Approve the Build conversion pack and run Forge accelerators before Pilot reviews."}{" "}
      <Link href={toolHref("forge", "accelerators")} className="font-medium underline">
        Open Build accelerators
      </Link>
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
        <Kpi label="Agent runs" value={_agentRuns.length} hint="Structured LLM outputs" />
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
              done={_agentRuns.some((r) => r.task === "data_product_identification")}
              title="Product Composer (Build accelerators) completed"
            />
            <Check
              done={reviews.some(
                (r) =>
                  r.review_type === "data_product_identification" && r.status === "approved"
              )}
              title="Product Owner approved product boundary / contract"
            />
            <Check
              done={_agentRuns.some((r) => r.task === "code_transformation")}
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
              <li>
                Run accelerators in{" "}
                <Link href={toolHref("forge", "accelerators")} className="font-medium text-brand-ink underline">
                  Build · Mirage Forge
                </Link>
              </li>
            </ul>
            {pilotReady && (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-good">
                Pilot exit met — proceed to Phase 6 cutover when ready.
              </div>
            )}
          </div>
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
                        No reviews yet — run Build accelerators to create review items.
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
