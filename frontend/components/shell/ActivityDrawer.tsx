"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function ActivityDrawer({ open, onClose, title = "Activity", children }: Props) {
  if (!open) return null;
  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-brand-line bg-white">
      <div className="flex h-12 items-center justify-between border-b border-brand-line px-3">
        <h2 className="text-sm font-semibold text-brand-ink">{title}</h2>
        <button type="button" className="btn-ghost !py-1" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </aside>
  );
}
