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
    <div className="atlas-toolbar atlas-toolbar-compact atlas-data-toolbar">
      {onSearchChange != null && (
        <input
          className="input !mt-0 !max-w-[11rem] !py-1.5 !text-xs"
          placeholder={searchPlaceholder}
          value={search || ""}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      )}
      {filters}
      {countLabel ? (
        <span className="ml-auto text-[11px] font-medium tabular-nums text-[#86868b]">
          {countLabel}
        </span>
      ) : (
        <span className="ml-auto" />
      )}
      {actions}
    </div>
  );
}
