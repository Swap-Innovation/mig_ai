"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api, getSession, setSession, validateSession, type Session } from "@/lib/api";
import {
  pickLatestRun,
  pipelineOf,
} from "@/components/phases/discovery/discoveryAgents";
import type { TerminalLine } from "@/components/phases/discovery/DiscoveryTerminal";
import {
  buildUserChatTurn,
  collectLiveAgentChatLines,
  isAgentChatStreaming,
  loadProjectAgentChat,
  mergeAgentChatLines,
  saveProjectAgentChat,
} from "@/lib/agentChat";
import { isAppSandboxProject } from "@/lib/appStore";

const ACTIVE_PROJECT_KEY = "mirage_active_project_id";

export type ProjectCreateInput = {
  name: string;
  description?: string;
  sample_id?: string;
  slug?: string;
  scaffold?: boolean;
};

type WorkspaceContextValue = {
  session: Session;
  project: any | null;
  projects: any[];
  pid: number | undefined;
  busy: boolean;
  msg: string;
  setMsg: (m: string) => void;
  run: (label: string, fn: () => Promise<any>) => Promise<any>;
  refreshProject: () => Promise<any>;
  selectProject: (id: number) => Promise<void>;
  createProject: (input: ProjectCreateInput) => Promise<any>;
  deleteProject: (id: number) => Promise<void>;
  /** Ensure hidden App Store sandbox and return it */
  ensureAppSandbox: () => Promise<any>;
  signOut: () => void;

  // Phase 0
  mobilisation: any | null;
  udpHub: any | null;
  llmStatus: any | null;
  loadPhase0: () => Promise<void>;

  // Phase 1
  inventory: any[];
  lineage: { nodes: any[]; edges: any[]; stats?: any };
  jobs: any[];
  assessmentRun: any | null;
  estate: any | null;
  samples: any[];
  discoveryRun: any | null;
  discoveryRunDiscover: any | null;
  discoveryRunInventory: any | null;
  discoveryRuns: any[];
  loadPhase1: () => Promise<void>;
  pollDiscovery: (runId?: number) => Promise<void>;
  pollAgents: () => Promise<void>;
  setDiscoveryRun: (r: any) => void;
  setDiscoveryRunDiscover: (r: any) => void;
  setDiscoveryRunInventory: (r: any) => void;
  setDiscoveryRuns: React.Dispatch<React.SetStateAction<any[]>>;
  setAssessmentRun: (r: any) => void;
  setAgentRuns: React.Dispatch<React.SetStateAction<any[]>>;

  // Phase 2
  dispositions: any[];
  benefits: any | null;
  loadPhase2: () => Promise<void>;

  // Phase 3
  mappings: any[];
  scorecard: any | null;
  sidStandards: any | null;
  loadPhase3: () => Promise<void>;

  // Phase 4 metadata (Align)
  metadata: any[];
  completeness: any | null;
  catalogueTags: Record<string, string[]>;
  loadPhase4: () => Promise<void>;

  // Build (platform conversion)
  buildArtifacts: any[];
  buildSummary: any | null;
  loadBuild: () => Promise<void>;

  // Phase 5
  agentRuns: any[];
  reviews: any[];
  products: any[];
  productRows: any[];
  pipelineRuns: any[];
  reconcileLatest: any | null;
  selectedProductId: number | null;
  setSelectedProductId: (id: number | null) => void;
  loadPhase5: () => Promise<void>;

  // Phase 6–7
  cutover: any | null;
  auditEvents: any[];
  hypercare: any | null;
  loadPhase67: () => Promise<void>;

  // Mirage Suite portfolio (independent of active workspace project)
  portfolio: any | null;
  portfolioError: string | null;
  loadPortfolio: (opts?: {
    projectId?: number | null;
    days?: number | null;
  }) => Promise<void>;

  /** Project-scoped agent chat transcript (persists across stages). */
  agentChatLines: TerminalLine[];
  agentChatActive: boolean;
  postAgentChatMessage: (text: string, opts?: { phaseHint?: string }) => void;
  /** Append assistant lines (e.g. Pilot section actions) into the live chat. */
  appendAgentChatLines: (lines: TerminalLine[]) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setLocalSession] = useState<Session | null>(null);
  const [project, setProject] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [inventory, setInventory] = useState<any[]>([]);
  const [lineage, setLineage] = useState<{ nodes: any[]; edges: any[]; stats?: any }>({
    nodes: [],
    edges: [],
  });
  const [jobs, setJobs] = useState<any[]>([]);
  const [assessmentRun, setAssessmentRun] = useState<any | null>(null);
  const [estate, setEstate] = useState<any | null>(null);
  const [samples, setSamples] = useState<any[]>([]);
  const [discoveryRun, setDiscoveryRun] = useState<any | null>(null);
  const [discoveryRunDiscover, setDiscoveryRunDiscover] = useState<any | null>(null);
  const [discoveryRunInventory, setDiscoveryRunInventory] = useState<any | null>(null);
  const [discoveryRuns, setDiscoveryRuns] = useState<any[]>([]);
  const [dispositions, setDispositions] = useState<any[]>([]);
  const [benefits, setBenefits] = useState<any | null>(null);
  const [mappings, setMappings] = useState<any[]>([]);
  const [scorecard, setScorecard] = useState<any | null>(null);
  const [sidStandards, setSidStandards] = useState<any | null>(null);
  const [metadata, setMetadata] = useState<any[]>([]);
  const [completeness, setCompleteness] = useState<any | null>(null);
  const [catalogueTags, setCatalogueTags] = useState<Record<string, string[]>>({});
  const [buildArtifacts, setBuildArtifacts] = useState<any[]>([]);
  const [buildSummary, setBuildSummary] = useState<any | null>(null);
  const [agentRuns, setAgentRuns] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productRows, setProductRows] = useState<any[]>([]);
  const [pipelineRuns, setPipelineRuns] = useState<any[]>([]);
  const [reconcileLatest, setReconcileLatest] = useState<any | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [cutover, setCutover] = useState<any | null>(null);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [mobilisation, setMobilisation] = useState<any | null>(null);
  const [udpHub, setUdpHub] = useState<any | null>(null);
  const [llmStatus, setLlmStatus] = useState<any | null>(null);
  const [hypercare, setHypercare] = useState<any | null>(null);
  const [portfolio, setPortfolio] = useState<any | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [agentChatLines, setAgentChatLines] = useState<TerminalLine[]>([]);
  const agentChatPidRef = useRef<number | null>(null);

  const pid = project?.id as number | undefined;

  const clearPhaseState = useCallback(() => {
    setInventory([]);
    setLineage({ nodes: [], edges: [] });
    setJobs([]);
    setAssessmentRun(null);
    setEstate(null);
    setDiscoveryRun(null);
    setDiscoveryRunDiscover(null);
    setDiscoveryRunInventory(null);
    setDiscoveryRuns([]);
    setDispositions([]);
    setBenefits(null);
    setMappings([]);
    setScorecard(null);
    setMetadata([]);
    setCompleteness(null);
    setCatalogueTags({});
    setBuildArtifacts([]);
    setBuildSummary(null);
    setAgentRuns([]);
    setReviews([]);
    setProducts([]);
    setProductRows([]);
    setPipelineRuns([]);
    setReconcileLatest(null);
    setSelectedProductId(null);
    setCutover(null);
    setAuditEvents([]);
    setMobilisation(null);
    setUdpHub(null);
    setLlmStatus(null);
    setHypercare(null);
  }, []);

  const refreshProject = useCallback(async () => {
    const list = await api<any[]>("/projects");
    setProjects(list);
    const stored =
      typeof window !== "undefined"
        ? Number(localStorage.getItem(ACTIVE_PROJECT_KEY) || 0)
        : 0;
    const nonSandbox = list.filter((p) => !isAppSandboxProject(p));
    const selected =
      list.find((p) => p.id === stored) ||
      nonSandbox[0] ||
      list[0] ||
      null;
    setProject(selected);
    if (selected?.id) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, String(selected.id));
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
    const sampleList = await api<any[]>("/estate/samples").catch(() => []);
    setSamples(sampleList);
    return selected;
  }, []);

  const ensureAppSandbox = useCallback(async () => {
    const sandbox = await api<any>("/platform/app-sandbox", { method: "POST" });
    setProjects((prev) => {
      if (prev.some((p) => p.id === sandbox.id)) {
        return prev.map((p) => (p.id === sandbox.id ? sandbox : p));
      }
      return [...prev, sandbox];
    });
    return sandbox;
  }, []);

  const selectProject = useCallback(
    async (id: number) => {
      const list = projects.length ? projects : await api<any[]>("/projects");
      const next = list.find((p) => p.id === id);
      if (!next) {
        setMsg("Project not found");
        return;
      }
      clearPhaseState();
      // Drop prior estate chat immediately — effect reloads this project's store.
      agentChatPidRef.current = null;
      setAgentChatLines([]);
      setProject(next);
      localStorage.setItem(ACTIVE_PROJECT_KEY, String(id));
      setMsg(`Switched to ${next.name}`);
    },
    [projects, clearPhaseState]
  );

  const createProject = useCallback(
    async (input: ProjectCreateInput) => {
      setBusy(true);
      setMsg("");
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 20000);
      try {
        const created = await api<any>("/projects", {
          method: "POST",
          body: JSON.stringify(input),
          signal: ctrl.signal,
        });
        clearPhaseState();
        agentChatPidRef.current = null;
        setAgentChatLines([]);
        localStorage.setItem(ACTIVE_PROJECT_KEY, String(created.id));
        const list = await api<any[]>("/projects");
        setProjects(list);
        const selected = list.find((p) => p.id === created.id) || created;
        setProject(selected);
        const sampleList = await api<any[]>("/estate/samples").catch(() => []);
        setSamples(sampleList);
        setMsg(`Created project “${created.name}”.`);
        return created;
      } catch (e: any) {
        if (ctrl.signal.aborted) {
          const err = new Error(
            "Create timed out — is the API running on 127.0.0.1:8000?"
          );
          setMsg(err.message);
          throw err;
        }
        setMsg(e.message || String(e));
        throw e;
      } finally {
        window.clearTimeout(timer);
        setBusy(false);
      }
    },
    [clearPhaseState]
  );

  const deleteProject = useCallback(
    async (id: number) => {
      setBusy(true);
      setMsg("");
      try {
        await api(`/projects/${id}`, { method: "DELETE" });
        if (Number(localStorage.getItem(ACTIVE_PROJECT_KEY)) === id) {
          localStorage.removeItem(ACTIVE_PROJECT_KEY);
        }
        clearPhaseState();
        await refreshProject();
        setMsg("Project deleted.");
      } catch (e: any) {
        setMsg(e.message || String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [clearPhaseState, refreshProject]
  );

  const loadPhase0 = useCallback(async () => {
    if (!pid) return;
    try {
      const [mob, hub, llm] = await Promise.all([
        api<any>(`/projects/${pid}/mobilisation`),
        api<any>(`/projects/${pid}/udp-hub`).catch(() => null),
        api<any>("/platform/llm").catch(() => null),
      ]);
      setMobilisation(mob);
      setUdpHub(hub);
      setLlmStatus(llm);
    } catch {
      setMobilisation(null);
    }
  }, [pid]);

  const loadPhase1 = useCallback(async () => {
    if (!pid) return;
    const [inv, lin, jobList, runs, est, sampleList, discRuns, sid, prods, maps] =
      await Promise.all([
        api<any[]>(`/projects/${pid}/inventory`),
        api<{ nodes: any[]; edges: any[]; stats?: any }>(`/projects/${pid}/lineage`),
        api<any[]>(`/projects/${pid}/jobs`),
        api<any[]>(`/projects/${pid}/agents/runs`),
        api<any>(`/projects/${pid}/estate`).catch(() => null),
        api<any[]>("/estate/samples").catch(() => []),
        api<any[]>(`/projects/${pid}/discovery/runs`).catch(() => []),
        api<any>("/standards/sid").catch(() => null),
        api<any[]>(`/projects/${pid}/products`).catch(() => []),
        api<any[]>(`/projects/${pid}/mappings`).catch(() => []),
      ]);
    setInventory(inv);
    setLineage(lin);
    setJobs(jobList);
    setAgentRuns(runs);
    setEstate(est);
    setSamples(sampleList);
    setDiscoveryRuns(discRuns);
    if (sid) setSidStandards(sid);
    setProducts(prods);
    setMappings(maps);
    setAssessmentRun(runs.find((r) => r.task === "legacy_code_assessment") || null);

    const latestDiscoverMeta = pickLatestRun(discRuns, "discover");
    const latestInventoryMeta = pickLatestRun(discRuns, "inventory");

    async function loadDetail(meta: any | null) {
      if (!meta?.id) return null;
      return api<any>(`/projects/${pid}/discovery/runs/${meta.id}`).catch(() => meta);
    }

    const [discoverDetail, inventoryDetail] = await Promise.all([
      loadDetail(latestDiscoverMeta),
      loadDetail(latestInventoryMeta),
    ]);
    setDiscoveryRunDiscover(discoverDetail);
    setDiscoveryRunInventory(inventoryDetail);
    // Prefer whichever is active; else latest overall for Sources / home
    const active =
      [discoverDetail, inventoryDetail].find((r) =>
        ["queued", "running"].includes(String(r?.status || ""))
      ) ||
      discRuns[0] ||
      null;
    if (active?.id) {
      const detail =
        active.id === discoverDetail?.id
          ? discoverDetail
          : active.id === inventoryDetail?.id
            ? inventoryDetail
            : await api<any>(`/projects/${pid}/discovery/runs/${active.id}`).catch(
                () => active
              );
      setDiscoveryRun(detail);
    } else {
      setDiscoveryRun(null);
    }
  }, [pid]);

  const pollDiscovery = useCallback(async (runId?: number) => {
    if (!pid) return;
    const ids = new Set<number>();
    if (runId) ids.add(runId);
    if (discoveryRunDiscover?.id) ids.add(discoveryRunDiscover.id);
    if (discoveryRunInventory?.id) ids.add(discoveryRunInventory.id);
    if (discoveryRun?.id) ids.add(discoveryRun.id);
    if (!ids.size) return;

    try {
      let anyActive = false;
      for (const id of ids) {
        const detail = await api<any>(`/projects/${pid}/discovery/runs/${id}`);
        const pipe = pipelineOf(detail);
        if (pipe === "inventory") setDiscoveryRunInventory(detail);
        else if (pipe === "discover") setDiscoveryRunDiscover(detail);
        if (discoveryRun?.id === id) setDiscoveryRun(detail);
        if (["queued", "running"].includes(String(detail.status || ""))) {
          anyActive = true;
        }
      }
      if (!anyActive) {
        const list = await api<any[]>(`/projects/${pid}/discovery/runs`).catch(() => []);
        setDiscoveryRuns(list);
        await loadPhase1();
      } else {
        const [inv, jobList, lin] = await Promise.all([
          api<any[]>(`/projects/${pid}/inventory`).catch(() => null),
          api<any[]>(`/projects/${pid}/jobs`).catch(() => null),
          api<any>(`/projects/${pid}/lineage`).catch(() => null),
        ]);
        if (inv) setInventory(inv);
        if (jobList) setJobs(jobList);
        if (lin) setLineage(lin);
      }
    } catch {
      /* ignore */
    }
  }, [pid, discoveryRun?.id, discoveryRunDiscover?.id, discoveryRunInventory?.id, loadPhase1]);

  const loadPhase2 = useCallback(async () => {
    if (!pid) return;
    try {
      const [disp, ben] = await Promise.all([
        api<any[]>(`/projects/${pid}/disposition`),
        api<any>(`/projects/${pid}/disposition/benefits`),
      ]);
      setDispositions(disp);
      setBenefits(ben);
    } catch {
      setDispositions([]);
      setBenefits(null);
    }
  }, [pid]);

  const loadPhase3 = useCallback(async () => {
    if (!pid) return;
    try {
      const [maps, score, sid] = await Promise.all([
        api<any[]>(`/projects/${pid}/mappings`),
        api<any>(`/projects/${pid}/mappings/scorecard`),
        api<any>("/standards/sid"),
      ]);
      setMappings(maps);
      setScorecard(score);
      setSidStandards(sid);
    } catch {
      setMappings([]);
      setScorecard(null);
    }
  }, [pid]);

  const loadPhase4 = useCallback(async () => {
    if (!pid) return;
    try {
      const [meta, comp, tagMap] = await Promise.all([
        api<any[]>(`/projects/${pid}/metadata`),
        api<any>(`/projects/${pid}/metadata/completeness`),
        api<Record<string, string[]>>(`/projects/${pid}/catalogue/tags`),
      ]);
      setMetadata(meta);
      setCompleteness(comp);
      setCatalogueTags(tagMap);
    } catch {
      setMetadata([]);
      setCompleteness(null);
      setCatalogueTags({});
    }
  }, [pid]);

  const loadBuild = useCallback(async () => {
    if (!pid) return;
    try {
      const [arts, sum] = await Promise.all([
        api<any[]>(`/projects/${pid}/build/artifacts`),
        api<any>(`/projects/${pid}/build/summary`),
      ]);
      setBuildArtifacts(arts);
      setBuildSummary(sum);
    } catch {
      setBuildArtifacts([]);
      setBuildSummary(null);
    }
  }, [pid]);

  const loadPhase5 = useCallback(async () => {
    if (!pid) return;
    try {
      const [revs, prods, pipes, runs] = await Promise.all([
        api<any[]>(`/projects/${pid}/reviews`),
        api<any[]>(`/projects/${pid}/products`),
        api<any[]>(`/projects/${pid}/pipeline/runs`),
        api<any[]>(`/projects/${pid}/agents/runs`),
      ]);
      setReviews(revs);
      setProducts(prods);
      setPipelineRuns(pipes);
      setAgentRuns(runs);
      const promotedIds: number[] = (
        (project as any)?.test_env?.product_ids || []
      )
        .map(Number)
        .filter(Boolean);
      const preferId = (list: any[]) => {
        if (!list.length) return null;
        if (promotedIds.length) {
          const hit = list.find((p) => promotedIds.includes(p.id));
          if (hit) return hit.id;
        }
        const liveSdp = list.find(
          (p) =>
            String(p.product_tier || "").toLowerCase() === "sdp" &&
            String(p.status || "").toLowerCase() === "live"
        );
        if (liveSdp) return liveSdp.id;
        const sdp = list.find(
          (p) => String(p.product_tier || "").toLowerCase() === "sdp"
        );
        return sdp?.id || list[0]?.id || null;
      };
      const activeId =
        selectedProductId && prods.some((p) => p.id === selectedProductId)
          ? selectedProductId
          : preferId(prods);
      if (activeId !== selectedProductId) {
        setSelectedProductId(activeId);
      }
      if (activeId) {
        try {
          setProductRows(await api<any[]>(`/projects/${pid}/products/${activeId}/data`));
        } catch {
          setProductRows([]);
        }
        try {
          const hist = await api<any[]>(`/projects/${pid}/products/${activeId}/reconcile`);
          setReconcileLatest(hist[0] || null);
        } catch {
          setReconcileLatest(null);
        }
      } else {
        setProductRows([]);
        setReconcileLatest(null);
      }
    } catch {
      setReviews([]);
      setProducts([]);
      setPipelineRuns([]);
      setProductRows([]);
      setReconcileLatest(null);
    }
  }, [pid, selectedProductId, project]);

  const loadPhase67 = useCallback(async () => {
    if (!pid) return;
    try {
      const [cut, aud, hc] = await Promise.all([
        api<any>(`/projects/${pid}/cutover`),
        api<any[]>(`/projects/${pid}/audit`),
        api<any>(`/projects/${pid}/hypercare`).catch(() => null),
      ]);
      setCutover(cut);
      setAuditEvents(aud);
      setHypercare(hc);
    } catch {
      setCutover(null);
      setAuditEvents([]);
      setHypercare(null);
    }
  }, [pid]);

  const loadPortfolio = useCallback(async (opts?: { projectId?: number | null; days?: number | null }) => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 20000);
    try {
      const qs = new URLSearchParams();
      if (opts?.projectId) qs.set("project_id", String(opts.projectId));
      if (opts?.days) qs.set("days", String(opts.days));
      const q = qs.toString();
      const data = await api<any>(`/portfolio/dashboard${q ? `?${q}` : ""}`, {
        signal: ctrl.signal,
      });
      setPortfolio(data);
      setPortfolioError(null);
    } catch (e: any) {
      setPortfolioError(
        ctrl.signal.aborted
          ? "Portfolio request timed out — retry, or restart the API if it is stuck."
          : String(e?.message || e || "Failed to load portfolio")
      );
      // Keep last good payload if we have one; otherwise leave null so UI can fall back.
      setPortfolio((prev: any) => prev);
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  const pollAgents = useCallback(async () => {
    if (!pid) return;
    try {
      const runs = await api<any[]>(`/projects/${pid}/agents/runs`);
      setAgentRuns(runs);
      setAssessmentRun(runs.find((r) => r.task === "legacy_code_assessment") || null);
      const active = runs.some((r) => ["queued", "running"].includes(r.status));
      if (!active) {
        await Promise.all([loadPhase3(), loadPhase5()]);
      }
    } catch {
      /* ignore */
    }
  }, [pid, loadPhase3, loadPhase5]);

  const run = useCallback(
    async (label: string, fn: () => Promise<any>) => {
      setBusy(true);
      setMsg("");
      try {
        const result = await fn();
        setMsg(`${label} completed.`);
        const currentId = project?.id;
        const list = await api<any[]>("/projects");
        setProjects(list);
        const selected =
          list.find((p) => p.id === currentId) ||
          list.find((p) => p.id === Number(localStorage.getItem(ACTIVE_PROJECT_KEY))) ||
          list[0] ||
          null;
        setProject(selected);
        return result;
      } catch (e: any) {
        setMsg(e.message || String(e));
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [project?.id]
  );

  const signOut = useCallback(() => {
    setSession(null);
    router.replace("/");
  }, [router]);

  const agentChatActive = useMemo(
    () =>
      isAgentChatStreaming({
        projectId: pid ?? null,
        discoveryRunDiscover,
        discoveryRunInventory,
        assessmentRun,
        agentRuns,
        pipelineRuns,
      }),
    [
      pid,
      discoveryRunDiscover,
      discoveryRunInventory,
      assessmentRun,
      agentRuns,
      pipelineRuns,
    ]
  );

  useEffect(() => {
    if (!pid) {
      agentChatPidRef.current = null;
      setAgentChatLines([]);
      return;
    }
    const switched = agentChatPidRef.current !== pid;
    agentChatPidRef.current = pid;

    setAgentChatLines((prev) => {
      const stored = loadProjectAgentChat(pid);
      // Hard isolate: never carry the previous estate's in-memory transcript.
      const base = switched ? stored : prev.length ? prev : stored;
      const live = collectLiveAgentChatLines({
        projectId: pid,
        discoveryRunDiscover,
        discoveryRunInventory,
        assessmentRun,
        agentRuns,
        project,
        reviews,
        products,
        pipelineRuns,
        reconcileLatest,
      });
      const merged = mergeAgentChatLines(base, live);
      saveProjectAgentChat(pid, merged);
      return merged;
    });
  }, [
    pid,
    discoveryRunDiscover,
    discoveryRunInventory,
    assessmentRun,
    agentRuns,
    project,
    reviews,
    products,
    pipelineRuns,
    reconcileLatest,
  ]);

  const appendAgentChatLines = useCallback(
    (lines: TerminalLine[]) => {
      if (!pid || !lines.length) return;
      setAgentChatLines((prev) => {
        const scoped = prev.filter(
          (row) => !row.projectId || Number(row.projectId) === Number(pid)
        );
        const tagged = lines.map((row) => ({
          ...row,
          projectId: row.projectId ?? Number(pid),
        }));
        const next = mergeAgentChatLines(scoped, tagged);
        saveProjectAgentChat(pid, next);
        return next;
      });
    },
    [pid]
  );

  const postAgentChatMessage = useCallback(
    (text: string, opts?: { phaseHint?: string }) => {
      if (!pid) return;
      const turn = buildUserChatTurn(text, {
        projectId: pid,
        active: isAgentChatStreaming({
          projectId: pid,
          discoveryRunDiscover,
          discoveryRunInventory,
          assessmentRun,
          agentRuns,
          pipelineRuns,
        }),
        projectName: project?.name,
        phaseHint:
          opts?.phaseHint ||
          (project?.phase === "5_pilot_product" ? "pilot" : undefined),
      });
      if (!turn.length) return;
      setAgentChatLines((prev) => {
        // Drop any stray lines from another estate before appending.
        const scoped = prev.filter(
          (row) => !row.projectId || Number(row.projectId) === Number(pid)
        );
        const next = mergeAgentChatLines(scoped, turn);
        saveProjectAgentChat(pid, next);
        return next;
      });
    },
    [
      pid,
      project?.name,
      project?.phase,
      discoveryRunDiscover,
      discoveryRunInventory,
      assessmentRun,
      agentRuns,
      pipelineRuns,
    ]
  );

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/");
      return;
    }
    setLocalSession(s);
    (async () => {
      try {
        const ok = await validateSession();
        if (!ok) {
          setSession(null);
          router.replace("/");
          return;
        }
        await refreshProject();
      } catch (e: any) {
        setMsg(String(e.message || e));
      }
    })();
  }, [router, refreshProject]);

  const value = useMemo<WorkspaceContextValue | null>(() => {
    if (!session) return null;
    return {
      session,
      project,
      projects,
      pid,
      busy,
      msg,
      setMsg,
      run,
      refreshProject,
      selectProject,
      createProject,
      deleteProject,
      ensureAppSandbox,
      signOut,
      mobilisation,
      udpHub,
      llmStatus,
      loadPhase0,
      inventory,
      lineage,
      jobs,
      assessmentRun,
      estate,
      samples,
      discoveryRun,
      discoveryRunDiscover,
      discoveryRunInventory,
      discoveryRuns,
      loadPhase1,
      pollDiscovery,
      pollAgents,
      setDiscoveryRun,
      setDiscoveryRunDiscover,
      setDiscoveryRunInventory,
      setDiscoveryRuns,
      setAssessmentRun,
      setAgentRuns,
      dispositions,
      benefits,
      loadPhase2,
      mappings,
      scorecard,
      sidStandards,
      loadPhase3,
      metadata,
      completeness,
      catalogueTags,
      loadPhase4,
      buildArtifacts,
      buildSummary,
      loadBuild,
      agentRuns,
      reviews,
      products,
      productRows,
      pipelineRuns,
      reconcileLatest,
      selectedProductId,
      setSelectedProductId,
      loadPhase5,
      cutover,
      auditEvents,
      hypercare,
      loadPhase67,
      portfolio,
      portfolioError,
      loadPortfolio,
      agentChatLines,
      agentChatActive,
      postAgentChatMessage,
      appendAgentChatLines,
    };
  }, [
    session,
    project,
    projects,
    pid,
    busy,
    msg,
    run,
    refreshProject,
    selectProject,
    createProject,
    deleteProject,
    ensureAppSandbox,
    signOut,
    mobilisation,
    udpHub,
    llmStatus,
    loadPhase0,
    inventory,
    lineage,
    jobs,
    assessmentRun,
    estate,
    samples,
    discoveryRun,
    discoveryRunDiscover,
    discoveryRunInventory,
    discoveryRuns,
    loadPhase1,
    pollDiscovery,
    pollAgents,
    dispositions,
    benefits,
    loadPhase2,
    mappings,
    scorecard,
    sidStandards,
    loadPhase3,
    metadata,
    completeness,
    catalogueTags,
    loadPhase4,
    buildArtifacts,
    buildSummary,
    loadBuild,
    agentRuns,
    reviews,
    products,
    productRows,
    pipelineRuns,
    reconcileLatest,
    selectedProductId,
    loadPhase5,
    cutover,
    auditEvents,
    hypercare,
    loadPhase67,
    portfolio,
    portfolioError,
    loadPortfolio,
    agentChatLines,
    agentChatActive,
    postAgentChatMessage,
    appendAgentChatLines,
  ]);

  if (!session || !value) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-brand-muted">
        Loading workspace…
      </div>
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
