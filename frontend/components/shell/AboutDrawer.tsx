"use client";

import { PHASE_ABOUT, PRODUCT_ABOUT } from "@/lib/phaseAbout";
import { getPhase, type PhaseId } from "@/lib/phases";

type Props = {
  open: boolean;
  onClose: () => void;
  phaseId?: string | null;
};

export function AboutDrawer({ open, onClose, phaseId }: Props) {
  if (!open) return null;

  const phase = phaseId ? getPhase(phaseId) : undefined;
  const about =
    phaseId && phaseId in PHASE_ABOUT
      ? PHASE_ABOUT[phaseId as PhaseId]
      : null;

  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l border-brand-line bg-white">
      <div className="flex h-12 items-center justify-between border-b border-brand-line px-3">
        <h2 className="text-sm font-semibold text-brand-ink">
          {phase ? `About · Phase ${phase.number}` : "About"}
        </h2>
        <button type="button" className="btn-ghost !py-1" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3 text-sm">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
            {PRODUCT_ABOUT.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-brand-slate">
            {PRODUCT_ABOUT.body}
          </p>
        </section>

        {phase && about ? (
          <section className="space-y-3 border-t border-brand-line pt-3">
            <div>
              <h3 className="font-semibold text-brand-ink">
                {phase.number}. {phase.title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-brand-slate">
                {about.summary}
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                Why it matters
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-brand-slate">{about.why}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                How to use this phase
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-relaxed text-brand-slate">
                {about.how.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg bg-tm-gray-50 p-2.5 text-xs text-brand-slate">
              <strong className="text-brand-ink">Exit criterion:</strong> {about.exit}
            </div>
          </section>
        ) : (
          <section className="border-t border-brand-line pt-3 text-xs text-brand-muted">
            Open a phase from the left nav to see phase-specific guidance here.
          </section>
        )}
      </div>
    </aside>
  );
}
