"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { pilotActionChatLines } from "@/lib/agentChat";
import {
  NAV_PHASES,
  activeWaveSummary,
  getPhase,
  getToolByPhase,
  phaseHref,
  toolHref,
  SUITE_GALLERY_HREF,
  FORGE_ACCELERATOR_TASKS,
  type PhaseId,
} from "@/lib/phases";
import { PageHeader, StatusStrip } from "@/components/shell/PageHeader";
import { buildPhaseStepNav } from "@/components/shell/PhaseSubNav";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { SuiteThemeShell } from "@/components/workspace/SuiteThemeShell";
import { ForgeToolSuite } from "@/components/workspace/ForgeToolSuite";
import { ForgeAcceleratorWorkbench } from "@/components/workspace/ForgeAcceleratorWorkbench";
import { DiscoveryPhase } from "@/components/phases/discovery/DiscoveryPhase";
import { Phase0Mobilisation } from "@/components/phases/Phase0Mobilisation";
import { PhasePlan } from "@/components/PhasePlan";
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
    if (phaseId === "0_mobilisation") {
      router.replace(phaseHref("1_discovery"));
      return;
    }
    if (!ws.pid) return;
    if (phaseId === "1_discovery") ws.loadPhase1();
    if (phaseId === "2_plan") ws.loadPhase1();
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
      ws.loadPhase1();
      ws.loadBuild();
      ws.loadPhase4();
      ws.loadPhase5();
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
  const tool = getToolByPhase(phaseId);
  const title = activeView?.label || phase.title;
  const subtitle = activeView?.group || tool?.tagline || phase.focus;
  const stepNav = buildPhaseStepNav(phaseId, view);
  const resolvedView = view || phase.defaultView;

  const fill =
    (phaseId === "1_discovery" &&
      (view === "lineage" ||
        view === "console" ||
        view === "profiling" ||
        view === "inventory" ||
        view === "review" ||
        view === "assessment" ||
        view === "signoff")) ||
    (phaseId === "2_plan" && (view === "overview" || view === "approve")) ||
    (phaseId === "3_mapping" &&
      (view === "workbench" || view === "gaps" || view === "entities")) ||
    (phaseId === "4_build" &&
      (view === "suite" ||
        view === "tables" ||
        view === "scripts" ||
        view === "pipelines" ||
        view === "reports" ||
        view === "data" ||
        view === "code" ||
        view === "dags" ||
        view === "approve" ||
        view === "accelerators" ||
        view === "cataloguer" ||
        view === "composer" ||
        view === "transform" ||
        view === "contracts")) ||
    (phaseId === "5_pilot_product" &&
      (view === "reviews" ||
        view === "product" ||
        view === "test_env" ||
        view === "pipeline" ||
        view === "reconcile"));

  const hideStatus = phaseId === "1_discovery" ||
    (phaseId === "3_mapping" && (view === "workbench" || view === "gaps"));

  // Forge owns its own Applications / tool theme chrome
  if (phaseId === "4_build") {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {renderPhase(phaseId, resolvedView, ws, router)}
      </div>
    );
  }

  if (tool) {
    const viewTabs = phase.views.map((v) => ({
      id: v.id,
      label: v.label,
      group: v.group,
    }));
    return (
      <SuiteThemeShell
        tool={tool}
        view={resolvedView}
        viewTabs={viewTabs}
        projectName={ws.project?.name}
        title={title}
        subtitle={subtitle}
        actions={<PhaseActions phaseId={phaseId} view={view} />}
        banner={
          !hideStatus ? (
            <div className="suite-theme-status">
              <PhaseStatus phaseId={phaseId} view={view} />
            </div>
          ) : null
        }
        fill={!!fill}
      >
        {renderPhase(phaseId, resolvedView, ws, router)}
      </SuiteThemeShell>
    );
  }

  return (
    <div className="suite-theme forge-pad flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="forge-pad-atmosphere" aria-hidden />
      <PageHeader
        key={`${phaseId}-${view}`}
        title={title}
        subtitle={subtitle}
        stepNav={stepNav}
        actions={<PhaseActions phaseId={phaseId} view={view} />}
      />
      {!hideStatus ? <PhaseStatus phaseId={phaseId} view={view} /> : null}
      <div
        className={
          fill
            ? "relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden"
            : "relative z-[1] min-h-0 flex-1 overflow-auto"
        }
      >
        {renderPhase(phaseId, resolvedView, ws, router)}
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
  if (phaseId === "2_plan") {
    const waves = ws.project?.wave_plan?.waves || [];
    const active = activeWaveSummary(ws.project);
    return (
      <StatusStrip
        items={[
          { label: "Profiling", value: ws.inventory.length },
          { label: "Waves", value: waves.length || "—" },
          {
            label: "Active",
            value: active ? active.name : "—",
          },
          {
            label: "Plan",
            value: ws.project?.plan_approved ? "Approved" : "Open",
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
    if (view === "suite") {
      return (
        <StatusStrip
          items={[
            { label: "Tools", value: 5 },
            { label: "Survivors", value: ws.buildSummary?.survivors ?? "—" },
            { label: "Artifacts", value: ws.buildArtifacts.length },
            {
              label: "Approved",
              value: ws.project?.build_approved ? "Yes" : "No",
            },
          ]}
        />
      );
    }
    return (
      <StatusStrip
        items={[
          { label: "Tables", value: by.table ?? 0 },
          { label: "Scripts", value: by.code ?? 0 },
          { label: "Pipelines", value: by.dag ?? 0 },
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

  if (phaseId === "2_plan") {
    const approved = !!ws.project?.plan_approved;
    const canApprove = [
      "change_board",
      "architect",
      "product_owner",
      "engineer",
    ].includes(ws.session.role);
    const hasWaves = (ws.project?.wave_plan?.waves || []).length > 0;

    if (view === "overview") {
      if (approved) {
        return (
          <Link href={SUITE_GALLERY_HREF} className="btn" title="Return to Stage map">
            Stage map
          </Link>
        );
      }
      return (
        <Link
          href={toolHref("horizon", "approve")}
          className="btn"
          title={
            hasWaves
              ? "Review wave scope and approve"
              : "Build waves first, then review and approve"
          }
        >
          Review & approve
        </Link>
      );
    }

    if (view !== "approve") return null;

    if (approved) {
      return (
        <Link href={SUITE_GALLERY_HREF} className="btn" title="Return to Stage map">
          Stage map
        </Link>
      );
    }

    return (
      <button
        type="button"
        className="btn"
        disabled={ws.busy || !canApprove || !hasWaves}
        title={
          !canApprove
            ? "Requires engineer, architect, product owner, or change board"
            : !hasWaves
              ? "Build waves on Overview first"
              : "Approve wave plan and return to Gallery"
        }
        onClick={() =>
          void ws
            .run("Approve wave plan", () =>
              api(`/projects/${ws.pid}/plan/approve`, { method: "POST" })
            )
            .then(() => ws.refreshProject())
            .then(() => router.push(SUITE_GALLERY_HREF))
        }
      >
        Approve → Stage map
      </button>
    );
  }

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

    if (approved) {
      return (
        <Link href={SUITE_GALLERY_HREF} className="btn" title="Return to Stage map">
          Stage map
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
              : "Approve disposition register and return to Gallery"
        }
        onClick={() =>
          void ws
            .run("Change Board approval", () =>
              api(`/projects/${ws.pid}/disposition/approve`, { method: "POST" })
            )
            .then(() => ws.refreshProject())
            .then(() => router.push(SUITE_GALLERY_HREF))
        }
      >
        Approve → Stage map
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

    if (metadataComplete) {
      if (view === "approve") {
        return (
          <Link href={SUITE_GALLERY_HREF} className="btn" title="Return to Stage map">
            Stage map
          </Link>
        );
      }
      return null;
    }

    // Approve owns the metadata gate (Complete → Stage map)
    if (view === "approve" && mappingApproved) {
      return (
        <button
          type="button"
          className="btn"
          disabled={ws.busy || !canCompleteMetadata}
          title={
            !canCompleteMetadata
              ? "Requires product owner, data owner, change board, architect, or engineer"
              : !completenessOk
                ? "Will seed SID entities from mappings, then return to Gallery"
                : "Mark metadata complete and return to Gallery"
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
              .then(() => router.push(SUITE_GALLERY_HREF))
          }
        >
          Complete → Stage map
        </button>
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

    if (approved) {
      return (
        <Link href={toolHref("prove")} className="btn" title="Continue to Pilot">
          Continue → Pilot
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
              ? "Generate in-scope convert apps from Forge apps first"
              : "Approve build and open Pilot"
        }
        onClick={() =>
          void ws
            .run("Build pack approval", () =>
              api(`/projects/${ws.pid}/build/approve`, { method: "POST" })
            )
            .then(() => ws.refreshProject())
            .then(() => router.push(toolHref("prove")))
        }
      >
        Approve build → Pilot
      </button>
    );
  }

  if (phaseId === "5_pilot_product") {
    // Gate exit on Reconcile — Continue → Migrate
    if (view !== "reconcile") return null;

    const reconcilePassed = !!(
      ws.reconcileLatest?.passed ?? ws.reconcileLatest?.metrics?.passed
    );
    const alreadyMigrate =
      ws.project?.phase === "6_migrate" || !!ws.project?.prod_env_ready;
    const canContinue = [
      "architect",
      "engineer",
      "product_owner",
      "change_board",
    ].includes(ws.session.role);

    if (alreadyMigrate) {
      return (
        <Link
          href={toolHref("transit")}
          className="btn"
          title="Open Migrate cutover"
        >
          Continue → Migrate
        </Link>
      );
    }

    return (
      <button
        type="button"
        className="btn"
        disabled={ws.busy || !canContinue || !reconcilePassed}
        title={
          !canContinue
            ? "Requires engineer, architect, product owner, or change board"
            : !reconcilePassed
              ? "Pass Reconcile within tolerance first"
              : "Unlock Migrate and open cutover"
        }
        onClick={() =>
          void ws
            .run("Continue to Migrate", () =>
              api(`/projects/${ws.pid}/pilot/continue`, { method: "POST" })
            )
            .then(() => ws.refreshProject())
            .then(() => router.push(toolHref("transit")))
        }
      >
        Continue → Migrate
      </button>
    );
  }

  if (phaseId === "6_migrate") {
    if (view !== "signoff") return null;
    const complete = ws.cutover?.status === "complete";
    const signed = !!(ws.cutover?.prod_env?.signoff?.signed_at || ws.project?.prod_env?.signoff?.signed_at);
    if (complete || signed) {
      return (
        <Link href={SUITE_GALLERY_HREF} className="btn" title="Return to Stage map">
          Stage map
        </Link>
      );
    }
    return null;
  }

  if (phaseId === "7_decommission") {
    if (view !== "close") return null;

    const journeyClosed =
      !!ws.project?.change_closed || ws.project?.status === "closed";
    const readyToClose =
      journeyClosed ||
      ws.project?.status === "pilot_complete" ||
      ws.cutover?.status === "complete";
    const canClose = [
      "change_board",
      "architect",
      "product_owner",
      "engineer",
    ].includes(ws.session.role);

    if (journeyClosed) {
      return (
        <Link
          href="/workspace"
          className="btn"
          title="Open Dashboard — this estate is complete"
          onClick={() => {
            void ws.loadPortfolio({ projectId: null, days: 30 });
          }}
        >
          Journey complete · Dashboard
        </Link>
      );
    }

    if (!readyToClose) return null;

    return (
      <button
        type="button"
        className="btn"
        disabled={ws.busy || !canClose}
        title={
          !canClose
            ? "Requires Change Board or Architect"
            : "Close the migration change, mark this estate complete on the Dashboard"
        }
        onClick={() =>
          void ws
            .run("Complete journey", () =>
              api(`/projects/${ws.pid}/change/close`, {
                method: "POST",
                body: JSON.stringify({ finalize: true }),
              })
            )
            .then(() => ws.refreshProject())
            .then(() => ws.loadPhase67())
            .then(() => ws.loadPortfolio({ projectId: null, days: 30 }))
            .then(() => router.push("/workspace"))
        }
      >
        Complete journey → Dashboard
      </button>
    );
  }

  if (phaseId !== "1_discovery") return null;

  const v = view || "profiling";
  const discoverRun = ws.discoveryRunDiscover;
  const inventoryRun = ws.discoveryRunInventory;
  const discoverStatus = String(discoverRun?.status || "").toLowerCase();
  const inventoryStatus = String(inventoryRun?.status || "").toLowerCase();
  const discoverActive = ["queued", "running"].includes(discoverStatus);
  const inventoryActive = ["queued", "running"].includes(inventoryStatus);
  const discoverDone = discoverStatus === "completed";
  const estateBound = !!(
    ws.estate?.exists ||
    ws.project?.sample_slug ||
    ws.project?.legacy_root
  );
  const cursorReady = ws.llmStatus?.cursor_configured !== false;

  const runDiscover = () =>
    void ws.run("Discovery scan queued", async () => {
      const result = await api<any>(`/projects/${ws.pid}/discovery/run`, {
        method: "POST",
        body: JSON.stringify({ pipeline: "discover" }),
      });
      if (result?.run_id) {
        const detail = await api(`/projects/${ws.pid}/discovery/runs/${result.run_id}`);
        ws.setDiscoveryRunDiscover(detail);
        ws.setDiscoveryRun(detail);
      }
      await ws.loadPhase1();
      router.push(phaseHref("1_discovery", "console"));
      return result;
    });

  const runInventory = () =>
    void ws.run("Profiling & lineage queued", async () => {
      const result = await api<any>(`/projects/${ws.pid}/discovery/run`, {
        method: "POST",
        body: JSON.stringify({ pipeline: "inventory" }),
      });
      if (result?.run_id) {
        const detail = await api(`/projects/${ws.pid}/discovery/runs/${result.run_id}`);
        ws.setDiscoveryRunInventory(detail);
        ws.setDiscoveryRun(detail);
      }
      await ws.loadPhase1();
      router.push(phaseHref("1_discovery", "profiling"));
      return result;
    });

  if (v === "sources") {
    const canRun = estateBound && !ws.busy && !discoverActive && cursorReady;
    return (
      <button
        type="button"
        className="btn text-xs"
        disabled={!canRun}
        title={
          !estateBound
            ? "Connect a source first"
            : !cursorReady
              ? "Set CURSOR_API_KEY"
              : discoverActive
                ? "Discovery in progress"
                : "Start discovery scan"
        }
        onClick={runDiscover}
      >
        {discoverActive ? "Scanning…" : "Start discovery"}
      </button>
    );
  }

  if (v === "console") {
    const canRerun =
      (discoverDone || discoverStatus === "failed" || !discoverRun) &&
      !ws.busy &&
      !discoverActive &&
      estateBound;
    return (
      <button
        type="button"
        className="btn text-xs"
        disabled={!canRerun}
        title={
          discoverActive
            ? "Discovery scan in progress"
            : !estateBound
              ? "Connect a source first"
              : "Run discovery scan"
        }
        onClick={runDiscover}
      >
        {discoverActive
          ? "Running…"
          : discoverRun
            ? "Re-run scan"
            : "Run scan"}
      </button>
    );
  }

  if (v === "profiling" || v === "inventory" || v === "usage") {
    const canRun =
      !ws.busy &&
      !inventoryActive &&
      estateBound &&
      (discoverDone ||
        (ws.discoveryRuns || []).some(
          (r: any) =>
            String((r.summary || {}).pipeline || "discover").toLowerCase() ===
              "discover" &&
            String(r.status || "").toLowerCase() === "completed"
        ));
    const label = inventoryActive
      ? "Profiling…"
      : inventoryRun || (ws.inventory?.length || 0) > 0
        ? "Re-run profiling"
        : "Run profiling";
    return (
      <button
        type="button"
        className="btn text-xs"
        disabled={!canRun}
        title={
          !estateBound
            ? "Connect a source first"
            : !discoverDone
              ? "Complete Activity scan first"
              : "Run InventoryProfiler & LineageStitcher"
        }
        onClick={runInventory}
      >
        {label}
      </button>
    );
  }

  if (v === "lineage" || v === "jobs") {
    return null;
  }

  if (v === "review" || v === "assessment" || v === "signoff") {
    if (ws.project?.inventory_signed_off) {
      return (
        <Link href={toolHref("horizon")} className="btn text-xs" title="Open Plan · Mirage Horizon">
          Continue → Plan
        </Link>
      );
    }
    return null;
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
          ws.run("Platform Hub probe", () =>
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
    const bleed =
      view === "lineage" ||
      view === "console" ||
      view === "profiling" ||
      view === "inventory" ||
      view === "review" ||
      view === "assessment" ||
      view === "signoff";
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
                ? "Profiling & lineage queued"
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
                  router.push(phaseHref("1_discovery", "profiling"));
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
            router.push(toolHref("horizon"));
          }}
        />
      </div>
    );
  }

  if (phaseId === "2_plan") {
    return (
      <PhasePlan
        view={view}
        project={ws.project}
        inventory={ws.inventory}
        lineage={ws.lineage}
        jobs={ws.jobs}
        busy={ws.busy}
        sessionRole={ws.session.role}
        onRefreshProject={ws.refreshProject}
        onMsg={(m) => ws.setMsg(m)}
      />
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
        planApproved={!!ws.project.plan_approved}
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
          await ws.refreshProject();
          router.push(SUITE_GALLERY_HREF);
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
            await ws.refreshProject();
            router.push(SUITE_GALLERY_HREF);
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
            advanced ? "SID mapping + semantic enrichment" : "SID mapping agent",
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
    const accelViews = [
      "accelerators",
      "cataloguer",
      "composer",
      "transform",
      "contracts",
    ];
    if (view === "suite") {
      return (
        <ForgeToolSuite
          project={ws.project}
          inventory={ws.inventory}
          summary={ws.buildSummary}
          artifacts={ws.buildArtifacts}
          metadataComplete={!!ws.project.metadata_complete}
          buildApproved={!!ws.project.build_approved}
          busy={ws.busy}
          agentRuns={ws.agentRuns.filter((r) =>
            FORGE_ACCELERATOR_TASKS.includes(r.task)
          )}
          onApproveBuild={() =>
            ws.run("Build pack approval", async () => {
              await api(`/projects/${pid}/build/approve`, { method: "POST" });
              await ws.refreshProject();
              router.push(toolHref("prove"));
            })
          }
        />
      );
    }
    if (accelViews.includes(view || "")) {
      return (
        <ForgeAcceleratorWorkbench
          project={ws.project}
          view={view || "accelerators"}
          buildApproved={!!ws.project.build_approved}
          metadataComplete={!!ws.project.metadata_complete}
          agentRuns={ws.agentRuns.filter((r) =>
            FORGE_ACCELERATOR_TASKS.includes(r.task)
          )}
          products={ws.products}
          busy={ws.busy}
          msg={ws.msg}
          onPollAgents={() => ws.pollAgents()}
          onRunAgent={(task, payload) =>
            ws.run(`Agent: ${task}`, async () => {
              const runRow = await api(`/projects/${pid}/agents/${task}/runs`, {
                method: "POST",
                body: JSON.stringify({ payload }),
              });
              ws.setAgentRuns((prev) => [
                runRow,
                ...prev.filter((r) => r.id !== runRow.id),
              ]);
              return runRow;
            })
          }
        />
      );
    }
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
        onGenerate={(targets, tool) =>
          ws.run("Generate Build pack", () =>
            api(`/projects/${pid}/build/generate`, {
              method: "POST",
              body: JSON.stringify({
                targets: targets || {},
                ...(tool ? { tool } : {}),
              }),
            }).then(async () => {
              await ws.loadBuild();
              // Stay on the convert tool — Generate is source→target only
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
            router.push(toolHref("prove"));
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
            }).then(() => {
              ws.appendAgentChatLines(
                pilotActionChatLines(
                  "reviews",
                  `Review #${id} ${decision === "approve" ? "approved" : "rejected"}`,
                  pid
                )
              );
              return ws.loadPhase5();
            })
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
              }).then(() => {
                ws.appendAgentChatLines(
                  pilotActionChatLines(
                    "reviews",
                    decision === "approve"
                      ? "Bulk-approved pending Reviews"
                      : "Bulk-rejected pending Reviews",
                    pid
                  )
                );
                return ws.loadPhase5();
              })
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
                const result = await api<any>(
                  `/projects/${pid}/products/${id}/pipeline/run`,
                  { method: "POST" }
                );
                const stages = (result?.stages || result?.blueprint?.stages || [])
                  .map((s: any) =>
                    `· ${s.label || s.id || s.name || "stage"} · ${s.status || "ok"}`
                  )
                  .slice(0, 8);
                ws.appendAgentChatLines(
                  pilotActionChatLines(
                    "pipeline",
                    `Dual pipeline completed for product #${id}${
                      result?.dataset_name ? ` · ${result.dataset_name}` : ""
                    }`,
                    pid,
                    stages.length
                      ? stages
                      : ["· ingest / landing / transform / publish succeeded"]
                  )
                );
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
                const metrics = await api<any>(
                  `/projects/${pid}/products/${id}/reconcile`,
                  { method: "POST" }
                );
                const passed = !!(metrics?.passed ?? metrics?.metrics?.passed);
                const delta =
                  metrics?.delta_pct ?? metrics?.metrics?.delta_pct;
                ws.appendAgentChatLines(
                  pilotActionChatLines(
                    "reconcile",
                    `Reconcile ${passed ? "passed" : "failed"} for product #${id}${
                      delta != null ? ` · Δ ${Number(delta).toFixed(2)}%` : ""
                    }`,
                    pid
                  )
                );
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
            ws.appendAgentChatLines(
              pilotActionChatLines(
                "test_env",
                `Migrate to Test · promoted ${productIds.length} product${
                  productIds.length === 1 ? "" : "s"
                } (${productIds.join(", ")})`,
                pid
              )
            );
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
          router.push(SUITE_GALLERY_HREF);
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
            router.push(SUITE_GALLERY_HREF);
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
          await ws.run("Close change / complete wave", () =>
            api(`/projects/${pid}/change/close`, {
              method: "POST",
              body: JSON.stringify({ finalize: true }),
            })
          );
          await ws.refreshProject();
          await ws.loadPhase67();
          await ws.loadPortfolio({ projectId: null, days: 30 });
          router.push("/workspace");
        }}
      />
    );
  }

  return <div className="p-5 text-sm text-brand-muted">Phase not available.</div>;
}
