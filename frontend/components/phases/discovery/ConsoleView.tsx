"use client";

import { useEffect, useMemo, useState } from "react";
import { AtlasEmpty, AtlasPage } from "@/components/phases/discovery/shared";
import {
  isTerminalStep,
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

/** Activity: discoveries + live agent terminal (Profiling has its own agents too). */
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

  useEffect(() => {
    if (!discoveryActive) return;
    const id = window.setInterval(
      () => onPollDiscovery(discoveryRun?.id),
      700
    );
    return () => window.clearInterval(id);
  }, [discoveryActive, onPollDiscovery, discoveryRun?.id]);

  const steps: any[] = discoveryRun?.steps || [];

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

  useEffect(() => {
    if (!findings.length) {
      setOpenGroup(null);
      return;
    }
    if (!openGroup || !findings.some((g) => g.id === openGroup)) {
      setOpenGroup(findings[0].id);
    }
  }, [findings, openGroup]);

  function handleRun() {
    setFindingsCleared(true);
    setOpenGroup(null);
    onRunDiscovery?.();
  }

  if (!discoveryRun) {
    return (
      <AtlasPage fill>
        <AtlasEmpty
          title="No discovery scan yet"
          detail="Start a discovery scan to run Cursor agents for structure, SQL, scripts, orchestration, and catalog. Then use Profiling for catalog & lineage."
          action={
            onRunDiscovery ? (
              <button type="button" className="btn text-xs" disabled={busy} onClick={handleRun}>
                Run discovery scan
              </button>
            ) : null
          }
        />
      </AtlasPage>
    );
  }

  const activeGroup = findings.find((g) => g.id === openGroup) || null;

  return (
    <AtlasPage fill>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[200px] shrink-0 flex-col border-r border-black/5 bg-black/[0.03]/60">
          <div className="border-b border-black/5 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#86868b]">
              Groups
            </p>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!findings.length ? (
              <p className="px-2 py-4 text-[11px] text-[#86868b]">
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
                      ? "bg-white font-medium text-[#1d1d1f] shadow-sm"
                      : "text-[#6e6e73] hover:bg-white/70"
                  }`}
                >
                  <span>{g.label}</span>
                  <span className="tabular-nums text-[#aeaeb2]">{g.items.length}</span>
                </button>
              ))
            )}
          </nav>
        </aside>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!activeGroup ? (
            <div className="flex h-full min-h-[160px] items-center justify-center px-5 py-10 text-center">
              <p className="text-sm text-[#86868b]">
                {discoveryActive
                  ? "Waiting for discoveries…"
                  : "No group selected."}
              </p>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 border-b border-black/5 bg-white/95 px-5 py-3 backdrop-blur">
                <p className="text-sm font-semibold text-[#1d1d1f]">{activeGroup.label}</p>
                <p className="text-[11px] text-[#86868b]">{activeGroup.hint}</p>
              </div>
              <ul className="divide-y divide-black/5">
                {activeGroup.items.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[#1d1d1f]">{item.title}</p>
                        {item.detail ? (
                          <p className="mt-0.5 truncate text-xs text-[#86868b]">{item.detail}</p>
                        ) : null}
                      </div>
                      {item.meta ? (
                        <span className="shrink-0 rounded bg-black/[0.03] px-2 py-0.5 text-[10px] text-[#6e6e73]">
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
    </AtlasPage>
  );
}
