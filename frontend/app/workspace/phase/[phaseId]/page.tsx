"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  getPhase,
  phaseHref,
  resolveDiscoveryView,
  type PhaseId,
} from "@/lib/phases";
import { PhaseWorkspace } from "@/components/workspace/PhaseWorkspace";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

export default function PhaseHubPage() {
  const params = useParams();
  const router = useRouter();
  const ws = useWorkspace();
  const phaseId = String(params.phaseId || "") as PhaseId;
  const phase = getPhase(phaseId);

  useEffect(() => {
    if (!phase) return;
    // Metadata folded into Align
    if (phaseId === "4_metadata") {
      router.replace(phaseHref("3_mapping", "entities"));
      return;
    }
    if (phase.views.length > 1) {
      const view =
        phaseId === "1_discovery"
          ? resolveDiscoveryView(ws.project, {
              inventoryCount: ws.inventory?.length || 0,
              estateBound: !!(
                ws.estate?.exists ||
                ws.project?.sample_slug ||
                ws.project?.legacy_root
              ),
            })
          : phase.defaultView;
      router.replace(phaseHref(phaseId, view));
    }
  }, [phase, phaseId, router, ws.project, ws.inventory, ws.estate]);

  if (!phase) {
    return <div className="p-5 text-sm text-bad">Unknown phase: {phaseId}</div>;
  }

  if (phase.views.length > 1) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-brand-muted">
        Opening {phase.short}…
      </div>
    );
  }

  return <PhaseWorkspace phaseId={phaseId} hub />;
}
