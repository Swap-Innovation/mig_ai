import type { TerminalLine } from "@/components/phases/discovery/DiscoveryTerminal";
import { terminalLinesFromRun } from "@/components/phases/discovery/discoveryAgents";

/** v2 — project-scoped transcripts only (v1 could leak across estates). */
const STORAGE_PREFIX = "mirage.agentChat.v2.";
const MAX_LINES = 900;

export function agentChatStorageKey(projectId: number) {
  return `${STORAGE_PREFIX}${projectId}`;
}

export function loadProjectAgentChat(projectId: number): TerminalLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(agentChatStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as TerminalLine[]).filter(
      (row) =>
        !row?.projectId || Number(row.projectId) === Number(projectId)
    );
  } catch {
    return [];
  }
}

export function saveProjectAgentChat(projectId: number, lines: TerminalLine[]) {
  if (typeof window === "undefined") return;
  try {
    const scoped = lines
      .filter(
        (row) =>
          !row?.projectId || Number(row.projectId) === Number(projectId)
      )
      .map((row) => ({ ...row, projectId }))
      .slice(-MAX_LINES);
    sessionStorage.setItem(
      agentChatStorageKey(projectId),
      JSON.stringify(scoped)
    );
  } catch {
    /* ignore quota */
  }
}

function lineKey(row: TerminalLine) {
  return `${row.projectId || ""}|${row.role || ""}|${row.ts || ""}|${row.agent || ""}|${row.line}`;
}

export function mergeAgentChatLines(
  prev: TerminalLine[],
  next: TerminalLine[]
): TerminalLine[] {
  if (!next.length) return prev;
  const seen = new Set(prev.map(lineKey));
  const out = [...prev];
  for (const row of next) {
    if (!row?.line) continue;
    const k = lineKey(row);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out.slice(-MAX_LINES);
}

function belongsToProject(run: any, projectId?: number | null) {
  if (projectId == null) return true;
  if (run == null) return false;
  if (run.project_id == null && run.projectId == null) return true;
  return (
    Number(run.project_id ?? run.projectId) === Number(projectId)
  );
}

function tagProject(
  rows: TerminalLine[],
  projectId?: number | null
): TerminalLine[] {
  if (projectId == null) return rows;
  return rows.map((r) => ({
    ...r,
    role: r.role || ("assistant" as const),
    projectId: Number(projectId),
  }));
}

/** Terminal / step lines from a generic agent run row. */
export function terminalLinesFromAgentRun(run: any | null | undefined): TerminalLine[] {
  if (!run) return [];
  const steps = run.steps || run.output?.steps || [];
  const lines: TerminalLine[] = [];
  const projectId =
    run.project_id != null ? Number(run.project_id) : undefined;
  for (const s of steps) {
    const isTerm =
      s?.name === "terminal.log" || s?.detail?.kind === "terminal";
    if (isTerm) {
      lines.push({
        ts: s.detail?.ts || s.created_at,
        agent: s.detail?.agent || run.task || "Agent",
        role: "assistant",
        projectId,
        line: String(s.message || ""),
      });
      continue;
    }
    if (s?.message) {
      const mark =
        s.status === "failed" ? "✗" : s.status === "running" ? "…" : "·";
      lines.push({
        ts: s.created_at,
        agent: s.detail?.agent || run.task || "Agent",
        role: "assistant",
        projectId,
        line: `${mark} ${s.message}`,
      });
    }
  }
  if (!lines.length && run.status) {
    lines.push({
      agent: run.task || "Agent",
      role: "assistant",
      projectId,
      line: `Status ${run.status}${
        run.confidence != null
          ? ` · conf ${Math.round(Number(run.confidence) * 100)}%`
          : ""
      }`,
    });
  }
  return lines;
}

export function collectLiveAgentChatLines(input: {
  projectId?: number | null;
  discoveryRunDiscover?: any | null;
  discoveryRunInventory?: any | null;
  assessmentRun?: any | null;
  agentRuns?: any[];
  /** Pilot / Prove stage snapshots */
  project?: any | null;
  reviews?: any[];
  products?: any[];
  pipelineRuns?: any[];
  reconcileLatest?: any | null;
}): TerminalLine[] {
  const pid = input.projectId ?? null;
  const out: TerminalLine[] = [];

  if (belongsToProject(input.discoveryRunDiscover, pid)) {
    out.push(
      ...tagProject(
        terminalLinesFromRun(input.discoveryRunDiscover || null),
        pid
      )
    );
  }
  if (belongsToProject(input.discoveryRunInventory, pid)) {
    out.push(
      ...tagProject(
        terminalLinesFromRun(input.discoveryRunInventory || null),
        pid
      )
    );
  }
  if (input.assessmentRun && belongsToProject(input.assessmentRun, pid)) {
    out.push(...tagProject(terminalLinesFromAgentRun(input.assessmentRun), pid));
  }
  for (const run of input.agentRuns || []) {
    if (!belongsToProject(run, pid)) continue;
    out.push(...tagProject(terminalLinesFromAgentRun(run), pid));
  }

  out.push(
    ...collectPilotChatLines({
      projectId: pid,
      project: input.project,
      reviews: input.reviews,
      products: input.products,
      pipelineRuns: input.pipelineRuns,
      reconcileLatest: input.reconcileLatest,
    })
  );

  return out;
}

/** Snapshot Pilot sections into the live chat (Reviews → Reconcile). */
export function collectPilotChatLines(input: {
  projectId?: number | null;
  project?: any | null;
  reviews?: any[];
  products?: any[];
  pipelineRuns?: any[];
  reconcileLatest?: any | null;
}): TerminalLine[] {
  const pid =
    input.projectId != null
      ? Number(input.projectId)
      : input.project?.id != null
        ? Number(input.project.id)
        : null;
  if (pid == null) return [];

  const lines: TerminalLine[] = [];
  const reviews = input.reviews || [];
  const products = input.products || [];
  const pipes = input.pipelineRuns || [];
  const rec = input.reconcileLatest;
  const testEnv = input.project?.test_env || {};
  const testReady = !!input.project?.test_env_ready;

  if (reviews.length) {
    const pending = reviews.filter(
      (r) => String(r.status || "").toLowerCase() === "pending"
    ).length;
    const approved = reviews.filter((r) =>
      ["approved", "accepted"].includes(String(r.status || "").toLowerCase())
    ).length;
    const rejected = reviews.filter((r) =>
      ["rejected", "flagged"].includes(String(r.status || "").toLowerCase())
    ).length;
    lines.push({
      role: "assistant",
      agent: "Pilot · Reviews",
      projectId: pid,
      line: `▶ Reviews · ${reviews.length} items · pending ${pending} · approved ${approved} · rejected ${rejected}`,
    });
    for (const r of reviews.slice(0, 12)) {
      const st = String(r.status || "pending");
      const mark =
        st === "approved" || st === "accepted"
          ? "✓"
          : st === "rejected" || st === "flagged"
            ? "✗"
            : "·";
      lines.push({
        role: "assistant",
        agent: "Pilot · Reviews",
        projectId: pid,
        ts: r.updated_at || r.created_at,
        line: `${mark} #${r.id} ${r.title || r.kind || r.task || "review"} · ${st}`,
      });
    }
  }

  if (products.length) {
    lines.push({
      role: "assistant",
      agent: "Pilot · Product",
      projectId: pid,
      line: `▶ Product · ${products.length} catalog entr${products.length === 1 ? "y" : "ies"}`,
    });
    for (const p of products.slice(0, 10)) {
      const tier = String(p.product_tier || "adp").toUpperCase();
      lines.push({
        role: "assistant",
        agent: "Pilot · Product",
        projectId: pid,
        line: `· ${p.name || `product #${p.id}`} · ${tier} · ${p.status || "draft"}${
          p.pipeline_status ? ` · pipeline ${p.pipeline_status}` : ""
        }`,
      });
    }
  }

  const promoted = (testEnv.product_ids || []).map(Number).filter(Boolean);
  if (testReady || promoted.length) {
    const names = products
      .filter((p) => promoted.includes(Number(p.id)))
      .map((p) => p.name || `#${p.id}`);
    lines.push({
      role: "assistant",
      agent: "Pilot · Migrate to Test",
      projectId: pid,
      line: testReady
        ? `▶ Migrate to Test · ready · ${
            names.length ? names.join(", ") : `${promoted.length} product(s)`
          }`
        : `▶ Migrate to Test · promoted ${
            names.length ? names.join(", ") : promoted.join(", ")
          } (awaiting ready)`,
    });
  }

  if (pipes.length) {
    lines.push({
      role: "assistant",
      agent: "Pilot · Dual pipeline",
      projectId: pid,
      line: `▶ Run dual pipeline · ${pipes.length} stage run${pipes.length === 1 ? "" : "s"}`,
    });
    for (const run of pipes.slice(0, 16)) {
      const msg =
        (run.detail && typeof run.detail === "object" && run.detail.message) ||
        null;
      const mark =
        String(run.status || "").toLowerCase() === "success" ||
        String(run.status || "").toLowerCase() === "succeeded"
          ? "✓"
          : String(run.status || "").toLowerCase() === "failed"
            ? "✗"
            : "·";
      lines.push({
        role: "assistant",
        agent: "Pilot · Dual pipeline",
        projectId: pid,
        ts: run.completed_at || run.created_at,
        line: `${mark} product #${run.product_id} · ${run.stage || "stage"} · ${
          run.status || "unknown"
        }${msg ? ` — ${msg}` : ""}`,
      });
    }
  }

  if (rec) {
    const passed = !!(rec.passed ?? rec.metrics?.passed);
    const metrics = rec.metrics || rec;
    const pname =
      metrics.product_name ||
      products.find((p) => p.id === (metrics.product_id || rec.product_id))
        ?.name ||
      `product #${metrics.product_id || rec.product_id || "?"}`;
    lines.push({
      role: "assistant",
      agent: "Pilot · Reconcile",
      projectId: pid,
      ts: rec.created_at,
      line: `${passed ? "✓" : "✗"} Reconcile · ${pname} · ${
        passed ? "passed" : "failed"
      }${
        metrics.delta_pct != null
          ? ` · Δ ${Number(metrics.delta_pct).toFixed(2)}%`
          : ""
      }`,
    });
  }

  return lines;
}

/** Immediate Pilot action narrative (Reviews / Product / Test / Pipeline / Reconcile). */
export function pilotActionChatLines(
  section:
    | "reviews"
    | "product"
    | "test_env"
    | "pipeline"
    | "reconcile",
  message: string,
  projectId?: number | null,
  extraLines: string[] = []
): TerminalLine[] {
  if (!message.trim()) return [];
  const pid = projectId != null ? Number(projectId) : undefined;
  const agent =
    section === "reviews"
      ? "Pilot · Reviews"
      : section === "product"
        ? "Pilot · Product"
        : section === "test_env"
          ? "Pilot · Migrate to Test"
          : section === "pipeline"
            ? "Pilot · Dual pipeline"
            : "Pilot · Reconcile";
  const ts = new Date().toISOString();
  return [
    {
      role: "assistant" as const,
      agent,
      projectId: pid,
      ts,
      line: `▶ ${message}`,
    },
    ...extraLines.map((line, i) => ({
      role: "assistant" as const,
      agent,
      projectId: pid,
      ts: new Date(Date.now() + i + 1).toISOString(),
      line,
    })),
  ];
}

export function isAgentChatStreaming(input: {
  projectId?: number | null;
  discoveryRunDiscover?: any | null;
  discoveryRunInventory?: any | null;
  assessmentRun?: any | null;
  agentRuns?: any[];
  pipelineRuns?: any[];
}): boolean {
  const pid = input.projectId ?? null;
  const statuses = [
    belongsToProject(input.discoveryRunDiscover, pid)
      ? input.discoveryRunDiscover?.status
      : null,
    belongsToProject(input.discoveryRunInventory, pid)
      ? input.discoveryRunInventory?.status
      : null,
    belongsToProject(input.assessmentRun, pid)
      ? input.assessmentRun?.status
      : null,
    ...(input.agentRuns || [])
      .filter((r) => belongsToProject(r, pid))
      .slice(0, 8)
      .map((r) => r.status),
    ...(input.pipelineRuns || [])
      .filter((r) => belongsToProject(r, pid) || r.project_id == null)
      .slice(0, 6)
      .map((r) => r.status),
  ];
  return statuses.some((s) =>
    ["queued", "running"].includes(String(s || "").toLowerCase())
  );
}

type StewardContext = {
  active?: boolean;
  projectName?: string;
  phaseHint?: string;
};

/** Lightweight in-rail steward replies (no network). */
export function stewardReply(question: string, ctx: StewardContext = {}): string {
  const q = question.toLowerCase();
  const estate = ctx.projectName ? `**${ctx.projectName}**` : "this estate";
  const onPilot =
    ctx.phaseHint === "pilot" ||
    ctx.phaseHint === "prove" ||
    ctx.phaseHint === "5_pilot_product";

  if (/\b(pause|stop|wait|hold)\b/.test(q)) {
    return ctx.active
      ? `Understood — keep watching the live stream on ${estate}. When the current agent step finishes, pause for your review before starting the next stage.`
      : `No run is streaming right now on ${estate}. When you start a stage action, say **pause after this step** and I'll remind you to review before continuing.`;
  }

  if (/\b(status|progress|running|live|pilot)\b/.test(q) || (onPilot && /\bstatus\b/.test(q))) {
    if (onPilot) {
      return ctx.active
        ? `Pilot is live on ${estate}. Watch **Reviews**, **Product**, **Migrate to Test**, **Run dual pipeline**, and **Reconcile** updates stream above as you work each Prove section.`
        : `Pilot on ${estate}: work **Reviews** → **Product** → **Migrate to Test** → **Run dual pipeline** → **Reconcile**. Each section’s updates appear in this chat.`;
    }
    return ctx.active
      ? `A live run is in progress on ${estate}. New agent lines appear above as they stream.`
      : `Idle on ${estate}. Start a stage action — output will stream here automatically.`;
  }

  if (/\b(review|inbox|hitl)\b/.test(q)) {
    return `Open Prove → **Reviews** for the HITL inbox on ${estate}. Approvals and rejects stream here under **Pilot · Reviews**.`;
  }

  if (/\b(product|contract)\b/.test(q)) {
    return `Open Prove → **Product** for the catalog and contract on ${estate}. Status changes show here under **Pilot · Product**.`;
  }

  if (/\b(test.?env|migrate to test|promote)\b/.test(q)) {
    return `Open Prove → **Migrate to Test** to promote products into the test environment on ${estate}. Promotion lines appear under **Pilot · Migrate to Test**.`;
  }

  if (/\b(dual|pipeline)\b/.test(q)) {
    return `Open Prove → **Run dual pipeline** on ${estate}. Stage results (ingest / landing / transform / publish) stream here under **Pilot · Dual pipeline**.`;
  }

  if (/\b(reconcil)\b/.test(q)) {
    return `Open Prove → **Reconcile** on ${estate}. Pass/fail and delta metrics stream here under **Pilot · Reconcile**.`;
  }

  if (/\b(summar|found|finding|what.*(agent|find|see))\b/.test(q)) {
    return onPilot
      ? `Scroll this thread for Pilot section updates on ${estate} — Reviews, Product, Migrate to Test, Dual pipeline, and Reconcile are labeled by agent.`
      : `Scroll the thread above for the latest agent narrative on ${estate}.`;
  }

  if (/\b(next|should i|what now|guide|help)\b/.test(q)) {
    return onPilot
      ? `Typical Pilot path on ${estate}: **Reviews** (HITL) → **Product** → **Migrate to Test** → **Run dual pipeline** → **Reconcile**, then continue to Migrate when reconcile passes.`
      : `Typical path on ${estate}: Discover → Plan → Decide → Align → Build → Pilot → Migrate. Ask me about the current stage anytime.`;
  }

  if (/\b(profil|inventor|lineage|assess|plan)\b/.test(q)) {
    return `Use the stage workbench for that view, and keep this chat open for live output and steering.`;
  }

  return onPilot
    ? `Got it. I'm Mirage for Pilot on ${estate} — I stream **Reviews**, **Product**, **Migrate to Test**, **Dual pipeline**, and **Reconcile** here. Ask about status, a section, or what to do next.`
    : `Got it. I'm Mirage for ${estate} — I stream live agent runs here and can help you govern the journey. Ask about the stream above, or say what you want to do next.`;
}

export function buildUserChatTurn(
  text: string,
  ctx: StewardContext & { projectId?: number | null } = {}
): TerminalLine[] {
  const ts = new Date().toISOString();
  const trimmed = text.trim();
  if (!trimmed) return [];
  const projectId =
    ctx.projectId != null ? Number(ctx.projectId) : undefined;
  return [
    { role: "user", agent: "You", line: trimmed, ts, projectId },
    {
      role: "assistant",
      agent: "Mirage",
      line: stewardReply(trimmed, ctx),
      ts: new Date(Date.now() + 1).toISOString(),
      projectId,
    },
  ];
}
