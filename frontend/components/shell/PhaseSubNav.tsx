"use client";

import {
  SUITE_GALLERY_HREF,
  getPhase,
  getToolByPhase,
  phaseHref,
  type PhaseId,
  type PhaseView,
} from "@/lib/phases";
import type { PageHeaderStepNav } from "@/components/shell/PageHeader";

type StepRef = {
  phaseId: PhaseId;
  view: PhaseView;
  stageName: string;
};

/**
 * Build step-nav for PageHeader — pages **within the current tool only**.
 * Crossing tools goes through Suite Gallery (not a direct jump to Decide/Align/…).
 */
export function buildPhaseStepNav(
  phaseId: PhaseId,
  viewId?: string
): PageHeaderStepNav | null {
  const resolvedPhaseId: PhaseId =
    phaseId === "4_metadata" ? "3_mapping" : phaseId;
  const phase = getPhase(resolvedPhaseId);
  if (!phase || phase.views.length === 0) return null;

  const tool = getToolByPhase(resolvedPhaseId);
  const stageName = tool?.stageName || phase.short;

  const journey: StepRef[] = phase.views.map((view) => ({
    phaseId: resolvedPhaseId,
    view,
    stageName,
  }));

  const activeViewId = viewId || phase.defaultView;
  const journeyIdx = journey.findIndex((s) => s.view.id === activeViewId);
  const safeIdx = journeyIdx >= 0 ? journeyIdx : 0;
  const current = journey[safeIdx];

  const prevView = safeIdx > 0 ? journey[safeIdx - 1] : null;
  const nextView =
    safeIdx < journey.length - 1 ? journey[safeIdx + 1] : null;

  const toolHome = tool
    ? phaseHref(resolvedPhaseId, tool.entryView)
    : phaseHref(resolvedPhaseId);

  return {
    phaseShort: stageName,
    phaseHref: toolHome,
    currentLabel: current.view.label,
    group: current.view.group,
    step: safeIdx + 1,
    total: journey.length,
    prev: prevView
      ? {
          label: prevView.view.label,
          href: phaseHref(prevView.phaseId, prevView.view.id),
        }
      : {
          label: "Stage map",
          href: SUITE_GALLERY_HREF,
        },
    next: nextView
      ? {
          label: nextView.view.label,
          href: phaseHref(nextView.phaseId, nextView.view.id),
        }
      : {
          label: "Stage map",
          href: SUITE_GALLERY_HREF,
        },
  };
}
