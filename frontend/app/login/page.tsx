"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, validateSession, DEMO_MODE, api } from "@/lib/api";
import { DEMO_USERS } from "@/lib/demo/mode";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("architect@demo.local");
  const [password, setPassword] = useState("demo");
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const ok = await validateSession();
        if (ok) router.replace("/workspace");
      } catch {
        /* stay on login */
      }
    })();
    if (DEMO_MODE) {
      setUsers(DEMO_USERS.map(({ email, role, name }) => ({ email, role, name })));
      return;
    }
    api("/auth/demo-users")
      .then(setUsers)
      .catch(() => {});
  }, [router]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.push("/workspace");
    } catch (err: any) {
      setError(
        DEMO_MODE
          ? err?.message || "Demo login failed"
          : `Login failed — ensure the API is running.`
      );
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-tm-gray-50">
      <header className="ws-topbar !h-14 border-b border-brand-line bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="brand-mark">M</div>
            <div>
              <div className="text-sm font-semibold text-brand-ink">Mirage</div>
              <div className="text-[11px] text-brand-muted">Control Plane</div>
            </div>
          </Link>
          {DEMO_MODE ? (
            <span className="badge-neutral">Public demo · mock data</span>
          ) : (
            <span className="badge-neutral">Enterprise workspace</span>
          )}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-6 py-10 lg:grid-cols-[1fr_380px]">
        <section className="flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Legacy → governed products
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink">
            Sign in to Mirage Suite
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-brand-muted">
            Discover the estate, decide with evidence, align to standards, and cut over
            one product at a time — with humans in the loop.
          </p>
          {DEMO_MODE && (
            <p className="mt-4 max-w-lg border-l-2 border-brand-500 pl-3 text-sm text-brand-ink">
              You are in <strong>mock demo mode</strong>. Data is fixture-backed; mutations
              are simulated and do not call a live backend.
            </p>
          )}
        </section>

        <section className="flex flex-col justify-center gap-3">
          <form onSubmit={onLogin} className="border border-brand-line bg-white p-5">
            <h2 className="text-base font-semibold text-brand-ink">Sign in</h2>
            <p className="mt-1 text-xs text-brand-muted">
              Demo personas enforce Architect, Product Owner, and Change Board gates.
            </p>
            <label className="label mt-4">
              Email
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="label mt-3">
              Password
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && <p className="mt-2 text-sm text-bad">{error}</p>}
            <button className="btn mt-4 w-full" type="submit">
              Enter workspace
            </button>
          </form>

          <div className="border border-brand-line bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
              Demo users · password <code className="text-brand-ink">demo</code>
            </p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs">
              {(users.length ? users : DEMO_USERS).map((u: any) => (
                <li key={u.email}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left hover:bg-tm-gray-50"
                    onClick={() => {
                      setEmail(u.email);
                      setPassword("demo");
                    }}
                  >
                    <span className="font-medium text-brand-ink">{u.email}</span>
                    <span className="ml-2 text-brand-muted">{u.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <Link href="/" className="text-center text-xs text-brand-muted hover:text-brand-500">
            ← Back to product site
          </Link>
        </section>
      </main>
    </div>
  );
}
