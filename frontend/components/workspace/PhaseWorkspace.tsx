"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  NAV_PHASES,
  getPhase,
  phaseHref,
  type PhaseId,
} from "@/lib/phases";
import { PageHeader, StatusStrip } from "@/components/shell/PageHeader";
import { buildPhaseStepNav } from "@/components/shell/PhaseSubNav";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { DiscoveryPhase } from "@/components/phases/discovery/DiscoveryPhase";
import { Phase0Mobilisation } from "@/components/phases/Phase0Mobilisation";
import { Phase2Disposition } from "@/components/Phase2Disposition";
import { Phase3SidMapping } from "@/components/Phase3SidMapping";
import { Phase4Metadata } from "@/components/Phase4Metadata";
import { PhaseBuild } from "@/components/PhaseBuild";
import { Phase5PilotProduct } from "@/components/Phase5PilotProduct";
import { Phase6Cutover } from "@/components/Phase6Cutover";
import { Phase7Decommission } from "@/components/Phase7Decommission";

type Props = {
  phaseId: PhaseId;
  viewId?: string;
  hub?: boolean;
};

export function PhaseWorkspace({ phaseId, viewId, hub }: Props) {
  const ws = useWorkspace();
  const router = useRouter();
  const phase = getPhase(phaseId);
  const view = viewId || phase?.defaultView;

  useEffect(() => {
    // Setup (Phase 0) is hidden from the demo path — bounce to Discovery
    if (phaseId === "0_mobilisation") {
      router.replace(phaseHref("1_discovery"));
      return;
    }
    if (!ws.pid) return;
    if (phaseId === "1_discovery") ws.loadPhase1();
    if (phaseId === "2_disposition") {
      ws.loadPhase1();
      ws.loadPhase2();
    }
    if (phaseId === "3_mapping") {
      ws.loadPhase3();
      ws.loadPhase4();
      ws.pollAgents();
    }
    if (phaseId === "4_build") {
      ws.loadBuild();
      ws.loadPhase4();
    }
    if (phaseId === "4_metadata") {
      router.replace(phaseHref("3_mapping", "entities"));
      return;
    }
    if (phaseId === "5_pilot_product") ws.loadPhase5();
    if (phaseId === "6_migrate" || phaseId === "7_decommission") {
      ws.loadPhase5();
      ws.loadPhase2();
      ws.loadPhase67();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.pid, phaseId, router]);

  if (!phase) {
    return <div className="p-5 text-sm text-bad">Unknown phase</div>;
  }

  if (!ws.project) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-brand-muted">
        Loading project…
      </div>
    );
  }

  if (hub) {
    return <PhaseHub phaseId={phaseId} />;
  }

  const activeView = phase.views.find((v) => v.id === view);
  const title = activeView?.label || phase.title;
  const subtitle = `${phase.number}. ${phase.short} · ${activeView?.group || "Space"}`;
  const stepNav = buildPhaseStepNav(phaseId, view);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        key={`${phaseId}-${view}`}
        title={title}
        subtitle={subtitle}
        stepNav={stepNav}
        actions={<PhaseActions phaseId={phaseId} view={view} />}
      />
      {!(
        (phaseId === "1_discovery" &&
          (view === "lineage" || view === "console" || view === "inventory")) ||
        (phaseId === "3_mapping" && (view === "workbench" || view === "gaps"))
      ) ? (
        <PhaseStatus phaseId={phaseId} view={view} />
      ) : null}
      <div
        className={
          (phaseId === "1_discovery" &&
            (view === "lineage" || view === "console" || view === "inventory")) ||
          (phaseId === "3_mapping" &&
            (view === "workbench" || view === "gaps" || view === "entities")) ||
          (phaseId === "4_build" &&
            (view === "tables" || view === "code" || view === "dags" || view === "approve")) ||
          (phaseId === "5_pilot_product" &&
            (view === "agents" ||
              view === "reviews" ||
              view === "product" ||
              view === "test_env" ||
              view === "pipeline" ||
              view === "reconcile"))
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "min-h-0 flex-1 overflow-auto"
        }
      >
        {renderPhase(phaseId, view || phase.defaultView, ws, router)}
      </div>
    </div>
  );
}

function PhaseHub({ phaseId }: { phaseId: PhaseId }) {
  const phase = getPhase(phaseId)!;
  const groups = Array.from(new Set(phase.views.map((v) => v.group)));
  const nextPhase = (() => {
    const idx = NAV_PHASES.findIndex((p) => p.id === phaseId);
    return idx >= 0 && idx < NAV_PHASES.length - 1 ? NAV_PHASES[idx + 1] : null;
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={`${phase.number}. ${phase.title}`}
        subtitle={phase.focus}
        actions={
          <Link href={phaseHref(phaseId, phase.defaultView)} className="btn">
            Enter space ·{" "}
            {phase.views.find((v) => v.id === phase.defaultView)?.label || "Start"}
          </Link>
        }
      />
      <div className="grid gap-4 p-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="pane rounded-md p-5">
          <h2 className="text-sm font-semibold text-brand-ink">Work in this space</h2>
          <p className="mt-1 text-xs text-brand-muted">
            Open one view at a time from the left rail. Finish the gate before moving on.
          </p>
          <ol className="mt-4 space-y-3">
            {groups.map((g) => (
              <li key={g}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
                  {g}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {phase.views
                    .filter((v) => v.group === g)
                    .map((v) => (
                      <li key={v.id}>
                        <Link
                          href={phaseHref(phaseId, v.id)}
                          className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-tm-gray-50"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-brand-100 text-[11px] font-bold text-brand-600">
                            {phase.views.findIndex((x) => x.id === v.id) + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium text-brand-ink">{v.label}</span>
                            <span className="block text-[11px] text-brand-muted">{g}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-4">
          <section className="pane rounded-md p-5">
            <h2 className="text-sm font-semibold text-brand-ink">Exit criterion</h2>
            <p className="mt-2 text-sm text-brand-muted">{phase.exitCriterion}</p>
          </section>
          {nextPhase ? (
            <section className="pane rounded-md p-5">
              <h2 className="text-sm font-semibold text-brand-ink">Next space</h2>
              <p className="mt-2 text-sm text-brand-muted">
                After this gate: {nextPhase.number}. {nextPhase.title}
              </p>
              <p className="mt-1 text-xs text-brand-muted">{nextPhase.focus}</p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PhaseStatus({ phaseId, view }: { phaseId: PhaseId; view?: string }) {
  const ws = useWorkspace();
  if (phaseId === "0_mobilisation") {
    const p = ws.mobilisation?.progress;
    const checks = ws.mobilisation?.ready_checks?.checks || [];
    const hard = checks.filter((c: any) => !c.soft);
    const hardPassed = hard.filter((c: any) => c.passed).length;
    const spoke = ws.mobilisation?.hub_spoke_id || ws.udpHub?.hub_spoke_id || "";
    return (
      <StatusStrip
        items={[
          { label: "Checklist", value: p ? `${p.done}/${p.total}` : "—" },
          {
            label: "Hard checks",
            value: hard.length ? `${hardPassed}/${hard.length}` : "—",
          },
          {
            label: "Hub spoke",
            value: spoke ? String(spoke).replace(/^spoke-/, "") : "—",
          },
          {
            label: "Ready",
            value: ws.project?.mobilisation_ready || ws.mobilisation?.ready ? "Yes" : "No",
          },
        ]}
      />
    );
  }
  if (phaseId === "1_discovery") {
    return (
      <StatusStrip
        items={[
          { label: "Objects", value: ws.inventory.length },
          { label: "Lineage", value: ws.lineage.edges?.length || 0 },
          {
            label: "Source",
            value: ws.estate?.readiness?.score?.ready
              ? "Ready"
              : ws.estate?.exists
                ? "Connected"
                : "—",
          },
          {
            label: "Sign off",
            value: ws.project?.inventory_signed_off ? "Done" : "Open",
          },
        ]}
      />
    );
  }
  if (phaseId === "3_mapping") {
    const entityCount = new Set(
      (ws.mappings || [])
        .map((m: any) => String(m.entity || "").trim())
        .filter(Boolean)
    ).size;
    const metaReady = (ws.completeness?.checks || []).filter(
      (c: any) => c.complete
    ).length;
    const metaTotal =
      ws.completeness?.required_count ??
      (ws.completeness?.checks || []).length ??
      0;

    if (view === "entities") {
      return (
        <StatusStrip
          items={[
            { label: "SID entities", value: entityCount || metaTotal || "—" },
            {
              label: "Metadata ready",
              value: metaTotal ? `${metaReady}/${metaTotal}` : "—",
            },
            {
              label: "Map pack",
              value: ws.project?.mapping_approved ? "Yes" : "No",
            },
            {
              label: "Catalogue",
              value: ws.project?.metadata_complete ? "Complete" : "Open",
            },
          ]}
        />
      );
    }

    return (
      <StatusStrip
        items={[
          { label: "Mappings", value: ws.mappings.length },
          {
            label: "Coverage",
            value:
              ws.scorecard?.coverage_pct != null
                ? `${ws.scorecard.coverage_pct}%`
                : ws.scorecard?.conformance_pct != null
                  ? `${ws.scorecard.conformance_pct}%`
                  : "—",
          },
          { label: "Entities", value: entityCount || "—" },
          {
            label: "Map pack",
            value: ws.project?.mapping_approved ? "Yes" : "No",
          },
        ]}
      />
    );
  }
  if (phaseId === "4_build") {
    const by = ws.buildSummary?.by_kind || {};
    return (
      <StatusStrip
        items={[
          { label: "Tables", value: by.table ?? 0 },
          { label: "Code", value: by.code ?? 0 },
          { label: "DAGs", value: by.dag ?? 0 },
          {
            label: "Approved",
            value: ws.project?.build_approved ? "Yes" : "No",
          },
        ]}
      />
    );
  }
  if (phaseId === "5_pilot_product") {
    return (
      <StatusStrip
        items={[
          { label: "Products", value: ws.products.length },
          { label: "Reviews", value: ws.reviews.filter((r) => r.status === "pending").length },
          { label: "Pipeline", value: ws.pipelineRuns.length },
        ]}
      />
    );
  }
  return null;
}

function PhaseActions({ phaseId, view }: { phaseId: PhaseId; view?: string }) {
  const ws = useWorkspace();
  const router = useRouter();

  // Gate CTA for approval / phase-exit. Header ← / → always walks Discover → Retire;
  // that pager is navigation only and does not replace these gated actions.

  if (phaseId === "2_disposition") {
    if (view !== "approve") return null;

    const approved = !!ws.project?.disposition_approved;
    const canApprove = [
      "change_board",
      "architect",
      "product_owner",
      "engineer",
    ].includes(ws.session.role);
    const hasRegister = (ws.dispositions?.length || 0) > 0;
    const mapHref = phaseHref("3_mapping");

    if (approved) {
      return (
        <Link href={mapHref} className="btn" title="Open Align (SID Mapping & Metadata)">
          Continue to Align
        </Link>
      );
    }

    return (
      <button
        type="button"
        className="btn"
        disabled={ws.busy || !canApprove || !hasRegister}
        title={
          !canApprove
            ? "Requires engineer, architect, product owner, or change board"
            : !hasRegister
              ? "Run Analyze on the Board first"
              : "Approve disposition register and open Align"
        }
        onClick={() =>
          void ws
            .run("Change Board approval", () =>
              api(`/projects/${ws.pid}/disposition/approve`, { method: "POST" })
            )
            .then(() => router.push(mapHref))
        }
      >
        Approve → Align
      </button>
    );
  }

  if (phaseId === "3_mapping") {
    const mappingApproved = !!ws.project?.mapping_approved;
    const metadataComplete = !!ws.project?.metadata_complete;
    const canCompleteMetadata = [
      "product_owner",
      "change_board",
      "data_owner",
      "architect",
      "engineer",
    ].includes(ws.session.role);
    const completenessOk = !!ws.completeness?.complete;
    const buildHref = phaseHref("4_build");
    const entitiesHref = phaseHref("3_mapping", "entities");

    if (metadataComplete) {
      if (view === "approve" || view === "entities") {
        return (
          <Link href={buildHref} className="btn" title="Open Platform Conversion (Build)">
            Continue to Build
          </Link>
        );
      }
      return null;
    }

    // Entities owns the metadata gate (Complete → Build)
    if (view === "entities" && mappingApproved) {
      return (
        <button
          type="button"
          className="btn"
          disabled={ws.busy || !canCompleteMetadata}
          title={
            !canCompleteMetadata
              ? "Requires product owner, data owner, change board, architect, or engineer"
              : !completenessOk
                ? "Will seed SID entities from mappings, then open Build"
                : "Mark metadata complete and open Build"
          }
          onClick={() =>
            void ws
              .run("Metadata phase gate", async () => {
                try {
                  await api(`/projects/${ws.pid}/metadata/seed`, {
                    method: "POST",
                  });
                } catch {
                  /* may already be seeded */
                }
                await ws.loadPhase4();
                await api(`/projects/${ws.pid}/metadata/complete`, {
                  method: "POST",
                });
                await ws.refreshProject();
              })
              .then(() => router.push(buildHref))
          }
        >
          Complete → Build
        </button>
      );
    }

    // Approve page: overview + pack approval only (CTA lives on the page)
    if (view === "approve" && mappingApproved) {
      return (
        <Link href={entitiesHref} className="btn" title="Open Entities to finish ownership">
          Continue to Entities
        </Link>
      );
    }

    return null;
  }

  if (phaseId === "4_build") {
    if (view !== "approve") return null;

    const approved = !!ws.project?.build_approved;
    const canApprove = [
      "architect",
      "engineer",
      "change_board",
      "product_owner",
    ].includes(ws.session.role);
    const hasPack = (ws.buildArtifacts?.length || 0) > 0;
    const pilotHref = phaseHref("5_pilot_product");

    if (approved) {
      return (
        <Link href={pilotHref} className="btn" title="Open Pilot Data Product">
          Continue to Pilot
        </Link>
      );
    }

    return (
      <button
        type="button"
        className="btn"
        disabled={ws.busy || !canApprove || !hasPack}
        title={
          !canApprove
            ? "Requires engineer, architect, product owner, or change board"
            : !hasPack
              ? "Generate the Build pack on Tables / Code / DAGs first"
              : "Approve conversion pack and open Pilot"
        }
        onClick={() =>
          void ws
            .run("Build pack approval", () =>
              api(`/projects/${ws.pid}/build/approve`, { method: "POST" })
            )
            .then(() => router.push(pilotHref))
        }
      >
        Approve → Pilot
      </button>
    );
  }

  if (phaseId === "6_migrate") {
    if (view !== "signoff") return null;
    const complete = ws.cutover?.status === "complete";
    const signed = !!(ws.cutover?.prod_env?.signoff?.signed_at || ws.project?.prod_env?.signoff?.signed_at);
    const retireHref = phaseHref("7_decommission");
    if (complete || signed) {
      return (
        <Link href={retireHref} className="btn" title="Open Decommission & Hypercare">
          Continue to Retire
        </Link>
      );
    }
    return null;
  }

  if (phaseId === "7_decommission") {
    if (view !== "close") return null;
    const closed =
      !!ws.project?.change_closed ||
      ws.project?.status === "closed" ||
      ws.project?.status === "pilot_complete";
    if (closed) {
      return (
        <Link href="/workspace" className="btn" title="Back to workspace home">
          Journey complete
        </Link>
      );
    }
    return null;
  }

  if (phaseId !== "1_discovery") return null;
  if (view !== "review" && view !== "assessment" && view !== "signoff") {
    return null;
  }

  const signed = !!ws.project?.inventory_signed_off;
  const decideHref = phaseHref("2_disposition");

  // Approval CTA lives on the Review page (with HITL Accept/Flag). Header only
  // continues after the gate is passed — one destination, one primary action.
  if (signed) {
    return (
      <Link href={decideHref} className="btn" title="Open Disposition (Decide)">
        Continue to Decide
      </Link>
    );
  }

  return null;
}

function renderPhase(
  phaseId: PhaseId,
  view: string,
  ws: ReturnType<typeof useWorkspace>,
  router: ReturnType<typeof useRouter>
) {
  const pid = ws.pid!;

  if (phaseId === "0_mobilisation") {
    return (
      <Phase0Mobilisation
        view={view}
        mobilisation={ws.mobilisation}
        udpHub={ws.udpHub}
        llmStatus={ws.llmStatus}
        busy={ws.busy}
        sessionRole={ws.session.role}
        onToggle={(itemId, done) =>
          ws.run(done ? "Checklist item done" : "Checklist item reopened", () =>
            api(`/projects/${pid}/mobilisation/items`, {
              method: "PATCH",
              body: JSON.stringify({ item_id: itemId, done }),
            }).then(() => ws.loadPhase0())
          )
        }
        onSaveItem={(itemId, body) =>
          ws.run("Save mobilisation evidence", () =>
            api(`/projects/${pid}/mobilisation/items`, {
              method: "PATCH",
              body: JSON.stringify({ item_id: itemId, ...body }),
            }).then(() => ws.loadPhase0())
          )
        }
        onBulkGroup={(group, done, acceptDemoEvidence) =>
          ws.run(`Mark ${group} done`, () =>
            api(`/projects/${pid}/mobilisation/bulk`, {
              method: "POST",
              body: JSON.stringify({
                group,
                done,
                accept_demo_evidence: !!acceptDemoEvidence,
              }),
            }).then(() => ws.loadPhase0())
          )
        }
        onAcceptDecisionDefaults={() =>
          ws.run("Accept decision defaults", () =>
            api(`/projects/${pid}/mobilisation/decisions/accept-defaults`, {
              method: "POST",
            }).then(() => ws.loadPhase0())
          )
        }
        onSaveDecision={(decisionId, body) =>
          ws.run("Save decision", () =>
            api(`/projects/${pid}/mobilisation/decisions`, {
              method: "PATCH",
              body: JSON.stringify({ decision_id: decisionId, ...body }),
            }).then(() => ws.loadPhase0())
          )
        }
        onSaveFreeze={(body) =>
          ws.run("Save freeze register", () =>
            api(`/projects/${pid}/mobilisation/freeze`, {
              method: "PUT",
              body: JSON.stringify(body),
            }).then(() => ws.loadPhase0())
          )
        }
        onAcceptFreezeDefaults={() =>
          ws.run("Accept freeze defaults", () =>
            api(`/projects/${pid}/mobilisation/freeze/accept-defaults`, {
              method: "POST",
            }).then(() => ws.loadPhase0())
          )
        }
        onPublishFreeze={() =>
          ws.run("Publish change freeze", () =>
            api(`/projects/${pid}/mobilisation/freeze/publish`, {
              method: "POST",
            }).then(() => ws.loadPhase0())
          )
        }
        onSaveTeam={(body) =>
          ws.run("Save team RACI", () =>
            api(`/projects/${pid}/mobilisation/team`, {
              method: "PATCH",
              body: JSON.stringify(body),
            }).then(() => ws.loadPhase0())
          )
        }
        onAcceptTeamDefaults={() =>
          ws.run("Seed demo team", () =>
            api(`/projects/${pid}/mobilisation/team/accept-defaults`, {
              method: "POST",
            }).then(() => ws.loadPhase0())
          )
        }
        onBindHubSpoke={(spokeId) =>
          ws.run(`Bind hub spoke ${spokeId}`, () =>
            api(`/projects/${pid}/udp-hub/bind`, {
              method: "PUT",
              body: JSON.stringify({ spoke_id: spokeId }),
            }).then(() => ws.loadPhase0())
          )
        }
        onProbeHub={() =>
          ws.run("UDP Hub probe", () =>
            api(`/projects/${pid}/udp-hub/probe`, { method: "POST" }).then(() =>
              ws.loadPhase0()
            )
          )
        }
        onReady={async () => {
          await ws.run("Mobilisation ready", () =>
            api(`/projects/${pid}/mobilisation/ready`, { method: "POST" })
          );
          await ws.loadPhase0();
          router.push(phaseHref("1_discovery"));
        }}
        onRefreshHub={() => ws.loadPhase0()}
      />
    );
  }

  if (phaseId === "1_discovery") {
    const bleed = view === "lineage" || view === "console" || view === "inventory";
    return (
      <div className={bleed ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "space-y-4 p-5"}>
        <DiscoveryPhase
          view={view}
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
              await api(`/projects/${pid}/estate/upload`, { method: "POST", body: form });
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
                ? "Inventory & lineage queued"
                : "Discovery scan queued",
              async () => {
                const result = await api<any>(`/projects/${pid}/discovery/run`, {
                  method: "POST",
                  body: JSON.stringify({ pipeline }),
                });
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
                if (pipeline === "discover") {
                  router.push(phaseHref("1_discovery", "console"));
                } else {
                  router.push(phaseHref("1_discovery", "inventory"));
                }
                return result;
              }
            )
          }
          onRunAssessment={() =>
            ws.run("Assessment agent", async () => {
              const runRow = await api(`/projects/${pid}/agents/legacy_code_assessment/runs`, {
                method: "POST",
                body: JSON.stringify({ payload: {} }),
              });
              ws.setAssessmentRun(runRow);
              ws.setAgentRuns((prev) => [runRow, ...prev.filter((r) => r.id !== runRow.id)]);
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
            router.push(phaseHref("2_disposition"));
          }}
        />
      </div>
    );
  }

  if (phaseId === "2_disposition") {
    return (
      <Phase2Disposition
        embedded
        view={view}
        project={ws.project}
        dispositions={ws.dispositions}
        benefits={ws.benefits}
        inventorySignedOff={!!ws.project.inventory_signed_off}
        busy={ws.busy}
        msg={ws.msg}
        sessionRole={ws.session.role}
        onCompute={() =>
          ws.run("Disposition analyze", () =>
            api(`/projects/${pid}/disposition/analyze`, { method: "POST" }).then(() =>
              ws.loadPhase2()
            )
          )
        }
        onAnalyze={() =>
          ws.run("Disposition analyze", () =>
            api(`/projects/${pid}/disposition/analyze`, { method: "POST" }).then(() => {
              ws.pollAgents();
              return ws.loadPhase2();
            })
          )
        }
        onOverride={(id, override) =>
          ws.run(`Override → ${override}`, () =>
            api(`/projects/${pid}/disposition/${id}`, {
              method: "PATCH",
              body: JSON.stringify({ override }),
            }).then(() => ws.loadPhase2())
          )
        }
        onAdvanceRetirement={(id) =>
          ws.run("Advance retirement", () =>
            api(`/projects/${pid}/disposition/${id}/advance-retirement`, {
              method: "POST",
            }).then(() => ws.loadPhase2())
          )
        }
        onNotifyConsumers={() =>
          ws.run("Notify consumers", () =>
            api(`/projects/${pid}/disposition/notify-consumers`, { method: "POST" }).then(() =>
              ws.loadPhase2()
            )
          )
        }
        onFreezeScope={() =>
          ws.run("Freeze scope", () =>
            api(`/projects/${pid}/disposition/freeze-scope`, { method: "POST" }).then(() =>
              ws.loadPhase2()
            )
          )
        }
        onApprove={async () => {
          await ws.run("Change Board approval", () =>
            api(`/projects/${pid}/disposition/approve`, { method: "POST" })
          );
          router.push(phaseHref("3_mapping"));
        }}
      />
    );
  }

  if (phaseId === "3_mapping") {
    if (view === "entities") {
      return (
        <Phase4Metadata
          embedded
          view="entities"
          project={ws.project}
          metadata={ws.metadata}
          completeness={ws.completeness}
          tags={ws.catalogueTags}
          mappingApproved={!!ws.project.mapping_approved}
          mappings={ws.mappings}
          sidStandards={ws.sidStandards}
          busy={ws.busy}
          msg={ws.msg}
          sessionRole={ws.session.role}
          onSeed={() =>
            ws.run("Seed metadata from SID mappings", () =>
              api(`/projects/${pid}/metadata/seed`, { method: "POST" }).then(() =>
                ws.loadPhase4()
              )
            )
          }
          onSave={(body) =>
            ws.run("Save metadata", () =>
              api(`/projects/${pid}/metadata`, {
                method: "PUT",
                body: JSON.stringify(body),
              }).then(() => ws.loadPhase4())
            )
          }
          onComplete={async () => {
            await ws.run("Metadata phase gate", () =>
              api(`/projects/${pid}/metadata/complete`, { method: "POST" })
            );
            router.push(phaseHref("4_build"));
          }}
        />
      );
    }

    return (
      <Phase3SidMapping
        embedded
        view={view}
        project={ws.project}
        mappings={ws.mappings}
        scorecard={ws.scorecard}
        completeness={ws.completeness}
        sidStandards={ws.sidStandards}
        dispositionApproved={!!ws.project.disposition_approved}
        agentRuns={ws.agentRuns}
        busy={ws.busy}
        msg={ws.msg}
        sessionRole={ws.session.role}
        onGenerate={async (opts) => {
          const advanced = !!opts?.advanced_ai;
          return ws.run(
            advanced ? "SID mapping + Model AI" : "SID mapping agent",
            async () => {
              const result = await api<any>(`/projects/${pid}/mappings/generate`, {
                method: "POST",
                body: JSON.stringify({
                  advanced_ai: advanced,
                  use_llm: advanced,
                }),
              });
              ws.pollAgents();
              return result;
            }
          );
        }}
        onSaveMapping={(id, body) =>
          ws.run("Save mapping", () =>
            api(`/projects/${pid}/mappings/${id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            }).then(() => ws.loadPhase3())
          )
        }
        onBulkReview={(decision, ids) =>
          ws.run(
            decision === "accept" ? "Accept all gaps" : "Flag all gaps",
            () =>
              api(`/projects/${pid}/mappings/bulk-review`, {
                method: "POST",
                body: JSON.stringify({ decision, ids: ids || null }),
              }).then(() => ws.loadPhase3())
          )
        }
        onApprove={async () => {
          await ws.run("Architect mapping approval", async () => {
            await api(`/projects/${pid}/mappings/approve`, { method: "POST" });
            try {
              await api(`/projects/${pid}/metadata/seed`, { method: "POST" });
            } catch {
              /* seed may already exist */
            }
            await Promise.all([ws.loadPhase3(), ws.loadPhase4()]);
            await ws.refreshProject();
          });
          router.push(phaseHref("3_mapping", "entities"));
        }}
        onPollAgents={ws.pollAgents}
        onRefreshMappings={() => ws.loadPhase3()}
      />
    );
  }

  if (phaseId === "4_metadata") {
    return (
      <div className="p-5 text-sm text-brand-muted">Redirecting to Align…</div>
    );
  }

  if (phaseId === "4_build") {
    return (
      <PhaseBuild
        embedded
        view={view}
        project={ws.project}
        artifacts={ws.buildArtifacts}
        summary={ws.buildSummary}
        metadataComplete={!!ws.project.metadata_complete}
        busy={ws.busy}
        msg={ws.msg}
        sessionRole={ws.session.role}
        onGenerate={(targets) =>
          ws.run("Generate Build pack", () =>
            api(`/projects/${pid}/build/generate`, {
              method: "POST",
              body: JSON.stringify({ targets: targets || {} }),
            }).then(() => ws.loadBuild())
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
          ws.run("Save build artifact", () =>
            api(`/projects/${pid}/build/artifacts/${id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            }).then(() => ws.loadBuild())
          )
        }
        onApprove={() =>
          ws.run("Build pack approval", async () => {
            await api(`/projects/${pid}/build/approve`, { method: "POST" });
            await ws.refreshProject();
          })
        }
      />
    );
  }

  if (phaseId === "5_pilot_product") {
    return (
      <Phase5PilotProduct
        embedded
        view={view}
        project={ws.project}
        metadataComplete={!!ws.project.metadata_complete}
        buildApproved={!!ws.project.build_approved}
        agentRuns={ws.agentRuns.filter((r) =>
          [
            "source_interface_acquisition",
            "data_product_identification",
            "code_transformation",
            "contract_documentation",
          ].includes(r.task)
        )}
        reviews={ws.reviews}
        products={ws.products}
        productRows={ws.productRows}
        pipelineRuns={ws.pipelineRuns}
        reconcileLatest={ws.reconcileLatest}
        selectedProductId={ws.selectedProductId}
        onSelectProduct={(id) => {
          ws.setSelectedProductId(id);
          void ws.loadPhase5();
        }}
        busy={ws.busy}
        msg={ws.msg}
        sessionRole={ws.session.role}
        onRunAgent={(task, payload) =>
          ws.run(`Agent: ${task}`, async () => {
            const runRow = await api(`/projects/${pid}/agents/${task}/runs`, {
              method: "POST",
              body: JSON.stringify({ payload }),
            });
            ws.setAgentRuns((prev) => [runRow, ...prev.filter((r) => r.id !== runRow.id)]);
            return runRow;
          })
        }
        onPollAgents={ws.pollAgents}
        onReview={(id, decision) =>
          ws.run(`Review ${decision}`, () =>
            api(`/projects/${pid}/reviews/${id}/decide`, {
              method: "POST",
              body: JSON.stringify({
                decision,
                notes: decision === "approve" ? "Demo approval" : "Needs work",
              }),
            }).then(() => ws.loadPhase5())
          )
        }
        onBulkReview={(decision) =>
          ws.run(
            decision === "approve" ? "Approve all reviews" : "Reject all reviews",
            () =>
              api(`/projects/${pid}/reviews/bulk-decide`, {
                method: "POST",
                body: JSON.stringify({
                  decision,
                  notes:
                    decision === "approve"
                      ? "Bulk demo approval"
                      : "Bulk reject",
                }),
              }).then(() => ws.loadPhase5())
          )
        }
        onPipeline={(productId) =>
          ws.run(
            Array.isArray(productId)
              ? `Dual pipeline ×${productId.length}`
              : "Dual pipeline run",
            async () => {
              const ids = Array.isArray(productId) ? productId : [productId];
              for (const id of ids) {
                await api(`/projects/${pid}/products/${id}/pipeline/run`, {
                  method: "POST",
                });
              }
              await ws.loadPhase5();
            }
          )
        }
        onReconcile={async (productId) => {
          const ids = Array.isArray(productId) ? productId : [productId];
          await ws.run(
            ids.length > 1 ? `Reconcile ×${ids.length}` : "Reconciliation",
            async () => {
              for (const id of ids) {
                await api(`/projects/${pid}/products/${id}/reconcile`, {
                  method: "POST",
                });
              }
            }
          );
          await ws.loadPhase5();
        }}
        onPromoteTestEnv={(productIds) =>
          ws.run("Promote to Test", async () => {
            await api(`/projects/${pid}/test-env/promote`, {
              method: "POST",
              body: JSON.stringify({
                product_ids: productIds,
                environment: "test",
              }),
            });
            await ws.refreshProject();
            await ws.loadPhase5();
          })
        }
      />
    );
  }

  if (phaseId === "6_migrate") {
    const reconcilePassed = !!(
      ws.reconcileLatest?.passed ?? ws.reconcileLatest?.metrics?.passed
    );
    return (
      <Phase6Cutover
        embedded
        view={view}
        project={ws.project}
        products={ws.products}
        cutover={ws.cutover}
        reconcilePassed={reconcilePassed}
        dispositions={ws.dispositions}
        busy={ws.busy}
        msg={ws.msg}
        sessionRole={ws.session.role}
        onRefreshCutover={() =>
          ws.run("Refresh cutover", async () => {
            await ws.loadPhase67();
          })
        }
        onPromoteProd={async (productIds) => {
          const result = await ws.run("Promote to Production", () =>
            api<any>(`/projects/${pid}/migrate/promote-prod`, {
              method: "POST",
              body: JSON.stringify({ product_ids: productIds }),
            })
          );
          const n = (result?.promoted || []).length;
          const skipped = (result?.skipped || []).length;
          if (n || skipped) {
            ws.setMsg(
              `Promote to Production · ${n} promoted` +
                (skipped ? ` · ${skipped} skipped (reconcile pending)` : "")
            );
          }
          await ws.refreshProject();
          await ws.loadPhase67();
          await ws.loadPhase5();
        }}
        onUpdateConsumer={async (body) => {
          await ws.run(`Consumer: ${body.name}`, () =>
            api(`/projects/${pid}/migrate/consumers`, {
              method: "POST",
              body: JSON.stringify(body),
            })
          );
          await ws.loadPhase67();
        }}
        onApplyFreeze={async () => {
          await ws.run("Apply legacy freeze", () =>
            api(`/projects/${pid}/migrate/freeze`, { method: "POST" })
          );
          await ws.loadPhase2();
          await ws.loadPhase67();
        }}
        onSignoff={async (notes) => {
          await ws.run("Production cutover sign-off", () =>
            api(`/projects/${pid}/migrate/signoff`, {
              method: "POST",
              body: JSON.stringify({ notes: notes || "" }),
            })
          );
          await ws.refreshProject();
          await ws.loadPhase67();
          router.push(phaseHref("7_decommission"));
        }}
        onCompleteItem={async (itemId, productId) => {
          await ws.run(`Cutover: ${itemId}`, () =>
            api(
              `/projects/${pid}/cutover/${itemId}/complete${
                productId != null ? `?product_id=${productId}` : ""
              }`,
              { method: "POST" }
            )
          );
          await ws.refreshProject();
          await ws.loadPhase67();
          if (itemId === "signoff") {
            router.push(phaseHref("7_decommission"));
          }
        }}
      />
    );
  }

  if (phaseId === "7_decommission") {
    const cutoverComplete = ws.cutover?.status === "complete";
    return (
      <Phase7Decommission
        embedded
        view={view}
        project={ws.project}
        dispositions={ws.dispositions}
        benefits={ws.benefits}
        cutoverComplete={cutoverComplete}
        audit={ws.auditEvents}
        hypercare={ws.hypercare}
        busy={ws.busy}
        msg={ws.msg}
        sessionRole={ws.session.role}
        onAdvanceRetirement={(id) =>
          ws.run("Advance retirement", () =>
            api(`/projects/${pid}/disposition/${id}/advance-retirement`, {
              method: "POST",
            }).then(() => ws.loadPhase2())
          )
        }
        onCloseChange={async () => {
          await ws.run("Close change", () =>
            api(`/projects/${pid}/change/close`, { method: "POST" })
          );
          await ws.loadPhase67();
        }}
      />
    );
  }

  return <div className="p-5 text-sm text-brand-muted">Phase not available.</div>;
}
