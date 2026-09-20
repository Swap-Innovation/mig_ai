import store from "./fixtures/store.json";
import meta from "./fixtures/meta.json";
import { DEMO_TOKEN, DEMO_USERS } from "./mode";

type Store = Record<string, unknown>;

const FIXTURES = store as Store;
const PROJECT_ID = String((meta as { project_id: number }).project_id || 5);

function normalizePath(path: string): string {
  const q = path.indexOf("?");
  const bare = q >= 0 ? path.slice(0, q) : path;
  return bare.replace(/\/+$/, "") || "/";
}

function getFixture(method: string, path: string): unknown {
  const bare = normalizePath(path);
  const key = `${method.toUpperCase()} ${bare}`;
  if (key in FIXTURES) return FIXTURES[key];

  // Portfolio dashboard ignores query in fixtures
  if (bare === "/portfolio/dashboard") {
    return FIXTURES["GET /portfolio/dashboard"];
  }

  // Remap any /projects/{id}/... to the fixture project id
  const remapped = bare.replace(/^\/projects\/[^/]+/, `/projects/${PROJECT_ID}`);
  const remapKey = `${method.toUpperCase()} ${remapped}`;
  if (remapKey in FIXTURES) return FIXTURES[remapKey];

  // Discovery run detail — return first run list item expanded
  const runMatch = remapped.match(/^\/projects\/\d+\/discovery\/runs\/([^/]+)$/);
  if (runMatch && method.toUpperCase() === "GET") {
    const list = FIXTURES[`GET /projects/${PROJECT_ID}/discovery/runs`];
    if (Array.isArray(list) && list.length) {
      const found = list.find(
        (r: any) => String(r.id) === runMatch[1] || String(r.run_id) === runMatch[1]
      );
      return found || list[0];
    }
  }

  // Product sub-resources — empty safe defaults
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
    return {
      run_id: "demo-discovery-1",
      status: "completed",
      message: "Demo mode — discovery replayed from fixtures",
    };
  }

  if (/\/agents\//.test(bare) && /\/runs$/.test(bare) && upper === "POST") {
    return {
      id: "demo-agent-1",
      status: "completed",
      task: "demo",
      message: "Demo mode — agent run simulated",
    };
  }

  if (upper === "DELETE") return undefined;

  // Generic OK for signoff / generate / approve / plan / etc.
  return {
    ok: true,
    status: "ok",
    demo: true,
    message: "Demo mode — mutation accepted (fixtures unchanged)",
    ...(typeof body === "object" && body ? body : {}),
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
  // Simulate network latency for realism
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

  if (method === "GET") {
    const data = getFixture(method, path);
    if (data !== undefined) return { status: 200, body: data };
    // Soft empty defaults so UI shells still render
    if (bare.endsWith("/inventory") || bare.endsWith("/jobs") || bare.endsWith("/mappings") || bare.endsWith("/reviews") || bare.endsWith("/audit") || bare.endsWith("/products") || bare.endsWith("/artifacts") || bare.endsWith("/runs")) {
      return { status: 200, body: [] };
    }
    if (bare.includes("/lineage")) {
      return { status: 200, body: { nodes: [], edges: [], stats: {} } };
    }
    return { status: 200, body: {} };
  }

  // Mutations
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
