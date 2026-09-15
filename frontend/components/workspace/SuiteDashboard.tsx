"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const INK = "#1d1d1f";
const MAGENTA = "#e20074";
const SLATE = "#86868b";
const LINE = "rgba(0,0,0,0.06)";
const EMERALD = "#34c759";
const AMBER = "#ff9f0a";
const ROSE = "#ff2d55";
const BLUE = "#007aff";
const INDIGO = "#5856d6";
const VIOLET = "#af52de";
const TEAL = "#00c7be";
const CYAN = "#32ade6";

const STAGE_ORDER = [
  "atlas",
  "horizon",
  "verdict",
  "compass",
  "forge",
  "prove",
  "transit",
  "sunset",
] as const;

const STAGE_COLORS: Record<string, string> = {
  atlas: MAGENTA,
  horizon: ROSE,
  verdict: VIOLET,
  compass: INDIGO,
  forge: BLUE,
  prove: CYAN,
  transit: TEAL,
  sunset: SLATE,
};

const DISP_COLORS: Record<string, string> = {
  migrate: MAGENTA,
  rebuild: VIOLET,
  consolidate: AMBER,
  "archive-only": SLATE,
  retire: ROSE,
};

type TimeWindow = "7" | "30" | "90" | "all";
type HealthMetric = "estates" | "pct" | "days";
type QualityMetric = "all" | "reconcile" | "hitl" | "agents" | "gaps";
type CutoverMetric = "all" | "promoted" | "switched" | "blocked" | "signoff" | "freeze";
type TrendMetric = "total" | "discovery" | "agent" | "audit";

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

function money(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="suite-chart-tooltip">
      {label ? <p className="suite-chart-tooltip-label">{label}</p> : null}
      {payload.map((p, i) => (
        <p key={`${p.name}-${i}`} className="suite-chart-tooltip-row">
          <span style={{ color: p.color || INK }}>{p.name}</span>
          <strong>{fmt(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <div className={`suite-kpi suite-kpi-${tone || "default"}`}>
      <p className="suite-kpi-label">{label}</p>
      <p className="suite-kpi-value">{value}</p>
      {hint ? <p className="suite-kpi-hint">{hint}</p> : null}
    </div>
  );
}

function Band({
  eyebrow,
  title,
  subtitle,
  filters,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`suite-band ${className}`}>
      <div className="suite-band-head suite-band-head-row">
        <div className="min-w-0">
          {eyebrow ? <p className="suite-theme-kicker">{eyebrow}</p> : null}
          <h2 className="suite-band-title">{title}</h2>
          {subtitle ? <p className="suite-band-sub">{subtitle}</p> : null}
        </div>
        {filters ? <div className="suite-band-filters">{filters}</div> : null}
      </div>
      {children}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="suite-filter">
      <span className="suite-filter-label">{label}</span>
      <select
        className="suite-filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SuiteDashboard() {
  const { portfolio, portfolioError, loadPortfolio, projects, selectProject } =
    useWorkspace();

  const [estateFilter, setEstateFilter] = useState<string>("all");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("30");
  const [healthMetric, setHealthMetric] = useState<HealthMetric>("estates");
  const [qualityMetric, setQualityMetric] = useState<QualityMetric>("all");
  const [cutoverMetric, setCutoverMetric] = useState<CutoverMetric>("all");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("total");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const projectId =
      estateFilter === "all" ? null : Number(estateFilter) || null;
    const days = timeWindow === "all" ? null : Number(timeWindow);
    setRefreshing(true);
    void loadPortfolio({ projectId, days }).finally(() => setRefreshing(false));
  }, [loadPortfolio, estateFilter, timeWindow, projects.length]);

  const fallback = useMemo(() => {
    const list = (projects || []).filter(
      (p: any) =>
        String(p.sample_slug || "") !== "mirage-app-sandbox" &&
        String(p.name || "") !== "App Store sandbox"
    );
    const active = list.filter(
      (p: any) => !(p.change_closed || p.status === "closed")
    );
    const complete = list.filter(
      (p: any) => p.change_closed || p.status === "closed"
    );
    return {
      portfolio_health: {
        active_estates: active.length,
        total_estates: list.length,
        complete_estates: complete.length,
        gated_estates: active.filter((p: any) => !p.inventory_signed_off).length,
        pct_by_stage: {},
        count_by_stage: {},
        avg_days_in_stage: {},
        stage_labels: {},
      },
      estate_economics: {
        objects_inventoried: 0,
        disposition_register: 0,
        survivors: 0,
        avoided: 0,
        avoid_pct: 0,
        by_disposition: {},
        estimated_monthly_infra_avoidance_usd: 0,
        build_artifacts: 0,
      },
      delivery_quality: {
        reconcile_pass_rate_pct: null,
        reconcile_total: 0,
        reconcile_passed: 0,
        open_hitl_findings: 0,
        failed_agent_runs: 0,
        mapping_conformance_gaps: 0,
      },
      cutover_risk: {
        products_promoted: 0,
        consumers_switched: 0,
        consumers_blocked: 0,
        freeze_applied_estates: 0,
        production_signoffs_pending: 0,
      },
      activity: [],
      activity_trend: [],
      estates: list.map((p: any) => ({
        id: p.id,
        name: p.name,
        sample_slug: p.sample_slug || "",
        phase: p.phase,
        suite_stage: "atlas",
        gated: !p.inventory_signed_off,
        complete: !!(p.change_closed || p.status === "closed"),
        days_in_stage: 0,
        inventory_signed_off: !!p.inventory_signed_off,
        plan_approved: !!p.plan_approved,
        disposition_approved: !!p.disposition_approved,
        build_approved: !!p.build_approved,
        objects_inventoried: 0,
        disposition_count: 0,
        build_artifacts: 0,
        open_hitl: 0,
      })),
    };
  }, [projects]);

  const data = portfolio || (projects.length ? fallback : null);
  const health = data?.portfolio_health;
  const econ = data?.estate_economics;
  const quality = data?.delivery_quality;
  const cutover = data?.cutover_risk;
  const activity = data?.activity || [];
  const trend = data?.activity_trend || [];
  const estates = data?.estates || [];
  const loading = !data && refreshing;
  const usingFallback = !portfolio && !!projects.length;

  const estateOptions = useMemo(
    () => [
      { id: "all", label: "All estates" },
      ...projects.map((p: any) => ({
        id: String(p.id),
        label: p.name,
      })),
    ],
    [projects]
  );

  const stageData = useMemo(() => {
    return STAGE_ORDER.map((sid) => ({
      id: sid,
      name: (health?.stage_labels?.[sid] || sid).replace("Mirage ", ""),
      estates: health?.count_by_stage?.[sid] ?? 0,
      pct: health?.pct_by_stage?.[sid] ?? 0,
      days: health?.avg_days_in_stage?.[sid] ?? 0,
      fill: STAGE_COLORS[sid] || MAGENTA,
    }));
  }, [health]);

  const healthChartKey =
    healthMetric === "pct" ? "pct" : healthMetric === "days" ? "days" : "estates";
  const healthChartName =
    healthMetric === "pct"
      ? "% of estates"
      : healthMetric === "days"
        ? "Avg days"
        : "Estates";

  const dispositionData = useMemo(() => {
    const by = econ?.by_disposition || {};
    const keys = ["migrate", "rebuild", "consolidate", "archive-only", "retire"];
    return keys
      .filter((k) => (by[k] || 0) > 0)
      .map((k) => ({
        name: k,
        value: by[k] as number,
        fill: DISP_COLORS[k] || SLATE,
      }));
  }, [econ]);

  const economicsSplit = useMemo(() => {
    const survivors = econ?.survivors ?? 0;
    const avoided = econ?.avoided ?? 0;
    const other = Math.max(
      (econ?.disposition_register ?? 0) - survivors - avoided,
      0
    );
    return [
      { name: "Survivors", value: survivors, fill: MAGENTA },
      { name: "Avoided", value: avoided, fill: EMERALD },
      ...(other > 0 ? [{ name: "Other", value: other, fill: "#d2d2d7" }] : []),
    ].filter((d) => d.value > 0);
  }, [econ]);

  const qualityBars = useMemo(() => {
    const all = [
      {
        id: "reconcile",
        name: "Reconcile pass %",
        value: quality?.reconcile_pass_rate_pct ?? 0,
        fill: EMERALD,
      },
      {
        id: "hitl",
        name: "Open HITL",
        value: quality?.open_hitl_findings ?? 0,
        fill: AMBER,
      },
      {
        id: "agents",
        name: "Failed agents",
        value: quality?.failed_agent_runs ?? 0,
        fill: ROSE,
      },
      {
        id: "gaps",
        name: "Mapping gaps",
        value: quality?.mapping_conformance_gaps ?? 0,
        fill: MAGENTA,
      },
    ];
    if (qualityMetric === "all") return all;
    return all.filter((d) => d.id === qualityMetric);
  }, [quality, qualityMetric]);

  const qualityRadar = useMemo(() => {
    const recon = quality?.reconcile_pass_rate_pct ?? 0;
    const hitlScore = Math.max(0, 100 - (quality?.open_hitl_findings ?? 0) * 8);
    const agentScore = Math.max(0, 100 - (quality?.failed_agent_runs ?? 0) * 12);
    const gapScore = Math.max(
      0,
      100 - (quality?.mapping_conformance_gaps ?? 0) * 5
    );
    return [
      { subject: "Reconcile", score: recon, fullMark: 100 },
      { subject: "HITL", score: hitlScore, fullMark: 100 },
      { subject: "Agents", score: agentScore, fullMark: 100 },
      { subject: "Mapping", score: gapScore, fullMark: 100 },
    ];
  }, [quality]);

  const cutoverBars = useMemo(() => {
    const all = [
      {
        id: "promoted",
        name: "Promoted",
        value: cutover?.products_promoted ?? 0,
        fill: MAGENTA,
      },
      {
        id: "switched",
        name: "Switched",
        value: cutover?.consumers_switched ?? 0,
        fill: EMERALD,
      },
      {
        id: "blocked",
        name: "Blocked",
        value: cutover?.consumers_blocked ?? 0,
        fill: ROSE,
      },
      {
        id: "signoff",
        name: "Sign-off pending",
        value: cutover?.production_signoffs_pending ?? 0,
        fill: AMBER,
      },
      {
        id: "freeze",
        name: "Freeze applied",
        value: cutover?.freeze_applied_estates ?? 0,
        fill: INK,
      },
    ];
    if (cutoverMetric === "all") return all;
    return all.filter((d) => d.id === cutoverMetric);
  }, [cutover, cutoverMetric]);

  const estateCompare = useMemo(() => {
    const source =
      estateFilter === "all"
        ? estates
        : estates.filter((e: any) => String(e.id) === estateFilter);
    return [...source]
      .sort((a: any, b: any) => (b.objects_inventoried || 0) - (a.objects_inventoried || 0))
      .slice(0, 8)
      .map((e: any) => ({
        name: String(e.name || "").slice(0, 14),
        objects: e.objects_inventoried || 0,
        days: e.days_in_stage || 0,
        artifacts: e.build_artifacts || 0,
        hitl: e.open_hitl || 0,
      }));
  }, [estates, estateFilter]);

  return (
    <div className="suite-dashboard forge-pad flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="forge-pad-atmosphere" aria-hidden />
      <header className="suite-dash-bar relative z-[1]">
        <div className="suite-dash-bar-inner">
          <div className="min-w-0">
            <p className="suite-theme-kicker">Mirage Suite</p>
            <h1 className="suite-dash-title">Dashboard</h1>
            <p className="suite-dash-sub">
              Portfolio KPIs across estates — not tied to the active project.
            </p>
          </div>
          <div className="suite-dash-bar-actions">
            <span className="badge-neutral tabular-nums">
              {loading ? "…" : fmt(health?.total_estates)} estates
            </span>
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={refreshing}
              onClick={() => {
                const projectId =
                  estateFilter === "all" ? null : Number(estateFilter) || null;
                const days = timeWindow === "all" ? null : Number(timeWindow);
                setRefreshing(true);
                void loadPortfolio({ projectId, days }).finally(() =>
                  setRefreshing(false)
                );
              }}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <Link href="/workspace/gallery" className="btn-secondary text-xs">
              Stage map →
            </Link>
          </div>
        </div>
      </header>

      <div className="suite-bands relative z-[1] space-y-5 p-5 lg:p-6">
        {(portfolioError || usingFallback) && (
          <div className="atlas-alert is-warn flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs">
              {portfolioError ||
                "Showing estate counts from projects while portfolio analytics reload."}
            </p>
            <button
              type="button"
              className="btn text-[11px] !px-2.5 !py-1"
              disabled={refreshing}
              onClick={() => {
                const projectId =
                  estateFilter === "all" ? null : Number(estateFilter) || null;
                const days = timeWindow === "all" ? null : Number(timeWindow);
                setRefreshing(true);
                void loadPortfolio({ projectId, days }).finally(() =>
                  setRefreshing(false)
                );
              }}
            >
              Retry
            </button>
          </div>
        )}

        <div className="suite-global-filters">
          <FilterSelect
            label="Estate"
            value={estateFilter}
            onChange={setEstateFilter}
            options={estateOptions}
          />
          <FilterSelect
            label="Time"
            value={timeWindow}
            onChange={(v) => setTimeWindow(v as TimeWindow)}
            options={[
              { id: "7", label: "Last 7 days" },
              { id: "30", label: "Last 30 days" },
              { id: "90", label: "Last 90 days" },
              { id: "all", label: "All time" },
            ]}
          />
        </div>

        <div className="suite-kpi-strip">
          <Kpi label="Active estates" value={fmt(health?.active_estates)} />
          <Kpi
            label="Gated"
            value={fmt(health?.gated_estates)}
            tone={health?.gated_estates ? "warn" : "good"}
          />
          <Kpi
            label="Complete"
            value={fmt(health?.complete_estates)}
            tone="good"
          />
          <Kpi
            label="Avoided objects"
            value={`${fmt(econ?.avoided)} (${econ?.avoid_pct ?? 0}%)`}
            hint="Retire / archive / consolidate"
          />
          <Kpi
            label="Reconcile pass"
            value={
              quality?.reconcile_pass_rate_pct == null
                ? "—"
                : `${quality.reconcile_pass_rate_pct}%`
            }
            hint={
              quality?.reconcile_total
                ? `${quality.reconcile_passed}/${quality.reconcile_total}`
                : "No dual-run yet"
            }
            tone={
              quality?.reconcile_pass_rate_pct == null
                ? "default"
                : quality.reconcile_pass_rate_pct >= 80
                  ? "good"
                  : "warn"
            }
          />
          <Kpi
            label="Sign-offs pending"
            value={fmt(cutover?.production_signoffs_pending)}
            tone={cutover?.production_signoffs_pending ? "warn" : "default"}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Band
            eyebrow="Health"
            title="Portfolio health"
            subtitle="Stage mix across the selected scope"
            filters={
              <FilterSelect
                label="KPI"
                value={healthMetric}
                onChange={(v) => setHealthMetric(v as HealthMetric)}
                options={[
                  { id: "estates", label: "Estate count" },
                  { id: "pct", label: "% of portfolio" },
                  { id: "days", label: "Avg days in stage" },
                ]}
              />
            }
          >
            <div className="suite-chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stageData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={{ stroke: LINE }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={72}
                    tick={{ fill: INK, fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(226,0,116,0.05)" }} />
                  <Bar
                    dataKey={healthChartKey}
                    name={healthChartName}
                    radius={[0, 6, 6, 0]}
                    barSize={14}
                  >
                    {stageData.map((d) => (
                      <Cell key={d.id} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Band>

          <Band
            eyebrow="Trend"
            title="Activity over time"
            subtitle="Discovery, agents, and audit volume"
            filters={
              <FilterSelect
                label="Series"
                value={trendMetric}
                onChange={(v) => setTrendMetric(v as TrendMetric)}
                options={[
                  { id: "total", label: "All events" },
                  { id: "discovery", label: "Discovery" },
                  { id: "agent", label: "Agents" },
                  { id: "audit", label: "Audit" },
                ]}
              />
            }
          >
            <div className="suite-chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={MAGENTA} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={MAGENTA} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: SLATE, fontSize: 10 }}
                    axisLine={{ stroke: LINE }}
                    tickLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {trendMetric === "total" ? (
                    <Area
                      type="monotone"
                      dataKey="total"
                      name="Events"
                      stroke={MAGENTA}
                      fill="url(#trendFill)"
                      strokeWidth={2}
                    />
                  ) : (
                    <Area
                      type="monotone"
                      dataKey={trendMetric}
                      name={trendMetric}
                      stroke={
                        trendMetric === "discovery"
                          ? BLUE
                          : trendMetric === "agent"
                            ? TEAL
                            : INDIGO
                      }
                      fill="url(#trendFill)"
                      strokeWidth={2}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Band>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Band
            eyebrow="Economics"
            title="Estate economics"
            subtitle="Survivors vs avoided surface"
            className="lg:col-span-1"
          >
            <div className="suite-chart-sq">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      economicsSplit.length
                        ? economicsSplit
                        : [{ name: "None", value: 1, fill: "#d2d2d7" }]
                    }
                    dataKey="value"
                    nameKey="name"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={3}
                  >
                    {(economicsSplit.length
                      ? economicsSplit
                      : [{ fill: "#d2d2d7" }]
                    ).map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(v) => (
                      <span className="text-[11px] font-medium text-[#1d1d1f]">
                        {v}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="suite-band-divider grid grid-cols-2 gap-2">
              <Kpi
                label="Monthly avoidance"
                value={`${money(econ?.estimated_monthly_infra_avoidance_usd)}`}
                hint="Illustrative infra"
              />
              <Kpi label="Build artifacts" value={fmt(econ?.build_artifacts)} />
            </div>
          </Band>

          <Band
            eyebrow="Disposition"
            title="Disposition mix"
            subtitle="Register by final decision"
            className="lg:col-span-2"
          >
            <div className="suite-chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={
                    dispositionData.length
                      ? dispositionData
                      : [{ name: "none", value: 0, fill: "#d2d2d7" }]
                  }
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={{ stroke: LINE }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Objects" radius={[6, 6, 0, 0]} barSize={36}>
                    {(dispositionData.length
                      ? dispositionData
                      : [{ fill: "#d2d2d7" }]
                    ).map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Band>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Band
            eyebrow="Quality"
            title="Delivery quality"
            subtitle="Pick a KPI or compare all"
            filters={
              <FilterSelect
                label="KPI"
                value={qualityMetric}
                onChange={(v) => setQualityMetric(v as QualityMetric)}
                options={[
                  { id: "all", label: "All metrics" },
                  { id: "reconcile", label: "Reconcile %" },
                  { id: "hitl", label: "Open HITL" },
                  { id: "agents", label: "Failed agents" },
                  { id: "gaps", label: "Mapping gaps" },
                ]}
              />
            }
          >
            <div className="suite-chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={qualityBars}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={{ stroke: LINE }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: INK, fontSize: 11, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Value" radius={[0, 6, 6, 0]} barSize={16}>
                    {qualityBars.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Band>

          <Band
            eyebrow="Radar"
            title="Quality scorecard"
            subtitle="Normalized 0–100 health axes"
          >
            <div className="suite-chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={qualityRadar} cx="50%" cy="50%" outerRadius="72%">
                  <PolarGrid stroke={LINE} />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: SLATE, fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: SLATE, fontSize: 9 }}
                  />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke={MAGENTA}
                    fill={MAGENTA}
                    fillOpacity={0.28}
                    strokeWidth={2}
                  />
                  <Tooltip content={<ChartTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </Band>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Band
            eyebrow="Risk"
            title="Cutover & risk"
            subtitle="Promotion, consumers, freeze, sign-off"
            filters={
              <FilterSelect
                label="KPI"
                value={cutoverMetric}
                onChange={(v) => setCutoverMetric(v as CutoverMetric)}
                options={[
                  { id: "all", label: "All metrics" },
                  { id: "promoted", label: "Promoted" },
                  { id: "switched", label: "Switched" },
                  { id: "blocked", label: "Blocked" },
                  { id: "signoff", label: "Sign-off pending" },
                  { id: "freeze", label: "Freeze applied" },
                ]}
              />
            }
          >
            <div className="suite-chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cutoverBars}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: SLATE, fontSize: 10 }}
                    interval={0}
                    axisLine={{ stroke: LINE }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]} barSize={28}>
                    {cutoverBars.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Band>

          <Band
            eyebrow="Compare"
            title="Estate comparison"
            subtitle="Objects, dwell days, and artifacts (top 8)"
          >
            <div className="suite-chart-h">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={estateCompare}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: SLATE, fontSize: 10 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={48}
                    axisLine={{ stroke: LINE }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    allowDecimals={false}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fill: SLATE, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="objects"
                    name="Objects"
                    fill={BLUE}
                    radius={[4, 4, 0, 0]}
                    barSize={18}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="artifacts"
                    name="Artifacts"
                    fill={TEAL}
                    radius={[4, 4, 0, 0]}
                    barSize={18}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="days"
                    name="Days in stage"
                    stroke={MAGENTA}
                    strokeWidth={2}
                    dot={{ r: 3, fill: MAGENTA }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Band>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Band
            eyebrow="Catalog"
            title="Estates"
            subtitle="Open Stage map for an estate — does not bind dashboard scope"
          >
            <ul className="suite-list">
              {estates.map((e: any) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void selectProject(e.id);
                    }}
                    className="suite-list-row"
                    title="Set workspace project and continue in Stage map"
                  >
                    <span className="min-w-0 truncate">
                      <span
                        className="suite-list-dot"
                        style={{
                          background: STAGE_COLORS[e.suite_stage] || MAGENTA,
                        }}
                      />
                      <span className="suite-list-name">{e.name}</span>
                      {e.sample_slug ? (
                        <span className="suite-list-slug">{e.sample_slug}</span>
                      ) : null}
                    </span>
                    <span className="suite-list-meta">
                      {e.complete
                        ? "complete"
                        : e.gated
                          ? `gated · ${e.suite_stage}`
                          : e.suite_stage}
                    </span>
                  </button>
                </li>
              ))}
              {!estates.length ? (
                <li className="suite-list-empty">
                  {loading ? "Loading estates…" : "No estates yet."}
                </li>
              ) : null}
            </ul>
            <div className="mt-3">
              <Link href="/workspace/gallery" className="btn-secondary text-xs">
                Open Stage map →
              </Link>
            </div>
          </Band>

          <Band eyebrow="Feed" title="Activity" subtitle="Recent discovery, agents, and audit">
            <ul className="suite-list">
              {activity.slice(0, 12).map((a: any, i: number) => (
                <li key={`${a.kind}-${a.at}-${i}`} className="suite-list-row">
                  <span className="min-w-0 truncate">
                    <span className="text-[#86868b]">{a.project_name}</span>
                    <span className="mx-1.5 text-[#d2d2d7]">·</span>
                    <span className="suite-list-name">{a.action}</span>
                  </span>
                  <span className="suite-list-meta uppercase tracking-wide">
                    {a.kind}
                  </span>
                </li>
              ))}
              {!activity.length ? (
                <li className="suite-list-empty">
                  {loading ? "Loading activity…" : "No recent events."}
                </li>
              ) : null}
            </ul>
          </Band>
        </div>
      </div>
    </div>
  );
}
