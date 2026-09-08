"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchKgHealth, fetchKgQueries, fetchKgQuery, runKgCypher } from "@/lib/kg/kgClient";
import type { KgEdge, KgNode, KgQueryGroup, KgQueryMeta, KgRunResult, KgTable } from "@/lib/kg/kgTypes";
import { collectNeighborhood, layoutFocusCluster, layoutMindMap } from "@/lib/kg/mindmapLayout";

export type SemanticsProduct = { id: string; name: string; scope?: string; familyId?: string; natco?: string };

export type SemanticsCanvasProps = {
  title?: string;
  initialQueryCode?: string;
  products?: SemanticsProduct[];
  natcos?: string[];
  onNodeSelect?: (node: KgNode | null) => void;
  fallbackGraph?: { nodes: KgNode[]; edges: KgEdge[]; title?: string; description?: string };
  /** Offline Wave-1 catalog (L1–L4) when /api/kg is unavailable */
  offlineCatalog?: {
    groups: KgQueryGroup[];
    queries: KgQueryMeta[];
    run: (code: string) => KgRunResult;
  };
  showContractsLink?: boolean;
  contractsHref?: string;
  className?: string;
  /** Hide left catalog when using static fallback only */
  hideCatalogWhenOffline?: boolean;
  /**
   * full — KG explorer (queries, Run, inspector).
   * viewer — discovery lineage: graph-first, no query rail / details / Run.
   */
  variant?: "full" | "viewer";
};

type GraphNodeData = {
  label: string
  subtitle: string
  nodeType: string
  layer: string
  natco: string
  dimmed?: boolean
  selected?: boolean
  hub?: boolean
}

/** Shared context-graph theme tokens (CSS-driven) */
const ACCENT = 'var(--color-accent)'
const EDGE = 'var(--color-edge)'
const EDGE_ACTIVE = 'var(--color-accent)'
const CANVAS_BG = 'var(--color-canvas)'
const CARD_BORDER = 'var(--color-line)'
const MUTED = 'var(--color-slate)'
const INK = 'var(--color-ink)'

/** Soft professional tints — used as translucent “liquid glass” fills by type */
const typeMeta: Record<string, { tint: string; icon: string; label: string }> = {
  product: { tint: '#C2185B', icon: '◆', label: 'Product' },
  port: { tint: '#9C27B0', icon: '◇', label: 'Port' },
  contract: { tint: '#5C6BC0', icon: '▣', label: 'Contract' },
  field: { tint: '#7E57C2', icon: '▪', label: 'Field' },
  table: { tint: '#D97706', icon: '▦', label: 'Table' },
  input_table: { tint: '#0284C7', icon: '▥', label: 'Input table' },
  output_table: { tint: '#BE185D', icon: '▦', label: 'Output table' },
  column: { tint: '#0891B2', icon: '▥', label: 'Column' },
  system: { tint: '#059669', icon: '☰', label: 'System' },
  repo: { tint: '#0F766E', icon: '⬡', label: 'Repository' },
  script: { tint: '#7C3AED', icon: '≡', label: 'Script' },
  dag: { tint: '#16A34A', icon: '◉', label: 'DAG' },
  task: { tint: '#2563EB', icon: '▸', label: 'Pipeline' },
  database: { tint: '#0E7490', icon: '⛁', label: 'Database' },
  schema: { tint: '#38BDF8', icon: '▤', label: 'Schema' },
  concept: { tint: '#A855F7', icon: '◎', label: 'Concept' },
  namespace: { tint: '#DB2777', icon: '⬡', label: 'Namespace' },
  glossary: { tint: '#6366F1', icon: '⌘', label: 'Glossary' },
  entity: { tint: '#4F46E5', icon: '▢', label: 'Entity' },
  attribute: { tint: '#C026D3', icon: '·', label: 'Attribute' },
  domain: { tint: '#6366F1', icon: '◉', label: 'Domain' },
  model: { tint: '#0369A1', icon: '☰', label: 'Model' },
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '')
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return `rgba(15, 23, 42, ${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function typeDisplay(nodeType: string) {
  return typeMeta[nodeType]?.label || nodeType.replace(/_/g, ' ')
}

function ContextNode({ data }: NodeProps) {
  const d = data as GraphNodeData
  const meta = typeMeta[d.nodeType] ?? { tint: '#64748B', icon: '●', label: d.nodeType }
  const tint = meta.tint
  const focused = d.selected || d.hub

  return (
    <div
      style={{
        opacity: d.dimmed ? 0.28 : 1,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 188,
        maxWidth: 240,
        padding: '10px 12px',
        borderRadius: 14,
        border: `1px solid ${hexToRgba(tint, focused ? 0.42 : 0.26)}`,
        background: focused
          ? `linear-gradient(145deg, ${hexToRgba(tint, 0.28)} 0%, ${hexToRgba(tint, 0.14)} 48%, rgba(255,255,255,0.62) 100%)`
          : `linear-gradient(145deg, ${hexToRgba(tint, 0.18)} 0%, ${hexToRgba(tint, 0.07)} 42%, rgba(255,255,255,0.78) 100%)`,
        backdropFilter: 'blur(18px) saturate(1.15)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.15)',
        boxShadow: focused
          ? `inset 0 1px 0 rgba(255,255,255,0.55), 0 8px 22px ${hexToRgba(tint, 0.22)}, 0 2px 8px ${hexToRgba(tint, 0.12)}`
          : `inset 0 1px 0 rgba(255,255,255,0.85), 0 2px 6px rgba(15,23,42,0.04), 0 10px 24px ${hexToRgba(tint, 0.08)}`,
        color: INK,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: hexToRgba(tint, 0.85),
          width: 8,
          height: 8,
          borderRadius: '50%',
          border: `1.5px solid ${hexToRgba(tint, 0.35)}`,
          boxShadow: `0 0 0 2px ${hexToRgba(tint, 0.12)}`,
        }}
      />
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          background: hexToRgba(tint, focused ? 0.28 : 0.16),
          border: `1px solid ${hexToRgba(tint, 0.22)}`,
          color: tint,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {meta.icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: focused ? tint : MUTED,
            fontWeight: 700,
          }}
        >
          {typeDisplay(d.nodeType)}
        </div>
        <div style={{ marginTop: 2, fontWeight: 700, fontSize: 13, lineHeight: 1.2, color: INK }}>
          {d.label}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 10,
            lineHeight: 1.25,
            color: MUTED,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 170,
          }}
        >
          {d.subtitle}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: hexToRgba(tint, 0.85),
          width: 8,
          height: 8,
          borderRadius: '50%',
          border: `1.5px solid ${hexToRgba(tint, 0.35)}`,
          boxShadow: `0 0 0 2px ${hexToRgba(tint, 0.12)}`,
        }}
      />
    </div>
  )
}

const nodeTypes = { context: ContextNode }

function buildFlow(
  nodesIn: KgNode[],
  edgesIn: KgEdge[],
  showEdgeLabels: boolean,
  focusId: string | null,
  rearrangeOnFocus: boolean,
) {
  const { nodes: laidOut, focusIds } =
    rearrangeOnFocus && focusId
      ? layoutFocusCluster(nodesIn, edgesIn, focusId)
      : { nodes: layoutMindMap(nodesIn, edgesIn), focusIds: focusId ? collectNeighborhood(focusId, edgesIn) : new Set<string>() }

  const nodes: Node[] = laidOut.map((n) => ({
    id: n.id,
    type: 'context',
    position: n.position,
    data: {
      label: n.label,
      subtitle: n.subtitle,
      nodeType: n.type,
      layer: n.layer,
      natco: n.natco,
      hub: Boolean(n.hub) || n.type === 'product' || n.id === focusId,
      dimmed: false,
      selected: n.id === focusId,
    } satisfies GraphNodeData,
  }))
  const edges: Edge[] = edgesIn.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: showEdgeLabels ? e.predicate.toLowerCase().replace(/_/g, ' ') : undefined,
    type: 'bezier',
    style: { stroke: EDGE, strokeWidth: 1.6 },
    labelStyle: { fill: MUTED, fontSize: 10, fontWeight: 600 },
    labelBgStyle: { fill: CANVAS_BG, fillOpacity: 0.95 },
    labelBgPadding: [4, 3] as [number, number],
    markerEnd: { type: MarkerType.ArrowClosed, color: EDGE, width: 14, height: 14 },
  }))
  return { nodes, edges, focusIds }
}

function GraphCanvas({
  graph,
  selectedId,
  onSelect,
  focusMode,
  showEdgeLabels,
  showMinimap,
  showControls,
  showBackground,
  animateEdges,
  fitToken,
  searchQuery,
}: {
  graph: { nodes: KgNode[]; edges: KgEdge[] }
  selectedId: string | null
  onSelect: (id: string | null) => void
  focusMode: boolean
  showEdgeLabels: boolean
  showMinimap: boolean
  showControls: boolean
  showBackground: boolean
  animateEdges: boolean
  fitToken: number
  searchQuery: string
}) {
  const rearrangeOnFocus = focusMode
  const built = useMemo(
    () => buildFlow(graph.nodes, graph.edges, showEdgeLabels, selectedId, rearrangeOnFocus),
    [graph, showEdgeLabels, selectedId, rearrangeOnFocus],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges)
  const { fitView } = useReactFlow()

  const searchLower = searchQuery.trim().toLowerCase()

  useEffect(() => {
    const next = buildFlow(graph.nodes, graph.edges, showEdgeLabels, selectedId, rearrangeOnFocus)
    const styledNodes = next.nodes.map((n) => {
      const inCluster = !selectedId || next.focusIds.has(n.id)
      const d = n.data as GraphNodeData
      const matchesSearch =
        !searchLower ||
        d.label.toLowerCase().includes(searchLower) ||
        d.nodeType.toLowerCase().includes(searchLower) ||
        n.id.toLowerCase().includes(searchLower)
      return {
        ...n,
        hidden: focusMode && selectedId ? !inCluster : false,
        data: {
          ...d,
          selected: n.id === selectedId,
          dimmed:
            (focusMode && selectedId ? !inCluster : false) ||
            (searchLower ? !matchesSearch : false),
          hub: d.hub || (searchLower && matchesSearch && n.id !== selectedId),
        },
      }
    })
    const styledEdges = next.edges.map((e) => {
      const inCluster =
        !!selectedId && next.focusIds.has(e.source) && next.focusIds.has(e.target)
      const active = !!selectedId && (e.source === selectedId || e.target === selectedId)
      const dimmed = focusMode && selectedId && !inCluster
      return {
        ...e,
        animated: animateEdges && active,
        hidden: focusMode && selectedId ? !inCluster : false,
        style: {
          stroke: active ? EDGE_ACTIVE : EDGE,
          strokeWidth: active ? 2.4 : 1.6,
          opacity: dimmed ? 0.08 : 1,
        },
        labelStyle: {
          fill: active ? ACCENT : MUTED,
          fontSize: 10,
          fontWeight: 600,
          opacity: dimmed ? 0.1 : 1,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: active ? EDGE_ACTIVE : EDGE,
          width: 14,
          height: 14,
        },
      }
    })
    setNodes(styledNodes)
    setEdges(styledEdges)

    const t = window.setTimeout(() => {
      if (selectedId && rearrangeOnFocus && next.focusIds.size) {
        const ids = [...next.focusIds]
        void fitView({
          nodes: ids.map((id) => ({ id })),
          padding: 0.22,
          duration: 420,
          maxZoom: 1.25,
          minZoom: 0.2,
        })
      } else {
        void fitView({ padding: 0.14, duration: 360 })
      }
    }, 50)
    return () => window.clearTimeout(t)
  }, [
    graph,
    showEdgeLabels,
    selectedId,
    rearrangeOnFocus,
    focusMode,
    animateEdges,
    searchLower,
    setNodes,
    setEdges,
    fitView,
  ])

  useEffect(() => {
    if (!fitToken) return
    const t = window.setTimeout(() => void fitView({ padding: 0.16, duration: 380 }), 30)
    return () => window.clearTimeout(t)
  }, [fitToken, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.12}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      colorMode="light"
      style={{ background: 'transparent' }}
    >
      {showBackground ? (
        <Background gap={22} color="rgba(0,0,0,0.08)" variant={BackgroundVariant.Dots} />
      ) : null}
      {showControls ? (
        <Controls
          showInteractive={false}
          style={{
            background: 'rgba(255,255,255,0.82)',
            border: '1px solid rgba(255,255,255,0.75)',
            borderRadius: 14,
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.04)',
          }}
        />
      ) : null}
      {showMinimap ? (
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as GraphNodeData
            if (d.hub || d.selected) return '#E20074'
            return typeMeta[d.nodeType]?.tint ?? '#E20074'
          }}
          maskColor="rgba(245,245,247,0.72)"
          style={{
            background: 'rgba(255,255,255,0.82)',
            border: '1px solid rgba(255,255,255,0.75)',
            borderRadius: 14,
            boxShadow: '0 12px 36px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04)',
          }}
        />
      ) : null}
    </ReactFlow>
  )
}

function DataTable({ table }: { table: KgTable }) {
  if (!table.columns.length) {
    return <div className="grid h-full place-items-center text-sm text-[var(--color-slate)]">No table rows</div>
  }
  return (
    <div className="h-full overflow-auto bg-[var(--color-paper-soft)]">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-white text-[var(--color-teal-dim)]">
          <tr>
            {table.columns.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-[var(--color-line)] px-3 py-2 font-mono font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--color-line)] text-[var(--color-ink-soft)] hover:bg-[var(--color-accent-soft)]">
              {table.columns.map((c) => (
                <td key={c} className="max-w-[280px] truncate px-3 py-1.5 font-mono text-[11px]" title={String(row[c] ?? '')}>
                  {row[c] == null ? '—' : typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Inspector({
  graph,
  selectedId,
  onSelectNeighbor,
}: {
  graph: { nodes: KgNode[]; edges: KgEdge[] }
  selectedId: string | null
  onSelectNeighbor: (id: string) => void
}) {
  const node = graph.nodes.find((n) => n.id === selectedId)
  const neighbors = useMemo(() => {
    if (!selectedId) return []
    return graph.edges
      .filter((e) => e.from === selectedId || e.to === selectedId)
      .map((e) => {
        const outbound = e.from === selectedId
        const otherId = outbound ? e.to : e.from
        return {
          predicate: e.predicate,
          direction: outbound ? 'out' : 'in',
          otherId,
          otherLabel: graph.nodes.find((n) => n.id === otherId)?.label ?? otherId,
        }
      })
  }, [selectedId, graph])

  if (!node) {
    return <div className="grid h-full place-items-center p-4 text-center text-xs text-[var(--color-mist)]">Click a graph node</div>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--color-line)] px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
          {(node.labels ?? [node.type]).join(':')} · {node.natco}
        </p>
        <h3 className="mt-1 text-sm font-bold text-[var(--color-ink)]">{node.label}</h3>
        <p className="font-mono text-[10px] text-[var(--color-mist)]">{node.neo4jId ?? node.id}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-mist)]">Properties</p>
        <pre className="mb-3 overflow-x-auto whitespace-pre-wrap break-words border border-[var(--color-line)] bg-white p-2 font-mono text-[10px] leading-relaxed text-[var(--color-ink-soft)]">
          {JSON.stringify(node.properties ?? {}, null, 2)}
        </pre>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-mist)]">Neighbors</p>
        <ul className="space-y-1">
          {neighbors.map((n) => (
            <li key={`${n.predicate}-${n.otherId}-${n.direction}`}>
              <button
                type="button"
                onClick={() => onSelectNeighbor(n.otherId)}
                className="w-full border border-[var(--color-line)] bg-white px-2 py-1.5 text-left text-xs hover:border-[var(--color-accent)]"
              >
                <span className="font-mono text-[10px] text-[var(--color-accent)]">
                  {n.direction === 'out' ? `─${n.predicate}→` : `←${n.predicate}─`}
                </span>
                <span className="mt-0.5 block text-[var(--color-ink)]">{n.otherLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function fallbackResult(fallbackGraph?: SemanticsCanvasProps["fallbackGraph"]): KgRunResult | null {
  if (!fallbackGraph?.nodes?.length) return null;
  return {
    source: "neo4j",
    mode: "both",
    title: fallbackGraph.title || "Estate graph",
    description: fallbackGraph.description || "Static discovery fallback",
    code: "LOCAL",
    nodeCount: fallbackGraph.nodes.length,
    edgeCount: fallbackGraph.edges.length,
    nodes: fallbackGraph.nodes,
    edges: fallbackGraph.edges,
    hasGraph: true,
    hasTable: true,
    graphTables: {
      nodes: {
        columns: ["id", "label", "type", "subtitle"],
        rows: fallbackGraph.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          type: n.type,
          subtitle: n.subtitle,
        })),
      },
      edges: {
        columns: ["id", "from", "to", "predicate"],
        rows: fallbackGraph.edges.map((e) => ({
          id: e.id,
          from: e.from,
          to: e.to,
          predicate: e.predicate,
        })),
      },
    },
  };
}

export function SemanticsCanvas({
  title = "Knowledge graph",
  initialQueryCode = "Q1",
  products = [],
  natcos = [],
  onNodeSelect,
  fallbackGraph,
  offlineCatalog,
  showContractsLink = false,
  contractsHref = "#",
  className = "",
  hideCatalogWhenOffline = false,
  variant = "full",
}: SemanticsCanvasProps) {
  const viewer = variant === "viewer"
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [productParam, setProductParam] = useState<string | null>(null)
  const [queryParam, setQueryParam] = useState<string | null>(initialQueryCode)
  const [natcoParam, setNatcoParam] = useState<string | null>(null)

  const [health, setHealth] = useState<{ ok: boolean; error?: string; queryCount?: number } | null>(null)
  const [queries, setQueries] = useState<KgQueryMeta[]>([])
  const [groups, setGroups] = useState<KgQueryGroup[]>([])
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)
  const [cypher, setCypher] = useState('')
  const [result, setResult] = useState<KgRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [panel, setPanel] = useState<'graph' | 'table'>('graph')
  const [tableTab, setTableTab] = useState<'result' | 'nodes' | 'edges'>('result')
  const [showCypher, setShowCypher] = useState(false)
  const [showInspector, setShowInspector] = useState(!viewer)
  const [showCatalog, setShowCatalog] = useState(!viewer)
  const [showLegend, setShowLegend] = useState(true)
  const [showOptions, setShowOptions] = useState(false)
  const [focusMode, setFocusMode] = useState(true)
  const [showEdgeLabels, setShowEdgeLabels] = useState(viewer)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showControls, setShowControls] = useState(true)
  const [showBackground, setShowBackground] = useState(true)
  const [animateEdges, setAnimateEdges] = useState(true)
  const [compact, setCompact] = useState(true)
  const [fitToken, setFitToken] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [copyFlash, setCopyFlash] = useState<string | null>(null)
  /** Focus exploration path — last entry is current (when selected). */
  const [focusTrail, setFocusTrail] = useState<string[]>([])
  const [usingOffline, setUsingOffline] = useState(false)

  const applyResult = useCallback(
    (data: KgRunResult) => {
      setResult(data)
      setPanel(data.hasGraph ? "graph" : "table")
      if (data.graphTables?.nodes.rows.length) setTableTab("nodes")
      const hub =
        data.nodes.find((n) => n.hub) ||
        data.nodes.find((n) => n.type === "product") ||
        data.nodes[0]
      if (hub) {
        setSelectedNodeId(hub.id)
        setFocusTrail([hub.id])
        onNodeSelect?.(hub)
      } else {
        setSelectedNodeId(null)
        setFocusTrail([])
      }
      setFitToken((n) => n + 1)
    },
    [onNodeSelect],
  )

  const loadOffline = useCallback(
    (code?: string) => {
      if (offlineCatalog) {
        setUsingOffline(true)
        setHealth({ ok: false, error: "offline" })
        setQueries(offlineCatalog.queries)
        setGroups(offlineCatalog.groups)
        const wanted = (code || queryParam || initialQueryCode || "L1").toUpperCase()
        const match =
          offlineCatalog.queries.find((q) => q.code.toUpperCase() === wanted) ||
          offlineCatalog.queries[0]
        if (match) {
          setActiveQueryId(match.id)
          setQueryParam(match.code)
          setCypher(`// Local Wave-1 scenario ${match.code}\n// ${match.description}`)
          applyResult(offlineCatalog.run(match.code))
        }
        setError(null)
        return true
      }
      const fb = fallbackResult(fallbackGraph)
      if (fb) {
        setUsingOffline(true)
        setHealth({ ok: false, error: "offline" })
        applyResult(fb)
        setError(null)
        return true
      }
      return false
    },
    [offlineCatalog, fallbackGraph, queryParam, initialQueryCode, applyResult],
  )

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      productId: productParam || 'dp-customer-360',
      natco: 'natco-de',
    }
    if (natcoParam) params.natco = natcoParam
    else if (productParam) {
      const m = productParam.match(/-(de|at|hr|hu|pl)$/)
      if (m) params.natco = `natco-${m[1]}`
    }
    if (productParam) params.productId = productParam
    return params
  }, [productParam, natcoParam])

  const activeMeta = useMemo(
    () => queries.find((q) => q.id === activeQueryId) ?? null,
    [queries, activeQueryId],
  )

  useEffect(() => {
    const ac = new AbortController()
    Promise.all([fetchKgHealth(ac.signal), fetchKgQueries(ac.signal)])
      .then(([h, catalog]) => {
        if (!h.ok) {
          if (!loadOffline(initialQueryCode)) {
            setHealth(h)
            setError(h.error || "Knowledge graph API unavailable")
          }
          return
        }
        setUsingOffline(false)
        setHealth(h)
        setQueries(catalog.queries)
        setGroups(catalog.groups)
      })
      .catch(() => {
        if (!loadOffline(initialQueryCode)) {
          setHealth({ ok: false })
          setError("Failed to load knowledge graph catalog")
        }
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackGraph, offlineCatalog])

  useEffect(() => {
    if (!queries.length) return
    const wanted = (queryParam ?? (productParam ? 'Q3' : initialQueryCode)).toUpperCase()
    const match =
      queries.find((q) => q.code.toUpperCase() === wanted) ??
      queries.find((q) => q.code === 'Q1') ??
      queries[0]
    if (match && match.id !== activeQueryId) setActiveQueryId(match.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries, queryParam, productParam])

  const runCypherText = useCallback(
    async (text: string, meta?: KgQueryMeta | null, params?: Record<string, unknown>) => {
      if (!health?.ok || usingOffline) {
        if (offlineCatalog && (meta?.code || queryParam)) {
          applyResult(offlineCatalog.run(meta?.code || queryParam || "L1"))
          setError(null)
          return
        }
        const fb = fallbackResult(fallbackGraph)
        if (fb) {
          applyResult(fb)
          setError("Showing local estate graph (KG API offline)")
          return
        }
        setError("Knowledge graph API unavailable")
        return
      }
      if (!text.trim()) return
      setLoading(true)
      setError(null)
      try {
        const useCompact = meta?.group === 'country-stacks' ? false : compact
        const data = await runKgCypher(text, { compact: useCompact, params: params ?? {} })
        const enriched: KgRunResult = meta
          ? { ...data, queryId: meta.id, code: meta.code, title: meta.title, sourceFile: meta.sourceFile, group: meta.group }
          : data
        applyResult(enriched)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Query failed')
        setResult(null)
      } finally {
        setLoading(false)
      }
    },
    [compact, health?.ok, usingOffline, offlineCatalog, queryParam, fallbackGraph, applyResult],
  )

  useEffect(() => {
    if (!activeQueryId || !health?.ok || usingOffline) return
    const ac = new AbortController()
    const meta = queries.find((q) => q.id === activeQueryId) ?? null
    fetchKgQuery(activeQueryId, ac.signal)
      .then(async (q) => {
        setCypher(q.cypher)
        await runCypherText(q.cypher, meta, queryParams)
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Failed to load query')
      })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueryId, health?.ok, queryParams, usingOffline])

  const selectCatalogQuery = (q: KgQueryMeta) => {
    setActiveQueryId(q.id)
    setQueryParam(q.code)
    if (usingOffline && offlineCatalog) {
      setCypher(`// Local Wave-1 scenario ${q.code}\n// ${q.description}`)
      applyResult(offlineCatalog.run(q.code))
      return
    }
    if (q.code === 'Q3') {
      setProductParam(productParam || queryParams.productId || products[0]?.id || null)
    } else if (q.code !== 'Q2') {
      setProductParam(null)
    }
    if (q.code === 'Q2') {
      setNatcoParam(natcoParam || queryParams.natco || natcos[0] || null)
    }
  }

  const setNatco = (natco: string) => {
    setQueryParam('Q2')
    setNatcoParam(natco)
  }

  const setProduct = (productId: string) => {
    setQueryParam('Q3')
    setProductParam(productId)
    const m = productId.match(/-(de|at|hr|hu|pl)$/)
    if (m) setNatcoParam(`natco-${m[1]}`)
  }

  const graph = useMemo(() => ({ nodes: result?.nodes ?? [], edges: result?.edges ?? [] }), [result])

  const activeTable: KgTable | null = useMemo(() => {
    if (!result) return null
    if (tableTab === 'nodes') return result.graphTables?.nodes ?? { columns: [], rows: [] }
    if (tableTab === 'edges') return result.graphTables?.edges ?? { columns: [], rows: [] }
    return result.table ?? { columns: [], rows: [] }
  }, [result, tableTab])

  const onSelect = (id: string | null) => {
    if (id == null) {
      setSelectedNodeId(null)
      onNodeSelect?.(null)
      return
    }
    setFocusTrail((t) => {
      if (t[t.length - 1] === id) return t
      return [...t, id].slice(-14)
    })
    setSelectedNodeId(id)
    const node = graph.nodes.find((n) => n.id === id) || null
    onNodeSelect?.(node)
    setShowInspector(true)
  }

  const goBackFocus = () => {
    if (!selectedNodeId && focusTrail.length > 0) {
      const last = focusTrail[focusTrail.length - 1]
      setSelectedNodeId(last)
      const node = graph.nodes.find((n) => n.id === last)
      setShowInspector(true)
      return
    }
    if (focusTrail.length <= 1) {
      setFocusTrail([])
      setSelectedNodeId(null)
      return
    }
    const next = focusTrail.slice(0, -1)
    const prev = next[next.length - 1]
    setFocusTrail(next)
    setSelectedNodeId(prev)
    const node = graph.nodes.find((n) => n.id === prev)
    setShowInspector(true)
  }

  const jumpTrail = (index: number) => {
    if (index < 0 || index >= focusTrail.length) return
    const next = focusTrail.slice(0, index + 1)
    const id = next[next.length - 1]
    setFocusTrail(next)
    setSelectedNodeId(id)
    const node = graph.nodes.find((n) => n.id === id)
    setShowInspector(true)
  }

  const clearTrail = () => {
    setFocusTrail([])
    setSelectedNodeId(null)
  }

  const trailLabels = useMemo(() => {
    return focusTrail.map((id) => {
      const n = graph.nodes.find((x) => x.id === id)
      return {
        id,
        label: n?.label ?? id,
        type: n?.type ?? 'node',
      }
    })
  }, [focusTrail, graph.nodes])

  const canGoBack = Boolean(selectedNodeId) || focusTrail.length > 0

  const exportGraph = () => {
    const payload = {
      title: result?.title ?? activeMeta?.title ?? 'graph',
      exportedAt: new Date().toISOString(),
      nodes: graph.nodes,
      edges: graph.edges,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kg-${activeMeta?.code ?? 'export'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyCypher = async () => {
    try {
      await navigator.clipboard.writeText(cypher)
      setCopyFlash('Cypher copied')
      window.setTimeout(() => setCopyFlash(null), 1600)
    } catch {
      setCopyFlash('Copy failed')
      window.setTimeout(() => setCopyFlash(null), 1600)
    }
  }

  const toggleFullscreen = async () => {
    const el = document.getElementById('context-graph')
    if (!el) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await el.requestFullscreen()
    } catch {
      /* ignore */
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<string, KgQueryMeta[]>()
    for (const g of groups) map.set(g.id, [])
    for (const q of queries) {
      if (!map.has(q.group)) map.set(q.group, [])
      map.get(q.group)!.push(q)
    }
    return map
  }, [queries, groups])

  return (
    <div id="semantics-canvas" className={`panel-card flex h-full min-h-[520px] overflow-hidden ${className}`}>
      {/* Catalog */}
      {!viewer && showCatalog && (health?.ok || usingOffline || !hideCatalogWhenOffline) && queries.length > 0 ? (
        <aside className="glass-soft flex w-[220px] shrink-0 flex-col border-r border-[var(--color-line)]">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-teal-dim)]">Queries</p>
              <p className="mt-0.5 text-[10px] text-[var(--color-mist)]">
                {health?.ok ? `${queries.length} scenarios` : (usingOffline ? `${queries.length} local` : 'API offline')}
              </p>
            </div>
            <button type="button" className="tool-btn px-2 py-0.5 text-[10px]" onClick={() => setShowCatalog(false)}>
              Hide
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.id} className="border-b border-[var(--color-line)]">
                <p className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-mist)]">{g.label}</p>
                <ul className="pb-1">
                  {(grouped.get(g.id) ?? []).map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => selectCatalogQuery(q)}
                        className={`w-full px-3 py-1.5 text-left ${
                          activeQueryId === q.id
                            ? 'bg-[var(--color-accent-soft)] text-[var(--color-teal-dim)]'
                            : 'text-[var(--color-ink)] hover:bg-white/50'
                        }`}
                      >
                        <span className="font-mono text-[10px] font-semibold">{q.code}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug opacity-90">
                          {q.title.replace(/^[^·]+·\s*/, '')}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>
      ) : null}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="glass-soft flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[var(--color-ink)]">
              {result?.title ?? activeMeta?.title ?? title}
            </p>
            <p className="truncate text-[10px] text-[var(--color-mist)]">
              {viewer
                ? result
                  ? `${result.nodeCount} nodes · ${result.edgeCount} edges · Git → DAG → script → table`
                  : "Git → DAG → script → table"
                : (
                  <>
                    {activeMeta?.code === 'Q2' ? `NATCO · ${queryParams.natco} · ` : ''}
                    {activeMeta?.code === 'Q3' ? `Product · ${queryParams.productId} · ` : ''}
                    {productParam && activeMeta?.code !== 'Q2' && activeMeta?.code !== 'Q3'
                      ? `Product · ${productParam} · `
                      : ''}
                    {result
                      ? `${result.nodeCount} nodes · ${result.edgeCount} edges · ${result.rowCount ?? 0} rows`
                      : 'Mind map · Product → Contracts → Tables → Concepts'}
                    {loading ? ' · running…' : ''}
                    {copyFlash ? ` · ${copyFlash}` : ''}
                  </>
                )}
            </p>
          </div>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find node…"
            className="w-[140px] rounded-full border border-[var(--color-line)] bg-white/60 px-3 py-1 text-[11px] outline-none placeholder:text-[var(--color-slate)] focus:border-[var(--color-accent)]"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFitToken((n) => n + 1)}
              className="tool-btn"
              title="Fit graph to viewport"
            >
              Fit
            </button>
            {!viewer ? (
              <>
                {!showCatalog ? (
                  <button type="button" className="tool-btn" onClick={() => setShowCatalog(true)}>
                    Queries
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPanel('graph')}
                  className={`tool-btn ${panel === 'graph' ? 'tool-btn-active' : ''}`}
                >
                  Graph
                </button>
                <button
                  type="button"
                  onClick={() => setPanel('table')}
                  className={`tool-btn ${panel === 'table' ? 'tool-btn-active' : ''}`}
                >
                  Table
                </button>
                <button type="button" onClick={exportGraph} className="tool-btn" title="Download graph JSON">
                  Export
                </button>
                <button type="button" onClick={() => void copyCypher()} className="tool-btn" title="Copy Cypher">
                  Copy
                </button>
                <button type="button" onClick={() => void toggleFullscreen()} className="tool-btn">
                  Fullscreen
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowOptions((v) => !v)}
                    className={`tool-btn ${showOptions ? 'tool-btn-active' : ''}`}
                  >
                    Options ▾
                  </button>
                  {showOptions ? (
                    <div className="tool-menu">
                      <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-slate)]">
                        Panels
                      </p>
                      <label>
                        <input type="checkbox" checked={showCatalog} onChange={(e) => setShowCatalog(e.target.checked)} />
                        Query catalog
                      </label>
                      <label>
                        <input type="checkbox" checked={showInspector} onChange={(e) => setShowInspector(e.target.checked)} />
                        Details inspector
                      </label>
                      <label>
                        <input type="checkbox" checked={showCypher} onChange={(e) => setShowCypher(e.target.checked)} />
                        Cypher editor
                      </label>
                      <label>
                        <input type="checkbox" checked={showLegend} onChange={(e) => setShowLegend(e.target.checked)} />
                        Type legend
                      </label>
                      <p className="mt-1 border-t border-[var(--color-line)] px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-slate)]">
                        Graph
                      </p>
                      <label>
                        <input type="checkbox" checked={focusMode} onChange={(e) => setFocusMode(e.target.checked)} />
                        Focus rearrange on click
                      </label>
                      <label>
                        <input type="checkbox" checked={showEdgeLabels} onChange={(e) => setShowEdgeLabels(e.target.checked)} />
                        Edge labels
                      </label>
                      <label>
                        <input type="checkbox" checked={animateEdges} onChange={(e) => setAnimateEdges(e.target.checked)} />
                        Animate active edges
                      </label>
                      <label>
                        <input type="checkbox" checked={showMinimap} onChange={(e) => setShowMinimap(e.target.checked)} />
                        Mini map
                      </label>
                      <label>
                        <input type="checkbox" checked={showControls} onChange={(e) => setShowControls(e.target.checked)} />
                        Zoom controls
                      </label>
                      <label>
                        <input type="checkbox" checked={showBackground} onChange={(e) => setShowBackground(e.target.checked)} />
                        Dot background
                      </label>
                      <p className="mt-1 border-t border-[var(--color-line)] px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-slate)]">
                        Query
                      </p>
                      <label>
                        <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                        Compact Neo4j payload
                      </label>
                      <button
                        type="button"
                        className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-[var(--color-slate)] hover:bg-[var(--color-accent-soft)]"
                        onClick={() => setShowOptions(false)}
                      >
                        Close
                      </button>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void runCypherText(cypher, queries.find((q) => q.id === activeQueryId) ?? null, queryParams)
                  }
                  disabled={loading || !cypher.trim()}
                  className="btn-accent px-3 py-1 text-[11px] disabled:opacity-40"
                >
                  Run ▶
                </button>
                {showContractsLink ? (
                  <a href={contractsHref} className="btn-ghost px-2.5 py-1 text-[10px]">
                    Contracts
                  </a>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {!viewer && activeMeta?.code === 'Q2' ? (
          <div className="glass-soft flex flex-wrap items-center gap-1.5 border-b border-[var(--color-line)] px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-teal-dim)]">NATCO</span>
            {(natcos.length ? natcos : ['natco-de', 'natco-at', 'natco-hr', 'natco-hu', 'natco-pl']).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNatco(n)}
                className={`tool-btn ${queryParams.natco === n ? 'tool-btn-active' : ''}`}
              >
                {n.replace('natco-', '').toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}

        {!viewer && activeMeta?.code === 'Q3' && products.length > 0 ? (
          <div className="glass-soft flex flex-wrap items-center gap-1.5 border-b border-[var(--color-line)] px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-teal-dim)]">Product</span>
            {products
              .filter((p) => !p.scope || p.scope === 'global')
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProduct(p.id)}
                  className={`tool-btn ${
                    queryParams.productId === p.id || queryParams.productId.startsWith(`${p.id}-`)
                      ? 'tool-btn-active'
                      : ''
                  }`}
                >
                  {p.name}
                </button>
              ))}
            {products.some((p) => p.scope === 'natco') ? (
              <>
                <span className="mx-1 text-[10px] text-[var(--color-slate)]">NATCO</span>
                {products
                  .filter((p) => {
                    if (p.scope !== 'natco') return false
                    const global = products.find((g) => g.familyId === p.familyId && g.scope === 'global')
                    return !!global && (queryParams.productId === global.id || queryParams.productId.startsWith(`${global.id}-`))
                  })
                  .map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProduct(p.id)}
                      className={`tool-btn ${queryParams.productId === p.id ? 'tool-btn-active' : ''}`}
                    >
                      {p.natco?.replace('natco-', '').toUpperCase() || p.name}
                    </button>
                  ))}
              </>
            ) : null}
          </div>
        ) : null}

        {!viewer && showCypher ? (
          <div className="border-b border-[var(--color-line)] bg-[var(--color-paper-soft)] p-2">
            <textarea
              value={cypher}
              onChange={(e) => setCypher(e.target.value)}
              spellCheck={false}
              className="h-24 w-full resize-y rounded-lg border border-[var(--color-line)] bg-white p-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
            {error ? <p className="mt-1 text-[11px] text-amber-700">{error}</p> : null}
          </div>
        ) : error ? (
          <p className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">{error}</p>
        ) : null}

        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1 bg-[var(--color-canvas)]">
            {panel === 'graph' && (canGoBack || trailLabels.length > 0) ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2">
                <div className="pointer-events-auto glass flex max-w-full items-center gap-1.5 rounded-xl px-2 py-1.5">
                  <button
                    type="button"
                    onClick={goBackFocus}
                    disabled={!canGoBack}
                    className="tool-btn shrink-0 disabled:opacity-40"
                    title="Go back to previous focus"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(null)}
                    className={`tool-btn shrink-0 ${!selectedNodeId ? 'tool-btn-active' : ''}`}
                    title="Show full graph overview"
                  >
                    Overview
                  </button>
                  {trailLabels.length > 0 ? (
                    <nav
                      aria-label="Focus trail"
                      className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
                    >
                      {trailLabels.map((crumb, i) => {
                        const isCurrent = selectedNodeId === crumb.id && i === trailLabels.length - 1
                        return (
                          <span key={`${crumb.id}-${i}`} className="flex shrink-0 items-center gap-0.5">
                            {i > 0 ? (
                              <span className="px-0.5 text-[10px] text-[var(--color-mist)]" aria-hidden>
                                ›
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => jumpTrail(i)}
                              title={`${crumb.type}: ${crumb.label}`}
                              className={`max-w-[120px] truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                isCurrent
                                  ? 'tool-btn-active'
                                  : 'text-[var(--color-ink)] hover:bg-white/50'
                              }`}
                            >
                              {crumb.label}
                            </button>
                          </span>
                        )
                      })}
                    </nav>
                  ) : null}
                  {trailLabels.length > 1 ? (
                    <button
                      type="button"
                      onClick={clearTrail}
                      className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-[var(--color-mist)] hover:text-[var(--color-ink)]"
                      title="Clear focus trail"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {panel === 'table' && (health?.ok || graph.nodes.length > 0) ? (
              <div className="flex h-full flex-col">
                <div className="flex gap-1 border-b border-[var(--color-line)] bg-white px-2 py-1.5">
                  {(
                    [
                      ['result', 'Query rows'],
                      ['nodes', 'Graph nodes'],
                      ['edges', 'Graph edges'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTableTab(id)}
                      className={`rounded-md px-2.5 py-1 text-[10px] font-semibold ${
                        tableTab === id
                          ? 'bg-[var(--color-accent-soft)] text-[var(--color-teal-dim)]'
                          : 'text-[var(--color-slate)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1">{activeTable ? <DataTable table={activeTable} /> : null}</div>
              </div>
            ) : graph.nodes.length === 0 && !loading ? (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-[var(--color-slate)]">
                No graph nodes — open{' '}
                <button type="button" className="underline" onClick={() => setPanel('table')}>
                  Table
                </button>{' '}
                for this query
              </div>
            ) : (
              <ReactFlowProvider>
                <div className={canGoBack || trailLabels.length > 0 ? 'h-full pt-11' : 'h-full'}>
                  <GraphCanvas
                    graph={graph}
                    selectedId={selectedNodeId}
                    onSelect={onSelect}
                    focusMode={focusMode}
                    showEdgeLabels={showEdgeLabels}
                    showMinimap={showMinimap}
                    showControls={showControls}
                    showBackground={showBackground}
                    animateEdges={animateEdges}
                    fitToken={fitToken}
                    searchQuery={searchQuery}
                  />
                </div>
              </ReactFlowProvider>
            )}
            {showLegend && panel === 'graph' ? (
              <div className="pointer-events-none absolute bottom-3 left-3 z-20">
                <div className="glass pointer-events-auto rounded-xl px-3 py-2">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-slate)]">
                    Object types
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {(viewer
                      ? (['repo', 'dag', 'task', 'script', 'input_table', 'output_table', 'table'] as const)
                      : (Object.keys(typeMeta).slice(0, 10) as string[])
                    ).map((type) => {
                      const meta = typeMeta[type]
                      if (!meta) return null
                      return (
                        <div key={type} className="flex items-center gap-1.5 text-[10px] text-[var(--color-ink-soft)]">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{
                              background: hexToRgba(meta.tint, 0.35),
                              border: `1px solid ${hexToRgba(meta.tint, 0.45)}`,
                              boxShadow: `inset 0 0 0 1px ${hexToRgba(meta.tint, 0.15)}`,
                            }}
                          />
                          {meta.label}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {!viewer && showInspector ? (
            <div className="glass-soft w-[280px] shrink-0 border-l border-[var(--color-line)]">
              <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-slate)]">Details</p>
                <button type="button" className="tool-btn px-2 py-0.5 text-[10px]" onClick={() => setShowInspector(false)}>
                  Hide
                </button>
              </div>
              <Inspector graph={graph} selectedId={selectedNodeId} onSelectNeighbor={onSelect} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
