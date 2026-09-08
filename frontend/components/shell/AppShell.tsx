"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { TopBar } from "./TopBar";
import { LeftNav } from "./LeftNav";
import { ActivityDrawer } from "./ActivityDrawer";
import { AboutDrawer } from "./AboutDrawer";
import type { Session } from "@/lib/api";

type Props = {
  session: Session;
  project: any | null;
  msg?: string;
  onSignOut: () => void;
  activity?: React.ReactNode;
  projectSwitcher?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({
  session,
  project,
  msg,
  onSignOut,
  activity,
  projectSwitcher,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const pathname = usePathname();
  const phaseMatch = pathname?.match(/\/workspace\/phase\/([^/]+)/);
  const phaseId = phaseMatch?.[1] || null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-tm-gray-50">
      <TopBar
        session={session}
        project={project}
        msg={msg}
        onSignOut={onSignOut}
        projectSwitcher={projectSwitcher}
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
      <div className="flex min-h-0 flex-1">
        <LeftNav
          project={project}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
        <main className="ws-canvas">{children}</main>
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
    </div>
  );
}
