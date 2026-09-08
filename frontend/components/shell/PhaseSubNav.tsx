"use client";

import {
  NAV_PHASES,
  getPhase,
  phaseHref,
  type PhaseId,
  type PhaseView,
} from "@/lib/phases";
import type { PageHeaderStepNav } from "@/components/shell/PageHeader";

type StepRef = {
  phaseId: PhaseId;
  view: PhaseView;
  phaseShort: string;
};

/** Flat Discover → Retire journey used for header ← / →. */
export function deliverySteps(): StepRef[] {
  const steps: StepRef[] = [];
  for (const phase of NAV_PHASES) {
    for (const view of phase.views) {
      steps.push({
        phaseId: phase.id as PhaseId,
        view,
        phaseShort: phase.short,
      });
    }
  }
  return steps;
}

function stepLabel(step: StepRef, fromPhaseId: PhaseId): string {
  if (step.phaseId === fromPhaseId) return step.view.label;
  return `${step.phaseShort} · ${step.view.label}`;
}

/**
 * Build step-nav props for PageHeader.
 * Prev/next follow the full Discover → Retire journey so every page has a
 * forward path (gate CTAs in the page body remain for approval actions).
 * Step N of M is the journey position across all delivery spaces.
 */
export function buildPhaseStepNav(
  phaseId: PhaseId,
  viewId?: string
): PageHeaderStepNav | null {
  const resolvedPhaseId: PhaseId =
    phaseId === "4_metadata" ? "3_mapping" : phaseId;
  const phase = getPhase(resolvedPhaseId);
  if (!phase) return null;

  // Mobilisation / hidden spaces still get local paging when opened directly
  const journey = NAV_PHASES.some((p) => p.id === resolvedPhaseId)
    ? deliverySteps()
    : phase.views.map((view) => ({
        phaseId: resolvedPhaseId,
        view,
        phaseShort: phase.short,
      }));

  if (journey.length <= 1) return null;

  const activeViewId = viewId || phase.defaultView;
  const journeyIdx = journey.findIndex(
    (s) => s.phaseId === resolvedPhaseId && s.view.id === activeViewId
  );
  const safeIdx = journeyIdx >= 0 ? journeyIdx : 0;
  const current = journey[safeIdx];

  const prevStep = safeIdx > 0 ? journey[safeIdx - 1] : null;
  const nextStep =
    safeIdx < journey.length - 1 ? journey[safeIdx + 1] : null;

  return {
    phaseShort: phase.short,
    phaseHref: phaseHref(resolvedPhaseId),
    currentLabel: current.view.label,
    group: current.view.group,
    step: safeIdx + 1,
    total: journey.length,
    prev: prevStep
      ? {
          label: stepLabel(prevStep, resolvedPhaseId),
          href: phaseHref(prevStep.phaseId, prevStep.view.id),
        }
      : null,
    next: nextStep
      ? {
          label: stepLabel(nextStep, resolvedPhaseId),
          href: phaseHref(nextStep.phaseId, nextStep.view.id),
        }
      : null,
  };
}
