export type KgNode = {
  id: string
  label: string
  subtitle: string
  type: string
  layer: string
  natco: string
  contract_ref: string
  hub?: boolean
  labels?: string[]
  properties?: Record<string, unknown>
  position: { x: number; y: number }
  neo4jId?: string
}

export type KgEdge = {
  id: string
  from: string
  to: string
  predicate: string
}

export type KgTable = {
  columns: string[]
  rows: Record<string, unknown>[]
}

export type KgRunResult = {
  source: 'neo4j'
  mode: 'graph' | 'table' | 'both'
  cypher?: string
  title?: string
  description?: string
  queryId?: string
  code?: string
  sourceFile?: string
  group?: string
  view?: string
  params?: Record<string, string>
  compact?: boolean
  nodeCount: number
  edgeCount: number
  rowCount?: number
  nodes: KgNode[]
  edges: KgEdge[]
  table?: KgTable
  graphTables?: {
    nodes: KgTable
    edges: KgTable
  }
  hasGraph?: boolean
  hasTable?: boolean
  error?: string
}

export type KgHealth = {
  ok: boolean
  neo4j: boolean
  error?: string
  queryCount?: number
}

export type KgQueryMeta = {
  id: string
  code: string
  title: string
  description: string
  sourceFile: string
  group: string
  resultHint: string
}

export type KgQueryGroup = {
  id: string
  label: string
}
