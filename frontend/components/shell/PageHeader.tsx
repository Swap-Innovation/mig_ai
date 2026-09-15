"use client";

import Link from "next/link";

export type PageHeaderStepNav = {
  phaseShort: string;
  phaseHref: string;
  currentLabel: string;
  group?: string;
  step: number;
  total: number;
  prev?: { label: string; href: string } | null;
  next?: { label: string; href: string } | null;
};

type Props = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** In-space step pager — merged into this header (no second bar). */
  stepNav?: PageHeaderStepNav | null;
};

export function PageHeader({ title, subtitle, actions, stepNav }: Props) {
  const hasPager = !!stepNav && stepNav.total > 1;

  return (
    <div className="ws-page-header">
      <div className="min-w-0 flex-1">
        {hasPager && stepNav.group ? (
          <p className="suite-theme-kicker">{stepNav.group}</p>
        ) : null}
        <h1 className="truncate text-[1.05rem] font-bold tracking-tight text-[#1d1d1f]">
          {title}
        </h1>
        {hasPager ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6e6e73]">
            <Link
              href={stepNav.phaseHref}
              className="font-medium text-[#1d1d1f] hover:text-brand-600"
            >
              {stepNav.phaseShort}
            </Link>
            <span className="text-brand-line">/</span>
            <span className="font-medium text-[#1d1d1f]">{stepNav.currentLabel}</span>
            {stepNav.group ? <span>· {stepNav.group}</span> : null}
            <span className="text-brand-line">·</span>
            <span>
              Step {stepNav.step} of {stepNav.total}
            </span>
          </div>
        ) : subtitle ? (
          <p className="mt-0.5 text-xs text-[#6e6e73]">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {hasPager ? (
          <>
            {stepNav.prev ? (
              <Link href={stepNav.prev.href} className="btn-ghost text-xs">
                ← {stepNav.prev.label}
              </Link>
            ) : (
              <span className="btn-ghost pointer-events-none text-xs opacity-40">← Start</span>
            )}
            {stepNav.next ? (
              <Link href={stepNav.next.href} className="btn-ghost text-xs">
                {stepNav.next.label} →
              </Link>
            ) : (
              <span className="btn-ghost pointer-events-none text-xs opacity-40">End</span>
            )}
          </>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

export function StatusStrip({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="ws-status-strip">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="text-brand-muted">{it.label}</span>
          <strong className="font-semibold text-brand-ink">{it.value}</strong>
        </span>
      ))}
    </div>
  );
}
