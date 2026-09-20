// Prefer 127.0.0.1 — on macOS `localhost` often resolves to ::1, which can hit a
// different listener on :8000 (e.g. Docker) while uvicorn binds IPv4 only.
import { DEMO_MODE, DEMO_TOKEN } from "@/lib/demo/mode";
import { mockApi } from "@/lib/demo/mockApi";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
export { DEMO_MODE };

export type Session = {
  token: string;
  role: string;
  name: string;
  email: string;
};

const SESSION_KEY = "mcp_session";

function looksLikeJwt(token: unknown): token is string {
  return typeof token === "string" && token.split(".").length === 3 && token.length > 20;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.token || parsed?.access_token;
    if (!looksLikeJwt(token)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return {
      token,
      role: String(parsed.role || "viewer"),
      name: String(parsed.name || ""),
      email: String(parsed.email || ""),
    };
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function setSession(s: Session | null) {
  if (!s) localStorage.removeItem(SESSION_KEY);
  else
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        token: s.token,
        role: s.role,
        name: s.name,
        email: s.email,
      })
    );
}

/** One-click demo session (architect persona). */
export function startDemoSession(): Session {
  const session: Session = {
    token: DEMO_TOKEN,
    role: "architect",
    name: "Alex Architect",
    email: "architect@demo.local",
  };
  setSession(session);
  if (typeof window !== "undefined") {
    localStorage.setItem("mirage_active_project_id", "5");
    localStorage.setItem("mirage_demo_mode", "1");
  }
  return session;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function parseErrorDetail(text: string, fallback: string): string {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.detail))
      return parsed.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ");
    if (parsed?.detail) return JSON.stringify(parsed.detail);
  } catch {
    /* keep raw */
  }
  return text || fallback;
}

export async function api<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  if (DEMO_MODE) {
    const result = await mockApi(path, opts);
    if (result.status === 204) return undefined as T;
    if (result.status >= 400) {
      const message =
        typeof (result.body as any)?.detail === "string"
          ? (result.body as any).detail
          : `Demo API error (${result.status})`;
      if (result.status === 401) setSession(null);
      throw new ApiError(message, result.status);
    }
    return result.body as T;
  }

  const session = getSession();
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  if (opts.body && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  } catch {
    throw new ApiError(
      `Cannot reach API at ${API_URL}. Is the backend running on 127.0.0.1:8000?`,
      0
    );
  }
  if (!res.ok) {
    const text = await res.text();
    let message = parseErrorDetail(text, res.statusText);
    if (res.status === 401) {
      setSession(null);
      if (
        message === "Could not validate credentials" ||
        message === "Not authenticated"
      ) {
        message = "Session expired or invalid — sign in again.";
      }
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function login(email: string, password: string): Promise<Session> {
  if (DEMO_MODE) {
    const result = await mockApi("/auth/login", {
      method: "POST",
      body: new URLSearchParams({ username: email, password }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (result.status >= 400) {
      throw new Error(
        typeof (result.body as any)?.detail === "string"
          ? (result.body as any).detail
          : "Login failed"
      );
    }
    const data = result.body as any;
    const session = {
      token: data.access_token,
      role: data.role,
      name: data.name,
      email: data.email,
    };
    setSession(session);
    return session;
  }

  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new Error(`Cannot reach API at ${API_URL}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseErrorDetail(text, "Login failed"));
  }
  const data = await res.json();
  if (!looksLikeJwt(data.access_token)) {
    throw new Error("Login succeeded but no access token was returned");
  }
  const session = {
    token: data.access_token,
    role: data.role,
    name: data.name,
    email: data.email,
  };
  setSession(session);
  return session;
}

/** Confirm stored JWT still works against the live API (or demo mock). */
export async function validateSession(): Promise<Session | null> {
  const session = getSession();
  if (!session) return null;
  try {
    await api("/me");
    return session;
  } catch (e: any) {
    if (e instanceof ApiError && e.status === 401) return null;
    // Network blip — keep session; caller decides
    throw e;
  }
}
