"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DataToolbar } from "@/components/shell/DataToolbar";

type SubTab = "tables" | "code" | "dags" | "approve";

type Lane = {
  id?: string;
  kind: string;
  asset_type?: string;
  label: string;
  source_tech: string;
  source_label: string;
  source_counts?: Record<string, number>;
  object_count: number;
  in_scope_count?: number;
  target: string;
  target_options: { id: string; label: string }[];
};

type Props = {
  project: any;
  artifacts: any[];
  summary: any | null;
  metadataComplete: boolean;
  busy: boolean;
  msg: string;
  sessionRole: string;
  onGenerate: (targets?: Record<string, string>) => void;
  onSaveTargets?: (targets: Record<string, string>) => void;
  onSaveArtifact?: (id: number, body: Record<string, any>) => void;
  onApprove: () => void;
  embedded?: boolean;
  view?: string;
};

/** Asset types that belong on each convert view. */
const ASSETS_FOR_VIEW: Record<string, string[]> = {
  tables: ["table", "view"],
  code: [
    "script",
    "procedure",
    "package",
    "function",
    "job",
    "repo",
    "report",
  ],
  dags: ["dag"],
};

const VIEW_COPY: Record<
  string,
  { title: string; blurb: string; emptyHint: string }
> = {
  tables: {
    title: "Tables & views",
    blurb: "Warehouse objects → analytical store (BigQuery, Snowflake, …).",
    emptyHint:
      "No table/view artifacts yet. Confirm targets for Tables/Views, then Generate pack.",
  },
  code: {
    title: "Scripts, jobs & procedures",
    blurb: "On-prem Spark / shell / PL/SQL → Dataproc / managed compute.",
    emptyHint:
      "No code artifacts yet. Confirm targets for scripts and Spark jobs, then Generate pack.",
  },
  dags: {
    title: "DAGs & schedules",
    blurb: "Airflow DAGs from discovery → Composer / MWAA.",
    emptyHint:
      "No DAG artifacts yet. Discovery should find every Airflow DAG under legacy/dags — Generate pack to convert them.",
  },
};

function laneKey(lane: Lane): string {
  return lane.asset_type || lane.id || lane.kind;
}

function lanesForView(lanes: Lane[], view: SubTab): Lane[] {
  if (view === "approve") return lanes;
  const allowed = new Set(ASSETS_FOR_VIEW[view] || []);
  return lanes.filter((l) => allowed.has(laneKey(l)));
}

function artifactsForView(artifacts: any[], view: SubTab): any[] {
  if (view === "approve") return artifacts;
  if (view === "tables") {
    return artifacts.filter(
      (a) =>
        a.kind === "table" ||
        a.source_type === "table" ||
        a.source_type === "view"
    );
  }
  if (view === "dags") {
    return artifacts.filter(
      (a) => a.kind === "dag" || a.source_type === "dag"
    );
  }
  // code: scripts/jobs/reports — not tables or dags
  return artifacts.filter((a) => {
    const t = a.source_type || "";
    if (t === "table" || t === "view" || t === "dag") return false;
    if (a.kind === "dag") return false;
    if (a.kind === "table") return false;
    return true;
  });
}

export function PhaseBuild({
  project,
  artifacts,
  summary,
  metadataComplete,
  busy,
  msg,
  sessionRole,
  onGenerate,
  onSaveTargets,
  onSaveArtifact,
  onApprove: _onApprove,
  embedded = false,
  view,
}: Props) {
  const initial = (view as SubTab) || "tables";
  const [sub, setSub] = useState<SubTab>(
    ["tables", "code", "dags", "approve"].includes(initial) ? initial : "tables"
  );
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [laneTargets, setLaneTargets] = useState<Record<string, string>>({});

  const allLanes: Lane[] = summary?.lanes || [];

  useEffect(() => {
    if (view && ["tables", "code", "dags", "approve"].includes(view)) {
      setSub(view as SubTab);
      setQ("");
      setTypeFilter("all");
      setSelectedId(null);
    }
  }, [view]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const lane of allLanes) {
      next[laneKey(lane)] = lane.target;
    }
    setLaneTargets(next);
  }, [summary]);

  const canGenerate = ["engineer", "architect", "product_owner"].includes(
    sessionRole
  );
  const canEdit = ["engineer", "architect"].includes(sessionRole);

  const scopedLanes = useMemo(
    () => lanesForView(allLanes, sub),
    [allLanes, sub]
  );

  const viewArtifacts = useMemo(
    () => artifactsForView(artifacts, sub),
    [artifacts, sub]
  );

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of viewArtifacts) {
      if (a.source_type) set.add(String(a.source_type));
    }
    return Array.from(set).sort();
  }, [viewArtifacts]);

  const rows = useMemo(() => {
    let list = viewArtifacts;
    if (typeFilter !== "all") {
      list = list.filter((a) => a.source_type === typeFilter);
    }
    if (!q) return list;
    const needle = q.toLowerCase();
    return list.filter((a) =>
      `${a.title} ${a.source_fqn} ${a.target_path} ${a.source_tech || ""} ${a.source_type || ""}`
        .toLowerCase()
        .includes(needle)
    );
  }, [viewArtifacts, typeFilter, q]);

  useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !rows.some((r) => r.id === selectedId)) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) || null;
  const byKind = summary?.by_kind || {};
  const buildApproved = !!project.build_approved;
  const copy = VIEW_COPY[sub];

  const setTarget = (assetType: string, target: string) => {
    const next = { ...laneTargets, [assetType]: target };
    setLaneTargets(next);
    onSaveTargets?.(next);
  };

  const runGenerate = () => onGenerate(laneTargets);

  const discoveredForView = scopedLanes.reduce(
    (n, l) => n + (l.object_count || 0),
    0
  );
  const inScopeForView = scopedLanes.reduce(
    (n, l) => n + (l.in_scope_count ?? 0),
    0
  );

  if (embedded && sub === "approve") {
    return (
      <ApproveView
        gateNote={
          buildApproved ? (
            <div className="badge-success w-fit text-xs">
              Build pack approved — use Continue to Pilot in the header
            </div>
          ) : (
            <p className="max-w-md text-xs text-brand-slate">
              Review the full technology map, generate if needed, then use{" "}
              <span className="font-medium text-brand-ink">Approve → Pilot</span>{" "}
              in the page header.
            </p>
          )
        }
        lanes={allLanes}
        laneTargets={laneTargets}
        onChangeTarget={setTarget}
        canEdit={canGenerate}
        busy={busy}
        metadataComplete={metadataComplete}
        onGenerate={runGenerate}
        byKind={byKind}
        survivors={summary?.survivors}
        narrative={summary?.narrative}
      />
    );
  }

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-tm-gray-50">
        {!metadataComplete ? (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-warn">
            Complete Align before generating the Build pack.
          </div>
        ) : null}
        {msg ? (
          <div className="shrink-0 border-b border-brand-line bg-brand-500/5 px-4 py-2 text-xs text-brand-600">
            {msg}
          </div>
        ) : null}

        <div className="shrink-0 border-b border-brand-line bg-white px-5 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-brand-ink">
                {copy?.title || sub}
              </h2>
              <p className="mt-0.5 text-[11px] text-brand-slate">{copy?.blurb}</p>
              <p className="mt-1 text-[11px] tabular-nums text-brand-muted">
                Discovery: {discoveredForView} objects
                {inScopeForView
                  ? ` · ${inScopeForView} migrate/rebuild in scope`
                  : ""}
                {viewArtifacts.length
                  ? ` · ${viewArtifacts.length} generated`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              className="btn shrink-0"
              disabled={busy || !canGenerate || !metadataComplete}
              onClick={runGenerate}
              title={
                !metadataComplete
                  ? "Complete Align first"
                  : "Generate conversion artifacts for migrate/rebuild survivors"
              }
            >
              Generate pack
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-brand-line bg-white">
          <ScopedTechMap
            lanes={scopedLanes}
            laneTargets={laneTargets}
            onChangeTarget={setTarget}
            canEdit={canGenerate}
            busy={busy}
            viewLabel={copy?.title || sub}
          />
        </div>

        <Workbench
          kindLabel={copy?.title || sub}
          emptyHint={copy?.emptyHint || "Generate the pack to create artifacts."}
          discoveredCount={discoveredForView}
          rows={rows}
          q={q}
          setQ={setQ}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          typeOptions={typeOptions}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selected={selected}
          canEdit={canEdit}
          busy={busy}
          onSaveArtifact={onSaveArtifact}
        />
      </div>
    );
  }

  // Non-embedded fallback
  return (
    <div className="space-y-4 p-5">
      <p className="text-sm text-brand-slate">Open Build from the workspace.</p>
    </div>
  );
}

function ScopedTechMap({
  lanes,
  laneTargets,
  onChangeTarget,
  canEdit,
  busy,
  viewLabel,
  heading = "Technology for this view",
}: {
  lanes: Lane[];
  laneTargets: Record<string, string>;
  onChangeTarget: (assetType: string, target: string) => void;
  canEdit: boolean;
  busy: boolean;
  viewLabel: string;
  heading?: string | null;
}) {
  if (!lanes.length) {
    return (
      <div className="px-5 py-3">
        <p className="text-xs text-brand-slate">
          No Discovery assets of this type yet. Run Discovery (and Decide) so{" "}
          {viewLabel.toLowerCase()} appear here for technology mapping.
        </p>
      </div>
    );
  }

  return (
    <div className="px-5 py-3">
      {heading ? (
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
          {heading}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-md border border-brand-line">
        <table className="w-full">
          <thead className="bg-tm-gray-50">
            <tr>
              <th className="table-th px-3">Asset type</th>
              <th className="table-th">Objects</th>
              <th className="table-th">Identified</th>
              <th className="table-th px-3">Target</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane) => {
              const key = laneKey(lane);
              return (
                <tr key={key} className="bg-white">
                  <td className="table-td px-3 font-medium text-brand-ink">
                    {lane.label}
                  </td>
                  <td className="table-td tabular-nums text-brand-slate">
                    {lane.object_count}
                    {lane.in_scope_count != null ? (
                      <span className="ml-1 text-[10px] text-brand-muted">
                        ({lane.in_scope_count} in scope)
                      </span>
                    ) : null}
                  </td>
                  <td className="table-td">
                    <span className="inline-flex rounded border border-brand-line bg-tm-gray-50 px-2 py-0.5 text-[11px] font-medium text-brand-ink">
                      {lane.source_label}
                    </span>
                  </td>
                  <td className="table-td px-3">
                    <select
                      className="input !mt-0 max-w-full !py-1.5 text-xs"
                      value={laneTargets[key] || lane.target}
                      disabled={!canEdit || busy}
                      onChange={(e) => onChangeTarget(key, e.target.value)}
                    >
                      {lane.target_options.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApproveView({
  gateNote,
  lanes,
  laneTargets,
  onChangeTarget,
  canEdit,
  busy,
  metadataComplete,
  onGenerate,
  byKind,
  survivors,
  narrative,
}: {
  gateNote: ReactNode;
  lanes: Lane[];
  laneTargets: Record<string, string>;
  onChangeTarget: (assetType: string, target: string) => void;
  canEdit: boolean;
  busy: boolean;
  metadataComplete: boolean;
  onGenerate: () => void;
  byKind: Record<string, number>;
  survivors?: number;
  narrative?: string;
}) {
  return (
    <div className="-m-0 flex min-h-0 flex-1 flex-col overflow-auto bg-tm-gray-50">
      <div className="shrink-0 border-b border-brand-line bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-brand-ink">
              Build gate · full technology map
            </h3>
            <p className="mt-1 text-xs text-brand-slate">
              All Discovery asset types. Generate the pack, then approve to unlock
              Pilot.
            </p>
          </div>
          {gateNote}
        </div>
      </div>
      <div className="mx-auto w-full max-w-5xl space-y-4 p-5">
        <div className="pane overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-line px-5 py-3">
            <div>
              <h4 className="text-sm font-semibold text-brand-ink">
                Asset technology map
              </h4>
              <p className="text-[11px] text-brand-slate">
                One row per Discovery asset type across the estate.
              </p>
            </div>
            <button
              type="button"
              className="btn"
              disabled={busy || !canEdit || !metadataComplete}
              onClick={onGenerate}
            >
              Generate pack
            </button>
          </div>
          <ScopedTechMap
            lanes={lanes}
            laneTargets={laneTargets}
            onChangeTarget={onChangeTarget}
            canEdit={canEdit}
            busy={busy}
            viewLabel="all assets"
            heading={null}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Survivors" value={String(survivors ?? "—")} />
          <Stat label="Tables" value={String(byKind.table ?? 0)} tone="accent" />
          <Stat label="Code / scripts" value={String(byKind.code ?? 0)} />
          <Stat label="DAGs" value={String(byKind.dag ?? 0)} />
        </div>
        <section className="pane p-4">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
            Narrative
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-brand-slate">
            {narrative ||
              "Map each Discovery asset type to a target, generate for migrate/rebuild survivors, then approve."}
          </p>
        </section>
      </div>
    </div>
  );
}

function Workbench({
  kindLabel,
  emptyHint,
  discoveredCount,
  rows,
  q,
  setQ,
  typeFilter,
  setTypeFilter,
  typeOptions,
  selectedId,
  setSelectedId,
  selected,
  canEdit,
  busy,
  onSaveArtifact,
}: {
  kindLabel: string;
  emptyHint: string;
  discoveredCount: number;
  rows: any[];
  q: string;
  setQ: (v: string) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  typeOptions: string[];
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
  selected: any | null;
  canEdit: boolean;
  busy: boolean;
  onSaveArtifact?: (id: number, body: Record<string, any>) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 flex-col">
        <DataToolbar
          search={q}
          onSearchChange={setQ}
          searchPlaceholder={`Search ${kindLabel}…`}
          countLabel={`${rows.length} artifacts`}
          filters={
            typeOptions.length > 1 ? (
              <select
                className="input !mt-0 !w-auto min-w-[8rem] !py-1.5 text-xs"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : null
          }
        />
        <div className="min-h-0 flex-1 overflow-auto">
          {!rows.length ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-sm font-semibold text-brand-ink">
                No generated artifacts
              </p>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-brand-slate">
                {emptyHint}
              </p>
              {discoveredCount > 0 ? (
                <p className="mt-3 text-[11px] text-brand-muted">
                  {discoveredCount} matching objects in Discovery — Generate pack
                  creates conversion stubs for in-scope survivors.
                </p>
              ) : null}
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-tm-gray-50">
                <tr>
                  <th className="table-th px-4">Asset</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Source</th>
                  <th className="table-th">Target</th>
                  <th className="table-th px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    className={`cursor-pointer hover:bg-tm-gray-50 ${
                      selectedId === a.id ? "bg-brand-500/[0.04]" : ""
                    }`}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <td className="table-td px-4">
                      <span className="font-medium text-brand-ink">{a.title}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-brand-muted">
                        {a.source_fqn}
                      </span>
                    </td>
                    <td className="table-td text-xs capitalize text-brand-slate">
                      {(a.source_type || a.kind || "—").replace(/_/g, " ")}
                    </td>
                    <td className="table-td text-xs capitalize text-brand-slate">
                      {(a.source_tech || "—").replace(/_/g, " ")}
                    </td>
                    <td className="table-td">
                      <span className="font-mono text-[11px] text-brand-ink">
                        {a.target_platform}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-brand-muted">
                        {a.target_path}
                      </span>
                    </td>
                    <td className="table-td px-4">
                      <span className="badge badge-neutral capitalize">
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <aside
        className={`flex w-[420px] shrink-0 flex-col border-l border-brand-line bg-white ${
          selected ? "" : "hidden"
        }`}
      >
        {selected ? (
          <>
            <div className="flex items-center justify-between border-b border-brand-line px-3 py-2.5">
              <h3 className="truncate text-sm font-semibold text-brand-ink">
                {selected.title}
              </h3>
              <button
                type="button"
                className="btn-ghost !py-1"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-brand-muted">Asset type</dt>
                  <dd className="capitalize text-brand-ink">
                    {(selected.source_type || "—").replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Source tech</dt>
                  <dd className="capitalize text-brand-ink">
                    {(selected.source_tech || "—").replace(/_/g, " ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Target</dt>
                  <dd className="text-brand-ink">{selected.target_platform}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Path</dt>
                  <dd className="break-all font-mono text-[11px]">
                    {selected.target_path}
                  </dd>
                </div>
              </dl>
              <label className="label mt-4">
                Generated artifact
                <textarea
                  className="input mt-1 min-h-[240px] font-mono text-[11px] leading-relaxed"
                  defaultValue={selected.content}
                  key={selected.id}
                  disabled={!canEdit || busy}
                  onBlur={(e) => {
                    if (e.target.value !== selected.content) {
                      onSaveArtifact?.(selected.id, { content: e.target.value });
                    }
                  }}
                />
              </label>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={busy}
                    onClick={() =>
                      onSaveArtifact?.(selected.id, { status: "reviewed" })
                    }
                  >
                    Mark reviewed
                  </button>
                  <button
                    type="button"
                    className="btn text-xs"
                    disabled={busy}
                    onClick={() =>
                      onSaveArtifact?.(selected.id, { status: "approved" })
                    }
                  >
                    Approve row
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        tone === "accent"
          ? "border-brand-500/25 bg-brand-500/[0.04]"
          : "border-brand-line bg-white"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-brand-ink">
        {value}
      </div>
    </div>
  );
}
