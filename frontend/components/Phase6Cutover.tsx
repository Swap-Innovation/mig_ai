"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";
import { phaseHref } from "@/lib/phases";

type SubTab = "checklist" | "consumers" | "freeze" | "signoff";

type Props = {
  project: any;
  products: any[];
  cutover: any | null;
  reconcilePassed: boolean;
  dispositions: any[];
  busy: boolean;
  msg: string;
  sessionRole: string;
  onCompleteItem: (itemId: string, productId?: number) => void;
  onRefreshCutover: () => void;
  onPromoteProd: (productIds: number[]) => void | Promise<any>;
  onUpdateConsumer: (body: {
    name: string;
    status: string;
    contract?: string;
    notes?: string;
  }) => void | Promise<any>;
  onApplyFreeze: () => void | Promise<any>;
  onSignoff: (notes?: string) => void | Promise<any>;
  embedded?: boolean;
  view?: string;
};

const STATUS_OPTS = [
  { id: "pending", label: "Pending" },
  { id: "notified", label: "Notified" },
  { id: "switched", label: "Switched" },
  { id: "blocked", label: "Blocked" },
];

export function Phase6Cutover({
  project,
  products,
  cutover,
  reconcilePassed,
  dispositions,
  busy,
  msg,
  sessionRole,
  onCompleteItem,
  onRefreshCutover,
  onPromoteProd,
  onUpdateConsumer,
  onApplyFreeze,
  onSignoff,
  embedded = false,
  view,
}: Props) {
  const initial = (view as SubTab) || "checklist";
  const [sub, setSub] = useState<SubTab>(initial);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedConsumer, setSelectedConsumer] = useState<string | null>(null);
  const [selectedFreezeId, setSelectedFreezeId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [activeProductId, setActiveProductId] = useState<number | null>(null);
  const [signoffNotes, setSignoffNotes] = useState("");
  const [selectedPromote, setSelectedPromote] = useState<number[]>([]);

  const byProduct = cutover?.by_product || [];
  const readiness = cutover?.readiness || {};
  const prodEnv = cutover?.prod_env || project?.prod_env || {};
  const prodReady = !!(cutover?.prod_env_ready ?? project?.prod_env_ready);
  const consumerReg: Record<string, any> = prodEnv.consumers || {};

  const reconcileReadyIds = useMemo(() => {
    const fromCutover = byProduct
      .filter((b: any) => b.reconcile_passed)
      .map((b: any) => Number(b.product_id));
    if (fromCutover.length) return fromCutover;
    // Fallback: all products when project-level reconcile passed
    if (reconcilePassed || readiness.reconcile_ok) {
      return products.map((p) => p.id);
    }
    return [];
  }, [byProduct, products, reconcilePassed, readiness.reconcile_ok]);

  const activeCutover =
    byProduct.find((p: any) => p.product_id === activeProductId) || byProduct[0] || null;
  const items = activeCutover?.items || cutover?.items || [];
  const doneCount = items.filter((i: any) => i.done).length;
  const complete =
    cutover?.status === "complete" || activeCutover?.status === "complete";
  const canAct = ["change_board", "product_owner", "architect", "engineer"].includes(
    sessionRole
  );
  // Demo / delivery roles that can record production cutover sign-off
  const canSign = [
    "change_board",
    "product_owner",
    "architect",
    "engineer",
  ].includes(sessionRole);

  useEffect(() => {
    if (view && ["checklist", "consumers", "freeze", "signoff"].includes(view)) {
      setSub(view as SubTab);
    }
  }, [view]);

  useEffect(() => {
    if (byProduct.length && activeProductId == null) {
      setActiveProductId(byProduct[0].product_id);
    }
  }, [byProduct, activeProductId]);

  useEffect(() => {
    if (!products.length) return;
    // Prefer reconcile-ready products; fall back to all so the CTA stays usable
    const preferred = reconcileReadyIds.length
      ? reconcileReadyIds
      : products.map((p) => p.id);
    setSelectedPromote((prev) => {
      if (prev.length) {
        // Drop ids that no longer exist; keep user selection otherwise
        const alive = prev.filter((id) => products.some((p) => p.id === id));
        return alive.length ? alive : preferred;
      }
      return preferred;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, reconcileReadyIds.join(",")]);

  const promoteIds = useMemo(() => {
    const selectedReady = selectedPromote.filter((id) =>
      reconcileReadyIds.includes(id)
    );
    if (selectedReady.length) return selectedReady;
    if (reconcileReadyIds.length) return reconcileReadyIds;
    return selectedPromote;
  }, [selectedPromote, reconcileReadyIds]);

  const canPromote =
    canAct &&
    !!project?.test_env_ready &&
    !prodReady &&
    (promoteIds.length > 0 || products.length > 0);

  const freezeCandidates = useMemo(
    () =>
      dispositions.filter((d) =>
        ["retire", "archive-only", "consolidate"].includes(d.final)
      ),
    [dispositions]
  );

  const consumerNames = useMemo(() => {
    const fromReg = Object.keys(consumerReg);
    if (fromReg.length) return fromReg.sort();
    const set = new Set<string>();
    dispositions.forEach((d) => {
      (d.evidence?.consumers || []).forEach((c: string) => set.add(c));
    });
    return Array.from(set).sort();
  }, [consumerReg, dispositions]);

  const filteredFreeze = useMemo(() => {
    if (!q) return freezeCandidates;
    const needle = q.toLowerCase();
    return freezeCandidates.filter((d) =>
      String(d.object_fqn || "").toLowerCase().includes(needle)
    );
  }, [freezeCandidates, q]);

  const selectedItem =
    selectedItemId != null
      ? items.find((i: any) => i.id === selectedItemId) || null
      : null;
  const selectedFreeze =
    selectedFreezeId != null
      ? freezeCandidates.find((d) => d.id === selectedFreezeId) || null
      : null;

  const gates: any[] = readiness.gates || [];
  const defaultContract =
    activeCutover?.dataset_name ||
    products.find((p) => p.id === activeCutover?.product_id)?.dataset_name ||
    "production_contract";

  const shell = embedded ? "space-y-4 p-5" : "space-y-4";

  return (
    <div className={shell}>
      {/* Production readiness banner */}
      <div className="rounded-lg border border-tm-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-tm-ink">Migrate to Production</h3>
            <p className="mt-0.5 text-xs text-tm-gray-600">
              Promote Pilot-reconciled products, switch consumers, freeze legacy, then Change
              Board sign-off — per product, never estate-wide big-bang.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!prodReady ? (
              <button
                type="button"
                className="btn text-xs"
                disabled={busy || !canPromote}
                title={
                  !project?.test_env_ready
                    ? "Complete Pilot · Migrate to Test first"
                    : !canAct
                      ? "Requires architect, engineer, product owner, or change board"
                      : !promoteIds.length
                        ? "No reconcile-ready products — run Pilot Reconcile first"
                        : `Promote ${promoteIds.length} reconcile-ready product${
                            promoteIds.length === 1 ? "" : "s"
                          }`
                }
                onClick={() => void onPromoteProd(promoteIds)}
              >
                Promote to Production
                {promoteIds.length ? ` (${promoteIds.length})` : ""}
              </button>
            ) : complete ? (
              <Link href={phaseHref("7_decommission")} className="btn text-xs">
                Continue → Retire
              </Link>
            ) : (
              <span className="badge-success text-xs">Production promoted</span>
            )}
            <button type="button" className="btn-ghost text-xs" onClick={onRefreshCutover}>
              Refresh
            </button>
          </div>
        </div>
        {!project?.test_env_ready ? (
          <p className="mt-2 text-xs text-amber-800">
            Migrate to Test is not marked ready — finish Pilot dual-run before promoting.
          </p>
        ) : !reconcileReadyIds.length && !prodReady ? (
          <p className="mt-2 text-xs text-amber-800">
            No products have passed Pilot reconcile yet — run Reconcile in Pilot, then
            promote the ready ones here.
          </p>
        ) : !reconcilePassed && !readiness.reconcile_ok && !prodReady ? (
          <p className="mt-2 text-xs text-tm-gray-600">
            Promoting {promoteIds.length} reconcile-ready product
            {promoteIds.length === 1 ? "" : "s"}
            {selectedPromote.length > promoteIds.length
              ? ` (${selectedPromote.length - promoteIds.length} skipped until reconcile passes)`
              : ""}
            .
          </p>
        ) : null}
        {msg ? <p className="mt-2 text-xs text-tm-gray-500">{msg}</p> : null}
      </div>

      {/* Gate strip */}
      {!!gates.length && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {gates.map((g) => (
            <div
              key={g.id}
              className={`rounded-md border px-3 py-2 text-xs ${
                g.done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-tm-gray-200 bg-tm-gray-50 text-tm-gray-600"
              }`}
            >
              <div>
                <span className="font-semibold">{g.done ? "✓ " : "○ "}</span>
                {g.label}
              </div>
              {!g.done && g.detail ? (
                <p className="mt-1 text-[11px] opacity-80">{g.detail}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {sub === "checklist" && (
        <div
          className={
            embedded
              ? "-mx-5 -mb-5 flex min-h-[calc(100vh-16rem)] flex-col border-t border-tm-gray-200"
              : "space-y-4"
          }
        >
          {!prodReady && (
            <div className="mx-5 mt-4 rounded-md border border-dashed border-tm-gray-300 bg-tm-gray-50 p-3">
              <p className="text-xs font-medium text-tm-ink">Select products to promote</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {products.map((p) => {
                  const ok = byProduct.find((b: any) => b.product_id === p.id)
                    ?.reconcile_passed;
                  const on = selectedPromote.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`rounded border px-2 py-1 text-xs ${
                        on
                          ? "border-tm-magenta bg-tm-magenta-light/50"
                          : "border-tm-gray-200 bg-white"
                      }`}
                      onClick={() =>
                        setSelectedPromote((prev) =>
                          prev.includes(p.id)
                            ? prev.filter((x) => x !== p.id)
                            : [...prev, p.id]
                        )
                      }
                    >
                      {p.name}
                      {ok ? " · reconcile ✓" : " · reconcile pending"}
                    </button>
                  );
                })}
                {!products.length && (
                  <span className="text-xs text-tm-gray-500">
                    No data products — complete Pilot first.
                  </span>
                )}
              </div>
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
                countLabel={`${doneCount}/${items.length || 0} complete`}
                filters={
                  byProduct.length > 1 ? (
                    <select
                      className="input !mt-0 max-w-[220px]"
                      value={activeCutover?.product_id || ""}
                      onChange={(e) => setActiveProductId(Number(e.target.value))}
                    >
                      {byProduct.map((p: any) => (
                        <option key={p.product_id} value={p.product_id}>
                          {p.product_name} ({p.status})
                        </option>
                      ))}
                    </select>
                  ) : undefined
                }
              />
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-tm-gray-50">
                    <tr>
                      <th className="table-th px-4">Step</th>
                      <th className="table-th">Group</th>
                      <th className="table-th px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it: any) => (
                      <tr
                        key={it.id}
                        className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                          selectedItemId === it.id ? "bg-tm-magenta-light/60" : ""
                        }`}
                        onClick={() => setSelectedItemId(it.id)}
                      >
                        <td className="table-td px-4 text-sm font-medium">{it.label}</td>
                        <td className="table-td text-xs text-tm-gray-500">
                          {it.group || "—"}
                        </td>
                        <td className="table-td px-4">
                          {it.done ? (
                            <span className="badge-success">done</span>
                          ) : (
                            <span className="badge-neutral">open</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!items.length && (
                      <tr>
                        <td className="table-td px-4 text-tm-gray-500" colSpan={3}>
                          No checklist yet — promote a product or refresh after Pilot.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <InspectorPanel
              open={!!selectedItem}
              title={selectedItem?.label || "Checklist item"}
              onClose={() => setSelectedItemId(null)}
            >
              {selectedItem ? (
                <div className="space-y-3 text-sm">
                  <dl className="grid gap-2 text-xs">
                    <div>
                      <dt className="text-tm-gray-500">Id</dt>
                      <dd className="font-mono">{selectedItem.id}</dd>
                    </div>
                    <div>
                      <dt className="text-tm-gray-500">Status</dt>
                      <dd>{selectedItem.done ? "done" : "open"}</dd>
                    </div>
                  </dl>
                  {selectedItem.id === "prod_promote" && !selectedItem.done ? (
                    <button
                      className="btn text-xs"
                      disabled={busy || !canPromote}
                      onClick={() => void onPromoteProd(promoteIds)}
                    >
                      Promote to Production
                      {promoteIds.length ? ` (${promoteIds.length})` : ""}
                    </button>
                  ) : !selectedItem.done ? (
                    <button
                      className="btn text-xs"
                      disabled={busy || !canSign}
                      onClick={() =>
                        onCompleteItem(selectedItem.id, activeCutover?.product_id)
                      }
                    >
                      {canSign ? "Complete step" : "Restricted role"}
                    </button>
                  ) : (
                    <span className="badge-success">Completed</span>
                  )}
                </div>
              ) : null}
            </InspectorPanel>
          </div>
        </div>
      )}

      {sub === "consumers" && (
        <div
          className={
            embedded
              ? "-mx-5 -mb-5 flex min-h-[calc(100vh-14rem)] flex-row border-t border-tm-gray-200"
              : "flex min-h-[360px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DataToolbar
              countLabel={`${consumerNames.length} consumers · ${
                readiness.consumers_switched || 0
              } switched`}
              actions={
                <button
                  type="button"
                  className="btn text-xs"
                  disabled={busy || !canAct || !consumerNames.length}
                  title={
                    !canAct
                      ? "Requires Architect, Change Board, Product Owner, or Engineer"
                      : !consumerNames.length
                        ? "No consumers harvested yet"
                        : "Mark every non-blocked consumer as switched"
                  }
                  onClick={() =>
                    void onCompleteItem("consumers", activeCutover?.product_id)
                  }
                >
                  Mark all switched
                </button>
              }
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-4">Consumer</th>
                    <th className="table-th">Status</th>
                    <th className="table-th px-4">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {consumerNames.map((c) => {
                    const entry = consumerReg[c] || {};
                    return (
                      <tr
                        key={c}
                        className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                          selectedConsumer === c ? "bg-tm-magenta-light/60" : ""
                        }`}
                        onClick={() => setSelectedConsumer(c)}
                      >
                        <td className="table-td px-4 font-medium">{c}</td>
                        <td className="table-td">
                          <span
                            className={
                                entry.status === "switched"
                                ? "badge-success"
                                : entry.status === "blocked"
                                  ? "badge-magenta"
                                  : "badge-neutral"
                            }
                          >
                            {entry.status || "pending"}
                          </span>
                        </td>
                        <td className="table-td px-4 font-mono text-xs">
                          {entry.contract || defaultContract}
                        </td>
                      </tr>
                    );
                  })}
                  {!consumerNames.length && (
                    <tr>
                      <td className="table-td px-4 text-tm-gray-500" colSpan={3}>
                        No consumers harvested — run Discover / Decide so consumer evidence is
                        available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <InspectorPanel
            open={!!selectedConsumer}
            title={selectedConsumer || "Consumer"}
            onClose={() => setSelectedConsumer(null)}
          >
            {selectedConsumer ? (
              <div className="space-y-3 text-xs text-tm-gray-600">
                <p>
                  Switch <strong>{selectedConsumer}</strong> onto the production contract before
                  legacy freeze.
                </p>
                <label className="block">
                  Status
                  <select
                    className="input mt-1 w-full"
                    disabled={busy || !canAct}
                    value={(consumerReg[selectedConsumer] || {}).status || "pending"}
                    onChange={(e) =>
                      void onUpdateConsumer({
                        name: selectedConsumer,
                        status: e.target.value,
                        contract:
                          (consumerReg[selectedConsumer] || {}).contract || defaultContract,
                      })
                    }
                  >
                    {STATUS_OPTS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="rounded bg-tm-gray-50 p-2">
                  Target dataset:{" "}
                  <code>
                    {(consumerReg[selectedConsumer] || {}).contract || defaultContract}
                  </code>
                </p>
              </div>
            ) : null}
          </InspectorPanel>
        </div>
      )}

      {sub === "freeze" && (
        <div
          className={
            embedded
              ? "-mx-5 -mb-5 flex min-h-[calc(100vh-14rem)] flex-col border-t border-tm-gray-200"
              : "space-y-4"
          }
        >
          <div
            className={
              embedded
                ? "flex min-h-0 flex-1 flex-row"
                : "flex min-h-[360px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
            }
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <DataToolbar
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Filter freeze candidates…"
                countLabel={`${filteredFreeze.length} objects · ${
                  readiness.frozen || 0
                } frozen`}
                actions={
                  <button
                    className="btn text-xs"
                    disabled={busy || !canAct || !!prodEnv.freeze_applied}
                    onClick={() => void onApplyFreeze()}
                  >
                    {prodEnv.freeze_applied ? "Freeze applied" : "Apply legacy freeze"}
                  </button>
                }
              />
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-tm-gray-50">
                    <tr>
                      <th className="table-th px-4">Object</th>
                      <th className="table-th">Disposition</th>
                      <th className="table-th px-4">Retirement state</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFreeze.map((d) => (
                      <tr
                        key={d.id}
                        className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                          selectedFreezeId === d.id ? "bg-tm-magenta-light/60" : ""
                        }`}
                        onClick={() => setSelectedFreezeId(d.id)}
                      >
                        <td className="table-td px-4 font-mono text-xs">{d.object_fqn}</td>
                        <td className="table-td text-sm">{d.final}</td>
                        <td className="table-td px-4 text-sm">{d.retirement_state}</td>
                      </tr>
                    ))}
                    {!filteredFreeze.length && (
                      <tr>
                        <td className="table-td px-4 text-tm-gray-500" colSpan={3}>
                          No freeze candidates — complete Decide disposition first.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <InspectorPanel
              open={!!selectedFreeze}
              title={selectedFreeze?.object_fqn || "Freeze candidate"}
              onClose={() => setSelectedFreezeId(null)}
            >
              {selectedFreeze ? (
                <div className="space-y-2 text-xs text-tm-gray-600">
                  <p>
                    Disposition <strong>{selectedFreeze.final}</strong> — freeze so legacy cannot
                    drift during the production cutover window.
                  </p>
                  <p>
                    Retirement state: <strong>{selectedFreeze.retirement_state}</strong>
                  </p>
                </div>
              ) : null}
            </InspectorPanel>
          </div>
        </div>
      )}

      {sub === "signoff" && (
        <div className="card max-w-2xl space-y-4">
          <h3 className="text-base font-semibold">Change Board · production cutover sign-off</h3>
          <p className="text-sm text-tm-gray-600">
            Confirms production promotion, consumer switch, and legacy freeze. Completing
            sign-off returns you to the <strong>Suite Gallery</strong> with Migrate
            marked complete so you can open <strong>Retire</strong> next.
          </p>
          <ul className="space-y-2 text-sm">
            {(readiness.gates || []).map((g: any) => (
              <li
                key={g.id}
                className="flex flex-col gap-0.5 rounded-lg bg-tm-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span>{g.label}</span>
                  {!g.done && g.detail ? (
                    <p className="mt-0.5 text-xs text-tm-gray-500">{g.detail}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <strong className={g.done ? "text-good" : "text-warn"}>
                    {g.done ? "met" : "open"}
                  </strong>
                  {g.id === "signoff" &&
                  !g.done &&
                  readiness.ready_for_signoff &&
                  canSign ? (
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={busy}
                      onClick={() => void onSignoff(signoffNotes)}
                    >
                      Sign off now
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {!readiness.ready_for_signoff && !prodEnv.signoff?.signed_at ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Sign-off stays disabled until every gate above (except Change Board
              sign-off itself) is met. Draft/suggested products that were not promoted
              do not block this gate.
            </p>
          ) : null}
          {prodEnv.signoff?.signed_at ? (
            <div className="space-y-2">
              <div className="badge-success w-fit text-sm">
                Signed by {prodEnv.signoff.signed_by} · {prodEnv.signoff.signed_at}
              </div>
              <Link href={phaseHref("7_decommission")} className="btn text-xs">
                Continue → Retire
              </Link>
            </div>
          ) : (
            <>
              <label className="block text-xs">
                Sign-off notes
                <textarea
                  className="input mt-1 min-h-[72px] w-full"
                  value={signoffNotes}
                  onChange={(e) => setSignoffNotes(e.target.value)}
                  placeholder="Go-live window, residual risks, rollback owner…"
                />
              </label>
              <button
                type="button"
                className="btn"
                disabled={busy || !canSign || !readiness.ready_for_signoff}
                title={
                  !canSign
                    ? "Sign in as Architect, Change Board, Product Owner, or Engineer"
                    : !readiness.ready_for_signoff
                      ? "Complete promote, consumers, and freeze first"
                      : "Record production cutover sign-off and return to Gallery"
                }
                onClick={() => void onSignoff(signoffNotes)}
              >
                Sign off production cutover → Retire
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
