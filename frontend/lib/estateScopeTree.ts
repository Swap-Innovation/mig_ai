/** Build a folder/file tree from discovery inventory for Horizon migrate-scope selection. */

export type EstateTreeNode = {
  id: string;
  name: string;
  kind: "folder" | "file";
  objectId?: number;
  objectType?: string;
  children: EstateTreeNode[];
  /** All inventory object ids under this node (self for files). */
  objectIds: number[];
};

/** Estate roots only — never mid-tree folders like /spark/ (those orphan files). */
const ESTATE_ROOT_MARKERS = ["/legacy/", "/migration-repo/"];
const ESTATE_ROOT_SEGMENTS = new Set([
  "legacy",
  "migration-repo",
  "dags",
  "catalog",
  "usage",
]);

function stripUrlOrAbs(path: string): string[] | null {
  const raw = path.replace(/\\/g, "/").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || /^git@/i.test(raw)) return null;

  let p = raw;
  const lower = p.toLowerCase();
  for (const marker of ESTATE_ROOT_MARKERS) {
    const i = lower.indexOf(marker);
    if (i >= 0) {
      p = p.slice(i + 1); // keep "legacy/..."
      break;
    }
  }

  // Drop leading drive / absolute root noise
  p = p.replace(/^[A-Za-z]:\//, "").replace(/^\/+/, "");
  let parts = p.split("/").filter(Boolean);
  if (!parts.length) return null;

  // Absolute paths without /legacy/ still often contain dags|catalog|usage
  const rootIdx = parts.findIndex((seg) =>
    ESTATE_ROOT_SEGMENTS.has(seg.toLowerCase())
  );
  if (rootIdx > 0) parts = parts.slice(rootIdx);

  // Keep relative dags/... under legacy so shell scripts and spark sit together
  if (parts[0]?.toLowerCase() === "dags") {
    parts = ["legacy", ...parts];
  }

  return parts;
}

function scriptSegmentsFromFqn(fqn: string, name: string): string[] | null {
  const parts = fqn.split(".").filter(Boolean);
  if (parts.length < 3) return null;
  const kind = parts[0].toLowerCase();
  const dag = parts[1];
  const leaf = parts.slice(2).join(".");
  if (kind === "scripts") {
    return ["legacy", "dags", dag, "scripts", leaf || name];
  }
  if (kind === "spark") {
    const file = leaf.includes(".") ? leaf : `${leaf || name}.py`;
    return ["legacy", "dags", dag, "spark", file];
  }
  if (kind === "sql") {
    const file = leaf.includes(".") ? leaf : `${leaf || name}.sql`;
    return ["legacy", "dags", dag, "sql", file];
  }
  return null;
}

export function objectPathSegments(o: {
  id?: number | string;
  object_type?: string;
  name?: string;
  schema_name?: string;
  fully_qualified_name?: string;
  source_path?: string;
}): string[] {
  const type = String(o.object_type || "object").toLowerCase();
  const schema =
    String(o.schema_name || "").trim() ||
    String(o.fully_qualified_name || "").split(".")[0] ||
    "default";
  const name =
    String(o.name || "").trim() ||
    String(o.fully_qualified_name || "").split(".").pop() ||
    `object-${o.id ?? "?"}`;
  const fqn = String(o.fully_qualified_name || "");

  // Prefer typed FQN for scripts so relative ".../spark/..." paths stay under the DAG
  if (type === "script") {
    const fromFqn = scriptSegmentsFromFqn(fqn, name);
    if (fromFqn) return fromFqn;
  }

  const fromPath = stripUrlOrAbs(String(o.source_path || ""));
  if (fromPath?.length) return fromPath;

  if (type === "table" || type === "view") {
    return ["catalog", schema, name];
  }
  if (type === "dag") {
    return ["legacy", "dags", name, "dag.json"];
  }
  if (type === "script") {
    return ["legacy", "scripts", name];
  }
  if (type === "repo" || type === "git") {
    return ["repo", name];
  }
  if (type === "job") return ["jobs", name];
  if (type === "report") return ["reports", name];
  return [type || "other", name];
}

type MutableNode = {
  id: string;
  name: string;
  kind: "folder" | "file";
  objectId?: number;
  objectType?: string;
  children: Map<string, MutableNode>;
};

function ensureChild(parent: MutableNode, name: string, kind: "folder" | "file") {
  const id = parent.id ? `${parent.id}/${name}` : name;
  let child = parent.children.get(name);
  if (!child) {
    child = { id, name, kind, children: new Map() };
    parent.children.set(name, child);
  } else if (kind === "file") {
    child.kind = "file";
  }
  return child;
}

function freeze(node: MutableNode): EstateTreeNode {
  const children = [...node.children.values()]
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map(freeze);

  const objectIds: number[] = [];
  if (node.kind === "file" && node.objectId != null) {
    objectIds.push(node.objectId);
  }
  for (const c of children) objectIds.push(...c.objectIds);

  return {
    id: node.id || "estate",
    name: node.name,
    kind: node.kind,
    objectId: node.objectId,
    objectType: node.objectType,
    children,
    objectIds: [...new Set(objectIds)],
  };
}

export function buildEstateScopeTree(inventory: any[]): EstateTreeNode {
  const root: MutableNode = {
    id: "",
    name: "Estate",
    kind: "folder",
    children: new Map(),
  };

  for (const o of inventory) {
    const segments = objectPathSegments(o);
    if (!segments.length) continue;
    let cur = root;
    for (let i = 0; i < segments.length; i++) {
      const isLeaf = i === segments.length - 1;
      const seg = segments[i];
      cur = ensureChild(cur, seg, isLeaf ? "file" : "folder");
      if (isLeaf) {
        cur.kind = "file";
        cur.objectId = Number(o.id);
        cur.objectType = String(o.object_type || "object");
      }
    }
  }

  return freeze(root);
}

export function filterEstateTree(
  root: EstateTreeNode,
  query: string
): EstateTreeNode {
  const q = query.trim().toLowerCase();
  if (!q) return root;

  function walk(node: EstateTreeNode): EstateTreeNode | null {
    if (node.kind === "file") {
      const hay = `${node.name} ${node.objectType || ""} ${node.id}`.toLowerCase();
      return hay.includes(q) ? node : null;
    }
    const kids = node.children.map(walk).filter(Boolean) as EstateTreeNode[];
    if (node.name.toLowerCase().includes(q) || kids.length) {
      const objectIds = kids.flatMap((c) => c.objectIds);
      return { ...node, children: kids, objectIds: [...new Set(objectIds)] };
    }
    return null;
  }

  const next = walk(root);
  return (
    next || {
      ...root,
      children: [],
      objectIds: [],
    }
  );
}

export function collectFolderIds(root: EstateTreeNode): string[] {
  const ids: string[] = [];
  function walk(n: EstateTreeNode) {
    if (n.kind === "folder") {
      if (n.id) ids.push(n.id);
      for (const c of n.children) walk(c);
    }
  }
  walk(root);
  return ids;
}
