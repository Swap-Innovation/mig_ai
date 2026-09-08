import type { KgHealth, KgQueryGroup, KgQueryMeta, KgRunResult } from '@/lib/kg/kgTypes'

export async function fetchKgHealth(signal?: AbortSignal): Promise<KgHealth> {
  try {
    const res = await fetch('/api/kg/health', { signal })
    if (!res.ok) return { ok: false, neo4j: false, error: `HTTP ${res.status}` }
    return (await res.json()) as KgHealth
  } catch (err) {
    return { ok: false, neo4j: false, error: err instanceof Error ? err.message : 'unreachable' }
  }
}

export async function fetchKgQueries(signal?: AbortSignal): Promise<{
  queries: KgQueryMeta[]
  groups: KgQueryGroup[]
}> {
  const res = await fetch('/api/kg/queries', { signal })
  if (!res.ok) throw new Error(`Failed to load query catalog (${res.status})`)
  return (await res.json()) as { queries: KgQueryMeta[]; groups: KgQueryGroup[] }
}

export async function fetchKgQuery(id: string, signal?: AbortSignal): Promise<{ cypher: string } & KgQueryMeta> {
  const res = await fetch(`/api/kg/queries/${encodeURIComponent(id)}`, { signal })
  if (!res.ok) throw new Error(`Query not found (${res.status})`)
  return (await res.json()) as { cypher: string } & KgQueryMeta
}

export async function runKgQueryId(
  queryId: string,
  opts?: {
    mode?: 'auto' | 'graph' | 'table'
    compact?: boolean
    params?: Record<string, unknown>
    signal?: AbortSignal
  },
): Promise<KgRunResult> {
  const res = await fetch('/api/kg/queries/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      queryId,
      mode: opts?.mode ?? 'auto',
      compact: opts?.compact,
      params: opts?.params ?? {},
    }),
    signal: opts?.signal,
  })
  const data = (await res.json()) as KgRunResult & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Run failed (${res.status})`)
  return data
}

export async function runKgCypher(
  cypher: string,
  opts?: {
    mode?: 'auto' | 'graph' | 'table'
    compact?: boolean
    params?: Record<string, unknown>
    signal?: AbortSignal
  },
): Promise<KgRunResult> {
  const res = await fetch('/api/kg/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cypher,
      params: opts?.params ?? {},
      mode: opts?.mode ?? 'auto',
      compact: opts?.compact !== false,
    }),
    signal: opts?.signal,
  })
  const data = (await res.json()) as KgRunResult & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `Run failed (${res.status})`)
  return data
}
