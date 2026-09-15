"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentRunsPanel } from "@/components/AgentRunsPanel";
import {
  ForgeThemePanel,
  ForgeThemeShell,
} from "@/components/workspace/ForgeThemeShell";
import {
  FORGE_ACCELERATOR_TASKS,
  FORGE_ACCELERATOR_TOOLS,
  getForgeAcceleratorTool,
  toolHref,
  type ForgeAcceleratorTool,
} from "@/lib/phases";
import { appStoreHref } from "@/lib/appStore";
import { api } from "@/lib/api";

type Props = {
  project: any;
  view: string;
  buildApproved: boolean;
  metadataComplete: boolean;
  agentRuns: any[];
  products: any[];
  busy: boolean;
  msg: string;
  onRunAgent: (task: string, payload: any) => void | Promise<any>;
  onPollAgents: () => void;
  standalone?: boolean;
};

function AcceleratorCard({
  tool,
  last,
  running,
  disabled,
  disableReason,
  showOpen = true,
  onRun,
}: {
  tool: ForgeAcceleratorTool;
  last?: any;
  running: boolean;
  disabled: boolean;
  disableReason: string;
  showOpen?: boolean;
  onRun: () => void;
}) {
  return (
    <article className="forge-theme-panel forge-theme-panel-pad">
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="suite-tool-seq">{tool.sequence}</span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-500">
              Accelerator · {tool.toolLabel}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-brand-ink">{tool.name}</h2>
              {last ? (
                <span className="badge-neutral">{last.status}</span>
              ) : (
                <span className="badge-neutral">Not run</span>
              )}
              {last?.confidence != null ? (
                <span className="badge-magenta">
                  conf {Math.round((last.confidence || 0) * 100)}%
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-brand-muted">{tool.tagline}</p>
            <p className="mt-1 text-xs text-brand-muted">{tool.focus}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tool.capabilities.map((c) => (
                <li key={c} className="badge-neutral">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          {showOpen ? (
            <Link
              href={toolHref("forge", tool.viewId)}
              className="btn-secondary text-xs text-center"
            >
              Open
            </Link>
          ) : null}
          <button
            type="button"
            className="btn text-xs"
            disabled={disabled}
            title={disableReason}
            onClick={onRun}
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ForgeAcceleratorWorkbench({
  project,
  view,
  buildApproved,
  metadataComplete: _metadataComplete,
  agentRuns,
  products,
  busy,
  msg,
  onRunAgent,
  onPollAgents,
  /** Hide journey chrome links when launched from App Store */
  standalone = false,
}: Props) {
  const product = products[0] || null;
  const focused =
    view === "accelerators" ? null : getForgeAcceleratorTool(view) || null;

  const [accelRun, setAccelRun] = useState<any | null>(null);
  const accelActive =
    !!accelRun &&
    (accelRun.status === "queued" ||
      accelRun.status === "running" ||
      Number(accelRun.id) < 0);

  const accelDone = [
    "succeeded",
    "success",
    "completed",
    "complete",
    "approved",
  ].includes(String(accelRun?.status || "").toLowerCase());

  useEffect(() => {
    const isAccel = (task: string) => FORGE_ACCELERATOR_TASKS.includes(task);
    if (accelRun && Number(accelRun.id) < 0) return;
    if (!accelRun?.id) {
      const latest = focused
        ? agentRuns.find((r) => r.task === focused.taskId)
        : agentRuns.find((r) => isAccel(r.task));
      if (latest) setAccelRun(latest);
      return;
    }
    const fresh = agentRuns.find((r) => r.id === accelRun.id);
    if (fresh) setAccelRun(fresh);
  }, [agentRuns, accelRun?.id, focused?.taskId]);

  useEffect(() => {
    if (!accelActive || !accelRun?.id || Number(accelRun.id) < 0) return;
    let cancelled = false;
    const id = window.setInterval(() => {
      if (cancelled) return;
      void onPollAgents();
      void api(`/projects/${project.id}/agents/runs/${accelRun.id}`)
        .then((row: any) => {
          if (!cancelled && row) setAccelRun(row);
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [accelActive, accelRun?.id, project?.id, onPollAgents]);

  function runTool(tool: ForgeAcceleratorTool) {
    // Accelerators are always runnable — not gated on Build pack approval.
    const payload =
      tool.defaultPayload === null
        ? {
            candidate_contract: product?.contract || {
              name: "party_customer_account",
              version: "0.1.0",
            },
          }
        : { ...(tool.defaultPayload || {}) };
    setAccelRun({
      id: -1,
      task: tool.taskId,
      status: "queued",
      steps: [
        {
          name: "terminal.log",
          status: "running",
          message: `▶ ${tool.toolLabel} · starting ${tool.name}`,
          detail: {
            kind: "terminal",
            agent: tool.toolLabel.replace(/\s+/g, ""),
          },
        },
      ],
    });
    void Promise.resolve(onRunAgent(tool.taskId, payload))
      .then((runRow: any) => {
        if (runRow?.id) setAccelRun(runRow);
      })
      .catch(() => {
        setAccelRun((prev: any) =>
          prev && Number(prev.id) < 0 ? null : prev
        );
      });
  }

  const disableReason = accelActive
    ? "Wait for the current accelerator to finish"
    : busy
      ? "Another workspace action is running"
      : "";

  const tools = focused ? [focused] : FORGE_ACCELERATOR_TOOLS;

  return (
    <ForgeThemeShell
      projectName={project?.name}
      title={focused ? focused.name : "Accelerators"}
      subtitle="Accelerate"
      meta={
        focused
          ? focused.focus
          : "Catalogue sources, compose products, generate transforms, publish contracts"
      }
      category="accelerate"
      packApproved={buildApproved}
      fill
      banner={
        <>
          {msg ? <div className="forge-theme-banner is-info">{msg}</div> : null}
          {accelDone && focused ? (
            <div className="forge-theme-banner is-good">
              {focused.name} finished
              {standalone
                ? " — return to App Store when ready."
                : " — use Forge apps when you are ready to return."}
            </div>
          ) : (
            <div className="forge-theme-banner is-info">
              {standalone
                ? "Standalone accelerator — run anytime from the App Store."
                : "Accelerators are always in scope — run anytime. Use Forge apps to return to the catalog."}
            </div>
          )}
        </>
      }
      actions={
        standalone ? (
          <Link href={appStoreHref()} className="btn-secondary text-xs">
            App Store
          </Link>
        ) : focused ? (
          <Link
            href={toolHref("forge", "accelerators")}
            className="btn-secondary text-xs"
          >
            All accelerators
          </Link>
        ) : null
      }
    >
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-1">
        {tools.map((tool) => {
          const last = agentRuns.find((r) => r.task === tool.taskId);
          const running = accelActive && accelRun?.task === tool.taskId;
          return (
            <AcceleratorCard
              key={tool.id}
              tool={tool}
              last={last}
              running={running}
              disabled={busy || accelActive}
              disableReason={disableReason || `Run ${tool.name}`}
              showOpen={!focused}
              onRun={() => runTool(tool)}
            />
          );
        })}

        <ForgeThemePanel>
          <AgentRunsPanel
            title="Recent accelerator runs"
            runs={agentRuns}
            taskFilter={[...FORGE_ACCELERATOR_TASKS]}
            onPoll={onPollAgents}
            selectedId={accelRun?.id}
            onSelect={(r) => setAccelRun(r)}
            emptyHint="No accelerator runs yet. Launch one above — process appears in the agent chat."
          />
        </ForgeThemePanel>
      </div>
    </ForgeThemeShell>
  );
}
