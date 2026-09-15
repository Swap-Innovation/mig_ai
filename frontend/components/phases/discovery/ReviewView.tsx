"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentRunsPanel } from "@/components/AgentRunsPanel";
import { pipelineOf } from "@/components/phases/discovery/discoveryAgents";
import { AtlasPage } from "@/components/phases/discovery/shared";
import {
  fetchHitlDecisions,
  findingKey,
  loadHitlDecisions,
  pendingHitlKeys,
  persistHitlDecisions,
  saveHitlDecisions,
  type HitlDecision,
} from "@/lib/discoveryHitl";

type Props = {
  project: any;
  inventory: any[];
  jobs?: any[];
  lineage: { nodes?: any[]; edges?: any[] };
  assessmentRun: any | null;
  agentRuns: any[];
  discoveryRunDiscover?: any | null;
  discoveryRunInventory?: any | null;
  discoveryRuns?: any[];
  busy: boolean;
  sessionRole: string;
  onPollAgents: () => void;
  onRunAssessment: () => void;
  onSignOff: (payload?: {
    decisions?: Record<string, HitlDecision>;
    agent_run_id?: number | null;
  }) => void | Promise<void>;
};

type CoverageStatus = "complete" | "partial" | "missing" | "optional";

type CoverageRow = {
  id: string;
  label: string;
  detail: string;
  status: CoverageStatus;
  score?: number; // 0–100 coverage or confidence
  meta?: string;
};

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function confPct(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((n <= 1 ? n * 100 : n));
}

function StatusPill({ status }: { status: CoverageStatus }) {
  const map: Record<CoverageStatus, string> = {
    complete: "atlas-pill is-good",
    partial: "atlas-pill is-warn",
    missing: "atlas-pill is-neutral",
    optional: "atlas-pill is-brand",
  };
  const label: Record<CoverageStatus, string> = {
    complete: "Reviewed",
    partial: "Partial",
    missing: "Not reviewed",
    optional: "Optional",
  };
  return <span className={map[status]}>{label[status]}</span>;
}

function ConfidenceBar({ value, label }: { value: number | null; label: string }) {
  const v = value ?? 0;
  const tone =
    value == null
      ? "bg-black/10"
      : v >= 85
        ? "bg-[#34c759]"
        : v >= 70
          ? "bg-[#ff9f0a]"
          : "bg-[#ff2d55]";
  return (
    <div className="min-w-0">
      <div className="mb-1 flex justify-between text-[11px] text-[#86868b]">
        <span>{label}</span>
        <span className="font-semibold tabular-nums text-[#1d1d1f]">
          {value == null ? "—" : `${v}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
        <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

/** Merged Assessment + Sign-off: coverage, confidence, findings, gate. */
export function ReviewView({
  project,
  inventory,
  jobs = [],
  lineage,
  assessmentRun,
  agentRuns,
  discoveryRunDiscover = null,
  discoveryRunInventory = null,
  discoveryRuns = [],
  busy,
  sessionRole,
  onPollAgents,
  onRunAssessment,
  onSignOff,
}: Props) {
  const [findingFilter, setFindingFilter] = useState<"all" | "low" | "high">("all");
  const [hitlDecisions, setHitlDecisions] = useState<Record<string, HitlDecision>>({});
  const [hitlTick, setHitlTick] = useState(0);

  const assessmentActive = ["queued", "running"].includes(
    String(assessmentRun?.status || "").toLowerCase()
  );

  useEffect(() => {
    if (!assessmentActive) return;
    const id = window.setInterval(() => onPollAgents(), 900);
    return () => window.clearInterval(id);
  }, [assessmentActive, onPollAgents]);

  useEffect(() => {
    const pid = project?.id;
    if (!pid) return;
    let cancelled = false;
    void fetchHitlDecisions(pid).then((remote) => {
      if (cancelled) return;
      if (remote && Object.keys(remote).length) {
        setHitlDecisions(remote);
        saveHitlDecisions(pid, assessmentRun?.id, remote);
      } else {
        setHitlDecisions(loadHitlDecisions(pid, assessmentRun?.id));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project?.id, assessmentRun?.id]);

  const decideHitl = useCallback(
    (key: string, decision: HitlDecision) => {
      const pid = project?.id;
      if (!pid) return;
      setHitlDecisions((prev) => {
        const next = { ...prev, [key]: decision };
        saveHitlDecisions(pid, assessmentRun?.id, next);
        void persistHitlDecisions(pid, next, assessmentRun?.id)
          .then((saved) => {
            if (saved && Object.keys(saved).length) {
              setHitlDecisions(saved);
            }
          })
          .catch(() => {
            /* sessionStorage kept; Approve → Gallery will re-POST decisions */
          });
        return next;
      });
      setHitlTick((t) => t + 1);
      window.dispatchEvent(new Event("mirage-hitl-changed"));
    },
    [project?.id, assessmentRun?.id]
  );

  const tables = useMemo(
    () => inventory.filter((o) => o.object_type === "table"),
    [inventory]
  );
  const scripts = useMemo(
    () => inventory.filter((o) => o.object_type === "script"),
    [inventory]
  );
  const profiled = useMemo(
    () =>
      tables.filter(
        (t) =>
          t.profile &&
          (Object.keys(t.profile.columns || {}).length > 0 ||
            (t.profile.pii_columns || []).length > 0 ||
            (t.columns || []).length > 0)
      ),
    [tables]
  );
  const usageCovered = useMemo(
    () => tables.filter((t) => (t.access_count || 0) > 0),
    [tables]
  );

  const discoverDone =
    String(discoveryRunDiscover?.status || "").toLowerCase() === "completed" ||
    discoveryRuns.some(
      (r) => pipelineOf(r) === "discover" && String(r.status).toLowerCase() === "completed"
    );
  const inventoryDone =
    String(discoveryRunInventory?.status || "").toLowerCase() === "completed" ||
    (inventory.length > 0 && (lineage.edges?.length || 0) > 0);

  const findings: any[] = assessmentRun?.output?.findings || [];
  const reviewItems: any[] =
    assessmentRun?.output?.review_items ||
    findings.filter((f) => (f.confidence ?? 1) < 0.8);
  const assessedFqns = new Set(findings.map((f) => String(f.object || "").toLowerCase()));
  const tablesAssessed = tables.filter((t) =>
    assessedFqns.has(String(t.fully_qualified_name || t.name || "").toLowerCase())
  );
  const tablesUnassessed = tables.filter(
    (t) => !assessedFqns.has(String(t.fully_qualified_name || t.name || "").toLowerCase())
  );

  const scanConfidence = confPct(
    discoveryRunDiscover?.summary?.confidence ??
      discoveryRunDiscover?.confidence ??
      (discoverDone ? 0.88 : null)
  );
  const inventoryConfidence = confPct(
    discoveryRunInventory?.summary?.confidence ??
      discoveryRunInventory?.confidence ??
      (inventoryDone ? 0.9 : null)
  );
  const assessmentConfidence = confPct(assessmentRun?.confidence ?? assessmentRun?.output?.confidence);

  const coverageRows: CoverageRow[] = useMemo(() => {
    const edgeN = lineage.edges?.length || 0;
    const jobN = jobs.length;
    return [
      {
        id: "scan",
        label: "Estate scan (Activity)",
        detail: discoverDone
          ? `Discovery scan completed${discoveryRunDiscover?.id ? ` · run #${discoveryRunDiscover.id}` : ""}`
          : "Run discovery scan on Activity",
        status: discoverDone ? "complete" : "missing",
        score: discoverDone ? scanConfidence ?? 88 : 0,
        meta: discoverDone ? "Structure · SQL · Scripts · Orchestration · Catalog" : undefined,
      },
      {
        id: "inventory",
        label: "Technical inventory",
        detail:
          inventory.length > 0
            ? `${inventory.length} objects · ${tables.length} tables · ${scripts.length} scripts`
            : "Run profiling on the Profiling page",
        status: inventory.length > 0 ? (inventoryDone ? "complete" : "partial") : "missing",
        score: inventory.length ? pct(tables.length, Math.max(tables.length, 1)) : 0,
        meta: inventoryDone ? "InventoryProfiler completed" : undefined,
      },
      {
        id: "lineage",
        label: "Lineage graph",
        detail: edgeN > 0 ? `${edgeN} edges · ${jobN} orchestration nodes` : "No lineage edges yet",
        status: edgeN > 0 ? "complete" : inventory.length ? "partial" : "missing",
        score: edgeN > 0 ? Math.min(100, 55 + Math.min(edgeN, 40)) : 0,
        meta: edgeN > 0 ? "LineageStitcher" : undefined,
      },
      {
        id: "profiling",
        label: "Column profiling",
        detail:
          tables.length > 0
            ? `${profiled.length}/${tables.length} tables with profile metadata`
            : "No tables to profile",
        status: !tables.length
          ? "missing"
          : profiled.length === tables.length
            ? "complete"
            : profiled.length
              ? "partial"
              : "missing",
        score: pct(profiled.length, tables.length),
      },
      {
        id: "usage",
        label: "Usage evidence",
        detail:
          tables.length > 0
            ? `${usageCovered.length}/${tables.length} tables with access evidence`
            : "No usage harvest",
        status: !tables.length
          ? "missing"
          : usageCovered.length
            ? usageCovered.length >= tables.length * 0.5
              ? "complete"
              : "partial"
            : "optional",
        score: pct(usageCovered.length, tables.length),
      },
      {
        id: "assessment",
        label: "Code assessment agent",
        detail: assessmentRun
          ? `${findings.length} findings · ${reviewItems.length} need HITL`
          : "Not run — start assessment below",
        status: !assessmentRun
          ? "missing"
          : assessmentActive
            ? "partial"
            : assessmentRun.status === "completed" || assessmentRun.status === "success"
              ? findings.length
                ? "complete"
                : "partial"
              : assessmentRun.status === "failed"
                ? "missing"
                : "partial",
        score: assessmentConfidence ?? (findings.length ? 75 : 0),
        meta: assessmentRun?.prompt_version
          ? `prompt ${assessmentRun.prompt_version}`
          : undefined,
      },
      {
        id: "object_review",
        label: "Object-level review",
        detail: tables.length
          ? `${tablesAssessed.length}/${tables.length} tables covered by assessment findings`
          : "Await profiling",
        status: !tables.length
          ? "missing"
          : !findings.length
            ? "missing"
            : tablesUnassessed.length === 0
              ? "complete"
              : tablesAssessed.length
                ? "partial"
                : "missing",
        score: pct(tablesAssessed.length, tables.length),
      },
    ];
  }, [
    discoverDone,
    discoveryRunDiscover,
    inventory,
    tables,
    scripts,
    inventoryDone,
    lineage.edges,
    jobs,
    profiled,
    usageCovered,
    assessmentRun,
    findings,
    reviewItems,
    assessmentActive,
    assessmentConfidence,
    tablesAssessed,
    tablesUnassessed,
    scanConfidence,
  ]);

  const reviewedCount = coverageRows.filter((r) => r.status === "complete").length;
  const coveragePct = pct(reviewedCount, coverageRows.length);

  const hitlPending = useMemo(
    () => pendingHitlKeys(findings, hitlDecisions),
    // hitlTick forces refresh after Accept
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [findings, hitlDecisions, hitlTick]
  );
  const hitlDone = hitlPending.length === 0;

  const acceptAllHitl = useCallback(async () => {
    const pid = project?.id;
    if (!pid || project?.inventory_signed_off) return;
    if (!hitlPending.length) return;
    const next = { ...hitlDecisions };
    for (const key of hitlPending) {
      next[key] = "accepted";
    }
    saveHitlDecisions(pid, assessmentRun?.id, next);
    setHitlDecisions(next);
    try {
      const saved = await persistHitlDecisions(pid, next, assessmentRun?.id);
      if (saved && Object.keys(saved).length) {
        setHitlDecisions(saved);
        saveHitlDecisions(pid, assessmentRun?.id, saved);
      }
      setHitlTick((t) => t + 1);
      window.dispatchEvent(new Event("mirage-hitl-changed"));
      return saved || next;
    } catch {
      setHitlTick((t) => t + 1);
      window.dispatchEvent(new Event("mirage-hitl-changed"));
      return next;
    }
  }, [
    project?.id,
    project?.inventory_signed_off,
    hitlPending,
    hitlDecisions,
    assessmentRun?.id,
  ]);

  const approveToDecide = useCallback(async () => {
    const pid = project?.id;
    if (!pid || project?.inventory_signed_off) return;
    let decisions = { ...hitlDecisions };
    // Ensure every low-confidence finding is decided before sign-off API
    for (const key of pendingHitlKeys(findings, decisions)) {
      decisions[key] = "accepted";
    }
    saveHitlDecisions(pid, assessmentRun?.id, decisions);
    setHitlDecisions(decisions);
    try {
      const saved = await persistHitlDecisions(pid, decisions, assessmentRun?.id);
      if (saved && Object.keys(saved).length) {
        decisions = saved;
        setHitlDecisions(saved);
        saveHitlDecisions(pid, assessmentRun?.id, saved);
      }
    } catch {
      // Sign-off endpoint also applies decisions — continue
    }
    setHitlTick((t) => t + 1);
    await onSignOff({
      decisions,
      agent_run_id: assessmentRun?.id ?? null,
    });
  }, [
    project?.id,
    project?.inventory_signed_off,
    hitlDecisions,
    findings,
    assessmentRun?.id,
    onSignOff,
  ]);

  const baseExitReady =
    inventory.length > 0 &&
    (lineage.edges?.length || 0) > 0 &&
    discoverDone &&
    inventoryDone &&
    !assessmentActive &&
    (!assessmentRun ||
      ["completed", "success", "failed"].includes(
        String(assessmentRun.status || "").toLowerCase()
      ) ||
      findings.length > 0);

  const exitReady = baseExitReady && hitlDone;

  const roleOk = [
    "architect",
    "change_board",
    "product_owner",
    "engineer",
  ].includes(sessionRole);
  const canSign =
    !busy && exitReady && !project.inventory_signed_off && roleOk;

  const filteredFindings = useMemo(() => {
    if (findingFilter === "low") return findings.filter((f) => (f.confidence ?? 1) < 0.8);
    if (findingFilter === "high") return findings.filter((f) => (f.confidence ?? 0) >= 0.8);
    return findings;
  }, [findings, findingFilter]);

  return (
    <AtlasPage fill>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 grid gap-2 border-b border-black/5 bg-white/40 px-4 py-2 sm:grid-cols-4">
          <div className="atlas-kpi !py-2 !px-3">
            <p className="atlas-kpi-label">Coverage</p>
            <p className="atlas-kpi-value !text-base">{coveragePct}%</p>
          </div>
          <div className="atlas-kpi !py-2 !px-3">
            <ConfidenceBar value={scanConfidence} label="Scan" />
          </div>
          <div className="atlas-kpi !py-2 !px-3">
            <ConfidenceBar value={inventoryConfidence} label="Profiling" />
          </div>
          <div className="atlas-kpi !py-2 !px-3">
            <ConfidenceBar value={assessmentConfidence} label="Assessment" />
          </div>
        </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Coverage */}
          <section className="border-b border-black/5 lg:border-b-0 lg:border-r">
            <div className="border-b border-black/5 px-5 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">
                What has been reviewed
              </h3>
            </div>
            <ul className="divide-y divide-black/5">
              {coverageRows.map((row) => (
                <li key={row.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-[#1d1d1f]">{row.label}</p>
                        <StatusPill status={row.status} />
                      </div>
                      <p className="mt-1 text-xs text-[#86868b]">{row.detail}</p>
                      {row.meta ? (
                        <p className="mt-0.5 text-[11px] text-[#aeaeb2]">{row.meta}</p>
                      ) : null}
                    </div>
                    <div className="w-16 shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-[#1d1d1f]">
                        {row.score != null ? `${row.score}%` : "—"}
                      </p>
                    </div>
                  </div>
                  {row.score != null && row.score > 0 ? (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/[0.04]">
                      <div
                        className={`h-full rounded-full ${
                          row.status === "complete"
                            ? "bg-emerald-500/80"
                            : row.status === "partial"
                              ? "bg-amber-500/80"
                              : "bg-[#d2d2d7]"
                        }`}
                        style={{ width: `${row.score}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {tablesUnassessed.length > 0 && findings.length > 0 ? (
              <div className="border-t border-black/5 px-5 py-4">
                <p className="text-xs font-semibold text-[#1d1d1f]">
                  Not covered by assessment ({tablesUnassessed.length})
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tablesUnassessed.slice(0, 12).map((t) => (
                    <span
                      key={t.id}
                      className="rounded bg-black/[0.03] px-2 py-0.5 font-mono text-[10px] text-[#6e6e73]"
                    >
                      {t.fully_qualified_name || t.name}
                    </span>
                  ))}
                  {tablesUnassessed.length > 12 ? (
                    <span className="text-[10px] text-[#aeaeb2]">
                      +{tablesUnassessed.length - 12} more
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {/* Assessment findings + agent */}
          <section className="min-h-0">
            <div className="border-b border-black/5 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[#86868b]">
                  Assessment findings
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1">
                    {(
                      [
                        ["all", "All"],
                        ["high", "High conf."],
                        ["low", "Needs HITL"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFindingFilter(id)}
                        className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                          findingFilter === id
                            ? "bg-[#1d1d1f] text-white"
                            : "text-[#86868b] hover:bg-black/[0.03]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn text-[11px] !px-2.5 !py-1"
                    disabled={
                      busy ||
                      assessmentActive ||
                      !(inventory?.length || 0)
                    }
                    title={
                      !(inventory?.length || 0)
                        ? "Profiling required"
                        : "Run legacy code assessment"
                    }
                    onClick={() => onRunAssessment()}
                  >
                    {assessmentActive
                      ? "Assessing…"
                      : assessmentRun
                        ? "Re-run assessment"
                        : "Run assessment"}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <AgentRunsPanel
                title="Assessment agent"
                runs={agentRuns}
                taskFilter={["legacy_code_assessment"]}
                onPoll={onPollAgents}
                selectedId={assessmentRun?.id}
                emptyHint="No assessment runs yet. Run assessment to score legacy objects."
              />

              {assessmentRun ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded bg-black/[0.03] px-2 py-1 font-medium capitalize text-[#1d1d1f]">
                    {assessmentRun.status}
                  </span>
                  {assessmentConfidence != null ? (
                    <span className="rounded bg-black/[0.03] px-2 py-1 text-[#6e6e73]">
                      Aggregate {assessmentConfidence}%
                    </span>
                  ) : null}
                  {assessmentRun.prompt_version ? (
                    <span className="rounded bg-black/[0.03] px-2 py-1 text-[#6e6e73]">
                      Prompt {assessmentRun.prompt_version}
                    </span>
                  ) : null}
                  {assessmentRun.standards_version ? (
                    <span className="rounded bg-black/[0.03] px-2 py-1 text-[#6e6e73]">
                      Standards {assessmentRun.standards_version}
                    </span>
                  ) : null}
                  {!project.inventory_signed_off && hitlPending.length > 0 ? (
                    <button
                      type="button"
                      className="btn text-[11px] !px-2.5 !py-1"
                      disabled={busy}
                      title={`Accept all ${hitlPending.length} low-confidence finding${
                        hitlPending.length === 1 ? "" : "s"
                      } that still need HITL`}
                      onClick={() => acceptAllHitl()}
                    >
                      Accept all ({hitlPending.length})
                    </button>
                  ) : null}
                  {!project.inventory_signed_off &&
                  findings.length > 0 &&
                  hitlPending.length === 0 ? (
                    <span className="rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-800">
                      All HITL accepted
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="max-h-[380px] space-y-2 overflow-auto">
                {filteredFindings.map((f: any, i: number) => {
                  const c = confPct(f.confidence) ?? 0;
                  const low = c < 80;
                  // Index in full findings list for stable HITL keys
                  const fullIdx = findings.indexOf(f);
                  const key = findingKey(f, fullIdx >= 0 ? fullIdx : i);
                  const decision = hitlDecisions[key];
                  return (
                    <div
                      key={key}
                      className={`rounded-lg border px-3 py-2.5 text-sm ${
                        decision === "accepted"
                          ? "border-emerald-200/80 bg-emerald-50/40"
                          : decision === "flagged"
                            ? "border-rose-200/80 bg-rose-50/30"
                            : low
                              ? "border-amber-200/80 bg-amber-50/40"
                              : "border-black/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-mono text-xs font-semibold text-[#1d1d1f]">{f.object}</p>
                        <span
                          className={`shrink-0 text-[10px] font-semibold tabular-nums ${
                            low ? "text-amber-800" : "text-emerald-700"
                          }`}
                        >
                          {c}%
                        </span>
                      </div>
                      {(f.sources || []).length || (f.targets || []).length ? (
                        <p className="mt-1 text-[11px] text-[#86868b]">
                          {(f.sources || []).length
                            ? `Sources: ${(f.sources || []).slice(0, 3).join(", ")}`
                            : null}
                          {(f.sources || []).length && (f.targets || []).length ? " · " : null}
                          {(f.targets || []).length
                            ? `Targets: ${(f.targets || []).slice(0, 3).join(", ")}`
                            : null}
                        </p>
                      ) : null}
                      <ul className="mt-2 space-y-0.5 text-xs text-[#6e6e73]">
                        {(f.candidate_business_rules || []).map((r: string, j: number) => (
                          <li key={j} className="flex gap-1.5">
                            <span className="text-[#aeaeb2]">·</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                      {low ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {decision ? (
                            <p className="text-[10px] font-medium uppercase tracking-wide text-[#1d1d1f]">
                              {decision === "accepted"
                                ? "Accepted by reviewer"
                                : "Flagged — proceed with caution"}
                            </p>
                          ) : (
                            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800">
                              Needs human review
                            </p>
                          )}
                          {!decision && !project.inventory_signed_off ? (
                            <div className="ml-auto flex gap-1.5">
                              <button
                                type="button"
                                className="rounded border border-emerald-300 bg-transparent px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50"
                                disabled={busy}
                                onClick={() => decideHitl(key, "accepted")}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="rounded border border-rose-200 bg-transparent px-2 py-0.5 text-[10px] font-semibold text-rose-800 hover:bg-rose-50"
                                disabled={busy}
                                onClick={() => decideHitl(key, "flagged")}
                              >
                                Flag
                              </button>
                            </div>
                          ) : null}
                          {decision && !project.inventory_signed_off ? (
                            <button
                              type="button"
                              className="ml-auto text-[10px] text-[#86868b] underline hover:text-[#1d1d1f]"
                              onClick={() => {
                                const pid = project?.id;
                                if (!pid) return;
                                setHitlDecisions((prev) => {
                                  const next = { ...prev };
                                  delete next[key];
                                  saveHitlDecisions(pid, assessmentRun?.id, next);
                                  return next;
                                });
                                setHitlTick((t) => t + 1);
                                window.dispatchEvent(new Event("mirage-hitl-changed"));
                              }}
                            >
                              Undo
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!filteredFindings.length ? (
                  <p className="py-6 text-center text-xs text-[#86868b]">
                    {assessmentActive
                      ? "Agent running — findings appear when complete."
                      : findings.length
                        ? "No findings in this filter."
                        : "Run assessment to generate object-level confidence and rules."}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        {/* Sign-off gate */}
        <section className="border-t border-black/5 bg-black/[0.03]/50 px-5 py-5">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#1d1d1f]">Phase 1 exit gate</h3>
              <p className="mt-1 text-xs text-[#86868b]">
                Accept or flag every low-confidence finding, then approve the inventory pack to open
                Plan.
              </p>
              <div
                className={`mt-2 inline-flex rounded-lg px-3 py-1.5 text-xs font-medium ${
                  project.inventory_signed_off
                    ? "bg-emerald-50 text-emerald-800"
                    : exitReady
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-50 text-amber-900"
                }`}
              >
                {project.inventory_signed_off
                  ? "Inventory pack signed off — Discover complete · continue to Plan"
                  : assessmentActive
                    ? "Assessment still running…"
                    : !baseExitReady
                      ? "Complete scan, profiling, and lineage before sign-off"
                      : !hitlDone
                        ? `${hitlPending.length} finding${hitlPending.length === 1 ? "" : "s"} still need Accept or Flag`
                        : !roleOk
                          ? "Sign in as Architect, Change Board, Product Owner, or Engineer to approve"
                          : "Human review complete — ready to approve"}
              </div>
            </div>
            {!project.inventory_signed_off ? (
              <button
                type="button"
                className="btn shrink-0"
                disabled={!canSign}
                title={
                  !roleOk
                    ? "Requires Architect, Change Board, Product Owner, or Engineer"
                    : !hitlDone
                      ? "Accept or flag all HITL findings first"
                      : !baseExitReady
                        ? "Complete profiling and lineage first"
                        : "Approve Discovery and open Plan"
                }
                onClick={() => void approveToDecide()}
              >
                Approve → Plan
              </button>
            ) : null}
          </div>
        </section>
      </div>
      </div>
    </AtlasPage>
  );
}
