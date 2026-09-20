import { PHASES, SUITE_TOOLS } from "@/lib/phases";

/** All suite tool + view combinations for static export. */
export function toolViewStaticParams(): { toolId: string; view: string }[] {
  const out: { toolId: string; view: string }[] = [];
  for (const tool of SUITE_TOOLS) {
    const phase = PHASES.find((p) => p.id === tool.phaseId);
    if (!phase) continue;
    for (const view of phase.views) {
      out.push({ toolId: tool.id, view: view.id });
    }
  }
  return out;
}

export function toolStaticParams(): { toolId: string }[] {
  return SUITE_TOOLS.map((t) => ({ toolId: t.id }));
}

export function phaseViewStaticParams(): { phaseId: string; view: string }[] {
  const out: { phaseId: string; view: string }[] = [];
  for (const phase of PHASES) {
    for (const view of phase.views) {
      out.push({ phaseId: phase.id, view: view.id });
    }
  }
  return out;
}

export function phaseStaticParams(): { phaseId: string }[] {
  return PHASES.map((p) => ({ phaseId: p.id }));
}

/** Placeholder app ids for static export of /workspace/apps/[appId]. */
export function appStaticParams(): { appId: string }[] {
  return [
    { appId: "demo" },
    { appId: "atlas" },
    { appId: "forge" },
    { appId: "cataloguer" },
    { appId: "composer" },
    { appId: "transform" },
    { appId: "contracts" },
  ];
}
