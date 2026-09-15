/** Forge apps in/out of scope from inventory (project + active wave). */

import { activeWaveSummary } from "@/lib/phases";

export type ForgeConvertAppId =
  | "tables"
  | "scripts"
  | "pipelines"
  | "reports"
  | "data";

const TYPE_TO_APPS: Record<string, ForgeConvertAppId[]> = {
  table: ["tables", "data"],
  view: ["tables", "data"],
  script: ["scripts"],
  procedure: ["scripts"],
  package: ["scripts"],
  function: ["scripts"],
  job: ["scripts"],
  code: ["scripts"],
  repo: ["scripts"],
  git: ["scripts"],
  dag: ["pipelines"],
  pipeline: ["pipelines"],
  orchestration: ["pipelines"],
  report: ["reports"],
};

/** Normalize inventory / lane type strings to convert-app keys. */
export function normalizeInventoryType(raw: unknown): string {
  const t = String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (!t) return "";
  if (t === "tables") return "table";
  if (t === "views") return "view";
  if (t === "scripts" || t === "spark" || t === "sql" || t === "shell")
    return "script";
  if (t === "dags" || t === "airflow" || t === "composer") return "dag";
  if (t === "reports" || t === "bi" || t === "workbook") return "report";
  if (t === "pipelines") return "pipeline";
  if (t === "repos" || t === "repository") return "repo";
  return t;
}

function objectTypeOf(o: any): string {
  return normalizeInventoryType(
    o?.object_type || o?.type || o?.kind || o?.asset_type
  );
}

export type ForgeAppScope = {
  /** Convert app ids present in the scoped estate */
  inScope: Set<ForgeConvertAppId>;
  /** Counts of inventory objects feeding each convert app */
  counts: Record<ForgeConvertAppId, number>;
  /** Inventory size after wave filter */
  objectCount: number;
  waveName: string | null;
  /** True when active wave object_ids filtered the estate */
  waveScoped: boolean;
};

export function scopedInventoryForForge(
  inventory: any[],
  project: any
): { objects: any[]; waveName: string | null; waveScoped: boolean } {
  const wave = activeWaveSummary(project);
  const waveRow = (project?.wave_plan?.waves || []).find(
    (w: any) => w.id === wave?.id
  );
  const ids = (waveRow?.object_ids || []) as Array<number | string>;

  if (project?.plan_approved && ids.length) {
    const set = new Set(ids.map(Number).filter((n) => Number.isFinite(n)));
    const filtered = inventory.filter((o) => set.has(Number(o.id)));
    // If IDs don't match loaded inventory yet, keep full estate rather than
    // falsely marking every convert app out of scope.
    if (filtered.length > 0 || inventory.length === 0) {
      return {
        objects: filtered,
        waveName: wave?.name || wave?.id || null,
        waveScoped: true,
      };
    }
    return {
      objects: inventory,
      waveName: wave?.name || wave?.id || null,
      waveScoped: false,
    };
  }

  return {
    objects: inventory,
    waveName: wave?.name || null,
    waveScoped: false,
  };
}

function emptyCounts(): Record<ForgeConvertAppId, number> {
  return {
    tables: 0,
    scripts: 0,
    pipelines: 0,
    reports: 0,
    data: 0,
  };
}

function countsFromObjects(
  objects: any[]
): Record<ForgeConvertAppId, number> {
  const counts = emptyCounts();
  for (const o of objects) {
    const t = objectTypeOf(o);
    const apps = TYPE_TO_APPS[t];
    if (!apps) continue;
    for (const id of apps) counts[id] += 1;
  }
  return counts;
}

/** Fallback when inventory isn't loaded yet — use Build lane object counts. */
function countsFromLanes(
  lanes: any[] | null | undefined
): Record<ForgeConvertAppId, number> | null {
  if (!lanes?.length) return null;
  const counts = emptyCounts();
  let any = false;
  for (const lane of lanes) {
    const t = normalizeInventoryType(lane.asset_type || lane.kind || lane.id);
    const apps = TYPE_TO_APPS[t];
    const n = Number(lane.object_count ?? 0);
    if (!apps || n <= 0) continue;
    any = true;
    for (const id of apps) counts[id] += n;
  }
  return any ? counts : null;
}

export function computeForgeAppScope(
  inventory: any[],
  project: any,
  buildSummary?: { lanes?: any[] } | null
): ForgeAppScope {
  const { objects, waveName, waveScoped } = scopedInventoryForForge(
    inventory,
    project
  );

  let counts = countsFromObjects(objects);
  const inventoryEmpty = !inventory?.length;
  const noTypedObjects = Object.values(counts).every((n) => n === 0);

  // Inventory not loaded / not yet typed — fall back to Build lane counts
  if ((inventoryEmpty || noTypedObjects) && buildSummary?.lanes) {
    const fromLanes = countsFromLanes(buildSummary.lanes);
    if (fromLanes) counts = fromLanes;
  }

  const inScope = new Set<ForgeConvertAppId>();
  (Object.keys(counts) as ForgeConvertAppId[]).forEach((id) => {
    if (counts[id] > 0) inScope.add(id);
  });

  return {
    inScope,
    counts,
    objectCount: objects.length || inventory.length || 0,
    waveName,
    waveScoped,
  };
}

export function isConvertAppInScope(
  appId: string,
  scope: ForgeAppScope
): boolean {
  return scope.inScope.has(appId as ForgeConvertAppId);
}
