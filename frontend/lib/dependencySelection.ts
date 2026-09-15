/** Expand migrate-scope selection via lineage / pipeline dependencies. */

export type DependencyDirection = "upstream" | "downstream" | "both";

type InvObj = {
  id?: number | string;
  object_type?: string;
  name?: string;
  schema_name?: string;
  fully_qualified_name?: string;
  profile?: {
    sources?: string[];
    targets?: string[];
  };
};

type LineageEdge = {
  source?: string;
  target?: string;
  source_fqn?: string;
  target_fqn?: string;
  job_name?: string;
  edge_type?: string;
};

type JobNode = {
  name?: string;
  depends_on?: string[];
};

function norm(s: string): string {
  return String(s || "").trim();
}

/** Resolve inventory object for an edge endpoint or job name. */
function resolveId(
  raw: string,
  byFqn: Map<string, number>,
  byName: Map<string, number[]>
): number | null {
  const key = norm(raw);
  if (!key) return null;
  if (byFqn.has(key)) return byFqn.get(key)!;

  // job_name "billing_finance_daily.spark_invoice_fact" → spark.*
  const parts = key.split(".");
  if (parts.length === 2 && !key.startsWith("dag.")) {
    const spark = `spark.${parts[0]}.${parts[1]}`;
    if (byFqn.has(spark)) return byFqn.get(spark)!;
    const scripts = `scripts.${parts[0]}.${parts[1]}`;
    if (byFqn.has(scripts)) return byFqn.get(scripts)!;
  }

  // Bare table/view name from script profile sources/targets
  const nameHits = byName.get(key.toLowerCase());
  if (nameHits?.length === 1) return nameHits[0];
  if (nameHits?.length) {
    // Prefer legacy schema when ambiguous
    for (const id of nameHits) {
      // resolved below via byFqn reverse is expensive — keep first table-ish
      return id;
    }
  }

  return null;
}

function indexInventory(inventory: InvObj[]) {
  const byFqn = new Map<string, number>();
  const byName = new Map<string, number[]>();
  const byId = new Map<number, InvObj>();
  const dagMembers = new Map<string, number[]>(); // dagKey → object ids

  for (const o of inventory) {
    const id = Number(o.id);
    if (Number.isNaN(id)) continue;
    byId.set(id, o);
    const fqn = norm(String(o.fully_qualified_name || ""));
    if (fqn) byFqn.set(fqn, id);
    const name = norm(String(o.name || "")).toLowerCase();
    if (name) {
      const list = byName.get(name) || [];
      list.push(id);
      byName.set(name, list);
    }

    // Group scripts/spark/dag under shared DAG key for co-selection
    const type = String(o.object_type || "").toLowerCase();
    let dagKey = "";
    if (type === "dag" && fqn.startsWith("dag.")) dagKey = fqn.slice(4);
    else if (fqn.startsWith("scripts.") || fqn.startsWith("spark.") || fqn.startsWith("sql.")) {
      const segs = fqn.split(".");
      if (segs.length >= 3) dagKey = segs[1];
    }
    if (dagKey) {
      const list = dagMembers.get(dagKey) || [];
      list.push(id);
      dagMembers.set(dagKey, list);
    }
  }

  return { byFqn, byName, byId, dagMembers };
}

/**
 * Build directed adjacency (id → ids) for upstream/downstream walks.
 * upstream = producers / inputs feeding into a node
 * downstream = consumers / outputs fed by a node
 */
export function buildDependencyGraph(
  inventory: InvObj[],
  lineage?: { edges?: LineageEdge[] } | null,
  jobs?: JobNode[] | null
): {
  upstream: Map<number, Set<number>>;
  downstream: Map<number, Set<number>>;
  edgeCount: number;
} {
  const { byFqn, byName, byId, dagMembers } = indexInventory(inventory);
  const upstream = new Map<number, Set<number>>();
  const downstream = new Map<number, Set<number>>();
  let edgeCount = 0;

  function link(from: number, to: number) {
    if (from === to) return;
    if (!upstream.has(to)) upstream.set(to, new Set());
    if (!downstream.has(from)) downstream.set(from, new Set());
    if (!upstream.get(to)!.has(from)) {
      upstream.get(to)!.add(from);
      downstream.get(from)!.add(to);
      edgeCount += 1;
    }
  }

  const edges = lineage?.edges || [];
  for (const e of edges) {
    const srcRaw = norm(String(e.source || e.source_fqn || ""));
    const tgtRaw = norm(String(e.target || e.target_fqn || ""));
    if (!srcRaw || !tgtRaw) continue;
    const src = resolveId(srcRaw, byFqn, byName);
    const tgt = resolveId(tgtRaw, byFqn, byName);
    if (src != null && tgt != null) link(src, tgt);

    // Attach producing job/script when present
    const jobRaw = norm(String(e.job_name || ""));
    if (jobRaw) {
      const jobId = resolveId(jobRaw, byFqn, byName);
      if (jobId != null) {
        if (src != null) link(src, jobId); // table → job (read)
        if (tgt != null) link(jobId, tgt); // job → table (write)
      }
    }
  }

  // Job-node depends_on (pipeline task order)
  for (const j of jobs || []) {
    const to = resolveId(norm(String(j.name || "")), byFqn, byName);
    if (to == null) continue;
    for (const dep of j.depends_on || []) {
      const from = resolveId(norm(String(dep)), byFqn, byName);
      if (from != null) link(from, to);
    }
  }

  // Script profile sources/targets (short names)
  for (const [id, o] of byId) {
    const type = String(o.object_type || "").toLowerCase();
    if (type !== "script") continue;
    const sources = o.profile?.sources || [];
    const targets = o.profile?.targets || [];
    for (const s of sources) {
      const sid = resolveId(norm(String(s)), byFqn, byName);
      if (sid != null) link(sid, id);
    }
    for (const t of targets) {
      const tid = resolveId(norm(String(t)), byFqn, byName);
      if (tid != null) link(id, tid);
    }
  }

  // Soft: DAG ↔ its scripts only (not a full script mesh — lineage covers that).
  // Selecting a DAG pulls its scripts; selecting a script pulls its DAG.
  for (const [dagKey, members] of dagMembers) {
    const dagId = byFqn.get(`dag.${dagKey}`);
    if (dagId == null) continue;
    for (const mid of members) {
      if (mid === dagId) continue;
      link(dagId, mid);
      link(mid, dagId);
    }
  }

  return { upstream, downstream, edgeCount };
}

export function expandSelectionByDependencies(
  seedIds: Iterable<number>,
  inventory: InvObj[],
  lineage?: { edges?: LineageEdge[] } | null,
  jobs?: JobNode[] | null,
  direction: DependencyDirection = "both"
): { ids: number[]; added: number; edgeCount: number } {
  const seeds = [...new Set([...seedIds].map(Number).filter((id) => !Number.isNaN(id)))];
  if (!seeds.length) {
    return { ids: [], added: 0, edgeCount: 0 };
  }

  const { upstream, downstream, edgeCount } = buildDependencyGraph(
    inventory,
    lineage,
    jobs
  );

  const result = new Set<number>(seeds);
  const queue = [...seeds];

  while (queue.length) {
    const cur = queue.pop()!;
    const nextSets: Set<number>[] = [];
    if (direction === "upstream" || direction === "both") {
      const u = upstream.get(cur);
      if (u) nextSets.push(u);
    }
    if (direction === "downstream" || direction === "both") {
      const d = downstream.get(cur);
      if (d) nextSets.push(d);
    }
    for (const set of nextSets) {
      for (const n of set) {
        if (result.has(n)) continue;
        result.add(n);
        queue.push(n);
      }
    }
  }

  return {
    ids: [...result],
    added: Math.max(0, result.size - seeds.length),
    edgeCount,
  };
}
