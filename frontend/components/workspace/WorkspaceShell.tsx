"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { ProjectSwitcher } from "@/components/workspace/ProjectSwitcher";
import { AgentRunsPanel } from "@/components/AgentRunsPanel";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { session, project, msg, signOut, agentRuns, pollAgents } = useWorkspace();
  const router = useRouter();

  return (
    <AppShell
      session={session}
      project={project}
      msg={msg}
      projectSwitcher={<ProjectSwitcher />}
      onSignOut={() => {
        signOut();
        router.replace("/");
      }}
      activity={
        <AgentRunsPanel
          title="Recent agent runs"
          runs={agentRuns}
          onPoll={pollAgents}
          emptyHint="Agent activity appears here as runs execute."
        />
      }
    >
      {children}
    </AppShell>
  );
}
