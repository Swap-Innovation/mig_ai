"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { publicPath } from "@/lib/publicPath";

const TOOLS = [
  { name: "Atlas", stage: "Discover", line: "Inventory, lineage, usage evidence" },
  { name: "Horizon", stage: "Plan", line: "Waves and in-scope delivery plans" },
  { name: "Verdict", stage: "Decide", line: "Disposition register and benefits" },
  { name: "Compass", stage: "Align", line: "SID mapping and ownership" },
  { name: "Forge", stage: "Build", line: "Cloud conversion packs" },
  { name: "Prove", stage: "Pilot", line: "Dual-run and reconcile" },
  { name: "Transit", stage: "Migrate", line: "Cutover and production sign-off" },
  { name: "Sunset", stage: "Retire", line: "Archive, hypercare, close change" },
];

export default function MarketingHome() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div className="marketing-root min-h-screen overflow-x-hidden bg-[#0B1220] text-white">
      <style jsx global>{`
        @keyframes mirage-rise {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes mirage-glow {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 0.85;
          }
        }
        @keyframes mirage-pan {
          from {
            transform: scale(1.06) translate3d(0, 0, 0);
          }
          to {
            transform: scale(1) translate3d(0, -1.5%, 0);
          }
        }
        .m-rise {
          animation: mirage-rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .m-rise-2 {
          animation: mirage-rise 1s 0.12s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .m-rise-3 {
          animation: mirage-rise 1.05s 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .m-glow {
          animation: mirage-glow 5s ease-in-out infinite;
        }
        .m-pan {
          animation: mirage-pan 18s ease-out both;
        }
      `}</style>

      <header className="relative isolate min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={publicPath("/marketing/02-workspace-home.png")}
            alt=""
            className={`h-full w-full object-cover object-top opacity-35 ${ready ? "m-pan" : ""}`}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B1220]/75 via-[#0B1220]/88 to-[#0B1220]" />
          <div className="m-glow absolute -left-1/4 top-0 h-[50vh] w-[70vw] rounded-full bg-[#E20074]/25 blur-[100px]" />
          <div className="absolute bottom-0 right-0 h-[40vh] w-[50vw] rounded-full bg-[#E20074]/10 blur-[120px]" />
        </div>

        <nav className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E20074] text-lg font-bold text-white shadow-[0_0_32px_rgba(226,0,116,0.45)]">
              M
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Mirage</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                Suite
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="hidden text-white/70 hover:text-white sm:inline">
              Sign in
            </Link>
            <Link
              href="/demo"
              className="rounded-full bg-[#E20074] px-5 py-2.5 font-semibold text-white shadow-[0_8px_28px_rgba(226,0,116,0.35)] transition hover:bg-[#c40066]"
            >
              Launch demo
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-5.5rem)] w-full max-w-6xl flex-col justify-end px-6 pb-16 pt-10 sm:pb-24">
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FF6BB5] ${ready ? "m-rise" : "opacity-0"}`}
          >
            Discover · Decide · Deliver · Retire
          </p>
          <h1
            className={`mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl ${ready ? "m-rise-2" : "opacity-0"}`}
          >
            Mirage
          </h1>
          <p
            className={`mt-5 max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl ${ready ? "m-rise-3" : "opacity-0"}`}
          >
            The control plane that turns legacy analytics estates into owned, governed
            data products — with evidence, standards, and human judgement at every gate.
          </p>
          <div
            className={`mt-8 flex flex-wrap items-center gap-4 ${ready ? "m-rise-3" : "opacity-0"}`}
          >
            <Link
              href="/demo"
              className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#0B1220] transition hover:bg-white/90"
            >
              One-click demo
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold text-white/90 transition hover:border-white/50"
            >
              Sign in with persona
            </Link>
          </div>
          <p className="mt-6 max-w-md text-xs leading-relaxed text-white/45">
            Do not migrate the estate. Migrate the products it was meant to be.
          </p>
        </div>
      </header>

      <section className="relative border-t border-white/10 bg-[#0B1220] px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Nine connected tools. One gated journey.
          </h2>
          <p className="mt-3 max-w-2xl text-base text-white/60">
            From mobilisation through retirement — disposition before build, dual-run
            before production, and legacy exit as a first-class outcome.
          </p>
          <ol className="mt-12 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((t, i) => (
              <li key={t.name} className="border-t border-white/15 pt-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FF6BB5]">
                  {String(i + 1).padStart(2, "0")} · {t.stage}
                </span>
                <div className="mt-2 text-xl font-semibold tracking-tight">{t.name}</div>
                <p className="mt-1 text-sm text-white/55">{t.line}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for real transformation programmes
          </h2>
          <p className="mt-3 max-w-2xl text-base text-white/60">
            Portfolio Dashboard, estate Stage map, and named tool workspaces — agents
            draft, humans approve, artifacts persist.
          </p>
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <img
              src={publicPath("/marketing/02b-suite-gallery.png")}
              alt="Mirage Suite stage map"
              className="block w-full"
            />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <img
              src={publicPath("/marketing/03-discovery-inventory.png")}
              alt="Mirage Atlas profiling"
              className="w-full rounded-xl border border-white/10"
            />
            <img
              src={publicPath("/marketing/06-build-dags.png")}
              alt="Mirage Forge pipeline migration"
              className="w-full rounded-xl border border-white/10"
            />
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Link
              href="/demo"
              className="rounded-full bg-[#E20074] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#c40066]"
            >
              Launch interactive demo
            </Link>
            <span className="text-sm text-white/45">
              Runs fully in your browser · mock fixtures · no install
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span className="font-semibold text-white/80">Mirage Suite</span>
            <span>· Swap Innovation</span>
          </div>
          <div className="flex gap-5 text-sm text-white/45">
            <Link href="/demo" className="hover:text-white">
              Demo
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
            <a
              href="https://github.com/Swap-Innovation/mig_ai"
              className="hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
