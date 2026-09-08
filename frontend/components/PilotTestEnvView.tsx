"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { phaseHref } from "@/lib/phases";

type Props = {
  project: any;
  products: any[];
  busy: boolean;
  embedded?: boolean;
  onPromoteTestEnv: (productIds: number[]) => void | Promise<any>;
};

export function PilotTestEnvView({
  project,
  products,
  busy,
  embedded = false,
  onPromoteTestEnv,
}: Props) {
  const router = useRouter();
  const ready = !!project?.test_env_ready;
  const testEnv = project?.test_env || {};
  const sdps = useMemo(
    () =>
      products.filter((p) => String(p.product_tier || "").toLowerCase() === "sdp"),
    [products]
  );
  const [selected, setSelected] = useState<number[]>(() =>
    (testEnv.product_ids || sdps.map((p: any) => p.id)).filter(Boolean)
  );

  const checks = [
    {
      id: "build",
      label: "Build conversion pack approved",
      done: !!project?.build_approved,
    },
    {
      id: "align",
      label: "Align metadata complete",
      done: !!project?.metadata_complete,
    },
    {
      id: "sdps",
      label: "SDP catalog available for promotion",
      done: sdps.length > 0,
    },
    {
      id: "spoke",
      label: "Landing / products spoke bound (or demo stub)",
      done: true,
    },
  ];
  const gatesOk = checks.every((c) => c.done);

  const toggle = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const shell = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
    : "space-y-4";

  return (
    <div className={shell}>
      <header
        className={
          embedded
            ? "shrink-0 border-b border-tm-gray-200 px-4 py-3"
            : "card !py-4"
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-tm-ink">
              Migrate to Test environment
            </h3>
            <p className="mt-1 max-w-3xl text-sm text-tm-gray-600">
              Promote selected source-aligned data products into the{" "}
              <strong>test</strong> environment so legacy and migrated pipelines
              can run in parallel (dual-run). Complete this before{" "}
              <strong>Run dual pipeline</strong>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ready && (
              <button
                type="button"
                className="btn text-xs"
                onClick={() =>
                  router.push(phaseHref("5_pilot_product", "pipeline"))
                }
              >
                Continue → Run dual pipeline
              </button>
            )}
            <button
              type="button"
              className="btn text-xs"
              disabled={busy || !gatesOk || selected.length === 0}
              title={
                !gatesOk
                  ? "Complete Align + Build first"
                  : selected.length === 0
                    ? "Select at least one SDP"
                    : ready
                      ? "Re-promote to test"
                      : "Promote selected SDPs to test"
              }
              onClick={() => void onPromoteTestEnv(selected)}
            >
              {ready ? "Re-promote to Test" : "Promote to Test"}
            </button>
          </div>
        </div>
        {ready ? (
          <p className="mt-2 text-xs text-good">
            Test environment ready
            {testEnv.promoted_at ? ` · ${testEnv.promoted_at}` : ""}
            {testEnv.environment ? ` · env ${testEnv.environment}` : " · env test"}
            {(testEnv.product_ids || []).length
              ? ` · ${(testEnv.product_ids || []).length} product(s)`
              : ""}
          </p>
        ) : (
          <p className="mt-2 text-xs text-warn">
            Not promoted yet — dual pipeline stays gated until Test is ready.
          </p>
        )}
      </header>

      <div
        className={
          embedded ? "min-h-0 flex-1 space-y-4 overflow-auto p-4" : "space-y-4"
        }
      >
        <section className="rounded-xl border border-tm-gray-200 bg-white p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
            Readiness checklist
          </h4>
          <ul className="mt-3 space-y-2">
            {checks.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg bg-tm-gray-50 px-3 py-2 text-sm"
              >
                <span className={c.done ? "text-tm-ink" : "text-tm-gray-500"}>
                  {c.label}
                </span>
                <span className={c.done ? "badge-success" : "badge-neutral"}>
                  {c.done ? "ready" : "open"}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-tm-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-tm-ink">
                SDPs to promote
              </h4>
              <p className="text-xs text-tm-gray-500">
                These land in test for dual-run against legacy extracts.
              </p>
            </div>
            <span className="text-[11px] text-tm-gray-500">
              {selected.length} selected
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {sdps.map((p) => {
              const on = selected.includes(p.id);
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-tm-gray-200 px-3 py-2 hover:border-tm-magenta/30">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={on}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-tm-ink">
                        {p.name}
                      </span>
                      <span className="block font-mono text-[11px] text-tm-gray-500">
                        {p.dataset_name}
                      </span>
                      <span className="mt-1 inline-flex gap-2 text-[10px] text-tm-gray-500">
                        <span className="badge-neutral capitalize">{p.status}</span>
                        <span>SoR {p.system_of_record || "—"}</span>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {!sdps.length && (
              <li className="text-sm text-tm-gray-500">
                No SDPs in catalog yet — open Product / accelerators first.
              </li>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-tm-gray-200 bg-tm-gray-50 p-4 text-sm text-tm-gray-600">
          <h4 className="text-sm font-semibold text-tm-ink">What happens next</h4>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li>Promote SDPs into the shared test landing / products spoke.</li>
            <li>
              Open <strong>Run dual pipeline</strong> to execute legacy + migrated
              paths side by side.
            </li>
            <li>
              Use <strong>Reconcile</strong> to compare outputs within tolerance.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
