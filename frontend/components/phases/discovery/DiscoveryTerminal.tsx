"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

export type TerminalLine = {
  ts?: string;
  agent?: string;
  line: string;
  /** user | assistant | system — defaults from agent name when omitted */
  role?: "user" | "assistant" | "system";
  /** Estate this line belongs to — chat is strictly project-scoped */
  projectId?: number;
};

type Props = {
  lines: TerminalLine[];
  active?: boolean;
  emptyHint?: string;
  title?: string;
  subtitle?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onSend?: (text: string) => void;
  suggestions?: string[];
};

type ChatBubble = {
  id: string;
  agent: string;
  role: "user" | "assistant" | "system";
  lines: string[];
  live?: boolean;
  ts?: string;
};

const DEFAULT_SUGGESTIONS = [
  "What's the status of this run?",
  "Summarize what agents found so far",
  "Pause after this step — I want to review",
  "What should I do next?",
];

function resolveRole(row: TerminalLine): "user" | "assistant" | "system" {
  if (row.role) return row.role;
  const a = String(row.agent || "").toLowerCase();
  if (a === "you" || a === "user") return "user";
  if (a === "system" || a === "mirage") return a === "system" ? "system" : "assistant";
  return "assistant";
}

function bubblesFromLines(lines: TerminalLine[], active: boolean): ChatBubble[] {
  const out: ChatBubble[] = [];
  for (let i = 0; i < lines.length; i++) {
    const row = lines[i];
    const role = resolveRole(row);
    const agent =
      role === "user"
        ? "You"
        : row.agent || (role === "system" ? "System" : "Mirage");
    const prev = out[out.length - 1];
    if (prev && prev.agent === agent && prev.role === role) {
      prev.lines.push(row.line);
      prev.ts = row.ts || prev.ts;
    } else {
      out.push({
        id: `${role}-${agent}-${i}`,
        agent,
        role,
        lines: [row.line],
        ts: row.ts,
      });
    }
  }
  if (active && out.length) {
    const last = out[out.length - 1];
    if (last.role === "assistant") last.live = true;
  }
  return out;
}

/** Light markdown: **bold**, `code`, and plain paragraphs. */
function renderRichText(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="agent-chat-md-strong">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <code key={key++} className="agent-chat-md-code">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function formatTime(ts?: string) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Right-rail Mirage assistant — live agent stream + conversational control.
 */
export function DiscoveryTerminal({
  lines,
  active = false,
  emptyHint = "Ask a question, steer the run, or watch live agent output here.",
  title = "Mirage",
  subtitle,
  defaultWidth = 400,
  minWidth = 320,
  maxWidth = 640,
  onSend,
  suggestions = DEFAULT_SUGGESTIONS,
}: Props) {
  const [width, setWidth] = useState(defaultWidth);
  const [collapsed, setCollapsed] = useState(false);
  const [draft, setDraft] = useState("");
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bubbles = useMemo(() => bubblesFromLines(lines, active), [lines, active]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || collapsed) return;
    el.scrollTop = el.scrollHeight;
  }, [lines.length, collapsed, active, bubbles.length]);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: width };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [width]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = dragRef.current.startX - e.clientX;
      const next = Math.min(
        maxWidth,
        Math.max(minWidth, dragRef.current.startW + dx)
      );
      setWidth(next);
      if (collapsed) setCollapsed(false);
    },
    [collapsed, maxWidth, minWidth]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || !onSend) return;
    onSend(text);
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [draft, onSend]);

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  if (collapsed) {
    return (
      <aside className="agent-chat agent-chat-collapsed" aria-label={title}>
        <button
          type="button"
          className="agent-chat-collapsed-btn"
          title={`Expand ${title}`}
          onClick={() => setCollapsed(false)}
        >
          <span className="agent-chat-collapsed-mark" aria-hidden>
            M
          </span>
          <span className="agent-chat-collapsed-label">Assistant</span>
          {active ? <span className="agent-chat-live-dot" aria-hidden /> : null}
          {lines.length ? (
            <span className="agent-chat-collapsed-count">{lines.length}</span>
          ) : null}
        </button>
      </aside>
    );
  }

  return (
    <aside className="agent-chat" style={{ width }} aria-label={title}>
      <div
        className="agent-chat-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Drag to resize"
        role="separator"
        aria-orientation="vertical"
      />

      <header className="agent-chat-head">
        <div className="agent-chat-head-brand">
          <span className="agent-chat-brand-mark" aria-hidden>
            M
          </span>
          <div className="min-w-0">
            <h2 className="agent-chat-title">{title}</h2>
            <p className="agent-chat-subtitle">
              {subtitle
                ? subtitle
                : active
                  ? "Live run · ask or steer anytime"
                  : "Estate assistant"}
            </p>
          </div>
        </div>
        <div className="agent-chat-head-actions">
          {active ? (
            <span className="agent-chat-live">
              <span className="agent-chat-live-dot" />
              Live
            </span>
          ) : null}
          <button
            type="button"
            className="agent-chat-icon-btn"
            onClick={() => setCollapsed(true)}
            title="Collapse"
            aria-label="Collapse assistant"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <div ref={scrollerRef} className="agent-chat-body">
        {!bubbles.length ? (
          <div className="agent-chat-empty">
            <span className="agent-chat-empty-mark" aria-hidden>
              M
            </span>
            <p className="agent-chat-empty-title">How can I help?</p>
            <p className="agent-chat-empty-detail">{emptyHint}</p>
            {onSend && suggestions.length ? (
              <div className="agent-chat-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="agent-chat-chip"
                    onClick={() => onSend(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="agent-chat-thread">
            {bubbles.map((b) => (
              <li
                key={b.id}
                className={`agent-chat-msg is-${b.role}${b.live ? " is-live" : ""}`}
              >
                {b.role !== "user" ? (
                  <span
                    className={`agent-chat-avatar is-${b.role === "system" ? "system" : "assistant"}`}
                    aria-hidden
                  >
                    {(b.agent || "M").slice(0, 1).toUpperCase()}
                  </span>
                ) : null}
                <div className="agent-chat-msg-col">
                  <div className="agent-chat-msg-meta">
                    <span className="agent-chat-agent">
                      {b.role === "user" ? "You" : b.agent}
                    </span>
                    {b.live ? <span className="agent-chat-live-pill">streaming</span> : null}
                    {formatTime(b.ts) ? (
                      <span className="agent-chat-time">{formatTime(b.ts)}</span>
                    ) : null}
                  </div>
                  <div className={`agent-chat-bubble is-${b.role}`}>
                    {b.lines.map((line, i) => (
                      <p key={i} className="agent-chat-line">
                        {renderRichText(line)}
                      </p>
                    ))}
                    {b.live ? <span className="agent-chat-caret" aria-hidden /> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="agent-chat-composer">
        {bubbles.length && onSend && suggestions.length && !active ? (
          <div className="agent-chat-suggestions is-compact">
            {suggestions.slice(0, 2).map((s) => (
              <button
                key={s}
                type="button"
                className="agent-chat-chip"
                onClick={() => onSend(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        <form className="agent-chat-form" onSubmit={onFormSubmit}>
          <textarea
            ref={inputRef}
            className="agent-chat-input"
            rows={1}
            value={draft}
            disabled={!onSend}
            placeholder={
              onSend
                ? active
                  ? "Ask a question or steer this run…"
                  : "Message Mirage…"
                : "Connect a project to chat"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="submit"
            className="agent-chat-send"
            disabled={!onSend || !draft.trim()}
            title="Send"
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2.5 8h11M8.5 3.5 13 8l-4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
        <p className="agent-chat-disclaimer">
          {active
            ? "Live agent output mixes with your messages · Enter to send"
            : "Ask about the estate or govern the next step · Enter to send"}
        </p>
      </footer>
    </aside>
  );
}
