"use client";

import { useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";
import { Meta } from "@/components/phases/discovery/shared";
import { DiscoveryTerminal } from "@/components/phases/discovery/DiscoveryTerminal";
import {
  INVENTORY_AGENTS,
  terminalLinesFromRun,
} from "@/components/phases/discovery/discoveryAgents";

type Props = {
  inventory: any[];
  discoveryRun?: any | null;
  lineage?: { nodes?: any[]; edges?: any[] };
  busy?: boolean;
  msg?: string;
  estateBound?: boolean;
  /** Completed Activity (discover) scan required before Find inventory */
  discoverDone?: boolean;
  onPollDiscovery?: (runId?: number) => void;
  onRunDiscovery?: () => void;
};

type InspectorTab = "overview" | "profile";

function columnRowsFor(obj: any) {
  const colMap = obj?.profile?.columns || {};
  const cols = obj?.columns || [];
  if (cols.length) {
    return cols.map((c: any) => {
      const p = colMap[c.name] || {};
      return {
        name: c.name,
        data_type: c.data_type || p.data_type || "—",
        null_rate: c.null_rate ?? p.null_rate,
        distinct_count: c.distinct_count ?? p.distinct_count,
        cardinality: p.cardinality || "—",
        pii_hint: p.pii_hint || null,
        is_pk: c.is_pk ?? p.is_pk,
      };
    });
  }
  return Object.entries(colMap).map(([name, p]: [string, any]) => ({
    name,
    data_type: p.data_type || "—",
    null_rate: p.null_rate,
    distinct_count: p.distinct_count,
    cardinality: p.cardinality || "—",
    pii_hint: p.pii_hint,
    is_pk: p.is_pk,
  }));
}

function CompactStat({ label, value }: { label: string; value: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-tm-gray-400">{label}</span>{" "}
      <span className="font-semibold text-tm-ink">{value}</span>
    </span>
  );
}

/** Inventory workbench: catalog + live Cursor agents (inventory + lineage). */
export function InventoryView({
  inventory,
  discoveryRun = null,
  busy = false,
  msg = "",
  estateBound = true,
  discoverDone = false,
  onPollDiscovery,
  onRunDiscovery,
}: Props) {
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<InspectorTab>("overview");

  const runStatus = String(discoveryRun?.status || "").toLowerCase();
  const discoveryActive = ["queued", "running"].includes(runStatus);
  const terminalLines = useMemo(
    () => terminalLinesFromRun(discoveryRun, INVENTORY_AGENTS),
    [discoveryRun]
  );

  useEffect(() => {
    if (!discoveryActive || !onPollDiscovery) return;
    const id = window.setInterval(
      () => onPollDiscovery(discoveryRun?.id),
      700
    );
    return () => window.clearInterval(id);
  }, [discoveryActive, onPollDiscovery, discoveryRun?.id]);

  const runCompleted = runStatus === "completed";
  const runFailed = runStatus === "failed";
  const hasFinishedRun = runCompleted || runFailed;
  /** Find inventory only after Activity discover completed and estate is bound */
  const canRun =
    !!onRunDiscovery &&
    !busy &&
    !discoveryActive &&
    estateBound &&
    discoverDone;

  const runLabel = discoveryActive
    ? "Finding…"
    : hasFinishedRun
      ? "Re-find inventory"
      : inventory.length
        ? "Refresh inventory"
        : "Find inventory";

  const stats = useMemo(() => {
    const tables = inventory.filter((o) => o.object_type === "table");
    let profiled = 0;
    let pii = 0;
    for (const t of tables) {
      if (t.profile && Object.keys(t.profile).length) profiled += 1;
      pii += (t.profile?.pii_columns || []).length;
    }
    return {
      objects: inventory.length,
      tables: tables.length,
      profiled,
      pii,
    };
  }, [inventory]);

  const filtered = useMemo(() => {
    return inventory.filter((o) => {
      if (typeFilter !== "all" && o.object_type !== typeFilter) return false;
      if (!q) return true;
      const hay = `${o.fully_qualified_name} ${o.description} ${(o.consumers || []).join(" ")}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [inventory, q, typeFilter]);

  const selected = selectedId != null ? inventory.find((o) => o.id === selectedId) || null : null;
  const isTable = selected?.object_type === "table";
  const profileRows = useMemo(() => (selected ? columnRowsFor(selected) : []), [selected]);
  const hasProfile =
    isTable &&
    !!(
      selected?.profile &&
      (Object.keys(selected.profile.columns || {}).length ||
        selected.profile.pii_columns?.length ||
        selected.columns?.length)
    );

  function selectRow(id: number) {
    setSelectedId(id);
    setTab("overview");
  }

  const statusHint = discoveryActive
    ? `InventoryProfiler & LineageStitcher running${discoveryRun?.id ? ` · #${discoveryRun.id}` : ""}`
    : discoveryRun?.id
      ? `Last inventory run #${discoveryRun.id}${runFailed ? " · failed" : runCompleted ? " · done" : ""}`
      : "Run InventoryProfiler & LineageStitcher to build catalog and lineage";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-tm-gray-200 px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-xs text-tm-gray-500">{statusHint}</p>
        {onRunDiscovery && (
          <button
            type="button"
            className="btn shrink-0 text-xs"
            disabled={!canRun}
            title={
              !estateBound
                ? "Connect a source first"
                : !discoverDone
                  ? "Complete Activity (discover scan) first"
                  : discoveryActive
                    ? "Inventory agents in progress"
                    : busy
                      ? "Please wait…"
                      : "Run InventoryProfiler & LineageStitcher"
            }
            onClick={onRunDiscovery}
          >
            {runLabel}
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
          {!inventory.length ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-sm text-tm-gray-500">
              <p className="font-semibold text-tm-ink">No inventory yet</p>
              <p className="mt-2 max-w-md">
                {!discoverDone
                  ? "Finish the Activity discover scan first — Inventory builds only from that stage’s estate (via API) and stores catalog + lineage in the backend."
                  : "Find inventory calls the backend InventoryProfiler & LineageStitcher using the last Activity scan’s estate. Results are loaded from the API for Lineage and Review."}
              </p>
              {!discoverDone && (
                <p className="mt-2 text-xs text-warn">
                  Activity scan required before Find inventory.
                </p>
              )}
              {msg ? (
                <p className="mt-3 max-w-lg rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {msg}
                </p>
              ) : null}
              {runFailed && discoveryRun?.error ? (
                <p className="mt-2 max-w-lg text-xs text-bad">
                  Last run failed: {discoveryRun.error}
                </p>
              ) : null}
              {onRunDiscovery && (
                <button
                  type="button"
                  className="btn mt-5 text-xs"
                  disabled={!canRun}
                  onClick={onRunDiscovery}
                >
                  Find inventory
                </button>
              )}
            </div>
          ) : (
            <>
              <DataToolbar
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Search objects…"
                filters={
                  <>
                    <select
                      className="input !mt-0 max-w-[130px]"
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                    >
                      <option value="all">All types</option>
                      <option value="table">Tables</option>
                      <option value="script">Scripts</option>
                      <option value="repo">Repos</option>
                    </select>
                    <div className="hidden items-center gap-3 text-[11px] text-tm-gray-500 sm:flex">
                      <CompactStat label="Objects" value={stats.objects} />
                      <CompactStat label="Tables" value={stats.tables} />
                      <CompactStat label="Profiled" value={stats.profiled} />
                      <CompactStat label="PII" value={stats.pii} />
                    </div>
                  </>
                }
                countLabel={`${filtered.length} shown`}
              />
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-tm-gray-50">
                    <tr>
                      <th className="table-th px-4">Object</th>
                      <th className="table-th">Type</th>
                      <th className="table-th">Rows</th>
                      <th className="table-th">Cols</th>
                      <th className="table-th">PII</th>
                      <th className="table-th">Access</th>
                      <th className="table-th px-4">Consumers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((o) => {
                      const colN =
                        o.columns?.length ||
                        Object.keys(o.profile?.columns || {}).length ||
                        0;
                      const piiN = o.profile?.pii_columns?.length || 0;
                      return (
                        <tr
                          key={o.id}
                          className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                            selected?.id === o.id ? "bg-tm-magenta-light/60" : ""
                          }`}
                          onClick={() => selectRow(o.id)}
                        >
                          <td className="table-td px-4 font-medium text-tm-ink">
                            {o.fully_qualified_name}
                          </td>
                          <td className="table-td">
                            <span className="badge-neutral">{o.object_type}</span>
                          </td>
                          <td className="table-td">
                            {o.row_count?.toLocaleString?.() ?? "—"}
                          </td>
                          <td className="table-td">
                            {o.object_type === "table" ? colN || "—" : "—"}
                          </td>
                          <td className="table-td">
                            {o.object_type === "table" ? (
                              piiN > 0 ? (
                                <span className="font-medium text-amber-800">{piiN}</span>
                              ) : (
                                "0"
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="table-td">{o.access_count ?? "—"}</td>
                          <td className="table-td px-4 text-xs text-tm-gray-500">
                            {(o.consumers || []).slice(0, 2).join(", ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <InspectorPanel
          open={!!selected}
          title={selected?.fully_qualified_name || "Object detail"}
          onClose={() => setSelectedId(null)}
        >
          {selected ? (
            <div className="space-y-3 text-sm">
              {isTable && (
                <div className="flex gap-1 border-b border-tm-gray-100 pb-2">
                  {(
                    [
                      ["overview", "Overview"],
                      ["profile", "Profile"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTab(id)}
                      className={`rounded px-2.5 py-1 text-xs font-medium ${
                        tab === id
                          ? "bg-tm-ink text-white"
                          : "text-tm-gray-600 hover:bg-tm-gray-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {(!isTable || tab === "overview") && (
                <>
                  <p className="text-tm-gray-600">
                    {selected.description || "No description"}
                  </p>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <Meta label="Schema" value={selected.schema_name} />
                    <Meta label="Type" value={selected.object_type} />
                    <Meta label="Rows" value={selected.row_count ?? "—"} />
                    <Meta
                      label="Retention"
                      value={selected.retention_required ? "Required" : "None"}
                    />
                    <Meta label="Last access" value={selected.last_accessed || "—"} />
                    <Meta label="Source path" value={selected.source_path || "—"} />
                  </dl>
                  {selected.columns?.length > 0 && tab === "overview" && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                        Columns ({selected.columns.length})
                      </h4>
                      <ul className="mt-2 max-h-[40vh] space-y-1 overflow-auto">
                        {selected.columns.map((c: any) => (
                          <li
                            key={c.id ?? c.name}
                            className="flex items-center justify-between rounded bg-tm-gray-50 px-2 py-1.5 text-xs"
                          >
                            <span className="font-medium">
                              {c.name}
                              {c.is_pk && (
                                <span className="ml-1 text-tm-magenta">PK</span>
                              )}
                            </span>
                            <span className="text-tm-gray-500">{c.data_type}</span>
                          </li>
                        ))}
                      </ul>
                      {isTable && (
                        <button
                          type="button"
                          onClick={() => setTab("profile")}
                          className="mt-2 text-xs font-medium text-tm-ink underline-offset-2 hover:underline"
                        >
                          Open full profile →
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {isTable && tab === "profile" && (
                <div className="space-y-3">
                  <p className="text-xs text-tm-gray-500">
                    Null rates, cardinality, and PII hints from discovery profiling.
                  </p>
                  {!hasProfile && !profileRows.length ? (
                    <p className="text-xs text-tm-gray-500">No profile metadata.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-tm-gray-500">
                          <th className="py-1">Column</th>
                          <th>Type</th>
                          <th>Null%</th>
                          <th>Distinct</th>
                          <th>Card.</th>
                          <th>PII</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileRows.map((c: {
                          name: string;
                          data_type: string;
                          null_rate?: number | null;
                          distinct_count?: number | null;
                          cardinality: string;
                          pii_hint?: string | null;
                          is_pk?: boolean;
                        }) => (
                          <tr key={c.name} className="border-t border-tm-gray-100">
                            <td className="py-1.5 font-medium">
                              {c.is_pk ? (
                                <span className="mr-1 text-tm-magenta">PK</span>
                              ) : null}
                              {c.name}
                            </td>
                            <td className="text-tm-gray-500">{c.data_type}</td>
                            <td>
                              {c.null_rate != null
                                ? `${Math.round(c.null_rate * 100)}%`
                                : "—"}
                            </td>
                            <td>{c.distinct_count?.toLocaleString?.() ?? "—"}</td>
                            <td>{c.cardinality}</td>
                            <td>{c.pii_hint || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-tm-gray-500">Select a row to inspect.</p>
          )}
        </InspectorPanel>
      </div>

      <DiscoveryTerminal
        lines={terminalLines}
        active={discoveryActive}
        emptyHint="InventoryProfiler & LineageStitcher stdout streams here when you Find inventory…"
      />
    </div>
  );
}
