/** Discovery HITL — persisted via backend ReviewItem APIs (with session fallback). */

import { api } from "@/lib/api";

export type HitlDecision = "accepted" | "flagged";

export function hitlStorageKey(projectId: number | string, runId: number | string | null | undefined) {
  return `mirage_discovery_hitl_${projectId}_${runId || "none"}`;
}

export function loadHitlDecisions(
  projectId: number | string,
  runId: number | string | null | undefined
): Record<string, HitlDecision> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(hitlStorageKey(projectId, runId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveHitlDecisions(
  projectId: number | string,
  runId: number | string | null | undefined,
  decisions: Record<string, HitlDecision>
) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(hitlStorageKey(projectId, runId), JSON.stringify(decisions));
}

/** Load HITL decisions from backend (source of truth). */
export async function fetchHitlDecisions(
  projectId: number | string
): Promise<Record<string, HitlDecision>> {
  try {
    const data = await api<{ decisions: Record<string, HitlDecision> }>(
      `/projects/${projectId}/discovery/hitl`
    );
    return data?.decisions || {};
  } catch {
    return {};
  }
}

/** Persist HITL decisions to backend ReviewItems. Throws on API failure. */
export async function persistHitlDecisions(
  projectId: number | string,
  decisions: Record<string, HitlDecision>,
  agentRunId?: number | null
): Promise<Record<string, HitlDecision>> {
  const data = await api<{ decisions: Record<string, HitlDecision> }>(
    `/projects/${projectId}/discovery/hitl`,
    {
      method: "POST",
      body: JSON.stringify({
        decisions,
        agent_run_id: agentRunId || undefined,
      }),
    }
  );
  return data?.decisions || decisions;
}

export function findingKey(f: { object?: string }, index: number) {
  return `${String(f.object || "obj")}:${index}`;
}

/** Low-confidence findings that still need a human decision. */
export function pendingHitlKeys(
  findings: any[],
  decisions: Record<string, HitlDecision>
): string[] {
  const pending: string[] = [];
  findings.forEach((f, i) => {
    const c = Number(f.confidence);
    const conf = Number.isFinite(c) ? (c <= 1 ? c : c / 100) : 1;
    if (conf >= 0.8) return;
    const key = findingKey(f, i);
    if (!decisions[key]) pending.push(key);
  });
  return pending;
}
