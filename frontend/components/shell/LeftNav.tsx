"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NAV_PHASES,
  continuePhaseId,
  getPhase,
  groupViews,
  phaseHref,
  phaseIndex,
  type PhaseId,
} from "@/lib/phases";

type Props = {
  project: any | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

function pathPhaseId(pathname: string | null): PhaseId | null {
  const m = pathname?.match(/\/workspace\/phase\/([^/]+)/);
  return (m?.[1] as PhaseId) || null;
}

function pathViewId(pathname: string | null, phaseId: PhaseId): string | undefined {
  const phase = getPhase(phaseId);
  if (!phase) return undefined;
  const m = pathname?.match(new RegExp(`/workspace/phase/${phaseId}/([^/]+)`));
  return m?.[1] || phase.defaultView;
}

export function LeftNav({ project, collapsed, onToggleCollapse }: Props) {
  const pathname = usePathname();
  const activePhaseId = pathPhaseId(pathname);
  const continueId = continuePhaseId(project);
  const projectIdx = phaseIndex(project?.phase || "1_discovery");
  const continueIdx = phaseIndex(continueId);

  return (
    <aside
      className={`ws-nav flex flex-col ${collapsed ? "w-[56px]" : "w-[248px]"} shrink-0 transition-all`}
    >
      <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
        {!collapsed && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
            Spaces
          </span>
        )}
        <button
          type="button"
          className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
        <Link
          href="/workspace"
          className={`ws-nav-item ${pathname === "/workspace" ? "ws-nav-item-active" : ""}`}
          title="Home"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs">⌂</span>
          {!collapsed && <span>Home</span>}
        </Link>

        {!collapsed && (
          <p className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
            Delivery plan
          </p>
        )}

        <div className="space-y-0.5">
          {NAV_PHASES.map((p) => {
            const idx = phaseIndex(p.id);
            const isActiveSpace = activePhaseId === p.id;
            const done = idx < continueIdx || (idx < projectIdx && p.id !== continueId);
            const gateDone =
              (p.id === "1_discovery" && !!project?.inventory_signed_off) ||
              (p.id === "2_disposition" && !!project?.disposition_approved) ||
              (p.id === "3_mapping" && !!project?.metadata_complete) ||
              (p.id === "4_build" && !!project?.build_approved) ||
              (p.id === "7_decommission" && !!project?.change_closed) ||
              done;
            const isContinue = p.id === continueId;
            const ahead = idx > continueIdx;
            const activeView = isActiveSpace
              ? pathViewId(pathname, p.id as PhaseId)
              : undefined;
            const groups = groupViews(p.views);
            const showChildren = !collapsed && isActiveSpace && p.views.length > 0;

            return (
              <div key={p.id} className={showChildren ? "mb-1" : ""}>
                <Link
                  href={phaseHref(p.id as PhaseId)}
                  title={p.title}
                  className={`ws-nav-item ${
                    isActiveSpace && !showChildren ? "ws-nav-item-active" : ""
                  } ${isActiveSpace && showChildren ? "ws-nav-item-space" : ""} ${
                    ahead && !isActiveSpace ? "opacity-55" : ""
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                      isActiveSpace
                        ? "bg-white/20"
                        : gateDone
                          ? "bg-emerald-500/35 text-white"
                          : "bg-white/10 text-white/70"
                    }`}
                  >
                    {gateDone && !isActiveSpace ? "✓" : p.number}
                  </span>
                  {!collapsed && (
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block truncate font-medium">{p.short}</span>
                        {isContinue && !isActiveSpace ? (
                          <span className="shrink-0 rounded bg-brand-500/30 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-brand-100">
                            Now
                          </span>
                        ) : null}
                      </span>
                      {isActiveSpace ? (
                        <span className="block truncate text-[10px] font-normal text-white/45">
                          {p.title}
                        </span>
                      ) : null}
                    </span>
                  )}
                </Link>

                {showChildren ? (
                  <div className="ml-2 mt-0.5 space-y-2 border-l border-white/10 pl-2">
                    {groups.map(({ group, views }) => (
                      <div key={group}>
                        <p className="px-2 pb-0.5 pt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/35">
                          {group}
                        </p>
                        <ul className="space-y-0.5">
                          {views.map((v) => {
                            const href = phaseHref(p.id as PhaseId, v.id);
                            const childActive = activeView === v.id;
                            return (
                              <li key={v.id}>
                                <Link
                                  href={href}
                                  className={`ws-nav-child ${
                                    childActive ? "ws-nav-child-active" : ""
                                  }`}
                                >
                                  {v.label}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!collapsed && continueId && activePhaseId === continueId ? (
          <div className="mt-auto border-t border-white/10 px-2 pb-2 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              Phase exit
            </p>
            <p className="mt-1 text-[11px] leading-snug text-white/55">
              {getPhase(continueId)?.exitCriterion}
            </p>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
