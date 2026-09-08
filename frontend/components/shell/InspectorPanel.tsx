"use client";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function InspectorPanel({ open, title = "Details", onClose, children }: Props) {
  if (!open) return null;
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-brand-line bg-white self-stretch">
      <div className="flex items-center justify-between border-b border-brand-line px-3 py-2.5">
        <h3 className="truncate text-sm font-semibold text-brand-ink" title={title}>
          {title}
        </h3>
        <button type="button" className="btn-ghost !py-1" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </aside>
  );
}
