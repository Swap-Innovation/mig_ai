"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";
import {
  DiscoveryTerminal,
  type TerminalLine,
} from "@/components/phases/discovery/DiscoveryTerminal";
import { api } from "@/lib/api";

type SubTab = "workbench" | "gaps" | "approve";

const MAP_VIEWS: SubTab[] = ["workbench", "gaps", "approve"];

function resolveMapView(view?: string): SubTab {
  if (view === "scorecard") return "approve";
  if (view === "agents" || view === "extensions" || view === "overview") {
    return "workbench";
  }
  if (view && MAP_VIEWS.includes(view as SubTab)) return view as SubTab;
  return "workbench";
}


type Props = {
  project: any;
  mappings: any[];
  scorecard: any | null;
  completeness?: any | null;
  sidStandards: any | null;
  dispositionApproved: boolean;
  agentRuns: any[];
  busy: boolean;
  msg: string;
  sessionRole: string;
  onGenerate: (opts?: { advanced_ai?: boolean }) => Promise<any> | void;
  onApprove: () => void;
  onSaveMapping?: (id: number, body: Record<string, any>) => void | Promise<any>;
  onBulkReview?: (decision: "accept" | "flag", ids?: number[]) => void | Promise<any>;
  onPollAgents: () => void;
  onRefreshMappings?: () => Promise<void> | void;
  embedded?: boolean;
  view?: string;
};

function terminalLinesFromMappingRun(run: any | null): TerminalLine[] {
  if (!run) return [];
  const steps = run.steps || [];
  const lines: TerminalLine[] = [];
  for (const s of steps) {
    const isTerm =
      s?.name === "terminal.log" || s?.detail?.kind === "terminal";
    if (isTerm) {
      lines.push({
        ts: s.detail?.ts,
        agent: s.detail?.agent || "MappingCoordinator",
        line: s.message || "",
      });
      continue;
    }
    if (s?.message) {
      lines.push({
        agent: s.detail?.agent || "MappingCoordinator",
        line: `${s.status === "failed" ? "✗" : s.status === "running" ? "…" : "·"} ${s.message}`,
      });
    }
  }
  return lines;
}

export function Phase3SidMapping({
  project,
  mappings,
  scorecard,
  completeness = null,
  sidStandards,
  dispositionApproved,
  agentRuns,
  busy,
  msg,
  sessionRole,
  onGenerate,
  onApprove,
  onSaveMapping,
  onBulkReview,
  onPollAgents,
  onRefreshMappings,
  embedded = false,
  view,
}: Props) {
  const [sub, setSub] = useState<SubTab>(() => resolveMapView(view));

  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [advancedAi, setAdvancedAi] = useState(false);
  const [mappingRun, setMappingRun] = useState<any | null>(null);
  const [edit, setEdit] = useState({
    domain: "",
    entity: "",
    attribute: "",
    status: "proposed",
    gap_reason: "",
    justification: "",
  });

  useEffect(() => {
    setSub(resolveMapView(view));
  }, [view]);

  useEffect(() => {
    const selected =
      selectedId != null ? mappings.find((m) => m.id === selectedId) : null;
    if (selected) {
      setEdit({
        domain: selected.domain || "",
        entity: selected.entity || "",
        attribute: selected.attribute || "",
        status: selected.status || "proposed",
        gap_reason: selected.gap_reason || "",
        justification: selected.justification || "",
      });
    }
  }, [selectedId, mappings]);

  // Seed latest standards_mapping run for terminal
  useEffect(() => {
    const latest = (agentRuns || []).find((r) => r.task === "standards_mapping");
    if (latest && (!mappingRun || mappingRun.id === latest.id)) {
      setMappingRun(latest);
    }
  }, [agentRuns]); // eslint-disable-line react-hooks/exhaustive-deps

  const mappingActive = ["queued", "running"].includes(
    String(mappingRun?.status || "")
  );

  useEffect(() => {
    if (!mappingActive || !mappingRun?.id || !project?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const detail = await api<any>(
          `/projects/${project.id}/agents/runs/${mappingRun.id}`
        );
        if (cancelled) return;
        setMappingRun(detail);
        onPollAgents();
        if (["completed", "failed"].includes(String(detail?.status))) {
          await onRefreshMappings?.();
        }
      } catch {
        /* ignore transient poll errors */
      }
    };
    tick();
    const id = window.setInterval(tick, 700);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    mappingActive,
    mappingRun?.id,
    project?.id,
    onPollAgents,
    onRefreshMappings,
  ]);

  const entities = useMemo(() => {
    const set = new Set<string>();
    mappings.forEach((m) => {
      if (m.entity) set.add(m.entity);
    });
    return Array.from(set).sort();
  }, [mappings]);

  const isHumanReviewed = (m: any) =>
    Array.isArray(m.citations) &&
    m.citations.some(
      (c: any) => c && c.type === "human_review" && (c.decision === "accepted" || c.decision === "flagged")
    );

  const gaps = useMemo(
    () =>
      mappings.filter((m) => {
        if (m.status === "approved") return false;
        if (isHumanReviewed(m)) return false;
        if (m.status === "gap" || m.conformance === "gap") return true;
        const c = Number(m.confidence);
        if (Number.isFinite(c) && (c <= 1 ? c : c / 100) < 0.8) return true;
        return false;
      }),
    [mappings]
  );

  const canReview = [
    "architect",
    "change_board",
    "engineer",
    "product_owner",
  ].includes(sessionRole);

  const acceptMapping = useCallback(
    (row: any) => {
      if (!onSaveMapping || !row) return;
      void onSaveMapping(row.id, {
        domain: row.domain || edit.domain || "",
        entity: row.entity || edit.entity || "",
        attribute: row.attribute || edit.attribute || "",
        status: "approved",
        gap_reason: "",
        justification:
          edit.justification ||
          row.justification ||
          "Accepted in Gaps review",
      });
    },
    [onSaveMapping, edit]
  );

  const flagMapping = useCallback(
    (row: any) => {
      if (!onSaveMapping || !row) return;
      void onSaveMapping(row.id, {
        domain: row.domain || edit.domain || "",
        entity: row.entity || edit.entity || "",
        attribute: row.attribute || edit.attribute || "",
        status: "gap",
        conformance: "gap",
        gap_reason:
          edit.gap_reason?.trim() ||
          row.gap_reason?.trim() ||
          "Flagged in Gaps review — needs architecture decision",
        justification: edit.justification || row.justification || "",
      });
    },
    [onSaveMapping, edit]
  );

  const acceptAllGaps = useCallback(() => {
    if (!onBulkReview || !gaps.length) return;
    void onBulkReview(
      "accept",
      gaps.map((g) => g.id)
    );
  }, [onBulkReview, gaps]);

  const flagAllGaps = useCallback(() => {
    if (!onBulkReview || !gaps.length) return;
    void onBulkReview(
      "flag",
      gaps.map((g) => g.id)
    );
  }, [onBulkReview, gaps]);

  useEffect(() => {
    if (sub !== "gaps") return;
    if (!gaps.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !gaps.some((g) => g.id === selectedId)) {
      setSelectedId(gaps[0].id);
    }
  }, [sub, gaps, selectedId]);

  const filtered = useMemo(() => {
    const base = sub === "gaps" ? gaps : mappings;
    return base.filter((m) => {
      if (entityFilter !== "all" && m.entity !== entityFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!q) return true;
      const hay =
        `${m.legacy_object}.${m.legacy_column} ${m.domain} ${m.entity} ${m.attribute}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });
  }, [mappings, gaps, q, entityFilter, statusFilter, sub]);

  const selected =
    selectedId != null
      ? mappings.find((m) => m.id === selectedId) || null
      : null;

  const terminalLines = useMemo(
    () => terminalLinesFromMappingRun(mappingRun),
    [mappingRun]
  );

  const runMapping = useCallback(async () => {
    const result = await onGenerate({ advanced_ai: advancedAi });
    if (result?.run_id) {
      setMappingRun({
        id: result.run_id,
        status: "queued",
        task: "standards_mapping",
        steps: [],
      });
    }
  }, [onGenerate, advancedAi]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of mappings) {
      const k = m.status || "proposed";
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [mappings]);

  const workbench =
    sub === "workbench" || sub === "gaps" ? (
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        {!dispositionApproved ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            Approve the Decide disposition register before running SID mapping on
            Wave-1 survivors.
          </div>
        ) : null}

        <DataToolbar
          search={q}
          onSearchChange={setQ}
          searchPlaceholder="Filter legacy column or SID path…"
          filters={
            <>
              <select
                className="input !mt-0 !h-9 max-w-[160px] !py-1.5 text-xs"
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
              >
                <option value="all">All entities</option>
                {entities.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              {sub === "workbench" ? (
                <select
                  className="input !mt-0 !h-9 max-w-[140px] !py-1.5 text-xs"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All status</option>
                  <option value="proposed">Proposed</option>
                  <option value="gap">Gap</option>
                  <option value="approved">Approved</option>
                </select>
              ) : null}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-brand-line bg-white px-2.5 py-1.5 text-[12px] font-medium text-tm-gray-600">
                <input
                  type="checkbox"
                  className="rounded border-brand-line"
                  checked={advancedAi}
                  onChange={(e) => setAdvancedAi(e.target.checked)}
                />
                Advanced Model AI
              </label>
            </>
          }
          countLabel={`${filtered.length} rows`}
          actions={
            <button
              type="button"
              className="btn text-xs"
              disabled={busy || mappingActive || !dispositionApproved}
              title={
                !dispositionApproved
                  ? "Complete Decide approval first"
                  : advancedAi
                    ? "Run Standards Mapping + Model AI enrichment"
                    : "Run Standards Mapping Agent"
              }
              onClick={() => void runMapping()}
            >
              {mappingActive
                ? "Mapping…"
                : mappings.length
                  ? "Re-run mapping"
                  : "Run mapping"}
            </button>
          }
        />

        {sub === "gaps" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line bg-amber-50/60 px-3 py-2">
            <p className="text-[12px] text-amber-950">
              <span className="font-semibold">{gaps.length}</span> row
              {gaps.length === 1 ? "" : "s"} need review (gaps or low confidence).
              Accept to approve, or Flag to keep as an open gap — reviewed rows leave
              this list.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {gaps.length === 0 && mappings.length > 0 ? (
                <span className="text-[11px] font-medium text-emerald-800">
                  All clear — continue on Approve
                </span>
              ) : null}
              {gaps.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="btn text-[11px]"
                    disabled={busy || !canReview || !onBulkReview}
                    title="Accept all pending Gaps rows"
                    onClick={acceptAllGaps}
                  >
                    Accept all ({gaps.length})
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-[11px]"
                    disabled={busy || !canReview || !onBulkReview}
                    title="Flag all pending Gaps rows as open gaps"
                    onClick={flagAllGaps}
                  >
                    Flag all ({gaps.length})
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {sub === "workbench" && mappings.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-b border-brand-line bg-white px-3 py-2">
            {(
              [
                ["all", "All", mappings.length],
                ["proposed", "Proposed", statusCounts.proposed || 0],
                ["gap", "Gaps", statusCounts.gap || gaps.length],
                ["approved", "Approved", statusCounts.approved || 0],
              ] as const
            ).map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  statusFilter === id
                    ? "bg-brand-500/10 text-brand-600"
                    : "text-tm-gray-600 hover:bg-tm-gray-50 hover:text-tm-ink"
                }`}
              >
                {label}{" "}
                <span className="tabular-nums text-tm-gray-400">{n}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto">
              {!mappings.length && !mappingActive ? (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
                  <p className="text-sm font-semibold text-tm-ink">
                    {sub === "gaps" ? "No gaps to review" : "Mapping workbench is empty"}
                  </p>
                  <p className="max-w-md text-xs leading-relaxed text-tm-gray-500">
                    {sub === "gaps"
                      ? "Run mapping on the Workbench first. Unresolved and low-confidence rows appear here for Accept / Flag."
                      : "Run the Standards Mapping Agent to propose SID domain → entity → attribute for migrate/rebuild survivors. Enable Advanced Model AI for an enrichment pass. Gaps stay unresolved for architecture review — never invented."}
                  </p>
                  {sub !== "gaps" ? (
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={busy || !dispositionApproved}
                      onClick={() => void runMapping()}
                    >
                      Run mapping
                    </button>
                  ) : null}
                </div>
              ) : sub === "gaps" && !gaps.length ? (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 px-6 text-center">
                  <p className="text-sm font-semibold text-tm-ink">Gaps clear</p>
                  <p className="max-w-md text-xs leading-relaxed text-tm-gray-500">
                    No open gaps or low-confidence rows. Open Approve to promote the
                    mapping pack and continue to Entities.
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 z-10 bg-tm-gray-50">
                    <tr>
                      <th className="table-th px-4">Legacy</th>
                      <th className="table-th">SID path</th>
                      <th className="table-th">Conformance</th>
                      <th className="table-th">Status</th>
                      <th className="table-th px-4">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((m) => (
                      <tr
                        key={m.id}
                        className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                          selected?.id === m.id ? "bg-tm-magenta-light/60" : ""
                        }`}
                        onClick={() => setSelectedId(m.id)}
                      >
                        <td className="table-td px-4 font-medium text-tm-ink">
                          <span className="block">
                            {m.legacy_object}.{m.legacy_column}
                          </span>
                        </td>
                        <td className="table-td text-sm text-tm-gray-700">
                          {m.entity
                            ? `${m.domain} · ${m.entity}.${m.attribute}`
                            : "—"}
                        </td>
                        <td className="table-td">
                          <ConfBadge value={m.conformance} />
                        </td>
                        <td className="table-td">
                          <StatusBadge value={m.status} />
                        </td>
                        <td className="table-td px-4 tabular-nums text-sm text-tm-gray-600">
                          {m.confidence != null
                            ? `${Math.round(Number(m.confidence) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                    {!filtered.length ? (
                      <tr>
                        <td
                          className="table-td px-4 text-tm-gray-500"
                          colSpan={5}
                        >
                          No rows match this filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <InspectorPanel
            open={!!selected}
            title={
              selected
                ? `${selected.legacy_object}.${selected.legacy_column}`
                : "Mapping"
            }
            onClose={() => setSelectedId(null)}
          >
            {selected ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <ConfBadge value={selected.conformance} />
                  <StatusBadge value={selected.status} />
                </div>
                {sub === "gaps" && onSaveMapping && !isHumanReviewed(selected) && selected.status !== "approved" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn text-xs"
                      disabled={busy || !canReview}
                      title={
                        !canReview
                          ? "Requires architect, engineer, product owner, or change board"
                          : "Accept this proposal as approved"
                      }
                      onClick={() => acceptMapping(selected)}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      disabled={busy || !canReview}
                      title={
                        !canReview
                          ? "Requires architect, engineer, product owner, or change board"
                          : "Flag as open gap for architecture"
                      }
                      onClick={() => flagMapping(selected)}
                    >
                      Flag as gap
                    </button>
                  </div>
                ) : null}
                {sub === "gaps" && isHumanReviewed(selected) ? (
                  <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-900">
                    Reviewed —{" "}
                    {(selected.citations || []).find(
                      (c: any) => c?.type === "human_review"
                    )?.decision === "flagged"
                      ? "flagged as open gap"
                      : "accepted"}
                  </p>
                ) : null}
                <p className="text-xs leading-relaxed text-tm-gray-600">
                  {selected.justification ||
                    selected.gap_reason ||
                    "No justification yet."}
                </p>
                {onSaveMapping ? (
                  <div className="space-y-2 border-t border-brand-line pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
                      Edit proposal
                    </p>
                    {(
                      [
                        ["domain", "Domain"],
                        ["entity", "Entity"],
                        ["attribute", "Attribute"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="block text-xs text-tm-gray-500">
                        {label}
                        <input
                          className="input !mt-1 text-sm"
                          value={(edit as any)[key]}
                          onChange={(e) =>
                            setEdit((p) => ({ ...p, [key]: e.target.value }))
                          }
                        />
                      </label>
                    ))}
                    <label className="block text-xs text-tm-gray-500">
                      Status
                      <select
                        className="input !mt-1 text-sm"
                        value={edit.status}
                        onChange={(e) =>
                          setEdit((p) => ({ ...p, status: e.target.value }))
                        }
                      >
                        <option value="proposed">proposed</option>
                        <option value="gap">gap</option>
                        <option value="approved">approved</option>
                      </select>
                    </label>
                    <label className="block text-xs text-tm-gray-500">
                      Gap reason
                      <textarea
                        className="input !mt-1 min-h-[64px] text-sm"
                        value={edit.gap_reason}
                        onChange={(e) =>
                          setEdit((p) => ({
                            ...p,
                            gap_reason: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-xs text-tm-gray-500">
                      Justification
                      <textarea
                        className="input !mt-1 min-h-[64px] text-sm"
                        value={edit.justification}
                        onChange={(e) =>
                          setEdit((p) => ({
                            ...p,
                            justification: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="btn w-full text-xs"
                      disabled={busy || !canReview}
                      onClick={() => onSaveMapping(selected.id, edit)}
                    >
                      Save mapping
                    </button>
                  </div>
                ) : null}
                {Array.isArray(selected.citations) &&
                selected.citations.length ? (
                  <div className="border-t border-brand-line pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
                      Citations
                    </p>
                    <ul className="mt-2 space-y-1 text-[11px] text-tm-gray-600">
                      {selected.citations.slice(0, 8).map((c: any, i: number) => (
                        <li key={i}>
                          {c.type}: {c.id || c.ref || "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-tm-gray-500">
                Select a row to inspect and edit the SID proposal.
              </p>
            )}
          </InspectorPanel>
        </div>

        <DiscoveryTerminal
          lines={terminalLines}
          active={mappingActive}
          emptyHint="Standards Mapping Agent output streams here when you Run mapping…"
          defaultHeight={200}
        />
      </div>
    ) : null;

  if (embedded && (sub === "workbench" || sub === "gaps")) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {msg ? (
          <div className="shrink-0 border-b border-brand-line bg-brand-500/5 px-4 py-2 text-xs text-brand-600">
            {msg}
          </div>
        ) : null}
        {workbench}
      </div>
    );
  }

  return (
    <div className={embedded ? "space-y-4 p-5" : "space-y-4"}>
      {!embedded && (
        <header className="card flex flex-wrap items-start justify-between gap-4 !py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tm-magenta">
              Align · SID Mapping &amp; Business Metadata
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-tm-ink">
              TM Forum SID alignment
            </h1>
          </div>
        </header>
      )}

      {sub === "approve" && (
        <ApproveScorecardView
          scorecard={scorecard}
          mappings={mappings}
          gaps={gaps}
          sidStandards={sidStandards}
          mappingApproved={!!project.mapping_approved}
          busy={busy}
          canApprove={canReview}
          onApprove={onApprove}
        />
      )}


      {!embedded && workbench}
    </div>
  );
}

function ApproveScorecardView({
  scorecard,
  mappings,
  gaps,
  sidStandards,
  mappingApproved,
  busy,
  canApprove,
  onApprove,
}: {
  scorecard: any | null;
  mappings: any[];
  gaps: any[];
  sidStandards: any | null;
  mappingApproved: boolean;
  busy: boolean;
  canApprove: boolean;
  onApprove: () => void;
}) {
  const byConf = (scorecard?.by_conformance || {}) as Record<string, number>;
  const total = scorecard?.total ?? mappings.length;
  const pct = scorecard?.conformance_pct ?? scorecard?.coverage_pct;
  const openGaps = gaps.filter((g) => g.status === "gap" || g.conformance === "gap");

  const byEntity = useMemo(() => {
    const m: Record<string, { domain: string; n: number }> = {};
    for (const row of mappings) {
      if (!row.entity) continue;
      const cur = m[row.entity] || { domain: row.domain || "", n: 0 };
      if (row.domain && !cur.domain) cur.domain = row.domain;
      cur.n += 1;
      m[row.entity] = cur;
    }
    return Object.entries(m).sort((a, b) => b[1].n - a[1].n);
  }, [mappings]);

  const canPromote = canApprove && total > 0 && !busy && !mappingApproved;

  if (!total) {
    return (
      <div className="-m-5 flex min-h-[calc(100vh-11rem)] flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-sm font-semibold text-tm-ink">No mappings yet</p>
        <p className="mt-2 max-w-md text-xs text-tm-gray-500">
          Run mapping on the Workbench, resolve Gaps, then return here to review
          the overview and approve the pack.
        </p>
      </div>
    );
  }

  return (
    <div className="-m-5 flex min-h-[calc(100vh-11rem)] flex-col bg-tm-gray-50">
      <div className="shrink-0 border-b border-brand-line bg-white px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-tm-ink">
              Mapping pack overview
            </h3>
            <p className="mt-1 text-xs text-tm-gray-500">
              Standards: {sidStandards?.version || sidStandards?.name || "TM Forum SID"}{" "}
              · {byEntity.length} entit{byEntity.length === 1 ? "y" : "ies"} from
              Workbench
            </p>
            {openGaps.length > 0 && !mappingApproved ? (
              <p className="mt-2 text-xs text-amber-800">
                {openGaps.length} open gap
                {openGaps.length === 1 ? "" : "s"} remain documented after approval.
                Use Gaps to Accept or Flag first if needed.
              </p>
            ) : null}
            {mappingApproved ? (
              <p className="mt-2 text-xs text-emerald-800">
                Pack approved. Describe ownership on Entities, then Complete → Build
                there when ready.
              </p>
            ) : (
              <p className="mt-2 max-w-lg text-xs text-tm-gray-500">
                Review coverage below, then approve to lock the SID mapping pack.
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {!mappingApproved ? (
              <button
                type="button"
                className="btn text-xs"
                disabled={!canPromote}
                title={
                  !canApprove
                    ? "Requires architect, engineer, product owner, or change board"
                    : !total
                      ? "Run mapping first"
                      : "Approve mapping pack"
                }
                onClick={() => void onApprove()}
              >
                Approve mapping pack
              </button>
            ) : (
              <span className="badge-success text-xs">Approved</span>
            )}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto grid max-w-5xl gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashStat label="Mapped rows" value={String(total)} />
            <DashStat
              label="Conformance"
              value={pct != null ? `${pct}%` : "—"}
              tone="accent"
            />
            <DashStat
              label="SID entities"
              value={String(byEntity.length)}
              tone="good"
            />
            <DashStat
              label="Open gaps"
              value={String(openGaps.length)}
              tone={openGaps.length ? "warn" : "good"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border border-brand-line bg-white p-4">
              <h4 className="text-[12px] font-semibold uppercase tracking-wide text-tm-gray-500">
                By conformance
              </h4>
              <ul className="mt-3 space-y-2">
                {Object.entries(byConf).map(([k, v]) => (
                  <li
                    key={k}
                    className="flex items-center justify-between text-sm"
                  >
                    <ConfBadge value={k} />
                    <span className="tabular-nums font-medium">{v}</span>
                  </li>
                ))}
                {!Object.keys(byConf).length ? (
                  <li className="text-xs text-tm-gray-500">No breakdown yet</li>
                ) : null}
              </ul>
            </section>
            <section className="rounded-lg border border-brand-line bg-white p-4">
              <h4 className="text-[12px] font-semibold uppercase tracking-wide text-tm-gray-500">
                TM Forum SID entities
              </h4>
              <ul className="mt-3 max-h-80 space-y-2 overflow-auto">
                {byEntity.map(([e, info]) => (
                  <li
                    key={e}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-tm-ink">{e}</span>
                      {info.domain ? (
                        <span className="text-[11px] text-tm-gray-500">
                          {info.domain}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-tm-gray-600">
                      {info.n}
                    </span>
                  </li>
                ))}
                {!byEntity.length ? (
                  <li className="text-xs text-tm-gray-500">No mapped entities</li>
                ) : null}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "good" | "warn";
}) {
  const shell =
    tone === "accent"
      ? "border-brand-500/25 bg-brand-500/[0.04]"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50/40"
        : tone === "warn"
          ? "border-amber-200 bg-amber-50/50"
          : "border-brand-line bg-white";
  return (
    <div className={`rounded-lg border px-4 py-3 ${shell}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-tm-ink">
        {value}
      </div>
    </div>
  );
}

function ConfBadge({ value }: { value: string }) {
  const tone =
    value === "conformant"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : value === "gap"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : "bg-tm-gray-100 text-tm-gray-700 border-tm-gray-200";
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {value || "—"}
    </span>
  );
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-md border border-brand-line bg-white px-2 py-0.5 text-[11px] font-medium capitalize text-tm-gray-700">
      {value || "proposed"}
    </span>
  );
}
