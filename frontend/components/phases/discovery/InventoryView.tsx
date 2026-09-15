"use client";

import { useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";
import { AtlasEmpty, AtlasPage, Meta } from "@/components/phases/discovery/shared";

type Props = {
  inventory: any[];
  discoveryRun?: any | null;
  lineage?: { nodes?: any[]; edges?: any[] };
  busy?: boolean;
  msg?: string;
  estateBound?: boolean;
  /** Completed Activity (discover) scan required before Run profiling */
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
      <span className="text-[#aeaeb2]">{label}</span>{" "}
      <span className="font-semibold text-[#1d1d1f]">{value}</span>
    </span>
  );
}

/** Profiling workbench: catalog + live Cursor agents (inventory pipeline + lineage). */
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

  useEffect(() => {
    if (!discoveryActive || !onPollDiscovery) return;
    const id = window.setInterval(
      () => onPollDiscovery(discoveryRun?.id),
      700
    );
    return () => window.clearInterval(id);
  }, [discoveryActive, onPollDiscovery, discoveryRun?.id]);

  const runFailed = runStatus === "failed";
  /** Run profiling only after Activity discover completed and estate is bound */
  const canRun =
    !!onRunDiscovery &&
    !busy &&
    !discoveryActive &&
    estateBound &&
    discoverDone;

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

  return (
    <AtlasPage fill>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col">
          {!inventory.length ? (
            <AtlasEmpty
              title="No profiling yet"
              detail={
                !discoverDone
                  ? "Finish the Activity discover scan first — Profiling builds catalog & lineage from that estate."
                  : "Run profiling runs InventoryProfiler & LineageStitcher. Results feed Lineage and Review."
              }
              action={
                <div className="flex flex-col items-center gap-2">
                  {!discoverDone ? (
                    <p className="text-xs text-[#9a6700]">
                      Activity scan required before Run profiling.
                    </p>
                  ) : null}
                  {msg ? <p className="atlas-alert is-warn max-w-lg">{msg}</p> : null}
                  {runFailed && discoveryRun?.error ? (
                    <p className="atlas-alert is-bad max-w-lg">
                      Last run failed: {discoveryRun.error}
                    </p>
                  ) : null}
                  {onRunDiscovery ? (
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={!canRun}
                      onClick={onRunDiscovery}
                    >
                      Run profiling
                    </button>
                  ) : null}
                </div>
              }
            />
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
                    <div className="hidden items-center gap-3 text-[11px] text-[#86868b] sm:flex">
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
                  <thead className="sticky top-0 bg-black/[0.03]">
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
                          className={`cursor-pointer hover:bg-[rgba(226,0,116,0.06)] ${
                            selected?.id === o.id ? "bg-[rgba(226,0,116,0.1)]" : ""
                          }`}
                          onClick={() => selectRow(o.id)}
                        >
                          <td className="table-td px-4 font-medium text-[#1d1d1f]">
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
                          <td className="table-td px-4 text-xs text-[#86868b]">
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
                <div className="flex gap-1 border-b border-black/5 pb-2">
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
                          ? "bg-[#1d1d1f] text-white"
                          : "text-[#6e6e73] hover:bg-black/[0.03]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {(!isTable || tab === "overview") && (
                <>
                  <p className="text-[#6e6e73]">
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
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">
                        Columns ({selected.columns.length})
                      </h4>
                      <ul className="mt-2 max-h-[40vh] space-y-1 overflow-auto">
                        {selected.columns.map((c: any) => (
                          <li
                            key={c.id ?? c.name}
                            className="flex items-center justify-between rounded bg-black/[0.03] px-2 py-1.5 text-xs"
                          >
                            <span className="font-medium">
                              {c.name}
                              {c.is_pk && (
                                <span className="ml-1 text-[#e20074]">PK</span>
                              )}
                            </span>
                            <span className="text-[#86868b]">{c.data_type}</span>
                          </li>
                        ))}
                      </ul>
                      {isTable && (
                        <button
                          type="button"
                          onClick={() => setTab("profile")}
                          className="mt-2 text-xs font-medium text-[#1d1d1f] underline-offset-2 hover:underline"
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
                  <p className="text-xs text-[#86868b]">
                    Null rates, cardinality, and PII hints from discovery profiling.
                  </p>
                  {!hasProfile && !profileRows.length ? (
                    <p className="text-xs text-[#86868b]">No profile metadata.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[#86868b]">
                          <th className="py-1">Column</th>
                          <th>Type</th>
                          <th>Null%</th>
                          <th>Distinct</th>
                          <th>Card.</th>
                          <th>PII</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profileRows.map(
                          (c: {
                            name: string;
                            data_type: string;
                            null_rate?: number | null;
                            distinct_count?: number | null;
                            cardinality: string;
                            pii_hint?: string | null;
                            is_pk?: boolean;
                          }) => (
                            <tr key={c.name} className="border-t border-black/5">
                              <td className="py-1.5 font-medium">
                                {c.is_pk ? (
                                  <span className="mr-1 text-[#e20074]">PK</span>
                                ) : null}
                                {c.name}
                              </td>
                              <td className="text-[#86868b]">{c.data_type}</td>
                              <td>
                                {c.null_rate != null
                                  ? `${Math.round(c.null_rate * 100)}%`
                                  : "—"}
                              </td>
                              <td>{c.distinct_count?.toLocaleString?.() ?? "—"}</td>
                              <td>{c.cardinality}</td>
                              <td>{c.pii_hint || "—"}</td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#86868b]">Select a row to inspect.</p>
          )}
        </InspectorPanel>
      </div>
    </AtlasPage>
  );
}
