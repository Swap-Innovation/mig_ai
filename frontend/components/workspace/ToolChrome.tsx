"use client";

import Link from "next/link";
import {
  GALLERY_TOOLS,
  activeWaveSummary,
  type SuiteToolDef,
} from "@/lib/phases";

type Props = {
  tool: SuiteToolDef;
  project?: any;
};

export function ToolChrome({ tool, project }: Props) {
  const galleryIdx = GALLERY_TOOLS.findIndex((t) => t.id === tool.id);
  const badge = galleryIdx >= 0 ? galleryIdx + 1 : tool.sequence;
  const wave = activeWaveSummary(project);
  const showWave =
    wave &&
    ["verdict", "compass", "forge", "prove", "transit", "sunset"].includes(tool.id);

  return (
    <div className="tool-chrome">
      <nav className="tool-chrome-crumb" aria-label="Suite breadcrumb">
        <Link href="/workspace" className="hover:text-brand-ink">
          Dashboard
        </Link>
        <span className="text-brand-line">/</span>
        <Link href="/workspace/gallery" className="hover:text-brand-ink">
          Stage map
        </Link>
        <span className="text-brand-line">/</span>
        <span className="text-brand-ink">{tool.stageName}</span>
      </nav>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="tool-chrome-badge">{badge}</span>
        <h1 className="truncate text-sm font-semibold text-brand-ink">
          {tool.stageName}
          <span className="mx-1.5 font-normal text-brand-muted">·</span>
          <span className="font-medium">{tool.productName}</span>
        </h1>
        {showWave ? (
          <span className="badge-magenta">
            Wave · {wave.name}
            {wave.object_count ? ` · ${wave.object_count} objs` : ""}
          </span>
        ) : null}
        <span className="hidden text-xs text-brand-muted sm:inline">
          {tool.tagline}
        </span>
      </div>
    </div>
  );
}
