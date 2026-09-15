"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  type EstateTreeNode,
  buildEstateScopeTree,
  collectFolderIds,
  filterEstateTree,
} from "@/lib/estateScopeTree";

type Props = {
  inventory: any[];
  selected: Set<number>;
  disabled?: boolean;
  query?: string;
  /** Assigned objects — inactive for further selection */
  lockedIds?: Set<number>;
  objectWaveMap?: Map<number, string>;
  waveColors?: string[];
  waves?: { id: string }[];
  filterSlot?: ReactNode;
  onToggleIds: (ids: number[], mode: "select" | "deselect" | "toggle") => void;
};

function checkState(
  objectIds: number[],
  selected: Set<number>,
  lockedIds?: Set<number>
): "all" | "some" | "none" {
  const selectable = lockedIds?.size
    ? objectIds.filter((id) => !lockedIds.has(id))
    : objectIds;
  if (!selectable.length) return "none";
  let hit = 0;
  for (const id of selectable) if (selected.has(id)) hit += 1;
  if (hit === 0) return "none";
  if (hit === selectable.length) return "all";
  return "some";
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 text-[#86868b]"
    >
      {open ? (
        <path
          d="M1.5 4.5h4.2l1.3 1.4H14.5v6.1a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"
          fill="currentColor"
          opacity="0.35"
        />
      ) : (
        <path
          d="M1.5 5.2A1.2 1.2 0 0 1 2.7 4h3.1l1.2 1.3h6.3A1.2 1.2 0 0 1 14.5 6.5v5.8a1.2 1.2 0 0 1-1.2 1.2H2.7A1.2 1.2 0 0 1 1.5 12.3V5.2Z"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
        />
      )}
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 text-[#aeaeb2]"
    >
      <path
        d="M4 1.75h5.2L12.5 5v9.25a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75V1.75Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M9.1 1.8V5h3.3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function TreeRow({
  node,
  depth,
  selected,
  disabled,
  lockedIds,
  expanded,
  onToggleExpand,
  onToggleIds,
  objectWaveMap,
  waveColors,
  waves,
}: {
  node: EstateTreeNode;
  depth: number;
  selected: Set<number>;
  disabled?: boolean;
  lockedIds?: Set<number>;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleIds: (ids: number[], mode: "select" | "deselect" | "toggle") => void;
  objectWaveMap?: Map<number, string>;
  waveColors?: string[];
  waves?: { id: string }[];
}) {
  const isFolder = node.kind === "folder";
  const open = isFolder && (expanded.has(node.id) || !node.id);
  const state = checkState(node.objectIds, selected, lockedIds);
  const selectableIds = lockedIds?.size
    ? node.objectIds.filter((id) => !lockedIds.has(id))
    : node.objectIds;
  const leafLocked =
    !isFolder &&
    node.objectId != null &&
    !!lockedIds?.has(node.objectId);
  const folderAllLocked =
    isFolder && node.objectIds.length > 0 && !selectableIds.length;
  const waveId =
    node.objectId != null ? objectWaveMap?.get(node.objectId) : undefined;
  const waveIdx =
    waveId && waves ? waves.findIndex((w) => w.id === waveId) : -1;

  return (
    <li className="estate-tree-li">
      <div
        className={`estate-tree-row ${state === "all" ? "is-selected" : ""} ${
          state === "some" ? "is-partial" : ""
        } ${leafLocked || folderAllLocked ? "is-locked" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        {isFolder ? (
          <button
            type="button"
            className="estate-tree-chevron"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={() => onToggleExpand(node.id)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="estate-tree-chevron is-spacer" />
        )}

        <label className="estate-tree-check">
          <input
            type="checkbox"
            disabled={
              disabled ||
              leafLocked ||
              folderAllLocked ||
              !selectableIds.length
            }
            checked={leafLocked ? true : state === "all"}
            ref={(el) => {
              if (el) el.indeterminate = !leafLocked && state === "some";
            }}
            onChange={() => {
              if (!selectableIds.length) return;
              onToggleIds(
                selectableIds,
                state === "all" ? "deselect" : "select"
              );
            }}
          />
        </label>

        <button
          type="button"
          className="estate-tree-label"
          disabled={
            isFolder ? false : disabled || leafLocked || !node.objectIds.length
          }
          title={
            leafLocked
              ? `Already in ${waveId || "a wave"} — inactive for next wave`
              : undefined
          }
          onClick={() => {
            if (isFolder) onToggleExpand(node.id);
            else if (node.objectId != null && !leafLocked)
              onToggleIds([node.objectId], "toggle");
          }}
        >
          {isFolder ? <FolderIcon open={!!open} /> : <FileIcon />}
          <span className="estate-tree-name">{node.name}</span>
          {isFolder ? (
            <span className="estate-tree-meta">
              {selectableIds.length}
              {folderAllLocked || selectableIds.length !== node.objectIds.length
                ? `/${node.objectIds.length}`
                : ""}{" "}
              free
            </span>
          ) : (
            <span className="estate-tree-meta">
              {leafLocked
                ? `Wave ${waveIdx >= 0 ? waveIdx + 1 : ""}`.trim()
                : node.objectType || "file"}
            </span>
          )}
          {waveIdx >= 0 && waveColors ? (
            <span
              className="estate-tree-wave"
              style={{ background: waveColors[waveIdx % waveColors.length] }}
              title={`Wave ${waveIdx + 1}`}
            />
          ) : null}
        </button>
      </div>

      {isFolder && open && node.children.length ? (
        <ul className="estate-tree-children">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              disabled={disabled}
              lockedIds={lockedIds}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onToggleIds={onToggleIds}
              objectWaveMap={objectWaveMap}
              waveColors={waveColors}
              waves={waves}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function EstateScopeTree({
  inventory,
  selected,
  disabled,
  query = "",
  lockedIds,
  objectWaveMap,
  waveColors,
  waves,
  filterSlot,
  onToggleIds,
}: Props) {
  const root = useMemo(() => buildEstateScopeTree(inventory), [inventory]);
  const filtered = useMemo(
    () => filterEstateTree(root, query),
    [root, query]
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const seededTreeKey = useRef("");

  useEffect(() => {
    // Seed once per tree shape — don't wipe Expand all on inventory poll refreshes
    const key = root.children
      .map((c) => `${c.id}:${c.objectIds.length}`)
      .join("|");
    if (seededTreeKey.current === key) return;
    seededTreeKey.current = key;
    setExpanded(
      new Set(
        root.children.filter((c) => c.kind === "folder").map((c) => c.id)
      )
    );
  }, [root]);

  useEffect(() => {
    if (!query.trim()) return;
    setExpanded(new Set(collectFolderIds(filtered)));
  }, [query, filtered]);

  function toggleExpand(id: string) {
    if (!id) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!inventory.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-semibold text-[#1d1d1f]">No estate objects</p>
        <p className="max-w-sm text-xs text-[#86868b]">
          Run Discover profiling first so Horizon can show the folder structure.
        </p>
      </div>
    );
  }

  return (
    <div className="estate-tree flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="estate-tree-toolbar shrink-0">
        <div>
          <p className="suite-theme-kicker">Discovered structure</p>
          <h2 className="text-sm font-semibold text-[#1d1d1f]">
            Select free objects for the next wave
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="btn-ghost text-[11px]"
            onClick={() =>
              setExpanded(new Set(collectFolderIds(filtered)))
            }
          >
            Expand all
          </button>
          <button
            type="button"
            className="btn-ghost text-[11px]"
            onClick={() => setExpanded(new Set())}
          >
            Collapse
          </button>
        </div>
        {filterSlot ? (
          <div className="estate-tree-toolbar-filter">{filterSlot}</div>
        ) : null}
      </div>

      <div className="estate-tree-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-1">
        <ul className="estate-tree-root">
          {filtered.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={0}
              selected={selected}
              disabled={disabled}
              lockedIds={lockedIds}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onToggleIds={onToggleIds}
              objectWaveMap={objectWaveMap}
              waveColors={waveColors}
              waves={waves}
            />
          ))}
        </ul>
        {!filtered.children.length ? (
          <p className="px-3 py-8 text-center text-xs text-[#86868b]">
            No folders or files match.
          </p>
        ) : null}
      </div>
    </div>
  );
}
