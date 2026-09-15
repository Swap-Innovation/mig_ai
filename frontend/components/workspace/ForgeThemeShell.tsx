"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { toolHref } from "@/lib/phases";

export type ForgeThemeCategory = "convert" | "accelerate" | "pack";

type Props = {
  projectName?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  category: ForgeThemeCategory;
  /** Kept for callers; accelerators no longer gate on pack approval. */
  packApproved?: boolean;
  actions?: ReactNode;
  banner?: ReactNode;
  footer?: ReactNode;
  /** Workbench-style fill: body becomes a flex column, no outer scroll */
  fill?: boolean;
  children: ReactNode;
};

const AREA_LABEL: Record<ForgeThemeCategory, string> = {
  convert: "Convert",
  accelerate: "Accelerate",
  pack: "Pack",
};

/**
 * Shared Forge chrome for convert / accelerate / pack leaf tools.
 * Hub navigation is Forge apps (suite) — F mark + one Back link.
 */
export function ForgeThemeShell({
  projectName,
  title,
  subtitle,
  meta,
  category,
  packApproved: _packApproved = false,
  actions,
  banner,
  footer,
  fill = false,
  children,
}: Props) {
  const appsHref = toolHref("forge", "suite");
  const area = AREA_LABEL[category];

  return (
    <div className="forge-theme forge-pad flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="forge-pad-atmosphere" aria-hidden />

      <header className="forge-pad-bar shrink-0">
        <div className="forge-pad-bar-inner forge-theme-bar-inner">
          <div className="forge-pad-brand">
            <Link
              href={appsHref}
              className="forge-pad-brand-mark"
              title="Back to Forge apps"
              aria-label="Back to Forge apps"
            >
              F
            </Link>
            <div className="min-w-0">
              <h1 className="forge-pad-brand-name truncate">{title}</h1>
              <p className="forge-pad-brand-sub">
                {projectName || "Estate"}
                {subtitle ? ` · ${subtitle}` : ` · ${area}`}
              </p>
            </div>
          </div>

          <div className="forge-pad-seg suite-theme-seg-static" aria-hidden>
            <span className="forge-pad-seg-btn is-active">{area}</span>
          </div>

          <div className="forge-theme-bar-actions">
            {actions}
            <Link
              href={appsHref}
              className="forge-pad-pack"
              title="Return to Forge apps catalog"
            >
              Forge apps
            </Link>
          </div>
        </div>
        {meta ? <p className="forge-theme-meta">{meta}</p> : null}
      </header>

      {banner}

      <div
        className={`forge-theme-body min-h-0 flex-1 ${
          fill ? "is-fill" : "overflow-auto"
        }`}
      >
        {fill ? <div className="forge-theme-stack">{children}</div> : children}
      </div>

      {footer ? <div className="forge-theme-footer shrink-0">{footer}</div> : null}
    </div>
  );
}

/** Frosted panel — same language as the pad detail sheet. */
export function ForgeThemePanel({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={[
        "forge-theme-panel",
        padded ? "forge-theme-panel-pad" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </section>
  );
}
