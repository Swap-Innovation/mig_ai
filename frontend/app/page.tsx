"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { login, validateSession, API_URL } from "@/lib/api";
import { NAV_PHASES } from "@/lib/phases";

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState("engineer@demo.local");
  const [password, setPassword] = useState("demo");
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const ok = await validateSession();
        if (ok) router.replace("/workspace");
      } catch {
        /* API down — stay on login */
      }
    })();
    fetch(`${API_URL}/auth/demo-users`)
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {});
  }, [router]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.push("/workspace");
    } catch {
      setError(`Login failed — ensure the API is running at ${API_URL}.`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-tm-gray-50">
      <header className="ws-topbar !h-14 border-b border-brand-line bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="brand-mark">M</div>
            <div>
              <div className="text-sm font-semibold text-brand-ink">Mirage</div>
              <div className="text-[11px] text-brand-muted">Control Plane</div>
            </div>
          </div>
          <span className="badge-neutral">Enterprise workspace</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-8 px-6 py-10 lg:grid-cols-[1fr_380px]">
        <section className="flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
            Legacy → Cloud
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink">
            Migration workspace
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-brand-muted">
            Discover the estate, dispose with evidence, map to SID, and deliver the Party &amp;
            Customer Account pilot — one focused page at a time.
          </p>
          <ol className="mt-8 grid gap-2 sm:grid-cols-2">
            {NAV_PHASES.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 border border-brand-line bg-white px-3 py-2.5"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-500 text-[11px] font-bold text-white">
                  {p.number}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-brand-ink">
                    {p.short}
                  </span>
                  <span className="block truncate text-[11px] text-brand-muted">{p.title}</span>
                </span>
              </li>
            ))}
          </ol>
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
              {(users.length
                ? users
                : [
                    { email: "engineer@demo.local", role: "engineer" },
                    { email: "architect@demo.local", role: "architect" },
                    { email: "owner@demo.local", role: "product_owner" },
                    { email: "board@demo.local", role: "change_board" },
                  ]
              ).map((u: any) => (
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
        </section>
      </main>
    </div>
  );
}
