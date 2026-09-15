"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  alignViewFromMetadata,
  getToolByPhase,
  phaseHref,
  toolHref,
  type PhaseId,
} from "@/lib/phases";

/** Legacy /workspace/phase/* → /workspace/tools/* */
export function LegacyPhaseRedirect() {
  const params = useParams();
  const router = useRouter();
  const rawPhaseId = String(params.phaseId || "") as PhaseId;
  const rawView = params.view ? String(params.view) : undefined;

  useEffect(() => {
    const phaseId: PhaseId =
      rawPhaseId === "4_metadata" ? "3_mapping" : rawPhaseId;
    const view =
      rawPhaseId === "4_metadata" ? alignViewFromMetadata(rawView) : rawView;
    const tool = getToolByPhase(phaseId);
    if (tool) {
      router.replace(toolHref(tool.id, view || tool.entryView));
    } else {
      router.replace(phaseHref(phaseId, view));
    }
  }, [rawPhaseId, rawView, router]);

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-brand-muted">
      Opening suite tool…
    </div>
  );
}
