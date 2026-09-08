import dagre from '@dagrejs/dagre'
import type { KgEdge, KgNode } from '@/lib/kg/kgTypes'

/** Left → right mind-map columns: Product → Contract → Table → Concept → other assets */
const TYPE_RANK: Record<string, number> = {
  product: 0,
  port: 1,
  contract: 2,
  field: 2,
  system: 3,
  database: 3,
  schema: 3,
  job: 3,
  table: 4,
  column: 5,
  concept: 6,
  namespace: 6,
  federation: 6,
  glossary: 7,
  entity: 7,
  attribute: 7,
  domain: 7,
  model: 7,
  mapping: 7,
}

const NODE_W = 208
const NODE_H = 68

function rankOf(n: Pick<KgNode, 'type' | 'layer'>) {
  if (TYPE_RANK[n.type] != null) return TYPE_RANK[n.type]
  if (n.layer === 'product') return 0
  if (n.layer === 'governance') return 1
  if (n.layer === 'technical') return 2
  if (n.layer === 'semantics') return 3
  return 4
}

/**
 * Layout nodes left-to-right as a context mind map.
 * Layout edges are oriented low-rank → high-rank so Data product sits on the left.
 */
export function layoutMindMap(nodes: KgNode[], edges: KgEdge[]): KgNode[] {
  if (!nodes.length) return []

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    align: 'UL',
    nodesep: 32,
    ranksep: 110,
    marginx: 40,
    marginy: 40,
    edgesep: 18,
  })

  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H })
  }

  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    const rf = rankOf(byId.get(e.from)!)
    const rt = rankOf(byId.get(e.to)!)
    if (rf <= rt) g.setEdge(e.from, e.to)
    else g.setEdge(e.to, e.from)
  }

  // Soft rank chain so sparse results still flow Product → … → Concepts
  const byRank = new Map<number, string[]>()
  for (const n of nodes) {
    const r = rankOf(n)
    if (!byRank.has(r)) byRank.set(r, [])
    byRank.get(r)!.push(n.id)
  }
  const ranks = [...byRank.keys()].sort((a, b) => a - b)
  for (let i = 0; i < ranks.length - 1; i++) {
    const a = byRank.get(ranks[i])![0]
    const b = byRank.get(ranks[i + 1])![0]
    if (!g.hasEdge(a, b) && !g.hasEdge(b, a)) g.setEdge(a, b)
  }

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      ...n,
      position: {
        x: (pos?.x ?? 0) - NODE_W / 2,
        y: (pos?.y ?? 0) - NODE_H / 2,
      },
    }
  })
}

/** Direct neighbors of focusId (1 hop), always including focus itself. */
export function collectNeighborhood(focusId: string, edges: KgEdge[]): Set<string> {
  const set = new Set<string>([focusId])
  for (const e of edges) {
    if (e.from === focusId) set.add(e.to)
    if (e.to === focusId) set.add(e.from)
  }
  return set
}

/**
 * Compact layout for a focus node + its neighbors so the cluster fits in one viewport.
 * Non-neighborhood nodes are parked far below (dimmed / out of fitView).
 */
export function layoutFocusCluster(
  nodes: KgNode[],
  edges: KgEdge[],
  focusId: string,
): { nodes: KgNode[]; focusIds: Set<string> } {
  const focusIds = collectNeighborhood(focusId, edges)
  const clusterNodes = nodes.filter((n) => focusIds.has(n.id))
  const clusterEdges = edges.filter((e) => focusIds.has(e.from) && focusIds.has(e.to))

  if (!clusterNodes.length) {
    return { nodes: layoutMindMap(nodes, edges), focusIds }
  }

  // Force focus leftmost via a synthetic root edge when needed
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({
    rankdir: 'LR',
    align: 'UL',
    nodesep: 28,
    ranksep: 96,
    marginx: 24,
    marginy: 24,
    edgesep: 14,
  })

  const byId = new Map(clusterNodes.map((n) => [n.id, n]))
  for (const n of clusterNodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H })
  }

  for (const e of clusterEdges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    // Keep focus as source when possible so it sits on the left
    if (e.from === focusId) g.setEdge(e.from, e.to)
    else if (e.to === focusId) g.setEdge(e.to, e.from)
    else {
      const rf = rankOf(byId.get(e.from)!)
      const rt = rankOf(byId.get(e.to)!)
      if (rf <= rt) g.setEdge(e.from, e.to)
      else g.setEdge(e.to, e.from)
    }
  }

  // Ensure every neighbor is reachable from focus for a tight star/tree layout
  for (const n of clusterNodes) {
    if (n.id === focusId) continue
    if (!g.hasEdge(focusId, n.id) && !g.hasEdge(n.id, focusId)) {
      g.setEdge(focusId, n.id)
    }
  }

  dagre.layout(g)

  const clusterLaid = new Map(
    clusterNodes.map((n) => {
      const pos = g.node(n.id)
      return [
        n.id,
        {
          ...n,
          position: {
            x: (pos?.x ?? 0) - NODE_W / 2,
            y: (pos?.y ?? 0) - NODE_H / 2,
          },
        } satisfies KgNode,
      ]
    }),
  )

  // Park everything else well below the cluster so fitView ignores them visually
  const parkY = 2400
  let parkX = 0
  const full = nodes.map((n) => {
    if (clusterLaid.has(n.id)) return clusterLaid.get(n.id)!
    const parked = {
      ...n,
      position: { x: parkX, y: parkY },
    }
    parkX += NODE_W + 40
    return parked
  })

  return { nodes: full, focusIds }
}
