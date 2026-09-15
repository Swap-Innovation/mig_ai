"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LeftNav } from "./LeftNav";
import { ActivityDrawer } from "./ActivityDrawer";
import { AboutDrawer } from "./AboutDrawer";
import { ProjectAgentChat } from "@/components/workspace/ProjectAgentChat";
import type { Session } from "@/lib/api";
import { getTool } from "@/lib/phases";

type Props = {
  session: Session;
  project: any | null;
  msg?: string;
  onSignOut: () => void;
  activity?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({
  session,
  project,
  msg,
  onSignOut,
  activity,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const pathname = usePathname();
  const toolMatch = pathname?.match(/\/workspace\/tools\/([^/]+)/);
  const phaseMatch = pathname?.match(/\/workspace\/phase\/([^/]+)/);
  const phaseId =
    phaseMatch?.[1] ||
    (toolMatch?.[1] ? getTool(toolMatch[1])?.phaseId : null) ||
    null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f2f2f7]">
      <LeftNav
        session={session}
        project={project}
        msg={msg}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onSignOut={onSignOut}
        activityOpen={activityOpen}
        onToggleActivity={
          activity
            ? () => {
                setActivityOpen((v) => !v);
                setAboutOpen(false);
              }
            : undefined
        }
        aboutOpen={aboutOpen}
        onToggleAbout={() => {
          setAboutOpen((v) => !v);
          setActivityOpen(false);
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <main className="ws-canvas">{children}</main>
        <ProjectAgentChat />
      </div>
      <AboutDrawer
        open={aboutOpen}
        phaseId={phaseId}
        onClose={() => setAboutOpen(false)}
      />
      {activity ? (
        <ActivityDrawer open={activityOpen} onClose={() => setActivityOpen(false)}>
          {activity}
        </ActivityDrawer>
      ) : null}
    </div>
  );
}
