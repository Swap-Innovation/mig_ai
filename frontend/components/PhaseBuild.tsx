"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DataToolbar } from "@/components/shell/DataToolbar";
import {
  ForgeThemePanel,
  ForgeThemeShell,
} from "@/components/workspace/ForgeThemeShell";

type SubTab = "tables" | "scripts" | "pipelines" | "reports" | "data" | "approve" | "code" | "dags";

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
  onGenerate: (targets?: Record<string, string>, tool?: string) => void;
  onSaveTargets?: (targets: Record<string, string>) => void;
  onSaveArtifact?: (id: number, body: Record<string, any>) => void;
  onApprove: () => void;
  embedded?: boolean;
  view?: string;
};

/** Asset types that belong on each convert view. */
const ASSETS_FOR_VIEW: Record<string, string[]> = {
  tables: ["table", "view"],
  scripts: [
    "script",
    "procedure",
    "package",
    "function",
    "job",
    "repo",
  ],
  code: [
    "script",
    "procedure",
    "package",
    "function",
    "job",
    "repo",
    "report",
  ],
  pipelines: ["dag"],
  dags: ["dag"],
  reports: ["report"],
  data: ["table", "view"],
};

const BUILD_VIEWS = [
  "tables",
  "scripts",
  "pipelines",
  "reports",
  "data",
  "approve",
  "code",
  "dags",
] as const;

const VIEW_COPY: Record<
  string,
  { title: string; blurb: string; emptyHint: string }
> = {
  tables: {
    title: "Table Migration",
    blurb: "Warehouse tables & views → analytical store (BigQuery, Snowflake, …).",
    emptyHint:
      "No table/view artifacts yet. Confirm targets for Tables/Views, then Generate pack.",
  },
  scripts: {
    title: "Script Migration",
    blurb: "Shell, Spark, PL/SQL, and job scripts → Dataproc / managed compute.",
    emptyHint:
      "No script artifacts yet. Confirm targets for scripts and Spark jobs, then Generate pack.",
  },
  code: {
    title: "Script Migration",
    blurb: "On-prem Spark / shell / PL/SQL → Dataproc / managed compute.",
    emptyHint:
      "No code artifacts yet. Confirm targets for scripts and Spark jobs, then Generate pack.",
  },
  pipelines: {
    title: "Pipeline Migration",
    blurb: "Airflow DAGs and schedules → Composer / MWAA.",
    emptyHint:
      "No DAG artifacts yet. Discovery should find every Airflow DAG under legacy/dags — Generate pack to convert them.",
  },
  dags: {
    title: "Pipeline Migration",
    blurb: "Airflow DAGs from discovery → Composer / MWAA.",
    emptyHint:
      "No DAG artifacts yet. Discovery should find every Airflow DAG under legacy/dags — Generate pack to convert them.",
  },
  reports: {
    title: "Report Migration",
    blurb: "BI / reporting assets → cloud semantic layer or export targets.",
    emptyHint:
      "No report artifacts yet. Reports surface from discovery inventory (object type report) after Generate pack.",
  },
  data: {
    title: "Data Migration",
    blurb: "Historical load, CDC, and backfill for migrate/rebuild survivor tables.",
    emptyHint:
      "No in-scope tables for data movement yet. Approve Align survivors, then Generate pack to plan loads.",
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
  const forgeOf = (a: any) => String(a?.detail?.forge_tool || "").toLowerCase();
  const anyTagged = artifacts.some((a) => Boolean(forgeOf(a)));
  if (view === "tables") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "tables";
      if (f === "data" || a.kind === "data") return false;
      return (
        a.kind === "table" ||
        a.source_type === "table" ||
        a.source_type === "view"
      );
    });
  }
  if (view === "data") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "data";
      return a.kind === "data" || a.source_type === "data";
    });
  }
  if (view === "pipelines" || view === "dags") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "pipelines";
      return a.kind === "dag" || a.source_type === "dag";
    });
  }
  if (view === "reports") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "reports";
      const t = String(a.source_type || "").toLowerCase();
      const k = String(a.kind || "").toLowerCase();
      return t === "report" || k === "report";
    });
  }
  // scripts / code
  return artifacts.filter((a) => {
    const f = forgeOf(a);
    if (anyTagged) return f === "scripts";
    const t = String(a.source_type || "").toLowerCase();
    if (
      t === "table" ||
      t === "view" ||
      t === "dag" ||
      t === "report" ||
      t === "data"
    )
      return false;
    if (a.kind === "dag" || a.kind === "table" || a.kind === "data") return false;
    if (String(a.kind || "").toLowerCase() === "report") return false;
    return true;
  });
}

function normalizeBuildView(view?: string): SubTab {
  if (view === "code") return "scripts";
  if (view === "dags") return "pipelines";
  if (view && (BUILD_VIEWS as readonly string[]).includes(view)) {
    return view as SubTab;
  }
  return "tables";
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
  const initial = normalizeBuildView(view);
  const [sub, setSub] = useState<SubTab>(initial);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [laneTargets, setLaneTargets] = useState<Record<string, string>>({});

  const allLanes: Lane[] = summary?.lanes || [];

  useEffect(() => {
    if (!view) return;
    const next = normalizeBuildView(view);
    setSub(next);
    setQ("");
    setTypeFilter("all");
    setSelectedId(null);
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

  const runGenerate = () => {
    const tool =
      sub === "code"
        ? "scripts"
        : sub === "dags"
          ? "pipelines"
          : ["tables", "scripts", "pipelines", "reports", "data"].includes(sub)
            ? sub
            : undefined;
    onGenerate(laneTargets, tool);
  };

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
        projectName={project?.name}
        packApproved={buildApproved}
        gateNote={
          buildApproved ? (
            <div className="badge-success w-fit text-xs">
              Build approved — continue to Pilot from Forge apps
            </div>
          ) : (
            <p className="max-w-md text-xs text-brand-slate">
              Generate each in-scope convert app from Forge apps, then{" "}
              <span className="font-medium text-brand-ink">
                Approve build → Pilot
              </span>{" "}
              when all in-scope convert apps are done. Accelerators stay available
              anytime.
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
      <ForgeThemeShell
        projectName={project?.name}
        title={copy?.title || sub}
        subtitle="Convert"
        category="convert"
        packApproved={buildApproved}
        fill
        banner={
          !metadataComplete ? (
            <div className="forge-theme-banner is-warn">
              Complete Align before generating the Build pack.
            </div>
          ) : viewArtifacts.length ? (
            <div className="forge-theme-banner is-info">
              {copy?.title || "Assets"} generated — return to Forge apps to convert
              the next in-scope app, then approve build when all are done.
            </div>
          ) : msg ? (
            <div className="forge-theme-banner is-info">{msg}</div>
          ) : (
            <div className="forge-theme-banner is-info">
              Pick target technology, Generate, then continue from Forge apps.
            </div>
          )
        }
        actions={
          <button
            type="button"
            className="btn"
            disabled={busy || !canGenerate || !metadataComplete}
            onClick={runGenerate}
            title={
              !metadataComplete
                ? "Complete Align first"
                : viewArtifacts.length
                  ? `Regenerate ${copy?.title || "assets"} in the selected target technology`
                  : `Generate ${copy?.title || "assets"} in the selected target technology`
            }
          >
            {viewArtifacts.length ? "Regenerate" : "Generate"}
          </button>
        }
      >
        <ForgeThemePanel padded={false} className="forge-convert-lanes shrink-0">
          <ScopedTechMap
            lanes={scopedLanes}
            laneTargets={laneTargets}
            onChangeTarget={setTarget}
            canEdit={canGenerate}
            busy={busy}
            viewLabel={copy?.title || sub}
            heading={null}
          />
        </ForgeThemePanel>

        <ForgeThemePanel padded={false} className="forge-theme-panel-fill">
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
        </ForgeThemePanel>
      </ForgeThemeShell>
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
      <div className="px-4 py-2">
        <p className="text-[11px] text-brand-slate">
          No Discovery assets of this type yet. Run Discovery (and Decide) so{" "}
          {viewLabel.toLowerCase()} appear here for technology mapping.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      {heading ? (
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
          {heading}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-md border border-brand-line">
        <table className="w-full">
          <thead className="bg-tm-gray-50">
            <tr>
              <th className="table-th !py-1.5 px-3">Asset type</th>
              <th className="table-th !py-1.5">Objects</th>
              <th className="table-th !py-1.5">Identified</th>
              <th className="table-th !py-1.5 px-3">Target</th>
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
  projectName,
  packApproved = false,
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
  projectName?: string;
  packApproved?: boolean;
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
    <ForgeThemeShell
      projectName={projectName}
      title="Approve pack"
      subtitle="Pack"
      meta={
        packApproved
          ? "Build approved · Pilot available"
          : "Full technology map · generate in-scope convert apps from Forge, then approve build → Pilot"
      }
      category="pack"
      packApproved={packApproved}
      actions={
        <button
          type="button"
          className="btn"
          disabled={busy || !canEdit || !metadataComplete}
          onClick={onGenerate}
          title="Generate or regenerate conversion assets in the selected target technologies"
        >
          {Object.values(byKind || {}).some((n) => Number(n) > 0)
            ? "Regenerate"
            : "Generate"}
        </button>
      }
      banner={
        <div className="forge-theme-banner is-info">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-brand-ink">
                Build gate · full technology map
              </p>
              <p className="mt-0.5 text-[11px] text-brand-slate">
                All Discovery asset types. Generate converts source→target per Forge
                app; Approve build opens Pilot. Accelerators are always available.
              </p>
            </div>
            {gateNote}
          </div>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <ForgeThemePanel padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-3">
            <div>
              <h4 className="text-sm font-semibold text-brand-ink">
                Asset technology map
              </h4>
              <p className="text-[11px] text-brand-slate">
                One row per Discovery asset type across the estate.
              </p>
            </div>
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
        </ForgeThemePanel>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Survivors" value={String(survivors ?? "—")} />
          <Stat label="Tables" value={String(byKind.table ?? 0)} tone="accent" />
          <Stat label="Code / scripts" value={String(byKind.code ?? 0)} />
          <Stat label="DAGs" value={String(byKind.dag ?? 0)} />
        </div>
        <ForgeThemePanel>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
            Narrative
          </h4>
          <p className="mt-2 text-sm leading-relaxed text-brand-slate">
            {narrative ||
              "Map each Discovery asset type to a target, generate for migrate/rebuild survivors, then approve."}
          </p>
        </ForgeThemePanel>
      </div>
    </ForgeThemeShell>
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
