"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { appStoreHref, getAppStoreApp } from "@/lib/appStore";
import { FORGE_ACCELERATOR_TASKS } from "@/lib/phases";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { DiscoveryPhase } from "@/components/phases/discovery/DiscoveryPhase";
import { PhaseBuild } from "@/components/PhaseBuild";
import { ForgeAcceleratorWorkbench } from "@/components/workspace/ForgeAcceleratorWorkbench";

type Props = {
  appId: string;
};

export function StandaloneAppShell({ appId }: Props) {
  const ws = useWorkspace();
  const app = getAppStoreApp(appId);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr("");
      setReady(false);
      try {
        const sandbox = await ws.ensureAppSandbox();
        if (cancelled) return;
        if (ws.project?.id !== sandbox.id) {
          await ws.selectProject(sandbox.id);
        }
        if (app?.embed.kind === "discovery") {
          await ws.loadPhase1();
        } else if (app?.embed.kind === "forge_convert") {
          await Promise.all([ws.loadPhase1(), ws.loadBuild()]);
        } else if (app?.embed.kind === "forge_accel") {
          await Promise.all([ws.loadPhase5(), ws.loadBuild()]);
        }
        if (!cancelled) setReady(true);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  if (!app) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-bad">Unknown app “{appId}”.</p>
        <Link href={appStoreHref()} className="btn">
          Back to App Store
        </Link>
      </div>
    );
  }

  const pid = ws.pid;
  const slimChrome = app.embed.kind !== "discovery";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f2f2f7]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 bg-white/80 px-4 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={appStoreHref()} className="btn-secondary text-xs shrink-0">
            ← App Store
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-ink">
              {app.name}
            </p>
            <p className="truncate text-[11px] text-brand-muted">
              Standalone · not an estate journey
            </p>
          </div>
        </div>
        <span className="badge-neutral shrink-0">App Store</span>
      </div>

      {err ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-warn">
          {err}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!ready || !ws.project || !pid ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-brand-muted">
            Starting {app.shortName}…
          </div>
        ) : app.embed.kind === "discovery" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!slimChrome ? (
              <div className="forge-theme-banner is-info shrink-0">
                Standalone Discovery — bind an estate and scan without the stage
                journey.
              </div>
            ) : null}
            <DiscoveryPhase
              view={app.embed.view}
              project={ws.project}
              inventory={ws.inventory}
              lineage={ws.lineage}
              jobs={ws.jobs}
              assessmentRun={ws.assessmentRun}
              estate={ws.estate}
              samples={ws.samples}
              discoveryRun={ws.discoveryRun}
              discoveryRunDiscover={ws.discoveryRunDiscover}
              discoveryRunInventory={ws.discoveryRunInventory}
              discoveryRuns={ws.discoveryRuns}
              busy={ws.busy}
              msg={ws.msg}
              sessionRole={ws.session.role}
              sidStandards={ws.sidStandards}
              products={ws.products}
              mappings={ws.mappings}
              agentRuns={ws.agentRuns}
              onPollAgents={ws.pollAgents}
              onPollDiscovery={ws.pollDiscovery}
              llmStatus={ws.llmStatus}
              onBindSample={(sampleId) =>
                ws.run("Bind sample estate", () =>
                  api(`/projects/${pid}/estate/sample`, {
                    method: "POST",
                    body: JSON.stringify({ sample_id: sampleId || null }),
                  }).then(() => ws.loadPhase1())
                )
              }
              onUploadZip={(file) =>
                ws.run("Upload ZIP estate", async () => {
                  const form = new FormData();
                  form.append("file", file);
                  await api(`/projects/${pid}/estate/upload`, {
                    method: "POST",
                    body: form,
                  });
                  await ws.loadPhase1();
                })
              }
              onBindGit={(payload) =>
                ws.run("Clone Git estate", () =>
                  api(`/projects/${pid}/estate/git`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                  }).then(() => ws.loadPhase1())
                )
              }
              onSyncGit={(token) =>
                ws.run("Re-sync Git estate", () =>
                  api(`/projects/${pid}/estate/git/sync`, {
                    method: "POST",
                    body: JSON.stringify({ token: token || null }),
                  }).then(() => ws.loadPhase1())
                )
              }
              onRunDiscovery={(pipeline = "discover") =>
                ws.run(
                  pipeline === "inventory"
                    ? "Profiling & lineage queued"
                    : "Discovery scan queued",
                  async () => {
                    const result = await api<any>(
                      `/projects/${pid}/discovery/run`,
                      {
                        method: "POST",
                        body: JSON.stringify({ pipeline }),
                      }
                    );
                    if (result?.run_id) {
                      const detail = await api(
                        `/projects/${pid}/discovery/runs/${result.run_id}`
                      );
                      if (pipeline === "inventory") {
                        ws.setDiscoveryRunInventory(detail);
                      } else {
                        ws.setDiscoveryRunDiscover(detail);
                      }
                      ws.setDiscoveryRun(detail);
                    }
                    await ws.loadPhase1();
                    return result;
                  }
                )
              }
              onRunAssessment={() =>
                ws.run("Assessment agent", async () => {
                  const runRow = await api(
                    `/projects/${pid}/agents/legacy_code_assessment/runs`,
                    {
                      method: "POST",
                      body: JSON.stringify({ payload: {} }),
                    }
                  );
                  ws.setAssessmentRun(runRow);
                  ws.setAgentRuns((prev) => [
                    runRow,
                    ...prev.filter((r) => r.id !== runRow.id),
                  ]);
                  return runRow;
                })
              }
              onSignOff={async (payload) => {
                await ws.run("Inventory sign-off", () =>
                  api(`/projects/${pid}/inventory/signoff`, {
                    method: "POST",
                    body: JSON.stringify({
                      decisions: payload?.decisions || {},
                      agent_run_id: payload?.agent_run_id ?? undefined,
                    }),
                  })
                );
                await ws.refreshProject();
              }}
            />
          </div>
        ) : app.embed.kind === "forge_convert" ? (
          <PhaseBuild
            embedded
            view={app.embed.view}
            project={ws.project}
            artifacts={ws.buildArtifacts}
            summary={ws.buildSummary}
            metadataComplete={true}
            busy={ws.busy}
            msg={ws.msg}
            sessionRole={ws.session.role}
            onGenerate={(targets, tool) =>
              ws.run("Generate Build pack", () =>
                api(`/projects/${pid}/build/generate`, {
                  method: "POST",
                  body: JSON.stringify({
                    targets: targets || {},
                    ...(tool ? { tool } : { tool: app.id }),
                  }),
                }).then(async () => {
                  await ws.loadBuild();
                })
              )
            }
            onSaveTargets={(targets) =>
              ws.run("Save build targets", () =>
                api(`/projects/${pid}/build/targets`, {
                  method: "PUT",
                  body: JSON.stringify({ targets }),
                }).then(() => ws.loadBuild())
              )
            }
            onSaveArtifact={(id, body) =>
              ws.run("Save artifact", () =>
                api(`/projects/${pid}/build/artifacts/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify(body),
                }).then(() => ws.loadBuild())
              )
            }
            onApprove={() => undefined}
          />
        ) : (
          <ForgeAcceleratorWorkbench
            project={ws.project}
            view={app.embed.view}
            buildApproved={true}
            metadataComplete={true}
            standalone
            agentRuns={ws.agentRuns.filter((r) =>
              FORGE_ACCELERATOR_TASKS.includes(r.task)
            )}
            products={ws.products}
            busy={ws.busy}
            msg={ws.msg}
            onPollAgents={() => ws.pollAgents()}
            onRunAgent={(task, payload) =>
              ws.run(`Agent: ${task}`, async () => {
                const runRow = await api(
                  `/projects/${pid}/agents/${task}/runs`,
                  {
                    method: "POST",
                    body: JSON.stringify({ payload }),
                  }
                );
                ws.setAgentRuns((prev) => [
                  runRow,
                  ...prev.filter((r) => r.id !== runRow.id),
                ]);
                return runRow;
              })
            }
          />
        )}
      </div>
    </div>
  );
}
