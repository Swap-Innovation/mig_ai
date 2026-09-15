"use client";

import { usePathname } from "next/navigation";
import { DiscoveryTerminal } from "@/components/phases/discovery/DiscoveryTerminal";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

const PILOT_SUGGESTIONS = [
  "What's the Pilot status?",
  "Summarize Reviews inbox",
  "Is Migrate to Test ready?",
  "Did dual pipeline / reconcile pass?",
];

/** Project-scoped Mirage assistant — live runs + chat for the active estate only. */
export function ProjectAgentChat() {
  const pathname = usePathname() || "";
  const { project, agentChatLines, agentChatActive, postAgentChatMessage } =
    useWorkspace();

  if (!project?.id) return null;

  const onPilot =
    pathname.includes("/tools/prove") ||
    pathname.includes("/phase/5_pilot") ||
    project.phase === "5_pilot_product";

  const scopedLines = agentChatLines.filter(
    (row) => !row.projectId || Number(row.projectId) === Number(project.id)
  );

  return (
    <DiscoveryTerminal
      key={project.id}
      title="Mirage"
      subtitle={
        agentChatActive
          ? `${project.name} · live`
          : onPilot
            ? `${project.name} · Pilot`
            : `${project.name} · this estate only`
      }
      lines={scopedLines}
      active={agentChatActive}
      onSend={(text) =>
        postAgentChatMessage(text, onPilot ? { phaseHint: "pilot" } : undefined)
      }
      suggestions={onPilot ? PILOT_SUGGESTIONS : undefined}
      emptyHint={
        onPilot
          ? `Pilot updates for “${project.name}” stream here — Reviews, Product, Migrate to Test, Dual pipeline, and Reconcile.`
          : `Chat and live agents for “${project.name}” only — switching estates loads that project’s transcript.`
      }
    />
  );
}
