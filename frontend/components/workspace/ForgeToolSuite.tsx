"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import {
  computeForgeAppScope,
  isConvertAppInScope,
} from "@/lib/forgeAppScope";
import {
  FORGE_ACCELERATOR_TOOLS,
  FORGE_MIGRATE_TOOLS,
  toolHref,
  type ForgeAcceleratorTool,
  type ForgeMigrateTool,
} from "@/lib/phases";

type Props = {
  project: any;
  inventory: any[];
  summary: any | null;
  artifacts: any[];
  metadataComplete: boolean;
  buildApproved: boolean;
  agentRuns?: any[];
  busy?: boolean;
  /** Approve build pack then continue to Pilot */
  onApproveBuild?: () => void | Promise<void>;
};

type ToolStatus = "done" | "ready" | "locked" | "empty" | "oos";
type Category = "all" | "convert" | "accelerators" | "inscope";

const TONES: Record<string, string> = {
  tables: "forge-pad-tone-blue",
  scripts: "forge-pad-tone-indigo",
  pipelines: "forge-pad-tone-violet",
  reports: "forge-pad-tone-rose",
  data: "forge-pad-tone-teal",
  cataloguer: "forge-pad-tone-cyan",
  composer: "forge-pad-tone-magenta",
  transform: "forge-pad-tone-amber",
  contracts: "forge-pad-tone-slate",
};

function AppGlyph({ id }: { id: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<string, ReactNode> = {
    tables: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </>
    ),
    scripts: (
      <>
        <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
      </>
    ),
    pipelines: (
      <>
        <circle cx="6" cy="6" r="2.25" />
        <circle cx="18" cy="6" r="2.25" />
        <circle cx="12" cy="18" r="2.25" />
        <path d="M8 7l2.5 8M16 7l-2.5 8" />
      </>
    ),
    reports: (
      <>
        <path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M14 3v5h5M8 13h8M8 17h5" />
      </>
    ),
    data: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    ),
    cataloguer: (
      <>
        <path d="M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z" />
        <path d="M9 13h6M9 16h4" />
      </>
    ),
    composer: (
      <>
        <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3z" />
      </>
    ),
    transform: (
      <>
        <path d="M4 7h11M15 7l-3-3M15 7l-3 3M20 17H9M9 17l3-3M9 17l3 3" />
      </>
    ),
    contracts: (
      <>
        <path d="M8 3h8l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
        <path d="M16 3v4h4M9 12h6M9 16h4" />
      </>
    ),
  };
  return <svg {...common}>{paths[id] || paths.tables}</svg>;
}

function countForTool(toolId: string, _summary: any | null, artifacts: any[]): number {
  const forgeOf = (a: any) =>
    String(a?.detail?.forge_tool || "").toLowerCase();
  // Once any artifact is tagged to a Forge app, only that tag counts as done —
  // prevents leftover unscoped pack rows from marking every convert app complete.
  const anyTagged = artifacts.some((a) => Boolean(forgeOf(a)));

  if (toolId === "tables") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "tables";
      if (f === "data" || a.kind === "data") return false;
      return (
        a.kind === "table" ||
        a.source_type === "table" ||
        a.source_type === "view"
      );
    }).length;
  }
  if (toolId === "pipelines") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "pipelines";
      return a.kind === "dag" || a.source_type === "dag";
    }).length;
  }
  if (toolId === "scripts") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "scripts";
      const t = String(a.source_type || "").toLowerCase();
      const k = String(a.kind || "").toLowerCase();
      if (
        t === "table" ||
        t === "view" ||
        t === "dag" ||
        t === "report" ||
        t === "data"
      )
        return false;
      if (k === "dag" || k === "table" || k === "data" || k === "report")
        return false;
      return true;
    }).length;
  }
  if (toolId === "reports") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "reports";
      const t = String(a.source_type || "").toLowerCase();
      const k = String(a.kind || "").toLowerCase();
      return t === "report" || k === "report";
    }).length;
  }
  if (toolId === "data") {
    return artifacts.filter((a) => {
      const f = forgeOf(a);
      if (anyTagged) return f === "data";
      return a.kind === "data" || a.source_type === "data";
    }).length;
  }
  return 0;
}

function convertStatus(
  count: number,
  locked: boolean,
  inScope: boolean
): ToolStatus {
  if (!inScope) return "oos";
  if (locked) return "locked";
  if (count > 0) return "done";
  return "empty";
}

function accelStatus(last: any | undefined): ToolStatus {
  const s = String(last?.status || "").toLowerCase();
  if (["succeeded", "success", "completed", "complete", "approved"].includes(s))
    return "done";
  if (last) return "ready";
  return "empty";
}

function statusLabel(st: ToolStatus, meta: string): string {
  if (st === "oos") return "Out of scope · not in this wave";
  if (st === "done") return `Done · ${meta}`;
  if (st === "locked") return "Available after Align";
  if (st === "ready") return `In progress · ${meta}`;
  return meta;
}

type PadApp = {
  key: string;
  id: string;
  label: string;
  title: string;
  tagline: string;
  focus: string;
  ownedBy: string;
  capabilities: string[];
  href: string;
  tone: string;
  status: ToolStatus;
  statusText: string;
  locked: boolean;
  inScope: boolean;
  sourceCount: number;
  group: "convert" | "accelerators";
};

export function ForgeToolSuite({
  project,
  inventory,
  summary,
  artifacts,
  metadataComplete,
  buildApproved,
  agentRuns = [],
  busy = false,
  onApproveBuild,
}: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<Category>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const convertLocked = !metadataComplete;

  const scope = useMemo(
    () => computeForgeAppScope(inventory, project, summary),
    [inventory, project, summary]
  );

  const apps = useMemo(() => {
    const convert: PadApp[] = FORGE_MIGRATE_TOOLS.map((tool: ForgeMigrateTool) => {
      const inScope = isConvertAppInScope(tool.id, scope);
      const sourceCount = scope.counts[tool.id as keyof typeof scope.counts] || 0;
      const count = countForTool(tool.id, summary, artifacts);
      const status = convertStatus(count, convertLocked, inScope);
      return {
        key: `convert-${tool.id}`,
        id: tool.id,
        label: tool.shortName,
        title: tool.name,
        tagline: tool.tagline,
        focus: tool.focus,
        ownedBy: tool.ownedBy,
        capabilities: tool.capabilities,
        href: toolHref("forge", tool.viewId),
        tone: TONES[tool.id] || "forge-pad-tone-blue",
        status,
        statusText: statusLabel(
          status,
          inScope
            ? count > 0
              ? `${count} in pack · ${sourceCount} source`
              : `${sourceCount} source object${sourceCount === 1 ? "" : "s"}`
            : "No matching objects in wave"
        ),
        locked: !inScope || convertLocked,
        inScope,
        sourceCount,
        group: "convert" as const,
      };
    });

    const accel: PadApp[] = FORGE_ACCELERATOR_TOOLS.map(
      (tool: ForgeAcceleratorTool) => {
        const last = agentRuns.find((r) => r.task === tool.taskId);
        const status = accelStatus(last);
        return {
          key: `accel-${tool.id}`,
          id: tool.id,
          label: tool.shortName,
          title: tool.name,
          tagline: tool.tagline,
          focus: tool.focus,
          ownedBy: tool.ownedBy,
          capabilities: tool.capabilities,
          href: toolHref("forge", tool.viewId),
          tone: TONES[tool.id] || "forge-pad-tone-cyan",
          status,
          statusText: statusLabel(
            status,
            last ? String(last.status) : "Ready · always in scope"
          ),
          locked: false,
          inScope: true,
          sourceCount: 0,
          group: "accelerators" as const,
        };
      }
    );

    return [...convert, ...accel];
  }, [summary, artifacts, agentRuns, convertLocked, scope]);

  const inScopeConvert = apps.filter(
    (a) => a.group === "convert" && a.inScope
  );
  const inScopeDone = inScopeConvert.filter((a) => a.status === "done");
  const convertComplete =
    inScopeConvert.length > 0 && inScopeDone.length === inScopeConvert.length;
  const accelApps = apps.filter((a) => a.group === "accelerators");
  const accelDone = accelApps.filter((a) => a.status === "done");
  const canApproveBuild = convertComplete && !buildApproved && !!onApproveBuild;
  const canContinuePilot = buildApproved && convertComplete;

  const visible = apps.filter((a) => {
    if (category === "inscope") return a.inScope;
    if (category === "all") return true;
    return a.group === category;
  });

  const convertInScopeVisible = visible.filter(
    (a) => a.group === "convert" && a.inScope
  );
  const convertOosVisible = visible.filter(
    (a) => a.group === "convert" && !a.inScope
  );
  const accelVisible = visible.filter((a) => a.group === "accelerators");
  const useSections =
    category === "all" || category === "convert" || category === "inscope";

  const selected = selectedKey
    ? apps.find((a) => a.key === selectedKey) || null
    : null;

  function selectApp(app: PadApp) {
    setSelectedKey((k) => (k === app.key ? null : app.key));
  }

  function renderTile(app: PadApp) {
    const selectedHere = selectedKey === app.key;
    return (
      <button
        key={app.key}
        type="button"
        role="listitem"
        className={[
          "forge-pad-tile",
          app.status === "oos" ? "is-oos" : "",
          app.locked && app.status !== "oos" ? "is-locked" : "",
          app.status === "done" ? "is-done" : "",
          selectedHere ? "is-selected" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-pressed={selectedHere}
        aria-expanded={selectedHere}
        onClick={() => selectApp(app)}
        onDoubleClick={() => {
          if (!app.locked && app.inScope) router.push(app.href);
        }}
      >
        <span className={`forge-pad-glow ${app.tone}`} aria-hidden />
        <span className={`forge-pad-icon ${app.tone}`} aria-hidden>
          <AppGlyph id={app.id} />
          {app.status === "done" ? (
            <span className="forge-pad-badge is-done" />
          ) : null}
          {app.status === "ready" ? (
            <span className="forge-pad-badge is-ready" />
          ) : null}
          {app.status === "oos" ? (
            <span className="forge-pad-badge is-oos" title="Out of scope" />
          ) : null}
          {app.locked && app.status !== "oos" ? (
            <span className="forge-pad-lock" aria-hidden>
              <svg
                viewBox="0 0 16 16"
                width="11"
                height="11"
                fill="currentColor"
              >
                <path d="M4.5 7V5.5a3.5 3.5 0 1 1 7 0V7h.75A1.75 1.75 0 0 1 14 8.75v4.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-4.5A1.75 1.75 0 0 1 3.75 7H4.5Zm1.5 0h4V5.5a2 2 0 1 0-4 0V7Z" />
              </svg>
            </span>
          ) : null}
        </span>
        <span className="forge-pad-label">{app.label}</span>
        {app.status === "oos" ? (
          <span className="forge-pad-scope-tag">Out of scope</span>
        ) : (
          <span className="forge-pad-scope-tag is-in">In scope</span>
        )}
      </button>
    );
  }

  const waveLabel = scope.waveName
    ? scope.waveScoped
      ? ` · Wave ${scope.waveName}`
      : ` · ${scope.waveName}`
    : "";
  const scopeMeta = `${inScopeDone.length}/${inScopeConvert.length} convert in scope · ${scope.objectCount} objects`;
  const oosConvertCount = apps.filter(
    (a) => a.group === "convert" && !a.inScope
  ).length;

  return (
    <div className="forge-pad flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="forge-pad-atmosphere" aria-hidden />

      <header className="forge-pad-bar shrink-0">
        <div className="forge-pad-bar-inner forge-theme-bar-inner">
          <div className="forge-pad-brand">
            <span className="forge-pad-brand-mark" aria-hidden>
              F
            </span>
            <div>
              <h1 className="forge-pad-brand-name">Forge</h1>
              <p className="forge-pad-brand-sub">
                {project?.name || "Estate"}
                {waveLabel} · {scopeMeta}
                {oosConvertCount ? ` · ${oosConvertCount} out of scope` : ""}
              </p>
            </div>
          </div>

          <div className="forge-pad-seg" role="tablist" aria-label="Categories">
            {(
              [
                { id: "all", label: "All" },
                { id: "inscope", label: "In scope" },
                { id: "convert", label: "Convert" },
                { id: "accelerators", label: "Accelerate" },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                className={`forge-pad-seg-btn ${
                  category === c.id ? "is-active" : ""
                }`}
                onClick={() => {
                  setCategory(c.id);
                  setSelectedKey(null);
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="forge-theme-bar-actions">
            {canContinuePilot ? (
              <Link
                href={toolHref("prove")}
                className="btn"
                title="Build approved — continue to Pilot"
              >
                Continue → Pilot
              </Link>
            ) : canApproveBuild ? (
              <button
                type="button"
                className="btn"
                disabled={busy}
                title="All in-scope convert apps generated — approve build and open Pilot"
                onClick={() => void onApproveBuild?.()}
              >
                {busy ? "Approving…" : "Approve build → Pilot"}
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                disabled
                title={
                  inScopeConvert.length === 0
                    ? "No in-scope convert apps for this wave"
                    : `Generate remaining in-scope convert apps (${inScopeDone.length}/${inScopeConvert.length}), then approve build`
                }
              >
                Approve build → Pilot
              </button>
            )}
            <Link href={toolHref("forge", "approve")} className="forge-pad-pack">
              {buildApproved ? "Pack" : "Pack detail"}
            </Link>
          </div>
        </div>
      </header>

      <div className="forge-theme-banner is-info shrink-0">
        {convertComplete && !buildApproved
          ? "In-scope convert apps are generated — approve build, then continue to Pilot. Accelerators stay available anytime."
          : buildApproved
            ? "Build approved — continue to Pilot when ready. Accelerators remain available."
            : scope.objectCount === 0
              ? "Loading estate inventory… convert apps follow project/wave objects; accelerators stay in scope."
              : `Convert apps follow ${scope.waveScoped ? "active wave" : "project"} inventory (${scope.objectCount} objects). Accelerators are always in scope — open anytime.`}
      </div>

      <div
        className={`forge-pad-stage min-h-0 flex-1 ${
          selected ? "has-sheet" : ""
        }`}
        role="list"
        aria-label="Forge applications"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedKey(null);
        }}
      >
        {useSections ? (
          <div className="forge-pad-sections">
            {convertInScopeVisible.length ? (
              <section className="forge-pad-section">
                <h2 className="forge-pad-section-title">
                  Convert · In scope
                  <span>
                    {inScopeDone.length}/{convertInScopeVisible.length} generated
                  </span>
                </h2>
                <div className="forge-pad-grid">
                  {convertInScopeVisible.map(renderTile)}
                </div>
              </section>
            ) : null}
            {convertOosVisible.length ? (
              <section className="forge-pad-section">
                <h2 className="forge-pad-section-title">
                  Convert · Out of scope
                  <span>
                    {scope.waveScoped
                      ? "No objects of this type in the active wave"
                      : "No objects of this type in this project"}
                  </span>
                </h2>
                <div className="forge-pad-grid">
                  {convertOosVisible.map(renderTile)}
                </div>
              </section>
            ) : null}
            {accelVisible.length && category !== "convert" ? (
              <section className="forge-pad-section">
                <h2 className="forge-pad-section-title">
                  Accelerate · In scope
                  <span>
                    {accelDone.length}/{accelVisible.length} done · always available
                  </span>
                </h2>
                <div className="forge-pad-grid">
                  {accelVisible.map(renderTile)}
                </div>
              </section>
            ) : null}
            {!visible.length ? (
              <p className="px-4 py-10 text-center text-xs text-[#86868b]">
                No apps in this filter for the current wave.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="forge-pad-grid">{visible.map(renderTile)}</div>
            {!visible.length ? (
              <p className="px-4 py-10 text-center text-xs text-[#86868b]">
                No apps in this filter for the current wave.
              </p>
            ) : null}
          </>
        )}
      </div>

      <div
        className={`forge-pad-sheet shrink-0 ${selected ? "is-open" : ""}`}
        aria-hidden={!selected}
      >
        {selected ? (
          <div className="forge-pad-sheet-card">
            <span
              className={`forge-pad-icon forge-pad-sheet-icon ${selected.tone}`}
              aria-hidden
            >
              <AppGlyph id={selected.id} />
            </span>
            <div className="forge-pad-sheet-copy">
              <p className="forge-pad-sheet-meta">
                {selected.group === "convert" ? "Convert" : "Accelerate"}
                <span aria-hidden> · </span>
                {selected.inScope ? "In scope" : "Out of scope"}
                <span aria-hidden> · </span>
                {selected.statusText}
              </p>
              <h2 className="forge-pad-sheet-title">{selected.title}</h2>
              <p className="forge-pad-sheet-tag">{selected.tagline}</p>
              {!selected.inScope ? (
                <p className="mt-2 text-[11px] text-[#86868b]">
                  No matching objects in this project
                  {scope.waveName ? ` / ${scope.waveName}` : ""} inventory — skipped
                  for this run.
                </p>
              ) : null}
              <details className="forge-pad-sheet-more">
                <summary>About</summary>
                <p>{selected.focus}</p>
                {selected.capabilities?.length ? (
                  <ul>
                    {selected.capabilities.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </details>
            </div>
            <div className="forge-pad-sheet-actions">
              {!selected.inScope ? (
                <span className="forge-pad-sheet-cta is-disabled">Out of scope</span>
              ) : selected.locked ? (
                <span className="forge-pad-sheet-cta is-disabled">Locked</span>
              ) : (
                <Link href={selected.href} className="forge-pad-sheet-cta">
                  {selected.group === "convert" && selected.status !== "done"
                    ? "Open & convert"
                    : selected.group === "accelerators"
                      ? "Open & run"
                      : "Open"}
                </Link>
              )}
              <button
                type="button"
                className="forge-pad-sheet-dismiss"
                onClick={() => setSelectedKey(null)}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {convertComplete ? (
        <p className="relative z-[1] shrink-0 px-4 pb-3 text-center text-[10px] text-[#86868b]">
          In-scope convert complete
          {accelDone.length
            ? ` · ${accelDone.length}/${accelApps.length} accelerators done`
            : ""}
          {buildApproved
            ? " — continue to Pilot when ready."
            : " — approve build to open Pilot."}
        </p>
      ) : null}
    </div>
  );
}
