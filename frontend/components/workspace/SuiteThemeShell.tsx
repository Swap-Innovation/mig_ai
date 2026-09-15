"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SUITE_GALLERY_HREF, toolHref, type SuiteToolDef } from "@/lib/phases";

export type SuiteViewTab = { id: string; label: string; group?: string };

type Props = {
  tool: SuiteToolDef;
  view: string;
  viewTabs?: SuiteViewTab[];
  projectName?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  actions?: ReactNode;
  banner?: ReactNode;
  footer?: ReactNode;
  fill?: boolean;
  children: ReactNode;
};

/**
 * Suite-wide tool chrome — Forge Applications visual template
 * for every product tool (atmosphere · frosted bar · mark · segments · actions).
 */
export function SuiteThemeShell({
  tool,
  view,
  viewTabs = [],
  projectName,
  title,
  subtitle,
  meta,
  actions,
  banner,
  footer,
  fill = false,
  children,
}: Props) {
  const mark = (tool.shortName || tool.stageName || "M").slice(0, 1).toUpperCase();

  // Flat segments for every view — group collapse hid siblings (e.g. Lineage under Review).
  const tabs = viewTabs.map((v) => ({ id: v.id, label: v.label }));

  const activeTab = tabs.find((t) => t.id === view)?.id || tabs[0]?.id;

  return (
    <div className="suite-theme forge-theme forge-pad flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="forge-pad-atmosphere" aria-hidden />

      <header className="forge-pad-bar shrink-0">
        <div className="forge-pad-bar-inner forge-theme-bar-inner">
          <div className="forge-pad-brand">
            <Link
              href={SUITE_GALLERY_HREF}
              className="forge-pad-brand-mark"
              title="Stage map"
              aria-label="Back to Stage map"
            >
              {mark}
            </Link>
            <div className="min-w-0">
              <p className="suite-theme-kicker">
                {tool.stageName}
                <span aria-hidden> · </span>
                {tool.productName}
              </p>
              <h1 className="forge-pad-brand-name truncate">{title}</h1>
              <p className="forge-pad-brand-sub">
                {projectName || "Estate"}
                {subtitle ? ` · ${subtitle}` : ""}
              </p>
            </div>
          </div>

          {tabs.length > 1 ? (
            <nav className="forge-pad-seg" aria-label={`${tool.shortName} sections`}>
              {tabs.map((t) => (
                <Link
                  key={t.id}
                  href={toolHref(tool.id, t.id)}
                  className={`forge-pad-seg-btn ${
                    activeTab === t.id || view === t.id ? "is-active" : ""
                  }`}
                  aria-current={view === t.id ? "page" : undefined}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          ) : (
            <div className="forge-pad-seg suite-theme-seg-static" aria-hidden>
              <span className="forge-pad-seg-btn is-active">{tool.shortName}</span>
            </div>
          )}

          <div className="forge-theme-bar-actions">{actions}</div>
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

export function SuiteThemePanel({
  children,
  className = "",
  padded = true,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={[
        "forge-theme-panel",
        padded ? "forge-theme-panel-pad" : "",
        "suite-theme-section",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}

export function SuiteSectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
}) {
  return (
    <header className="suite-section-heading">
      {eyebrow ? <p className="suite-theme-kicker">{eyebrow}</p> : null}
      <h2 className="suite-section-title">{title}</h2>
      {detail ? <p className="suite-section-detail">{detail}</p> : null}
    </header>
  );
}
