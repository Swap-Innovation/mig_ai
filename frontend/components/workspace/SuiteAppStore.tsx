"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  APP_STORE_APPS,
  APP_STORE_SECTION_LABEL,
  appStoreHref,
  appsBySection,
  type AppStoreApp,
  type AppStoreSection,
} from "@/lib/appStore";

const SECTIONS: AppStoreSection[] = ["discover", "convert", "accelerate"];

function AppGlyph({ id }: { id: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<string, React.ReactNode> = {
    discovery: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3-3" />
      </>
    ),
    tables: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </>
    ),
    scripts: (
      <>
        <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
      </>
    ),
    pipelines: (
      <>
        <circle cx="6" cy="6" r="2.25" />
        <circle cx="18" cy="6" r="2.25" />
        <circle cx="12" cy="18" r="2.25" />
        <path d="M8 7l2.5 8M16 7l-2.5 8" />
      </>
    ),
    reports: (
      <>
        <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v5h5M8 13h8M8 17h5" />
      </>
    ),
    data: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    ),
    cataloguer: (
      <>
        <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
        <path d="M9 13h6M9 16h4" />
      </>
    ),
    composer: (
      <>
        <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3z" />
      </>
    ),
    transform: (
      <>
        <path d="M4 7h11M15 7l-3-3M15 7l-3 3M20 17H9M9 17l3-3M9 17l3 3" />
      </>
    ),
    contracts: (
      <>
        <path d="M8 3h8l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path d="M16 3v4h4M9 12h6M9 16h4" />
      </>
    ),
  };
  return <svg {...common}>{paths[id] || paths.discovery}</svg>;
}

function AppTile({ app }: { app: AppStoreApp }) {
  return (
    <Link
      href={appStoreHref(app.id)}
      className="forge-pad-tile"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <span className={`forge-pad-glow ${app.tone}`} aria-hidden />
      <span className={`forge-pad-icon ${app.tone}`} aria-hidden>
        <AppGlyph id={app.id} />
      </span>
      <span className="forge-pad-label">{app.shortName}</span>
      <span className="forge-pad-scope-tag is-in">Standalone</span>
    </Link>
  );
}

export function SuiteAppStore() {
  const [q, setQ] = useState("");
  const [section, setSection] = useState<AppStoreSection | "all">("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return APP_STORE_APPS.filter((a) => {
      if (section !== "all" && a.section !== section) return false;
      if (!needle) return true;
      return `${a.name} ${a.shortName} ${a.tagline} ${a.focus} ${a.capabilities.join(" ")}`
        .toLowerCase()
        .includes(needle);
    });
  }, [q, section]);

  const sectionsToShow =
    section === "all" ? SECTIONS : ([section] as AppStoreSection[]);

  return (
    <div className="suite-dashboard forge-pad flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="forge-pad-atmosphere" aria-hidden />
      <header className="forge-pad-bar shrink-0">
        <div className="forge-pad-bar-inner forge-theme-bar-inner">
          <div className="forge-pad-brand">
            <span className="forge-pad-brand-mark" aria-hidden>
              A
            </span>
            <div className="min-w-0">
              <h1 className="forge-pad-brand-name">App Store</h1>
              <p className="forge-pad-brand-sub">
                Spin up one app · not an estate journey
              </p>
            </div>
          </div>
          <div className="forge-pad-seg">
            <button
              type="button"
              className={`forge-pad-seg-btn ${section === "all" ? "is-active" : ""}`}
              onClick={() => setSection("all")}
            >
              All
            </button>
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`forge-pad-seg-btn ${section === s ? "is-active" : ""}`}
                onClick={() => setSection(s)}
              >
                {APP_STORE_SECTION_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="forge-theme-bar-actions">
            <input
              className="input text-xs"
              style={{ minWidth: 160, maxWidth: 220 }}
              placeholder="Search apps…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search apps"
            />
          </div>
        </div>
        <p className="forge-theme-meta">
          Open a single capability — Discovery, convert apps, or accelerators —
          without Projects or Stage map gates.
        </p>
      </header>

      <div className="forge-pad-stage min-h-0 flex-1 overflow-auto">
        <div className="forge-pad-sections p-4">
          {sectionsToShow.map((s) => {
            const apps =
              section === "all"
                ? appsBySection(s).filter((a) => filtered.includes(a))
                : filtered;
            if (!apps.length) return null;
            return (
              <section key={s} className="forge-pad-section">
                <h2 className="forge-pad-section-title">
                  <span>{APP_STORE_SECTION_LABEL[s]}</span>
                </h2>
                <div className="forge-pad-grid" role="list">
                  {apps.map((app) => (
                    <AppTile key={app.id} app={app} />
                  ))}
                </div>
              </section>
            );
          })}
          {!filtered.length ? (
            <p className="p-6 text-sm text-brand-muted">No apps match your search.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
