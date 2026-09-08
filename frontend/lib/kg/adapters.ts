import type { KgEdge, KgNode, KgQueryGroup, KgQueryMeta, KgRunResult } from "@/lib/kg/kgTypes";

export type EstateGraphInput = {
  lineage?: { nodes?: any[]; edges?: any[]; stats?: any };
  inventory?: any[];
  jobs?: any[];
  sidStandards?: any | null;
  products?: any[];
  project?: {
    id?: number;
    name?: string;
    sample_slug?: string;
    estate_label?: string;
  } | null;
  mappings?: any[];
};

function shortLabel(fqn: string) {
  if (!fqn) return fqn;
  const parts = fqn.split(".");
  return parts[parts.length - 1] || fqn;
}

/** crm_daily → CRM Daily; keeps existing Title Case. */
function humanizeName(raw: string | null | undefined, fallback = ""): string {
  const s = String(raw || fallback || "").trim();
  if (!s) return fallback;
  if (/[A-Z]/.test(s) && /\s/.test(s)) return s; // already titled
  return s
    .replace(/^dag\./i, "")
    .replace(/^job_/i, "")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fileBase(path: string | null | undefined): string {
  if (!path) return "";
  const part = String(path).split("/").pop() || String(path);
  return part.replace(/\.(sh|sql|py|r|scala)$/i, "");
}

function schemaOf(fqn: string): string {
  const parts = fqn.split(".");
  if (parts.length >= 2) return parts.slice(0, -1).join(".");
  return "";
}

function upsertNode(map: Map<string, KgNode>, node: KgNode) {
  const prev = map.get(node.id);
  if (!prev) {
    map.set(node.id, node);
    return;
  }
  map.set(node.id, {
    ...prev,
    ...node,
    properties: { ...(prev.properties || {}), ...(node.properties || {}) },
    labels: Array.from(new Set([...(prev.labels || []), ...(node.labels || [])])),
    hub: Boolean(prev.hub || node.hub),
    subtitle: node.subtitle || prev.subtitle,
  });
}

function addEdge(edges: KgEdge[], seen: Set<string>, edge: KgEdge) {
  const key = `${edge.from}|${edge.predicate}|${edge.to}`;
  if (seen.has(key) || edge.from === edge.to) return;
  if (!edge.from || !edge.to) return;
  seen.add(key);
  edges.push(edge);
}

function jobNodeId(name: string) {
  const id = String(name);
  if (id.startsWith("job_") || id.startsWith("dag.") || id.includes(".")) return id;
  return `job_${id}`;
}

/**
 * Pure repo discovery graph for the active project:
 *   Git repo → DAG → task → script → input/output tables
 */
export function buildRepoDiscoveryGraph(input: EstateGraphInput): {
  nodes: KgNode[];
  edges: KgEdge[];
  title: string;
  description: string;
} {
  const lineage = input.lineage || { nodes: [], edges: [] };
  const inventory = input.inventory || [];
  const jobs = input.jobs || [];
  const projectLabel =
    input.project?.name ||
    input.project?.sample_slug ||
    input.project?.estate_label ||
    "Active project";
  const slug = input.project?.sample_slug || "";

  const nodeMap = new Map<string, KgNode>();
  const edges: KgEdge[] = [];
  const seen = new Set<string>();

  // Graph is driven only by LineageStitcher edges — never pre-seed full catalog.
  const stitchEdges = lineage.edges || [];
  if (!stitchEdges.length) {
    return {
      nodes: [],
      edges: [],
      title: `${projectLabel} · lineage`,
      description:
        "No LineageStitcher edges yet — run Find inventory after source identification.",
    };
  }

  const invByFqn = new Map(
    inventory
      .filter((o) => o.fully_qualified_name)
      .map((o) => [String(o.fully_qualified_name).toLowerCase(), o] as const)
  );
  const jobByName = new Map(jobs.map((j) => [String(j.name), j] as const));

  function looksLikeTableFqn(id: string): boolean {
    if (!id || id.includes(":")) return false;
    if (
      id.startsWith("job_") ||
      id.startsWith("dag.") ||
      id.startsWith("git.") ||
      id.startsWith("scripts.")
    ) {
      return false;
    }
    return id.includes(".") || invByFqn.has(id.toLowerCase());
  }

  function ensureRepoNode(id: string) {
    if (!id.startsWith("git.") || nodeMap.has(id)) return;
    const meta = invByFqn.get(id.toLowerCase());
    const remote = String(meta?.source_path || "");
    const remoteShort = remote.replace(/^https?:\/\//, "").replace(/\.git$/, "");
    upsertNode(nodeMap, {
      id,
      label: humanizeName(meta?.name || shortLabel(id), "Repository"),
      subtitle: remoteShort || "Git repository",
      type: "repo",
      layer: "technical",
      natco: "",
      contract_ref: "",
      hub: true,
      labels: ["Repository", "Git"],
      properties: {
        remote: meta?.source_path || null,
        engine: meta?.profile?.engine || null,
        sample_slug: slug || null,
        object_kind: "repo",
        linked_by: "lineage_stitcher",
      },
      position: { x: 0, y: 0 },
    });
  }

  function ensureJobNode(idRaw: string) {
    const id = jobNodeId(String(idRaw));
    if (!id || nodeMap.has(id)) return;
    const j = jobByName.get(id) || jobByName.get(String(idRaw));
    const isDag =
      (j?.params?.kind || "") === "dag" || /^dag\.[^.]+$/.test(id);
    const dagId = j?.params?.dag_id || id.replace(/^dag\./, "");
    const schedule = j?.schedule || "";
    if (isDag) {
      upsertNode(nodeMap, {
        id,
        label: humanizeName(j?.params?.dag_name || dagId, dagId),
        subtitle: schedule
          ? `Cron ${schedule}`
          : j?.params?.task_count != null
            ? `${j.params.task_count} tasks · manual`
            : "Manual schedule",
        type: "dag",
        layer: "technical",
        natco: "",
        contract_ref: "",
        hub: true,
        labels: ["DAG"],
        properties: {
          schedule: schedule || null,
          script_path: j?.script_path || null,
          dag_id: dagId,
          kind: "dag",
          object_kind: "dag",
          linked_by: "lineage_stitcher",
        },
        position: { x: 0, y: 0 },
      });
    } else {
      const taskId = j?.params?.task_id || id.split(".").pop() || id;
      const scriptRef = j?.params?.script || j?.script_path || "";
      upsertNode(nodeMap, {
        id,
        label: humanizeName(j?.params?.task_name || taskId, taskId),
        subtitle: scriptRef
          ? `Pipeline · ${fileBase(scriptRef) || scriptRef}`
          : `Pipeline · ${humanizeName(String(dagId), "DAG")}`,
        type: "task",
        layer: "technical",
        natco: "",
        contract_ref: "",
        labels: ["Task", "Pipeline"],
        properties: {
          schedule: schedule || null,
          script_path: j?.script_path || null,
          dag_id: j?.params?.dag_id || null,
          task_id: taskId,
          kind: "task",
          object_kind: "task",
          linked_by: "lineage_stitcher",
        },
        position: { x: 0, y: 0 },
      });
    }
  }

  function ensureScriptNode(id: string) {
    if (!id.startsWith("scripts.") || nodeMap.has(id)) return;
    const meta = invByFqn.get(id.toLowerCase());
    const path = String(meta?.source_path || meta?.name || id);
    const base = fileBase(path) || String(meta?.name || shortLabel(id));
    upsertNode(nodeMap, {
      id,
      label: humanizeName(base, base),
      subtitle: meta?.extra?.dag_id
        ? `Script · ${meta.extra.dag_id}`
        : path
          ? `Script · ${path}`
          : "Shell / SQL script",
      type: "script",
      layer: "technical",
      natco: "",
      contract_ref: "",
      labels: ["Script"],
      properties: {
        path: meta?.source_path || null,
        dag_id: meta?.extra?.dag_id || null,
        object_kind: "script",
        linked_by: "lineage_stitcher",
      },
      position: { x: 0, y: 0 },
    });
  }

  function ensureTableNode(fqnRaw: string) {
    const fqn = String(fqnRaw);
    if (!looksLikeTableFqn(fqn)) return;
    if (nodeMap.has(fqn)) return;
    const meta = invByFqn.get(fqn.toLowerCase());
    const schema = schemaOf(fqn);
    upsertNode(nodeMap, {
      id: fqn,
      label: humanizeName(shortLabel(fqn), shortLabel(fqn)),
      subtitle: schema ? `Table · ${schema}` : meta?.description || fqn,
      type: "table",
      layer: "technical",
      natco: "",
      contract_ref: "",
      labels: ["Table"],
      properties: {
        fqn,
        row_count: meta?.row_count ?? null,
        source_path: meta?.source_path || null,
        object_kind: "table",
        linked_by: "lineage_stitcher",
      },
      position: { x: 0, y: 0 },
    });
  }

  function ensureEndpoint(endRaw: string) {
    const end = String(endRaw || "");
    if (!end || end.startsWith("dag:")) return;
    if (end.startsWith("git.")) ensureRepoNode(end);
    else if (end.startsWith("scripts.")) ensureScriptNode(end);
    else if (end.startsWith("dag.") || jobByName.has(end)) ensureJobNode(end);
    else ensureTableNode(end);
  }

  // Materialize nodes + edges only from LineageStitcher results
  for (const e of stitchEdges) {
    const from = String(e.source || "");
    const to = String(e.target || "");
    if (from.startsWith("dag:") || to.startsWith("dag:")) continue;
    ensureEndpoint(from);
    ensureEndpoint(to);
    if (!nodeMap.has(from) || !nodeMap.has(to)) continue;

    let predicate = "FEEDS";
    if (e.edge_type === "job") {
      if (from.startsWith("git.")) predicate = "CONTAINS";
      else if (from.startsWith("dag.") && !to.startsWith("dag.")) predicate = "RUNS";
      else if (to.startsWith("scripts.")) predicate = "RUNS";
      else predicate = "DEPENDS_ON";
    } else if (from.startsWith("scripts.")) {
      predicate = "WRITES";
    }

    addEdge(edges, seen, {
      id: `e-${e.id || `${from}-${to}-${e.job_name || ""}`}`,
      from,
      to,
      predicate,
    });
  }

  // Task dependencies only among nodes already on the stitcher graph
  for (const j of jobs) {
    const to = jobNodeId(String(j.name));
    if (!nodeMap.has(to)) continue;
    for (const dep of j.depends_on || []) {
      const from = jobNodeId(String(dep));
      if (!nodeMap.has(from)) continue;
      addEdge(edges, seen, {
        id: `dep-${from}-${to}`,
        from,
        to,
        predicate: "DEPENDS_ON",
      });
    }
  }

  // Drop isolated nodes (catalog-only tables must not appear without stitcher edges)
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  for (const id of Array.from(nodeMap.keys())) {
    if ((degree.get(id) || 0) > 0) continue;
    const n = nodeMap.get(id);
    // Keep only if somehow a hub with children — otherwise remove orphans
    if (n && (n.type === "table" || n.type === "input_table" || n.type === "output_table" || n.type === "script")) {
      nodeMap.delete(id);
    } else if (n && (n.type === "repo" || n.type === "dag" || n.type === "task") && !(degree.get(id) || 0)) {
      // Keep repo/dag/task only when connected; otherwise remove noise
      nodeMap.delete(id);
    }
  }

  // Classify tables as input / output from edge direction
  const writtenTo = new Set<string>();
  const readFrom = new Set<string>();
  for (const e of edges) {
    const fromNode = nodeMap.get(e.from);
    const toNode = nodeMap.get(e.to);
    if (!fromNode || !toNode) continue;
    if (e.predicate === "WRITES" && toNode.type === "table") {
      writtenTo.add(e.to);
    }
    if (e.predicate === "FEEDS") {
      if (fromNode.type === "table" || fromNode.type === "input_table" || fromNode.type === "output_table") {
        readFrom.add(e.from);
      }
      if (toNode.type === "table" || toNode.type === "input_table" || toNode.type === "output_table") {
        if (fromNode.type === "table" || fromNode.type === "input_table" || fromNode.type === "output_table") {
          writtenTo.add(e.to);
          readFrom.add(e.from);
        } else {
          writtenTo.add(e.to);
        }
      }
    }
    if (
      (toNode.type === "table" || toNode.type === "input_table" || toNode.type === "output_table") &&
      (fromNode.type === "script" || fromNode.type === "task") &&
      (e.predicate === "WRITES" || e.predicate === "FEEDS" || e.predicate === "RUNS")
    ) {
      writtenTo.add(e.to);
    }
  }

  for (const [id, n] of Array.from(nodeMap.entries())) {
    if (n.type !== "table") continue;
    const isOut = writtenTo.has(id);
    const isIn = readFrom.has(id);
    let type = "table";
    let roleLabel = "Table";
    let subtitle = n.subtitle;
    if (isOut && !isIn) {
      type = "output_table";
      roleLabel = "Output table";
      subtitle = schemaOf(id) ? `Output · ${schemaOf(id)}` : "Produced by pipeline";
    } else if (isIn && !isOut) {
      type = "input_table";
      roleLabel = "Input table";
      subtitle = schemaOf(id) ? `Input · ${schemaOf(id)}` : "Read by pipeline";
    } else if (isIn && isOut) {
      type = "table";
      roleLabel = "Table";
      subtitle = schemaOf(id) ? `In/out · ${schemaOf(id)}` : "Read and written";
    }
    upsertNode(nodeMap, {
      ...n,
      type,
      labels: [roleLabel, "Table"],
      subtitle,
      properties: {
        ...(n.properties || {}),
        object_kind: type,
        role: roleLabel,
      },
    });
  }

  const linkedTableCount = Array.from(nodeMap.values()).filter((n) =>
    ["table", "input_table", "output_table"].includes(n.type)
  ).length;
  const inventoryTables = inventory.filter((o) => o.object_type === "table").length;

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    title: `${projectLabel} · lineage`,
    description: slug
      ? `LineageStitcher graph · ${linkedTableCount}/${inventoryTables || linkedTableCount} tables linked (sample-data/projects/${slug}/legacy)`
      : `LineageStitcher graph · ${linkedTableCount} linked tables (catalog-only objects omitted)`,
  };
}

/** @deprecated use buildRepoDiscoveryGraph — kept for call-site compatibility */
export function buildEstateKnowledgeGraph(input: EstateGraphInput) {
  return buildRepoDiscoveryGraph(input);
}

/** @deprecated Jobs view merged into repo graph */
export function buildJobsKnowledgeGraph(input: EstateGraphInput) {
  return buildRepoDiscoveryGraph(input);
}

export function lineageToKgGraph(
  lineage: { nodes?: any[]; edges?: any[] },
  extra?: Omit<EstateGraphInput, "lineage">
) {
  return buildRepoDiscoveryGraph({ lineage, ...extra });
}

export function jobsToKgGraph(jobs: any[], extra?: Omit<EstateGraphInput, "jobs">) {
  return buildRepoDiscoveryGraph({ jobs, ...extra });
}

/** Single offline scenario: the project repo graph only. */
export function buildOfflineCatalog(input: EstateGraphInput): {
  groups: KgQueryGroup[];
  queries: KgQueryMeta[];
  run: (code: string) => KgRunResult;
} {
  const full = buildRepoDiscoveryGraph(input);
  const slug = input.project?.sample_slug || input.project?.name || "project";
  const groupId = "repo";

  const tablesOnly = {
    nodes: full.nodes.filter(
      (n) =>
        n.type === "table" ||
        n.type === "input_table" ||
        n.type === "output_table" ||
        n.type === "script" ||
        n.labels?.includes("Script")
    ),
    edges: full.edges.filter(
      (e) => e.predicate === "FEEDS" || e.predicate === "WRITES"
    ),
    title: `${slug} · scripts & tables`,
    description: "SQL FEEDS / script WRITES from this estate only",
  };

  const scenarios: Record<string, typeof full> = {
    R1: full,
    R2: tablesOnly,
    L1: full,
    L2: full,
  };

  const groups: KgQueryGroup[] = [{ id: groupId, label: String(slug) }];
  const queries: KgQueryMeta[] = [
    {
      id: "local-R1",
      code: "R1",
      title: "Repo · full discovery graph",
      description: "Repository → DAG → pipeline → script → tables",
      sourceFile: `sample-data/projects/${slug}/legacy`,
      group: groupId,
      resultHint: "graph",
    },
    {
      id: "local-R2",
      code: "R2",
      title: "Repo · scripts & tables",
      description: "Script WRITES and SQL FEEDS only",
      sourceFile: `sample-data/projects/${slug}/legacy/dags`,
      group: groupId,
      resultHint: "graph",
    },
  ];

  const run = (code: string): KgRunResult => {
    const g = scenarios[code.toUpperCase()] || full;
    return {
      source: "neo4j",
      mode: "both",
      title: g.title,
      description: g.description,
      code: code.toUpperCase(),
      group: groupId,
      nodeCount: g.nodes.length,
      edgeCount: g.edges.length,
      nodes: g.nodes,
      edges: g.edges,
      hasGraph: true,
      hasTable: true,
      graphTables: {
        nodes: {
          columns: ["id", "label", "type", "subtitle"],
          rows: g.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            type: n.type,
            subtitle: n.subtitle,
          })),
        },
        edges: {
          columns: ["id", "from", "to", "predicate"],
          rows: g.edges.map((e) => ({
            id: e.id,
            from: e.from,
            to: e.to,
            predicate: e.predicate,
          })),
        },
      },
    };
  };

  return { groups, queries, run };
}
