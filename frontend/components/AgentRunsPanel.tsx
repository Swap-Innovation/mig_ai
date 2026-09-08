"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  runs: any[];
  title?: string;
  emptyHint?: string;
  taskFilter?: string[];
  /** When true and any filtered run is queued/running, call onPoll every ~800ms */
  pollWhileRunning?: boolean;
  onPoll?: () => void;
  selectedId?: number | null;
  onSelect?: (run: any) => void;
};

export function AgentRunsPanel({
  runs,
  title = "Agent runs",
  emptyHint = "No agent runs yet.",
  taskFilter,
  pollWhileRunning = true,
  onPoll,
  selectedId,
  onSelect,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const list = taskFilter?.length
      ? runs.filter((r) => taskFilter.includes(r.task))
      : runs;
    return [...list].sort((a, b) => (b.id || 0) - (a.id || 0));
  }, [runs, taskFilter]);

  const hasActive = filtered.some((r) =>
    ["queued", "running"].includes(String(r.status || "").toLowerCase())
  );

  useEffect(() => {
    if (!pollWhileRunning || !hasActive || !onPoll) return;
    const id = window.setInterval(() => onPoll(), 800);
    return () => window.clearInterval(id);
  }, [pollWhileRunning, hasActive, onPoll]);

  useEffect(() => {
    if (selectedId != null) setExpandedId(selectedId);
    else if (filtered[0]?.id && hasActive) setExpandedId(filtered[0].id);
  }, [selectedId, filtered, hasActive]);

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {hasActive && (
          <span className="animate-pulse text-xs font-semibold text-tm-magenta">
            Running — polling steps…
          </span>
        )}
      </div>
      <ul className="max-h-[420px] space-y-2 overflow-auto">
        {filtered.map((r) => {
          const open = expandedId === r.id;
          const steps = r.steps || r.output?.steps || [];
          return (
            <li
              key={r.id}
              className={`rounded-xl border p-3 text-sm transition ${
                open ? "border-tm-magenta/40 bg-tm-magenta-light/20" : "border-tm-gray-200 bg-white"
              }`}
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => {
                  setExpandedId(open ? null : r.id);
                  onSelect?.(r);
                }}
              >
                <div>
                  <div className="font-medium text-tm-ink">{r.task}</div>
                  <div className="mt-0.5 text-xs text-tm-gray-500">
                    #{r.id} · prompt {r.prompt_version || "v1"} · standards{" "}
                    {r.standards_version || "—"}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <StatusPill status={r.status} />
                  <span className="text-tm-gray-500">
                    {Math.round((r.confidence || 0) * 100)}%
                  </span>
                </div>
              </button>
              {open && (
                <div className="mt-3 space-y-2 border-t border-tm-gray-100 pt-3">
                  {r.error ? (
                    <div className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-bad">{r.error}</div>
                  ) : null}
                  {steps.length > 0 ? (
                    <ol className="space-y-1.5">
                      {steps.map((s: any, i: number) => (
                        <li
                          key={`${r.id}-step-${i}`}
                          className="flex items-start justify-between gap-2 rounded-lg bg-tm-gray-50 px-2 py-1.5 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-tm-ink">{s.name}</span>
                            {s.message ? (
                              <p className="mt-0.5 text-tm-gray-600">{s.message}</p>
                            ) : null}
                          </div>
                          <StatusPill status={s.status || "success"} compact />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-tm-gray-500">No step log on this run.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!filtered.length && (
          <li className="text-sm text-tm-gray-500">{emptyHint}</li>
        )}
      </ul>
    </div>
  );
}

function StatusPill({ status, compact }: { status: string; compact?: boolean }) {
  const s = String(status || "").toLowerCase();
  const cls =
    s === "failed"
      ? "bg-rose-50 text-bad"
      : s === "completed" || s === "success"
        ? "bg-emerald-50 text-good"
        : s === "warning"
          ? "bg-amber-50 text-warn"
          : s === "running" || s === "queued"
            ? "bg-tm-magenta-light text-tm-magenta-dark"
            : "bg-tm-gray-100 text-tm-gray-600";
  return (
    <span
      className={`rounded-full px-2 font-semibold ${cls} ${compact ? "py-0.5 text-[10px]" : "py-1 text-[11px]"}`}
    >
      {status}
    </span>
  );
}
