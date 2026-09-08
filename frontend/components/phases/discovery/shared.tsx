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
    <div className={`card ${accent ? "border-tm-magenta/40 bg-tm-magenta-light/40" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-tm-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-tm-gray-500">{hint}</div>}
    </div>
  );
}

export function ChecklistItem({ done, title }: { done: boolean; title: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          done ? "bg-tm-magenta" : "bg-tm-gray-300"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-tm-ink" : "text-tm-gray-500"}>{title}</span>
    </div>
  );
}

export function Meta({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-tm-gray-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">{label}</div>
      <div className="truncate font-medium">{String(value)}</div>
    </div>
  );
}

export function StepBadge({ status }: { status: string }) {
  const cls =
    status === "failed"
      ? "badge-danger"
      : status === "warning"
        ? "bg-amber-100 text-amber-800"
        : status === "running"
          ? "badge-neutral"
          : "badge-success";
  return (
    <span className={`badge-neutral rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

export function Dot() {
  return <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tm-magenta" />;
}

export function EmptyGraph({ hint }: { hint: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-tm-gray-500">
      {hint}
    </div>
  );
}
