"use client";

import { useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";

type Facet =
  | "overview"
  | "ports"
  | "contract"
  | "docs"
  | "code"
  | "catalogue"
  | "sample"
  | "cost";

const FACETS: { id: Facet; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "ports", label: "Ports" },
  { id: "contract", label: "Contract" },
  { id: "docs", label: "Docs" },
  { id: "code", label: "Code" },
  { id: "catalogue", label: "Catalogue" },
  { id: "sample", label: "Sample" },
  { id: "cost", label: "Cost & usage" },
];

type Props = {
  products: any[];
  productRows: any[];
  selectedProductId?: number | null;
  onSelectProduct?: (productId: number) => void;
  sessionRole: string;
  busy: boolean;
  onPipeline?: (productId: number) => void;
  embedded?: boolean;
  testEnvReady?: boolean;
  promotedProductIds?: number[];
};

function statusTone(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "live") return "badge-magenta";
  if (s === "approved") return "badge-magenta";
  if (s === "proposed") return "badge-neutral";
  if (s === "suggested") return "badge-neutral";
  return "badge-neutral";
}

function PortCard({ port }: { port: any }) {
  return (
    <div className="rounded-lg border border-tm-gray-200 bg-white px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-tm-ink">{port.name}</span>
        <span className="badge-neutral">{port.direction}</span>
        <span className="badge-neutral">{port.protocol}</span>
        {port.pii ? <span className="badge-magenta">PII</span> : null}
        {port.tool ? <span className="text-tm-gray-500">{port.tool}</span> : null}
      </div>
      <p className="mt-1 font-mono text-[11px] text-tm-gray-600">{port.path}</p>
      <p className="mt-1 text-tm-gray-500">
        schema v{port.schema_version || "—"} · SLA {port.sla || "—"}
      </p>
    </div>
  );
}

export function PilotProductCatalog({
  products,
  productRows,
  selectedProductId,
  onSelectProduct,
  sessionRole,
  busy,
  onPipeline,
  embedded = false,
  testEnvReady = false,
  promotedProductIds = [],
}: Props) {
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [facet, setFacet] = useState<Facet>("overview");
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [docPreview, setDocPreview] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return products
      .filter((p) => {
        if (statusFilter !== "all" && (p.status || "").toLowerCase() !== statusFilter) {
          return false;
        }
        if (!q) return true;
        const hay = [
          p.name,
          p.dataset_name,
          p.owner,
          p.domain,
          ...(p.sid_entities || []),
          ...(p.consumers || []),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => {
        const order: Record<string, number> = {
          live: 0,
          approved: 1,
          proposed: 2,
          suggested: 3,
        };
        const da = order[(a.status || "").toLowerCase()] ?? 9;
        const db = order[(b.status || "").toLowerCase()] ?? 9;
        if (da !== db) return da - db;
        return (b.confidence || 0) - (a.confidence || 0);
      });
  }, [products, filter, statusFilter]);

  const product =
    products.find((p) => p.id === selectedProductId) ||
    filtered[0] ||
    products[0] ||
    null;

  useEffect(() => {
    if (!selectedProductId && product?.id && onSelectProduct) {
      onSelectProduct(product.id);
    }
  }, [selectedProductId, product?.id, onSelectProduct]);

  const selectedRow =
    selectedRowIdx != null ? productRows[selectedRowIdx] || null : null;

  const schema = (product?.contract?.schema || []) as any[];
  const inputs = (product?.input_ports || []) as any[];
  const outputs = (product?.output_ports || []) as any[];
  const docs = (product?.docs || []) as any[];
  const code = product?.code_links || {};
  const collibra = product?.collibra || {};
  const breakdown = product?.cost_breakdown || {};
  const usage = product?.usage_metrics || {};
  const promotedSet = useMemo(
    () => new Set((promotedProductIds || []).map(Number)),
    [promotedProductIds]
  );
  const productPromoted =
    !!product &&
    (!promotedSet.size || promotedSet.has(Number(product.id)));
  const canPipeline =
    !!product &&
    ["approved", "live"].includes((product.status || "").toLowerCase()) &&
    !!onPipeline &&
    testEnvReady &&
    productPromoted;

  if (!products.length) {
    return (
      <div className={embedded ? "p-5 text-sm text-tm-gray-600" : "card text-sm text-tm-gray-600"}>
        No products yet. Run <strong>Product Composer</strong> in Build · Accelerators,

        then approve in the Review inbox — suggested Wave-2 products also appear here after
        refresh.
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "flex min-h-0 flex-1 flex-row overflow-hidden bg-white"
          : "flex min-h-[640px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
      }
    >
      {/* Catalog rail */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-tm-gray-200 bg-tm-gray-50">
        <div className="shrink-0 space-y-2 border-b border-tm-gray-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-tm-ink">Products</h3>
            <span className="text-[11px] text-tm-gray-500">{filtered.length}</span>
          </div>
          <input
            className="input !mt-0 w-full text-xs"
            placeholder="Search name, SID, consumer…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input !mt-0 w-full text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="live">Live</option>
            <option value="approved">Approved</option>
            <option value="proposed">Proposed</option>
            <option value="suggested">Suggested</option>
          </select>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto p-2">
          {filtered.map((p) => {
            const active = product?.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={`mb-1 w-full rounded-lg border px-3 py-2 text-left transition ${
                    active
                      ? "border-tm-magenta/40 bg-tm-magenta-light/50"
                      : "border-transparent bg-white hover:border-tm-gray-200"
                  }`}
                  onClick={() => onSelectProduct?.(p.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-tm-ink">{p.name}</span>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="badge-neutral !text-[9px] uppercase">
                        {p.product_tier || "adp"}
                      </span>
                      <span className={`${statusTone(p.status)} capitalize`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-tm-gray-500">
                    {p.dataset_name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(p.sid_entities || []).slice(0, 3).map((e: string) => (
                      <span key={e} className="badge-neutral !text-[9px]">
                        {e}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] text-tm-gray-500">
                    <span>${p.cost_estimate_monthly ?? "—"}/mo</span>
                    {p.confidence > 0 && (
                      <span>conf {Math.round(p.confidence * 100)}%</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
          {!filtered.length && (
            <li className="px-2 py-6 text-center text-xs text-tm-gray-500">
              No products match this filter.
            </li>
          )}
        </ul>
      </aside>

      {/* Dossier */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {product ? (
          <>
            <header className="shrink-0 border-b border-tm-gray-200 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-tm-ink">{product.name}</h2>
                    <span className={`${statusTone(product.status)} capitalize`}>
                      {product.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-tm-gray-600">
                    <code className="text-xs">{product.dataset_name}</code>
                    {" · "}v{product.version}
                    {" · "}owner {product.owner || "—"}
                    {product.system_of_record
                      ? ` · SoR ${product.system_of_record}`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="badge-neutral">
                      est. ${product.cost_estimate_monthly}/mo
                    </span>
                    <span className="badge-neutral">
                      SLO {product.freshness_slo_hours || 24}h
                    </span>
                    {product.domain ? (
                      <span className="badge-neutral">{product.domain}</span>
                    ) : null}
                    {product.confidence > 0 ? (
                      <span className="badge-magenta">
                        conf {Math.round(product.confidence * 100)}%
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canPipeline && (
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={busy || product.status === "proposed"}
                      onClick={() => onPipeline?.(product.id)}
                    >
                      Run dual pipeline
                    </button>
                  )}
                  {!testEnvReady && onPipeline && (
                    <span className="text-[11px] text-warn">
                      Promote on Migrate to Test first
                    </span>
                  )}
                  {testEnvReady &&
                    onPipeline &&
                    !productPromoted &&
                    ["approved", "live"].includes(
                      String(product.status || "").toLowerCase()
                    ) && (
                      <span className="text-[11px] text-tm-gray-500">
                        Not in Test promotion set
                      </span>
                    )}
                  {code.mr_url ? (
                    <a
                      className="btn-ghost text-xs"
                      href={code.mr_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open GitLab
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {FACETS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFacet(f.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                      facet === f.id
                        ? "bg-tm-magenta text-white"
                        : "text-tm-gray-600 hover:bg-tm-gray-100"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {facet === "overview" && (
                <div className="space-y-4 text-sm">
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      Description
                    </h4>
                    <p className="mt-1 text-tm-gray-700">
                      {product.description ||
                        "No rationale captured yet — run Product Composer in Build · Accelerators."}
                    </p>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      SID entities
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(product.sid_entities || []).map((e: string) => (
                        <span key={e} className="badge-magenta">
                          {e}
                        </span>
                      ))}
                      {!(product.sid_entities || []).length && (
                        <span className="text-xs text-tm-gray-500">—</span>
                      )}
                    </div>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      Consumers
                    </h4>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(product.consumers || []).map((c: string) => (
                        <span key={c} className="badge-neutral">
                          {c}
                        </span>
                      ))}
                      {!(product.consumers || []).length && (
                        <span className="text-xs text-tm-gray-500">None listed</span>
                      )}
                    </div>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      Quality rules
                    </h4>
                    <ul className="mt-2 list-inside list-disc text-xs text-tm-gray-600">
                      {(product.contract?.quality_rules || []).map((r: string) => (
                        <li key={r}>{r}</li>
                      ))}
                      {!(product.contract?.quality_rules || []).length && (
                        <li>No rules on contract yet</li>
                      )}
                    </ul>
                  </section>
                </div>
              )}

              {facet === "ports" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      Input ports ({inputs.length})
                    </h4>
                    {inputs.map((p, i) => (
                      <PortCard key={`${p.name}-${i}`} port={p} />
                    ))}
                    {!inputs.length && (
                      <p className="text-xs text-tm-gray-500">No input ports yet.</p>
                    )}
                  </section>
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      Output ports ({outputs.length})
                    </h4>
                    {outputs.map((p, i) => (
                      <PortCard key={`${p.name}-${i}`} port={p} />
                    ))}
                    {!outputs.length && (
                      <p className="text-xs text-tm-gray-500">No output ports yet.</p>
                    )}
                  </section>
                </div>
              )}

              {facet === "contract" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-tm-gray-500">
                    <span>
                      Contract{" "}
                      <code>{product.contract?.name || "—"}</code>
                    </span>
                    <span>v{product.contract?.version || product.version}</span>
                    <span>
                      deprecation: {product.contract?.deprecation_policy || "—"}
                    </span>
                  </div>
                  <div className="overflow-auto rounded-lg border border-tm-gray-200">
                    <table className="w-full">
                      <thead className="bg-tm-gray-50">
                        <tr>
                          <th className="table-th px-3">Column</th>
                          <th className="table-th">Type</th>
                          <th className="table-th">Semantic</th>
                          <th className="table-th">Flags</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schema.map((col) => (
                          <tr key={col.name}>
                            <td className="table-td px-3 font-mono text-xs">
                              {col.name}
                            </td>
                            <td className="table-td text-xs">{col.type}</td>
                            <td className="table-td text-xs text-tm-gray-600">
                              {col.semantic || "—"}
                            </td>
                            <td className="table-td">
                              <div className="flex flex-wrap gap-1">
                                {col.pk ? (
                                  <span className="badge-magenta">PK</span>
                                ) : null}
                                {col.pii ? (
                                  <span className="badge-neutral">PII</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!schema.length && (
                          <tr>
                            <td
                              className="table-td px-3 text-tm-gray-500"
                              colSpan={4}
                            >
                              No schema on contract.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-tm-gray-500">
                      Raw contract JSON
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-tm-gray-50 p-3 text-[11px] text-tm-gray-700">
                      {JSON.stringify(product.contract, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              {facet === "docs" && (
                <div className="space-y-2">
                  {docs.map((d, i) => (
                    <button
                      key={`${d.path}-${i}`}
                      type="button"
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-tm-gray-200 bg-white px-3 py-2 text-left text-xs hover:border-tm-magenta/30"
                      onClick={() => setDocPreview(d)}
                    >
                      <div>
                        <div className="font-semibold text-tm-ink">{d.title}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-tm-gray-500">
                          {d.path}
                        </div>
                        <div className="mt-1 text-tm-gray-500">
                          {d.generated_by} · {d.kind} · {d.status}
                        </div>
                      </div>
                      <span className="badge-neutral shrink-0">Preview</span>
                    </button>
                  ))}
                  {!docs.length && (
                    <p className="text-xs text-tm-gray-500">
                      No docs yet — run Contract &amp; Docs in Build · Accelerators.
                    </p>
                  )}
                  {docPreview && (
                    <div className="mt-3 rounded-lg border border-tm-gray-200 bg-tm-gray-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold text-tm-ink">
                          {docPreview.title}
                        </h4>
                        <button
                          type="button"
                          className="btn-ghost text-[10px]"
                          onClick={() => setDocPreview(null)}
                        >
                          Close
                        </button>
                      </div>
                      <pre className="mt-2 max-h-72 overflow-auto text-[11px] text-tm-gray-700">
                        {typeof docPreview.preview === "string"
                          ? docPreview.preview
                          : JSON.stringify(docPreview.preview ?? docPreview, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {facet === "code" && (
                <div className="space-y-3 text-sm">
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-tm-gray-500">Repository</dt>
                      <dd className="font-mono">{code.repo || "migration-repo (local)"}</dd>
                    </div>
                    <div>
                      <dt className="text-tm-gray-500">Branch</dt>
                      <dd className="font-mono">{code.branch || "main"}</dd>
                    </div>
                    <div>
                      <dt className="text-tm-gray-500">MR status</dt>
                      <dd className="capitalize">{code.mr_status || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-tm-gray-500">Commit</dt>
                      <dd className="font-mono">{code.commit || "—"}</dd>
                    </div>
                  </dl>
                  {code.pr_summary ? (
                    <p className="text-xs text-tm-gray-600">{code.pr_summary}</p>
                  ) : null}
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                    Generated files
                  </h4>
                  <ul className="space-y-1">
                    {(code.files || []).map((f: string) => {
                      const url = code.file_urls?.[f];
                      return (
                        <li key={f} className="text-xs">
                          {url && String(url).startsWith("http") ? (
                            <a
                              className="font-mono text-tm-magenta hover:underline"
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {f}
                            </a>
                          ) : (
                            <code className="text-tm-gray-700">{f}</code>
                          )}
                        </li>
                      );
                    })}
                    {!(code.files || []).length && (
                      <li className="text-xs text-tm-gray-500">
                        No code pack yet — run Code Transformation in Build · Accelerators.
                      </li>
                    )}
                  </ul>
                  {code.mr_url ? (
                    <a
                      className="btn text-xs"
                      href={code.mr_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in GitLab
                    </a>
                  ) : (
                    <p className="text-xs text-tm-gray-500">
                      Bind a Git URL on the project to enable GitLab deep links.
                    </p>
                  )}
                </div>
              )}

              {facet === "catalogue" && (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge-neutral capitalize">
                      {collibra.status || "not_linked"}
                    </span>
                    {collibra.asset_id ? (
                      <span className="font-mono text-xs">{collibra.asset_id}</span>
                    ) : null}
                  </div>
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-tm-gray-500">Asset</dt>
                      <dd>{collibra.asset_name || product.name}</dd>
                    </div>
                    <div>
                      <dt className="text-tm-gray-500">Domain</dt>
                      <dd>{collibra.domain || product.domain || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-tm-gray-500">Steward</dt>
                      <dd>{collibra.steward || product.owner || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-tm-gray-500">Last sync</dt>
                      <dd>{collibra.last_sync || "—"}</dd>
                    </div>
                  </dl>
                  {collibra.url ? (
                    <a
                      className="btn-ghost text-xs"
                      href={collibra.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Collibra
                    </a>
                  ) : (
                    <p className="text-xs text-tm-gray-500">
                      Collibra sync is stubbed for the demo. Live products show a
                      synced asset id after pipeline land; Contract Docs moves
                      status to pending.
                    </p>
                  )}
                </div>
              )}

              {facet === "sample" && (
                <div className="flex min-h-[320px] flex-row overflow-hidden rounded-lg border border-tm-gray-200">
                  <div className="flex min-h-0 flex-1 flex-col">
                    <DataToolbar
                      countLabel={`${productRows.length} rows${
                        sessionRole === "viewer" ? " · PII masked" : ""
                      }`}
                    />
                    <div className="min-h-0 flex-1 overflow-auto">
                      {(() => {
                        const cols =
                          productRows[0]
                            ? Object.keys(productRows[0]).filter(
                                (k) => k !== "biz_key"
                              )
                            : (schema || [])
                                .map((c: any) => c.name)
                                .filter(Boolean)
                                .slice(0, 6);
                        const displayCols = cols.length
                          ? cols.slice(0, 6)
                          : ["—"];
                        return (
                      <table className="w-full">
                        <thead className="sticky top-0 bg-tm-gray-50">
                          <tr>
                            {displayCols.map((c) => (
                              <th key={c} className="table-th px-3">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {productRows.map((r, i) => (
                            <tr
                              key={i}
                              className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                                selectedRowIdx === i ? "bg-tm-magenta-light/60" : ""
                              }`}
                              onClick={() => setSelectedRowIdx(i)}
                            >
                              {displayCols.map((c) => (
                                <td
                                  key={c}
                                  className="table-td px-3 font-mono text-xs"
                                >
                                  {r[c] == null ? "—" : String(r[c])}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {!productRows.length && (
                            <tr>
                              <td
                                className="table-td px-4 text-tm-gray-500"
                                colSpan={displayCols.length}
                              >
                                No sample rows yet — promote on Migrate to Test,
                                then run dual pipeline for this product.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                        );
                      })()}
                    </div>
                  </div>
                  <InspectorPanel
                    open={!!selectedRow}
                    title={
                      selectedRow
                        ? String(
                            selectedRow.biz_key ||
                              selectedRow.party_id ||
                              selectedRow.cust_id ||
                              selectedRow.ticket_id ||
                              selectedRow.account_id ||
                              "Row detail"
                          )
                        : "Row"
                    }
                    onClose={() => setSelectedRowIdx(null)}
                  >
                    {selectedRow ? (
                      <dl className="grid grid-cols-1 gap-2 text-xs">
                        {Object.entries(selectedRow).map(([k, v]) => (
                          <div key={k}>
                            <dt className="text-tm-gray-500">{k}</dt>
                            <dd className="font-mono">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </InspectorPanel>
                </div>
              )}

              {facet === "cost" && (
                <div className="space-y-4 text-sm">
                  <div className="flex flex-wrap items-end gap-6">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-tm-gray-500">
                        Monthly estimate
                      </div>
                      <div className="text-2xl font-semibold text-tm-ink">
                        ${product.cost_estimate_monthly ?? "—"}
                      </div>
                    </div>
                    <div className="text-xs text-tm-gray-500">
                      Landing ${breakdown.landing ?? "—"} · Transform $
                      {breakdown.transform ?? "—"} · Serve $
                      {breakdown.serve ?? "—"}
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-tm-gray-100">
                    <div className="flex h-full">
                      <div
                        className="bg-tm-gray-400"
                        style={{
                          width: `${
                            ((breakdown.landing || 0) /
                              (product.cost_estimate_monthly || 1)) *
                            100
                          }%`,
                        }}
                        title="Landing"
                      />
                      <div
                        className="bg-tm-magenta/70"
                        style={{
                          width: `${
                            ((breakdown.transform || 0) /
                              (product.cost_estimate_monthly || 1)) *
                            100
                          }%`,
                        }}
                        title="Transform"
                      />
                      <div
                        className="bg-tm-magenta"
                        style={{
                          width: `${
                            ((breakdown.serve || 0) /
                              (product.cost_estimate_monthly || 1)) *
                            100
                          }%`,
                        }}
                        title="Serve"
                      />
                    </div>
                  </div>
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      Usage (7d)
                    </h4>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-tm-gray-200 px-3 py-2">
                        <div className="text-[10px] uppercase text-tm-gray-500">
                          Queries
                        </div>
                        <div className="text-lg font-semibold">
                          {usage.query_count_7d ?? 0}
                        </div>
                      </div>
                      <div className="rounded-lg border border-tm-gray-200 px-3 py-2">
                        <div className="text-[10px] uppercase text-tm-gray-500">
                          Row reads
                        </div>
                        <div className="text-lg font-semibold">
                          {(usage.row_reads_7d ?? 0).toLocaleString?.() ??
                            usage.row_reads_7d ??
                            0}
                        </div>
                      </div>
                      <div className="rounded-lg border border-tm-gray-200 px-3 py-2">
                        <div className="text-[10px] uppercase text-tm-gray-500">
                          Last access
                        </div>
                        <div className="text-lg font-semibold">
                          {usage.last_access || "—"}
                        </div>
                      </div>
                    </div>
                  </section>
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                      Top consumers
                    </h4>
                    <ul className="mt-2 space-y-1 text-xs">
                      {(usage.top_consumers || []).map((c: any, i: number) => (
                        <li
                          key={typeof c === "string" ? c : c.name || i}
                          className="flex justify-between gap-2 border-b border-tm-gray-100 py-1"
                        >
                          <span>{typeof c === "string" ? c : c.name}</span>
                          {typeof c !== "string" && c.queries != null ? (
                            <span className="text-tm-gray-500">
                              {c.queries} queries
                            </span>
                          ) : null}
                        </li>
                      ))}
                      {!(usage.top_consumers || []).length &&
                        (product.consumers || []).map((c: string) => (
                          <li key={c} className="text-tm-gray-600">
                            {c}
                          </li>
                        ))}
                      {!(usage.top_consumers || []).length &&
                        !(product.consumers || []).length && (
                          <li className="text-tm-gray-500">No consumption yet</li>
                        )}
                    </ul>
                  </section>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-tm-gray-500">
            Select a product from the catalog.
          </div>
        )}
      </div>
    </div>
  );
}
