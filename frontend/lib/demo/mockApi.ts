import store from "./fixtures/store.json";
import meta from "./fixtures/meta.json";
import { DEMO_TOKEN, DEMO_USERS } from "./mode";

type Store = Record<string, unknown>;

/** Mutable overlay so demo mutations can "stick" for the session. */
const FIXTURES: Store = { ...(store as Store) };
const PROJECT_ID = String((meta as { project_id: number }).project_id || 5);

function normalizePath(path: string): string {
  const q = path.indexOf("?");
  const bare = q >= 0 ? path.slice(0, q) : path;
  return bare.replace(/\/+$/, "") || "/";
}

function runsKey() {
  return `GET /projects/${PROJECT_ID}/discovery/runs`;
}

function getRuns(): any[] {
  const list = FIXTURES[runsKey()];
  return Array.isArray(list) ? list : [];
}

function findRun(id: string | number): any | undefined {
  return getRuns().find(
    (r: any) => String(r.id) === String(id) || String(r.run_id) === String(id)
  );
}

function getFixture(method: string, path: string): unknown {
  const bare = normalizePath(path);
  const key = `${method.toUpperCase()} ${bare}`;
  if (key in FIXTURES) return FIXTURES[key];

  if (bare === "/portfolio/dashboard") {
    return FIXTURES["GET /portfolio/dashboard"];
  }

  const remapped = bare.replace(/^\/projects\/[^/]+/, `/projects/${PROJECT_ID}`);
  const remapKey = `${method.toUpperCase()} ${remapped}`;
  if (remapKey in FIXTURES) return FIXTURES[remapKey];

  const runMatch = remapped.match(/^\/projects\/\d+\/discovery\/runs\/([^/]+)$/);
  if (runMatch && method.toUpperCase() === "GET") {
    const found = findRun(runMatch[1]);
    if (found) return found;
  }

  if (/\/products\/[^/]+\/(data|reconcile)$/.test(remapped)) return [];
  if (/\/products\/[^/]+\/pipeline\/blueprint$/.test(remapped)) {
    return { status: "idle", steps: [] };
  }

  return undefined;
}

function mutationResponse(method: string, path: string, body: unknown): unknown {
  const bare = normalizePath(path);
  const upper = method.toUpperCase();

  if (bare === "/projects" && upper === "POST") {
    return {
      id: 9001,
      name: (body as any)?.name || "Demo Estate",
      slug: "demo-estate",
      phase: "1_discovery",
    };
  }

  if (/\/discovery\/run$/.test(bare) && upper === "POST") {
    const pipeline = String(
      (body as any)?.pipeline || (body as any)?.pipe || "discover"
    ).toLowerCase();
    const want = pipeline === "inventory" ? "inventory" : "discover";
    const runs = getRuns();
    const match =
      runs.find(
        (r: any) =>
          String(r?.summary?.pipeline || r?.pipeline || "").toLowerCase() === want
      ) || runs[0];
    if (match) {
      // Ensure newest-first list still surfaces this pipeline after "re-run"
      const rest = runs.filter((r: any) => r.id !== match.id);
      FIXTURES[runsKey()] = [{ ...match, status: "completed" }, ...rest];
      return {
        run_id: match.id,
        id: match.id,
        status: "completed",
        pipeline: want,
        message:
          want === "inventory"
            ? "Demo mode — profiling & lineage replayed from fixtures"
            : "Demo mode — discovery scan replayed from fixtures",
      };
    }
    return {
      run_id: 3,
      id: 3,
      status: "completed",
      pipeline: want,
      message: "Demo mode — discovery completed (fixtures missing run detail)",
    };
  }

  if (/\/inventory\/signoff$/.test(bare) && upper === "POST") {
    return {
      ok: true,
      demo: true,
      signed_off: true,
      signed_off_at: new Date().toISOString(),
      message: "Demo mode — inventory sign-off recorded",
    };
  }

  if (/\/discovery\/hitl$/.test(bare) && upper === "POST") {
    const key = String((body as any)?.key || (body as any)?.object_key || "item");
    const current =
      (FIXTURES[`GET /projects/${PROJECT_ID}/discovery/hitl`] as any) || {
        decisions: {},
      };
    const decisions = { ...(current.decisions || {}) };
    decisions[key] = {
      decision: (body as any)?.decision || "migrate",
      rationale: (body as any)?.rationale || "Demo decision",
      decided_by: "architect@demo.local",
    };
    FIXTURES[`GET /projects/${PROJECT_ID}/discovery/hitl`] = { decisions };
    return { ok: true, demo: true, decisions };
  }

  if (/\/agents\//.test(bare) && /\/runs$/.test(bare) && upper === "POST") {
    return {
      id: "demo-agent-1",
      status: "completed",
      task: "demo",
      message: "Demo mode — agent run simulated",
    };
  }

  if (/\/estate\/(sample|upload|git)/.test(bare) && upper === "POST") {
    const est = {
      ...((FIXTURES[`GET /projects/${PROJECT_ID}/estate`] as object) || {}),
      exists: true,
      ready: true,
      last_synced_at: new Date().toISOString(),
    };
    FIXTURES[`GET /projects/${PROJECT_ID}/estate`] = est;
    return { ok: true, demo: true, estate: est };
  }

  if (upper === "DELETE") return undefined;

  return {
    ok: true,
    status: "ok",
    demo: true,
    message: "Demo mode — mutation accepted",
    ...(typeof body === "object" && body ? (body as object) : {}),
  };
}

export type MockResult = { status: number; body: unknown };

/**
 * Handle an API call entirely in-browser. Throws never — returns status + body.
 */
export async function mockApi(
  path: string,
  opts: RequestInit = {}
): Promise<MockResult> {
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));

  const method = (opts.method || "GET").toUpperCase();
  const bare = normalizePath(path);

  if (bare === "/auth/demo-users" && method === "GET") {
    return {
      status: 200,
      body: DEMO_USERS.map(({ email, role, name }) => ({ email, role, name })),
    };
  }

  if (bare === "/auth/login" && method === "POST") {
    let email = "architect@demo.local";
    let password = "demo";
    const raw = opts.body;
    if (typeof raw === "string") {
      const params = new URLSearchParams(raw);
      email = params.get("username") || email;
      password = params.get("password") || password;
    } else if (raw instanceof URLSearchParams) {
      email = raw.get("username") || email;
      password = raw.get("password") || password;
    }
    const user = DEMO_USERS.find(
      (u) => u.email === email && u.password === password
    );
    if (!user) {
      return { status: 401, body: { detail: "Invalid demo credentials" } };
    }
    return {
      status: 200,
      body: {
        access_token: DEMO_TOKEN,
        token_type: "bearer",
        role: user.role,
        name: user.name,
        email: user.email,
      },
    };
  }

  if (bare === "/health" && method === "GET") {
    return {
      status: 200,
      body: {
        status: "ok",
        demo: true,
        sample_project: "party-customer-wave1",
      },
    };
  }

  if (bare === "/platform/llm" && method === "GET") {
    return {
      status: 200,
      body: {
        cursor_configured: true,
        mode: "demo",
        demo: true,
      },
    };
  }

  if (method === "GET") {
    const data = getFixture(method, path);
    if (data !== undefined) return { status: 200, body: data };
    // Soft empty defaults so UI shells still render
    if (
      bare.endsWith("/inventory") ||
      bare.endsWith("/jobs") ||
      bare.endsWith("/mappings") ||
      bare.endsWith("/reviews") ||
      bare.endsWith("/audit") ||
      bare.endsWith("/products") ||
      bare.endsWith("/artifacts") ||
      bare.endsWith("/runs")
    ) {
      return { status: 200, body: [] };
    }
    if (bare.includes("/lineage")) {
      return { status: 200, body: { nodes: [], edges: [], stats: {} } };
    }
    return { status: 200, body: {} };
  }

  let parsedBody: unknown = null;
  if (opts.body && typeof opts.body === "string") {
    try {
      parsedBody = JSON.parse(opts.body);
    } catch {
      parsedBody = opts.body;
    }
  }
  const body = mutationResponse(method, path, parsedBody);
  if (body === undefined) return { status: 204, body: undefined };
  return { status: 200, body };
}
