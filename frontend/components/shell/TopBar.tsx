"use client";

import Link from "next/link";
import type { Session } from "@/lib/api";

type Props = {
  session: Session;
  project: any | null;
  onSignOut: () => void;
  onToggleActivity?: () => void;
  activityOpen?: boolean;
  onToggleAbout?: () => void;
  aboutOpen?: boolean;
  msg?: string;
  projectSwitcher?: React.ReactNode;
};

export function TopBar({
  session,
  project,
  onSignOut,
  onToggleActivity,
  activityOpen,
  onToggleAbout,
  aboutOpen,
  msg,
  projectSwitcher,
}: Props) {
  return (
    <header className="ws-topbar">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/workspace" className="flex items-center gap-2 shrink-0">
          <span className="brand-mark !h-7 !w-7 !text-xs">L</span>
          <span className="hidden text-sm font-semibold text-brand-ink sm:inline">
            Lumina
          </span>
        </Link>
        <span className="hidden h-4 w-px bg-brand-line sm:block" />
        {projectSwitcher || (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-brand-ink">
              {project?.name || "Workspace"}
            </div>
            <div className="truncate text-[11px] text-brand-muted">
              Control plane · {project?.phase?.replace(/_/g, " ") || "—"}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {msg ? (
          <span className="hidden max-w-[220px] truncate text-xs text-brand-muted md:inline">
            {msg}
          </span>
        ) : null}
        <span className="badge-neutral hidden sm:inline-flex">{session.role}</span>
        <span className="hidden text-xs text-brand-slate md:inline">{session.name}</span>
        {onToggleAbout && (
          <button
            type="button"
            className={`btn-ghost ${aboutOpen ? "bg-tm-gray-100" : ""}`}
            onClick={onToggleAbout}
          >
            About
          </button>
        )}
        {onToggleActivity && (
          <button
            type="button"
            className={`btn-ghost ${activityOpen ? "bg-tm-gray-100" : ""}`}
            onClick={onToggleActivity}
          >
            Activity
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
