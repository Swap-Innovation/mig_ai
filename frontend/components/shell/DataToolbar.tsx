"use client";

type Props = {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  countLabel?: string;
};

/** Thin filter/action bar for table-first workspace pages. */
export function DataToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  actions,
  countLabel,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-brand-line bg-white px-3 py-2">
      {onSearchChange != null && (
        <input
          className="input !mt-0 max-w-xs"
          placeholder={searchPlaceholder}
          value={search || ""}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      )}
      {filters}
      {countLabel ? (
        <span className="ml-auto text-xs text-brand-muted">{countLabel}</span>
      ) : (
        <span className="ml-auto" />
      )}
      {actions}
    </div>
  );
}
