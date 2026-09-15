import type { ReactNode } from "react";

export function AtlasPage({
  children,
  fill = false,
  className = "",
}: {
  children: ReactNode;
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "atlas-view",
        fill ? "atlas-view-fill" : "atlas-view-scroll",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

export function AtlasPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`atlas-panel ${className}`.trim()}>{children}</section>
  );
}

export function AtlasHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="atlas-heading">
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="suite-theme-kicker">{eyebrow}</p> : null}
        <h2 className="atlas-heading-title">{title}</h2>
        {detail ? <p className="atlas-heading-detail">{detail}</p> : null}
      </div>
      {action ? <div className="atlas-heading-action">{action}</div> : null}
    </header>
  );
}

export function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`atlas-kpi ${accent ? "is-accent" : ""}`}>
      <div className="atlas-kpi-label">{label}</div>
      <div className="atlas-kpi-value">{value}</div>
      {hint ? <div className="atlas-kpi-hint">{hint}</div> : null}
    </div>
  );
}

export function ChecklistItem({ done, title }: { done: boolean; title: string }) {
  return (
    <div className="atlas-check">
      <span className={`atlas-check-mark ${done ? "is-done" : ""}`}>
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-[#1d1d1f]" : "text-[#86868b]"}>{title}</span>
    </div>
  );
}

export function Meta({ label, value }: { label: string; value: any }) {
  return (
    <div className="atlas-meta">
      <div className="atlas-meta-label">{label}</div>
      <div className="atlas-meta-value">{String(value)}</div>
    </div>
  );
}

export function StepBadge({ status }: { status: string }) {
  const tone =
    status === "failed"
      ? "is-bad"
      : status === "warning"
        ? "is-warn"
        : status === "running"
          ? "is-neutral"
          : "is-good";
  return <span className={`atlas-pill ${tone}`}>{status}</span>;
}

export function Dot() {
  return <span className="atlas-dot" aria-hidden />;
}

export function EmptyGraph({ hint }: { hint: string }) {
  return (
    <div className="atlas-empty">
      <p className="atlas-empty-detail">{hint}</p>
    </div>
  );
}

export function AtlasEmpty({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="atlas-empty">
      <p className="atlas-empty-title">{title}</p>
      {detail ? <p className="atlas-empty-detail">{detail}</p> : null}
      {action ? <div className="atlas-empty-action">{action}</div> : null}
    </div>
  );
}

export function AtlasSeg({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="atlas-seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={`atlas-seg-btn ${value === o.id ? "is-active" : ""}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
