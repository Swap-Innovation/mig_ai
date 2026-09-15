"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import {
  GALLERY_TOOLS,
  activeWaveSummary,
  continuePhaseId,
  getToolByPhase,
  toolHref,
  toolStatus,
  type SuiteToolId,
  type ToolGateStatus,
} from "@/lib/phases";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const STAGE_TONES: Record<SuiteToolId, string> = {
  mobilize: "forge-pad-tone-slate",
  atlas: "forge-pad-tone-magenta",
  horizon: "forge-pad-tone-blue",
  verdict: "forge-pad-tone-violet",
  compass: "forge-pad-tone-indigo",
  forge: "forge-pad-tone-amber",
  prove: "forge-pad-tone-teal",
  transit: "forge-pad-tone-cyan",
  sunset: "forge-pad-tone-slate",
};

function statusClass(s: ToolGateStatus): string {
  if (s === "complete") return "suite-status-complete";
  if (s === "in_progress") return "suite-status-progress";
  if (s === "locked") return "suite-status-locked";
  return "suite-status-idle";
}

function statusLabel(s: ToolGateStatus): string {
  if (s === "complete") return "Done";
  if (s === "in_progress") return "In progress";
  if (s === "locked") return "Locked";
  return "Ready";
}

function StageCheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      width="14"
      height="14"
    >
      <path
        d="M3.5 8.25 6.4 11.2 12.5 4.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StageGlyph({ id }: { id: SuiteToolId }) {
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
  const paths: Partial<Record<SuiteToolId, ReactNode>> = {
    atlas: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4v16M4 12h16" />
        <path d="M7 7c2 3 8 3 10 0M7 17c2-3 8-3 10 0" />
      </>
    ),
    horizon: (
      <>
        <path d="M3 16h18" />
        <path d="M5 16V9l3.5 3.5L12 6l3.5 4.5L19 8v8" />
      </>
    ),
    verdict: (
      <>
        <path d="M9 11l2.2 2.2L15.5 9" />
        <rect x="4" y="3" width="16" height="18" rx="2" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 9.5 10 14l4.5-1.2L16 8.8 14.5 9.5z" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    forge: (
      <>
        <path d="M14 4l6 6-2.5 1-1.5 4-4 1.5-1-2.5L6 16" />
        <path d="M4 20l5-5" />
      </>
    ),
    prove: (
      <>
        <path d="M9 11l2.5 2.5L16 9" />
        <path d="M12 3l2 2.5h3.5v3.5L20 12l-2.5 2v3.5H14L12 20l-2-2.5H6.5V14L4 12l2.5-2V6.5H10L12 3z" />
      </>
    ),
    transit: (
      <>
        <path d="M4 12h12" />
        <path d="M12 7l5 5-5 5" />
        <path d="M4 7v10" />
      </>
    ),
    sunset: (
      <>
        <path d="M4 16h16" />
        <path d="M12 16V8" />
        <path d="M7 12a5 5 0 0 1 10 0" />
        <path d="M12 4v1.5M5.5 7.5l1.2 1.2M18.5 7.5l-1.2 1.2" />
      </>
    ),
  };
  return <svg {...common}>{paths[id] || paths.atlas}</svg>;
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden>
      <path d="M4.5 7V5.5a3.5 3.5 0 1 1 7 0V7h.75A1.75 1.75 0 0 1 14 8.75v4.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-4.5A1.75 1.75 0 0 1 3.75 7H4.5Zm1.5 0h4V5.5a2 2 0 1 0-4 0V7Z" />
    </svg>
  );
}

export function SuiteGallery() {
  const { project, projects, selectProject, refreshProject } = useWorkspace();
  const cont = continuePhaseId(project);
  const wave = activeWaveSummary(project);
  const continueTool = project
    ? getToolByPhase(cont) || GALLERY_TOOLS.find((t) => t.phaseId === cont)
    : null;
  const continueSt = continueTool
    ? toolStatus(continueTool, project, cont)
    : null;
  const continueHref = continueTool ? toolHref(continueTool.id) : null;
  const doneCount = project
    ? GALLERY_TOOLS.filter(
        (t) => toolStatus(t, project, cont) === "complete"
      ).length
    : 0;

  useEffect(() => {
    if (project) void refreshProject();
  }, [refreshProject, project?.id]);

  if (!project) {
    return (
      <div className="suite-gallery forge-pad flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="forge-pad-atmosphere" aria-hidden />
        <header className="suite-gallery-hero relative z-[1]">
          <div className="suite-dash-bar-inner">
            <div className="min-w-0">
              <p className="suite-theme-kicker">Mirage Suite</p>
              <h1 className="suite-dash-title">Stage map</h1>
              <p className="suite-dash-sub">
                Choose an estate folder in the left nav to open its stage apps.
              </p>
            </div>
            <div className="suite-dash-bar-actions">
              <Link href="/workspace" className="btn-secondary text-xs">
                Dashboard
              </Link>
            </div>
          </div>
        </header>
        <div className="suite-estate-pick relative z-[1] p-5 lg:p-6">
          <ul className="suite-estate-pick-list">
            {[...(projects || [])]
              .sort((a, b) =>
                String(a.name || "").localeCompare(String(b.name || ""))
              )
              .map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="suite-estate-pick-item"
                    onClick={() => void selectProject(p.id)}
                  >
                    <span className="suite-estate-pick-name">{p.name}</span>
                    <span className="suite-estate-pick-meta">
                      {p.sample_slug || "estate"}
                    </span>
                  </button>
                </li>
              ))}
            {!projects?.length ? (
              <li className="suite-list-empty">No estates yet.</li>
            ) : null}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="suite-gallery forge-pad flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="forge-pad-atmosphere" aria-hidden />

      <header className="suite-gallery-hero relative z-[1]">
        <div className="suite-dash-bar-inner">
          <div className="min-w-0">
            <p className="suite-theme-kicker">Mirage Suite</p>
            <h1 className="suite-dash-title">Stage map</h1>
            <p className="suite-dash-sub">
              {project?.name || "Active estate"}
              {wave ? (
                <>
                  <span className="text-[#d2d2d7]"> · </span>
                  {wave.name}
                </>
              ) : null}
            </p>
          </div>
          <div className="suite-dash-bar-actions">
            <span className="badge-neutral tabular-nums">
              {doneCount}/{GALLERY_TOOLS.length} done
            </span>
            {continueTool && continueHref && continueSt !== "complete" ? (
              <Link href={continueHref} className="btn text-xs">
                Continue {continueTool.stageName}
              </Link>
            ) : null}
            <Link href="/workspace" className="btn-secondary text-xs">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="suite-stage-apps relative z-[1]">
        <ol className="suite-stage-apps-grid" aria-label="Stage apps">
          {GALLERY_TOOLS.map((tool) => {
            const st = toolStatus(tool, project, cont);
            const done = st === "complete";
            const locked = st === "locked";
            const isContinue =
              tool.id === continueTool?.id && st !== "complete" && !locked;
            const tone = STAGE_TONES[tool.id] || "forge-pad-tone-magenta";
            const tileClass = [
              "forge-pad-tile",
              "suite-stage-app",
              locked ? "is-locked" : "",
              done ? "is-done" : "",
              isContinue ? "is-continue" : "",
            ]
              .filter(Boolean)
              .join(" ");

            const body = (
              <>
                <span className={`forge-pad-glow ${tone}`} aria-hidden />
                <span className={`forge-pad-icon ${tone}`} aria-hidden>
                  <StageGlyph id={tool.id} />
                  {done ? <span className="forge-pad-badge is-done" /> : null}
                  {isContinue ? (
                    <span className="forge-pad-badge is-ready" />
                  ) : null}
                  {locked ? (
                    <span className="forge-pad-lock" aria-hidden>
                      <LockGlyph />
                    </span>
                  ) : null}
                </span>
                <span className="forge-pad-label">{tool.stageName}</span>
                <span className="suite-stage-app-product">{tool.shortName}</span>
              </>
            );

            return (
              <li key={tool.id} className="suite-stage-app-item">
                {locked ? (
                  <div
                    className={tileClass}
                    title={`${tool.stageName} · Locked`}
                    aria-disabled="true"
                  >
                    {body}
                  </div>
                ) : (
                  <Link
                    href={toolHref(tool.id)}
                    className={tileClass}
                    title={`${tool.stageName} · ${tool.shortName}`}
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="suite-spine-section p-5 lg:p-6">
        <ol className="suite-spine-list">
          {GALLERY_TOOLS.map((tool, idx) => {
            const st = toolStatus(tool, project, cont);
            const locked = st === "locked";
            const done = st === "complete";
            const isContinue =
              tool.id === continueTool?.id && !done && !locked;
            const prior = locked && idx > 0 ? GALLERY_TOOLS[idx - 1] : null;
            const isLast = idx === GALLERY_TOOLS.length - 1;
            const nested =
              tool.nestedSuite?.length && !locked
                ? tool.nestedSuite
                    .map((b) => `${b.count} ${b.label}`)
                    .join(" · ")
                : null;

            return (
              <li
                key={tool.id}
                className={`suite-spine-item ${statusClass(st)} ${
                  isContinue ? "suite-spine-item-continue" : ""
                }`}
              >
                <div className="suite-spine-track" aria-hidden>
                  <span
                    className={`suite-spine-node ${done ? "suite-spine-node-done" : ""} ${
                      isContinue ? "suite-spine-node-continue" : ""
                    } ${locked ? "suite-spine-node-locked" : ""}`}
                  >
                    {done ? <StageCheckIcon /> : idx + 1}
                  </span>
                  {!isLast ? <span className="suite-spine-line" /> : null}
                </div>

                <article
                  id={`stage-${tool.id}`}
                  className={`suite-tool-tile suite-tool-tile-spine suite-tool-tile-row ${
                    locked ? "suite-tool-tile-locked" : ""
                  } ${done ? "suite-tool-tile-done" : ""} ${
                    isContinue ? "suite-tool-tile-continue" : ""
                  }`}
                >
                  <div className="suite-tile-main min-w-0 flex-1">
                    <div className="suite-tile-title-row">
                      <h2 className="suite-tile-title">
                        {tool.stageName}
                        <span className="suite-tile-sep">·</span>
                        <span className="suite-tile-product">{tool.shortName}</span>
                      </h2>
                      <span
                        className={`suite-tile-status ${
                          done
                            ? "is-done"
                            : isContinue
                              ? "is-continue"
                              : locked
                                ? "is-locked"
                                : ""
                        }`}
                      >
                        {done ? (
                          <>
                            <StageCheckIcon /> Done
                          </>
                        ) : isContinue ? (
                          "Continue"
                        ) : (
                          statusLabel(st)
                        )}
                      </span>
                    </div>
                    <p className="suite-tile-tagline">
                      {locked && prior
                        ? `Unlocks after ${prior.stageName}`
                        : tool.tagline}
                      {nested ? ` · ${nested}` : null}
                    </p>
                  </div>

                  <div className="suite-tile-action shrink-0">
                    {locked ? (
                      <span className="btn-secondary pointer-events-none opacity-45">
                        Locked
                      </span>
                    ) : done ? (
                      <Link
                        href={toolHref(tool.id)}
                        className="btn-secondary suite-review-btn"
                      >
                        Review
                      </Link>
                    ) : isContinue ? (
                      <Link href={toolHref(tool.id)} className="btn">
                        Open
                      </Link>
                    ) : (
                      <Link href={toolHref(tool.id)} className="btn-secondary">
                        Open
                      </Link>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
