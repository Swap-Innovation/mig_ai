"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

export type TerminalLine = {
  ts?: string;
  agent?: string;
  line: string;
};

type Props = {
  lines: TerminalLine[];
  active?: boolean;
  emptyHint?: string;
  title?: string;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
};

/** Resizable bottom terminal for live Cursor agent discovery output. */
export function DiscoveryTerminal({
  lines,
  active = false,
  emptyHint = "Cursor agent stdout will stream here when agents run…",
  title = "Agent terminal",
  defaultHeight = 220,
  minHeight = 120,
  maxHeight = 520,
}: Props) {
  const [height, setHeight] = useState(defaultHeight);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || collapsed) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length, collapsed, active]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY, startH: height };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [height]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dy = dragRef.current.startY - e.clientY;
      const next = Math.min(
        maxHeight,
        Math.max(minHeight, dragRef.current.startH + dy)
      );
      setHeight(next);
      if (collapsed) setCollapsed(false);
    },
    [collapsed, maxHeight, minHeight]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const displayH = collapsed ? 36 : height;

  return (
    <div
      className="z-20 flex shrink-0 flex-col border-t border-tm-gray-300 bg-[#0f1419] text-[#c8d0d8] shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{ height: displayH }}
    >
      <div
        className="flex h-2 cursor-ns-resize items-center justify-center bg-[#1a222c] hover:bg-tm-magenta/40"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Drag to resize terminal"
      >
        <span className="h-0.5 w-8 rounded bg-white/30" />
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="font-semibold tracking-wide text-white/90">
            {title}
          </span>
          {active ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              live
            </span>
          ) : (
            <span className="text-white/40">{lines.length} lines</span>
          )}
        </div>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/10 hover:text-white"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "Expand" : "Collapse"}
        </button>
      </div>
      {!collapsed && (
        <div
          ref={scrollerRef}
          className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
        >
          {!lines.length ? (
            <p className="text-white/35">{emptyHint}</p>
          ) : (
            lines.map((row, i) => (
              <div key={`${row.ts || i}-${i}`} className="whitespace-pre-wrap break-all">
                {row.agent ? (
                  <span className="mr-2 text-tm-magenta/80">{row.agent}</span>
                ) : null}
                <span className="text-[#c8d0d8]">{row.line}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
