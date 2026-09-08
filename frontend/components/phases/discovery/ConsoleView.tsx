"use client";

import { useEffect, useMemo, useState } from "react";
import { DiscoveryTerminal } from "@/components/phases/discovery/DiscoveryTerminal";
import {
  DISCOVER_AGENTS,
  DISCOVER_STAGES,
  isTerminalStep,
  stageStatus,
  terminalLinesFromRun,
} from "@/components/phases/discovery/discoveryAgents";

type Props = {
  estate: any | null;
  discoveryRun: any | null;
  inventory?: any[];
  jobs?: any[];
  lineage?: { nodes?: any[]; edges?: any[] };
  busy?: boolean;
  onPollDiscovery: (runId?: number) => void;
  onRunDiscovery?: () => void;
};

type FindingItem = {
  id: string;
  title: string;
  detail?: string;
  meta?: string;
};

type FindingGroup = {
  id: string;
  label: string;
  hint: string;
  items: FindingItem[];
};

function shortName(raw: string): string {
  const s = String(raw || "");
  if (!s) return "—";
  if (s.includes("/")) return s.split("/").pop() || s;
  if (s.includes(".")) {
    const parts = s.split(".");
    return parts[parts.length - 1] || s;
  }
  return s;
}

/**
 * Discoveries for Activity come from the current discover run
 * (steps + jobs) — DAGs, Spark jobs, SQL, inferred tables, catalog.
 */
function buildFindingsFromRun(
  steps: any[],
  jobs: any[],
  estate: any | null,
  runActive: boolean
): FindingGroup[] {
  const tables: FindingItem[] = [];
  const scripts: FindingItem[] = [];
  const sparkJobs: FindingItem[] = [];
  const repos: FindingItem[] = [];
  const dags: FindingItem[] = [];
  const pipelines: FindingItem[] = [];
  const sqlFiles: FindingItem[] = [];
  const folders: FindingItem[] = [];
  const seen = new Set<string>();

  const add = (bucket: FindingItem[], item: FindingItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    bucket.push(item);
  };

  for (const s of steps || []) {
    if (isTerminalStep(s)) continue;
    if (s.name === "queued") continue;
    const d = s.detail || {};

    if (s.name === "sql.parse" && d.path) {
      add(sqlFiles, {
        id: `sql:${d.path}`,
        title: shortName(d.path),
        detail: d.path,
        meta:
          d.sources || d.targets
            ? `${(d.sources || []).length} in → ${(d.targets || []).length} out`
            : undefined,
      });
      for (const t of [...(d.sources || []), ...(d.targets || [])]) {
        if (!t) continue;
        const name = String(t).split(".").pop() || String(t);
        add(tables, {
          id: `t:${name.toLowerCase()}`,
          title: name,
          detail: (d.targets || []).includes(t) ? "SQL target" : "SQL source",
          meta: shortName(d.path),
        });
      }
    }
    if (s.name === "sql.tables_inferred" && Array.isArray(d.tables)) {
      for (const t of d.tables) {
        add(tables, {
          id: `t:${String(t).toLowerCase()}`,
          title: String(t),
          detail: "Inferred from SQL / Spark",
        });
      }
    }
    if ((s.name === "script.parse" || s.name?.startsWith("script.")) && d.path) {
      const isSpark =
        d.kind === "spark_submit" ||
        d.engine === "spark" ||
        /spark/i.test(String(d.path));
      const item: FindingItem = {
        id: `s:${d.path}`,
        title: shortName(d.path),
        detail: d.path,
        meta: isSpark ? "spark-submit" : "shell",
      };
      if (isSpark) add(sparkJobs, item);
      else add(scripts, item);
    }
    if (s.name === "spark.parse" && d.path) {
      add(sparkJobs, {
        id: `sp:${d.path}`,
        title: shortName(d.path),
        detail: d.path,
        meta:
          d.sources || d.targets
            ? `${(d.sources || []).length} in → ${(d.targets || []).length} out`
            : d.kind || "pyspark",
      });
      for (const t of [...(d.sources || []), ...(d.targets || [])]) {
        if (!t) continue;
        add(tables, {
          id: `t:${String(t).toLowerCase()}`,
          title: String(t),
          detail: "Spark job table",
          meta: shortName(d.path),
        });
      }
    }
    if (s.name === "structure.understand" && Array.isArray(d.folders)) {
      for (const f of d.folders) {
        add(folders, {
          id: `f:${f}`,
          title: String(f),
          detail: "Estate folder",
        });
      }
    }
    if (s.name === "orch.dag" && (d.dag_id || d.dag_name)) {
      add(dags, {
        id: `d:${d.dag_id || d.dag_name}`,
        title: String(d.dag_name || d.dag_id),
        detail: d.schedule ? `Cron ${d.schedule}` : "Manual",
        meta: [
          d.engine ? String(d.engine) : null,
          Array.isArray(d.tasks) ? `${d.tasks.length} tasks` : null,
          Array.isArray(d.spark_jobs) && d.spark_jobs.length
            ? `${d.spark_jobs.length} Spark`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      for (const job of d.spark_jobs || []) {
        if (!job) continue;
        add(sparkJobs, {
          id: `sp:dag:${d.dag_id}:${job}`,
          title: shortName(String(job)),
          detail: `DAG ${d.dag_id}`,
          meta: "from DAG",
        });
      }
      for (const tn of d.task_names || []) {
        if (!tn) continue;
        add(pipelines, {
          id: `p:${d.dag_id}.${tn}`,
          title: String(tn),
          detail: `DAG ${d.dag_id}`,
          meta: d.engine || "task",
        });
      }
    }
    if (s.name === "orch.repo_meta" && (d.remote || d.branch)) {
      add(repos, {
        id: `r:${d.remote || "repo"}`,
        title: shortName(String(d.remote || "Repository")),
        detail: d.remote || undefined,
        meta: d.branch || undefined,
      });
    }
    if (s.name === "meta.catalog" && Array.isArray(d.tables)) {
      for (const t of d.tables) {
        const name = typeof t === "string" ? t : t?.name;
        if (!name) continue;
        add(tables, {
          id: `t:${String(name).toLowerCase()}`,
          title: String(name),
          detail: "From catalog harvest",
        });
      }
    }
  }

  if (!runActive) {
    for (const j of jobs || []) {
      const id = String(j.name || j.id);
      const kind = j.params?.kind || (/^dag\.[^.]+$/.test(id) ? "dag" : "task");
      const engine = j.params?.engine || "";
      if (kind === "dag" || /^dag\.[^.]+$/.test(id)) {
        add(dags, {
          id: `d:${id}`,
          title: j.params?.dag_name || id.replace(/^dag\./, ""),
          detail: j.schedule ? `Cron ${j.schedule}` : "Manual",
          meta:
            j.params?.task_count != null ? `${j.params.task_count} tasks` : undefined,
        });
      } else {
        const item: FindingItem = {
          id: `p:${id}`,
          title: j.params?.task_name || shortName(id),
          detail: j.params?.script || j.script_path || id,
          meta: j.params?.dag_id
            ? `DAG ${j.params.dag_id}${engine ? ` · ${engine}` : ""}`
            : "Pipeline",
        };
        if (engine === "spark" || /spark/i.test(String(j.params?.script || ""))) {
          add(sparkJobs, item);
        } else {
          add(pipelines, item);
        }
      }
    }
  }

  if (!repos.length && !runActive && (estate?.sample_slug || estate?.legacy_root)) {
    add(repos, {
      id: "r:estate",
      title: estate.sample_slug || "bound estate",
      detail: estate.legacy_root || estate.estate_label || undefined,
    });
  }

  const groups: FindingGroup[] = [
    { id: "repo", label: "Repository", hint: "Git / bound estate", items: repos },
    { id: "folders", label: "Estate folders", hint: "Layout", items: folders },
    { id: "dags", label: "DAGs", hint: "Orchestration", items: dags },
    { id: "spark", label: "Spark scripts", hint: "PySpark / submit", items: sparkJobs },
    { id: "pipelines", label: "Pipeline tasks", hint: "DAG tasks", items: pipelines },
    { id: "scripts", label: "Shell scripts", hint: "ETL wrappers", items: scripts },
    { id: "sql", label: "SQL files", hint: "Parsed leaves", items: sqlFiles },
    { id: "tables", label: "Tables", hint: "Sources & targets", items: tables },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Activity: discoveries + live agent terminal (Inventory has its own terminal too). */
export function ConsoleView({
  estate,
  discoveryRun,
  jobs = [],
  busy = false,
  onPollDiscovery,
  onRunDiscovery,
}: Props) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  /** Cleared as soon as Start / Re-run is clicked; refill as the new scan reports. */
  const [findingsCleared, setFindingsCleared] = useState(false);

  const discoveryActive = ["queued", "running"].includes(
    String(discoveryRun?.status || "").toLowerCase()
  );
  const runCompleted = String(discoveryRun?.status || "").toLowerCase() === "completed";
  const canRerun =
    !!onRunDiscovery &&
    (runCompleted || String(discoveryRun?.status || "").toLowerCase() === "failed") &&
    !busy &&
    !discoveryActive;

  useEffect(() => {
    if (!discoveryActive) return;
    const id = window.setInterval(
      () => onPollDiscovery(discoveryRun?.id),
      700
    );
    return () => window.clearInterval(id);
  }, [discoveryActive, onPollDiscovery, discoveryRun?.id]);

  const steps: any[] = discoveryRun?.steps || [];
  const summary = discoveryRun?.summary || {};
  const runStatus = String(discoveryRun?.status || "idle");
  const terminalLines = useMemo(
    () => terminalLinesFromRun(discoveryRun, DISCOVER_AGENTS),
    [discoveryRun]
  );

  const substantiveSteps = useMemo(
    () =>
      (steps || []).filter(
        (s) => !isTerminalStep(s) && s.name !== "queued" && s.name !== "agent.plan"
      ),
    [steps]
  );

  // New scan started → keep panel empty until agents emit findings
  useEffect(() => {
    if (discoveryActive) {
      setFindingsCleared(true);
      setOpenGroup(null);
    }
  }, [discoveryRun?.id, discoveryActive]);

  // Refill once the current run has real discovery steps
  useEffect(() => {
    if (findingsCleared && substantiveSteps.length > 0) {
      setFindingsCleared(false);
    }
  }, [findingsCleared, substantiveSteps.length]);

  const findings = useMemo(() => {
    if (findingsCleared) return [];
    return buildFindingsFromRun(steps, jobs, estate, discoveryActive);
  }, [findingsCleared, steps, jobs, estate, discoveryActive]);

  const totalFound = findings.reduce((n, g) => n + g.items.length, 0);

  useEffect(() => {
    if (!findings.length) {
      setOpenGroup(null);
      return;
    }
    if (!openGroup || !findings.some((g) => g.id === openGroup)) {
      setOpenGroup(findings[0].id);
    }
  }, [findings, openGroup]);

  const doneCount = DISCOVER_STAGES.filter(
    (s) =>
      stageStatus(s.agent, steps, runStatus, DISCOVER_STAGES) === "done" ||
      stageStatus(s.agent, steps, runStatus, DISCOVER_STAGES) === "warning"
  ).length;
  const progressPct =
    discoveryRun?.status === "completed"
      ? 100
      : Math.round((doneCount / DISCOVER_STAGES.length) * 100);

  function handleRun() {
    setFindingsCleared(true);
    setOpenGroup(null);
    onRunDiscovery?.();
  }

  if (!discoveryRun) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-semibold text-tm-ink">No discovery scan yet</p>
          <p className="mt-2 max-w-sm text-sm text-tm-gray-500">
            Start a discovery scan here to run Cursor agents for structure, SQL, scripts,
            orchestration, and catalog. Then use Inventory for inventory & lineage agents.
          </p>
          {onRunDiscovery && (
            <button
              type="button"
              className="btn mt-5 text-xs"
              disabled={busy}
              onClick={handleRun}
            >
              Run discovery scan
            </button>
          )}
        </div>
        <DiscoveryTerminal
          lines={[]}
          active={false}
          emptyHint="Discovery scan agents stream here (Structure → SQL → Scripts → Orchestration → Catalog)…"
        />
      </div>
    );
  }

  const activeGroup = findings.find((g) => g.id === openGroup) || null;
  const metricsBlank = findingsCleared || discoveryActive;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="shrink-0 border-b border-tm-gray-200 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-tm-ink">
                Discoveries · run #{discoveryRun.id}
              </h2>
              <span className="text-xs font-semibold capitalize text-tm-gray-600">
                {runStatus}
              </span>
            </div>
            <p className="mt-1 text-xs text-tm-gray-500">
              {discoveryActive && !totalFound
                ? "Scanning — discoveries appear as agents report"
                : `${totalFound} findings · discovery agents (scan) · log below`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-4 text-right text-xs">
              <Metric label="SQL" value={metricsBlank ? "—" : summary.sql_files ?? "—"} />
              <Metric label="DAGs" value={metricsBlank ? "—" : summary.dags ?? "—"} />
              <Metric label="Jobs" value={metricsBlank ? "—" : summary.jobs ?? "—"} />
            </div>
            {onRunDiscovery && (
              <button
                type="button"
                className="btn text-xs"
                disabled={!canRerun}
                title={
                  !runCompleted && runStatus !== "failed"
                    ? "Available after the first discovery scan completes"
                    : discoveryActive
                      ? "Discovery scan in progress"
                      : "Re-run discovery scan"
                }
                onClick={handleRun}
              >
                {discoveryActive ? "Running…" : "Re-run scan"}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] text-tm-gray-500">
            <span>
              {doneCount}/{DISCOVER_STAGES.length} stages
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-tm-gray-100">
            <div
              className="h-full rounded-full bg-tm-magenta transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[200px] shrink-0 flex-col border-r border-tm-gray-100 bg-tm-gray-50/60">
          <div className="border-b border-tm-gray-100 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
              Groups
            </p>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!findings.length ? (
              <p className="px-2 py-4 text-[11px] text-tm-gray-500">
                {discoveryActive ? "Scanning…" : "No findings yet."}
              </p>
            ) : (
              findings.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setOpenGroup(g.id)}
                  className={`mb-0.5 flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-xs ${
                    activeGroup?.id === g.id
                      ? "bg-white font-medium text-tm-ink shadow-sm"
                      : "text-tm-gray-600 hover:bg-white/70"
                  }`}
                >
                  <span>{g.label}</span>
                  <span className="tabular-nums text-tm-gray-400">{g.items.length}</span>
                </button>
              ))
            )}
          </nav>
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!activeGroup ? (
            <div className="flex h-full min-h-[160px] items-center justify-center px-5 py-10 text-center">
              <p className="text-sm text-tm-gray-500">
                {discoveryActive
                  ? "Waiting for discoveries…"
                  : "No group selected."}
              </p>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 border-b border-tm-gray-100 bg-white/95 px-5 py-3 backdrop-blur">
                <p className="text-sm font-semibold text-tm-ink">{activeGroup.label}</p>
                <p className="text-[11px] text-tm-gray-500">{activeGroup.hint}</p>
              </div>
              <ul className="divide-y divide-tm-gray-100">
                {activeGroup.items.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-tm-ink">{item.title}</p>
                        {item.detail ? (
                          <p className="mt-0.5 truncate text-xs text-tm-gray-500">{item.detail}</p>
                        ) : null}
                      </div>
                      {item.meta ? (
                        <span className="shrink-0 rounded bg-tm-gray-50 px-2 py-0.5 text-[10px] text-tm-gray-600">
                          {item.meta}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <DiscoveryTerminal
        lines={terminalLines}
        active={discoveryActive}
        emptyHint="Discovery scan agents stream here (Structure → SQL → Scripts → Orchestration → Catalog)…"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-tm-gray-400">{label}</div>
      <div className="font-semibold tabular-nums text-tm-ink">{value}</div>
    </div>
  );
}
