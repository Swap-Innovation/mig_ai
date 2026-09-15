/** Standalone App Store catalog — not part of the estate journey. */

import {
  FORGE_ACCELERATOR_TOOLS,
  FORGE_MIGRATE_TOOLS,
} from "@/lib/phases";

export const APP_SANDBOX_SLUG = "mirage-app-sandbox";
export const APP_SANDBOX_NAME = "App Store sandbox";

export type AppStoreSection = "discover" | "convert" | "accelerate";

export type AppStoreAppId =
  | "discovery"
  | "tables"
  | "scripts"
  | "pipelines"
  | "data"
  | "reports"
  | "cataloguer"
  | "composer"
  | "transform"
  | "contracts";

export type AppStoreApp = {
  id: AppStoreAppId;
  name: string;
  shortName: string;
  tagline: string;
  focus: string;
  capabilities: string[];
  section: AppStoreSection;
  tone: string;
  /** Existing tool surface to embed */
  embed: {
    kind: "discovery" | "forge_convert" | "forge_accel";
    view: string;
  };
};

const TONES: Record<string, string> = {
  discovery: "forge-pad-tone-magenta",
  tables: "forge-pad-tone-blue",
  scripts: "forge-pad-tone-indigo",
  pipelines: "forge-pad-tone-violet",
  reports: "forge-pad-tone-rose",
  data: "forge-pad-tone-teal",
  cataloguer: "forge-pad-tone-cyan",
  composer: "forge-pad-tone-magenta",
  transform: "forge-pad-tone-amber",
  contracts: "forge-pad-tone-slate",
};

export const APP_STORE_SECTION_LABEL: Record<AppStoreSection, string> = {
  discover: "Discover",
  convert: "Convert",
  accelerate: "Accelerate",
};

export const APP_STORE_APPS: AppStoreApp[] = [
  {
    id: "discovery",
    name: "Discovery App",
    shortName: "Discovery",
    tagline: "Bind estates, scan inventory, lineage, and HITL review",
    focus: "Standalone discovery scan without the full Mirage journey",
    capabilities: ["Estate bind", "Activity scan", "Profiling", "Lineage"],
    section: "discover",
    tone: TONES.discovery,
    embed: { kind: "discovery", view: "sources" },
  },
  ...FORGE_MIGRATE_TOOLS.map((t) => ({
    id: t.id as AppStoreAppId,
    name: `${t.name} App`,
    shortName: t.shortName,
    tagline: t.tagline,
    focus: t.focus,
    capabilities: t.capabilities,
    section: "convert" as const,
    tone: TONES[t.id] || "forge-pad-tone-blue",
    embed: { kind: "forge_convert" as const, view: t.viewId },
  })),
  ...FORGE_ACCELERATOR_TOOLS.map((t) => ({
    id: t.id as AppStoreAppId,
    name: t.name,
    shortName: t.shortName,
    tagline: t.tagline,
    focus: t.focus,
    capabilities: t.capabilities,
    section: "accelerate" as const,
    tone: TONES[t.id] || "forge-pad-tone-cyan",
    embed: { kind: "forge_accel" as const, view: t.viewId },
  })),
];

export function getAppStoreApp(id: string): AppStoreApp | undefined {
  return APP_STORE_APPS.find((a) => a.id === id);
}

export function appStoreHref(appId?: string): string {
  return appId ? `/workspace/apps/${appId}` : "/workspace/apps";
}

export function isAppSandboxProject(p: {
  sample_slug?: string | null;
  name?: string | null;
} | null): boolean {
  if (!p) return false;
  return (
    String(p.sample_slug || "") === APP_SANDBOX_SLUG ||
    String(p.name || "") === APP_SANDBOX_NAME
  );
}

export function appsBySection(
  section: AppStoreSection
): AppStoreApp[] {
  return APP_STORE_APPS.filter((a) => a.section === section);
}
