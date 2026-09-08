"use client";

import { useEffect, useMemo, useState } from "react";
import { UdpHubPanel } from "@/components/phases/UdpHubPanel";
import { InspectorPanel } from "@/components/shell/InspectorPanel";

const GROUP_META: Record<string, { title: string; blurb: string }> = {
  access: {
    title: "Access",
    blurb: "Confirm read access — attach notes, owner, or evidence URL for Wave-1 systems.",
  },
  environments: {
    title: "Environments",
    blurb: "Landing zone and non-production deploy path before discovery starts.",
  },
  tooling: {
    title: "Tooling",
    blurb: "Control plane, migration-repo layout, and CI hooks for gated delivery.",
  },
  freeze: {
    title: "Change freeze",
    blurb: "Wave-1 scope and freeze window so the legacy estate does not drift mid-migration.",
  },
};

type Props = {
  view: string;
  mobilisation: any | null;
  udpHub?: any | null;
  llmStatus?: any | null;
  busy: boolean;
  sessionRole: string;
  onToggle: (itemId: string, done: boolean) => void;
  onSaveItem: (itemId: string, body: Record<string, unknown>) => void;
  onBulkGroup: (group: string, done: boolean, acceptDemoEvidence?: boolean) => void;
  onAcceptDecisionDefaults: () => void;
  onSaveDecision: (decisionId: string, body: Record<string, unknown>) => void;
  onSaveFreeze: (body: Record<string, unknown>) => void;
  onAcceptFreezeDefaults: () => void;
  onPublishFreeze: () => void;
  onSaveTeam: (body: Record<string, unknown>) => void;
  onAcceptTeamDefaults: () => void;
  onBindHubSpoke?: (spokeId: string) => void;
  onProbeHub?: () => void;
  onReady: () => void;
  onRefreshHub?: () => void;
};

const DEMO_PICKER = [
  { email: "architect@demo.local", label: "Alex Architect" },
  { email: "owner@demo.local", label: "Pat Product Owner" },
  { email: "dataowner@demo.local", label: "Dana Data Owner" },
  { email: "steward@demo.local", label: "Sam Data Steward" },
  { email: "board@demo.local", label: "Casey Change Board" },
  { email: "engineer@demo.local", label: "Jordan Engineer" },
];

export function Phase0Mobilisation({
  view,
  mobilisation,
  udpHub,
  llmStatus,
  busy,
  sessionRole,
  onToggle,
  onSaveItem,
  onBulkGroup,
  onAcceptDecisionDefaults,
  onSaveDecision,
  onSaveFreeze,
  onAcceptFreezeDefaults,
  onPublishFreeze,
  onSaveTeam,
  onAcceptTeamDefaults,
  onBindHubSpoke,
  onProbeHub,
  onReady,
  onRefreshHub,
}: Props) {
  const items: any[] = mobilisation?.items || [];
  const decisions: any[] = mobilisation?.decisions || [];
  const freeze: any = mobilisation?.freeze || {};
  const teamRoster: any[] = mobilisation?.team_roster || [];
  const readyChecks = mobilisation?.ready_checks;
  const canEdit = [
    "engineer",
    "architect",
    "change_board",
    "product_owner",
    "data_owner",
    "data_steward",
  ].includes(sessionRole);
  const canDecide = [
    "architect",
    "change_board",
    "product_owner",
    "data_owner",
    "engineer",
  ].includes(sessionRole);
  const canPublishFreeze = ["architect", "change_board"].includes(sessionRole);
  const canReady = ["architect", "change_board", "product_owner"].includes(sessionRole);
  const ready = !!mobilisation?.ready;
  const progress = mobilisation?.progress || { done: 0, total: items.length };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    notes: "",
    owner_email: "",
    evidence_url: "",
    status: "open",
  });
  const [decDraft, setDecDraft] = useState({
    value: "",
    notes: "",
    status: "open",
  });
  const [freezeDraft, setFreezeDraft] = useState({
    freeze_start: "",
    freeze_end: "",
    scope_summary: "",
    in_scope_systems: "",
    change_board_ref: "",
    exception_policy: "",
    notified_consumers: "",
    deferred: false,
    deferred_note: "",
  });
  const [teamDraft, setTeamDraft] = useState<Record<string, string>>({});

  const groups = useMemo(() => {
    const order = ["access", "environments", "tooling", "freeze"];
    return order.map((g) => ({
      id: g,
      ...GROUP_META[g],
      items: items.filter((i) => i.group === g),
    }));
  }, [items]);

  const selected = selectedId ? items.find((i) => i.id === selectedId) || null : null;
  const selectedDecision = selectedDecisionId
    ? decisions.find((d) => d.id === selectedDecisionId) || null
    : null;

  useEffect(() => {
    if (selected) {
      setDraft({
        notes: selected.notes || "",
        owner_email: selected.owner_email || "",
        evidence_url: selected.evidence_url || "",
        status: selected.status || (selected.done ? "done" : "open"),
      });
    }
  }, [selectedId, selected]);

  useEffect(() => {
    if (selectedDecision) {
      setDecDraft({
        value: selectedDecision.value || "",
        notes: selectedDecision.notes || "",
        status: selectedDecision.status || "open",
      });
    }
  }, [selectedDecisionId, selectedDecision]);

  useEffect(() => {
    setFreezeDraft({
      freeze_start: freeze.freeze_start || "",
      freeze_end: freeze.freeze_end || "",
      scope_summary: freeze.scope_summary || "",
      in_scope_systems: (freeze.in_scope_systems || []).join(", "),
      change_board_ref: freeze.change_board_ref || "",
      exception_policy: freeze.exception_policy || "",
      notified_consumers: (freeze.notified_consumers || []).join(", "),
      deferred: !!freeze.deferred,
      deferred_note: freeze.deferred_note || "",
    });
  }, [mobilisation?.freeze]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const r of teamRoster) {
      next[r.id] = r.email || "";
    }
    setTeamDraft(next);
  }, [mobilisation?.team, mobilisation?.team_roster]);

  if (view === "hub") {
    return (
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-tm-gray-500">
          <span>
            LLM mode: <strong>{llmStatus?.llm_mode || udpHub?.llm_mode || "mock"}</strong>
          </span>
          {llmStatus?.openai_configured != null && (
            <span className="badge-neutral">
              OpenAI key {llmStatus.openai_configured ? "set" : "not set"}
            </span>
          )}
        </div>
        <UdpHubPanel
          hub={udpHub}
          busy={busy}
          canEdit={canEdit}
          onRefresh={onRefreshHub}
          onBindSpoke={onBindHubSpoke}
          onProbe={onProbeHub}
        />
      </div>
    );
  }

  if (view === "team") {
    const missing: string[] =
      readyChecks?.checks?.find((c: any) => c.id === "team")?.detail?.missing || [];
    return (
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Team / RACI</h3>
            <p className="mt-1 max-w-2xl text-sm text-tm-gray-600">
              Name Wave-1 accountable roles. Ready requires <strong>architect</strong> and{" "}
              <strong>data_owner</strong>.
            </p>
          </div>
          {canDecide && (
            <button className="btn" disabled={busy} onClick={onAcceptTeamDefaults}>
              Seed demo users
            </button>
          )}
        </div>
        {missing.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn">
            Still required: {missing.join(", ")}
          </div>
        )}
        <div className="card max-w-2xl space-y-3">
          {(teamRoster.length
            ? teamRoster
            : [
                { id: "architect", label: "Solution architect", raci: "A" },
                { id: "product_owner", label: "Product owner", raci: "A" },
                { id: "data_owner", label: "Data owner", raci: "A" },
                { id: "data_steward", label: "Data steward", raci: "R" },
                { id: "change_board", label: "Change board", raci: "C" },
                { id: "engineer_lead", label: "Engineer lead", raci: "R" },
              ]
          ).map((r: any) => (
            <label key={r.id} className="block text-xs">
              <span className="flex items-center gap-2 text-tm-gray-500">
                {r.label}
                <span className="badge-neutral text-[10px]">RACI {r.raci}</span>
                {(r.id === "architect" || r.id === "data_owner") && (
                  <span className="text-[10px] font-semibold uppercase text-tm-magenta">
                    Required
                  </span>
                )}
              </span>
              <div className="mt-0.5 flex gap-2">
                <input
                  className="input flex-1"
                  list="demo-team-emails"
                  value={teamDraft[r.id] || ""}
                  disabled={!canDecide || busy}
                  onChange={(e) =>
                    setTeamDraft((p) => ({ ...p, [r.id]: e.target.value }))
                  }
                />
              </div>
            </label>
          ))}
          <datalist id="demo-team-emails">
            {DEMO_PICKER.map((u) => (
              <option key={u.email} value={u.email}>
                {u.label}
              </option>
            ))}
          </datalist>
          {canDecide && (
            <button
              className="btn w-full text-xs sm:w-auto"
              disabled={busy}
              onClick={() => onSaveTeam(teamDraft)}
            >
              Save team
            </button>
          )}
        </div>
      </div>
    );
  }

  if (view === "freeze") {
    const freezeCheck = readyChecks?.checks?.find((c: any) => c.id === "freeze");
    const freezeItems = items.filter((i) => i.group === "freeze");
    return (
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Change freeze register</h3>
            <p className="mt-1 max-w-2xl text-sm text-tm-gray-600">
              Structured window, scope, Change Board ref, and consumer notifications. Publishing
              (Architect / Change Board) ticks the freeze checklist.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canDecide && (
              <button
                className="btn-secondary text-xs"
                disabled={busy}
                onClick={onAcceptFreezeDefaults}
              >
                Accept demo defaults
              </button>
            )}
            {canPublishFreeze && (
              <button className="btn text-xs" disabled={busy} onClick={onPublishFreeze}>
                Publish freeze
              </button>
            )}
          </div>
        </div>
        {freeze.published ? (
          <div className="badge-success w-fit text-sm">
            Published {freeze.published_at || ""} · {freeze.published_by || ""}
          </div>
        ) : freeze.deferred ? (
          <div className="badge-neutral w-fit text-sm">Deferred with Change Board note</div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn">
            Not published — Ready check: {freezeCheck?.passed ? "pass" : "fail"}
          </div>
        )}
        <div className="card max-w-2xl space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-tm-gray-500">Freeze start</span>
              <input
                type="date"
                className="input mt-0.5"
                value={freezeDraft.freeze_start}
                disabled={!canDecide || busy}
                onChange={(e) =>
                  setFreezeDraft((p) => ({ ...p, freeze_start: e.target.value }))
                }
              />
            </label>
            <label className="block text-xs">
              <span className="text-tm-gray-500">Freeze end</span>
              <input
                type="date"
                className="input mt-0.5"
                value={freezeDraft.freeze_end}
                disabled={!canDecide || busy}
                onChange={(e) =>
                  setFreezeDraft((p) => ({ ...p, freeze_end: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="text-tm-gray-500">Scope summary</span>
            <textarea
              className="input mt-0.5 min-h-[72px]"
              value={freezeDraft.scope_summary}
              disabled={!canDecide || busy}
              onChange={(e) =>
                setFreezeDraft((p) => ({ ...p, scope_summary: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs">
            <span className="text-tm-gray-500">In-scope systems (comma-separated)</span>
            <input
              className="input mt-0.5"
              value={freezeDraft.in_scope_systems}
              disabled={!canDecide || busy}
              onChange={(e) =>
                setFreezeDraft((p) => ({ ...p, in_scope_systems: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs">
            <span className="text-tm-gray-500">Change Board ref</span>
            <input
              className="input mt-0.5"
              value={freezeDraft.change_board_ref}
              disabled={!canDecide || busy}
              onChange={(e) =>
                setFreezeDraft((p) => ({ ...p, change_board_ref: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs">
            <span className="text-tm-gray-500">Exception policy</span>
            <textarea
              className="input mt-0.5 min-h-[56px]"
              value={freezeDraft.exception_policy}
              disabled={!canDecide || busy}
              onChange={(e) =>
                setFreezeDraft((p) => ({ ...p, exception_policy: e.target.value }))
              }
            />
          </label>
          <label className="block text-xs">
            <span className="text-tm-gray-500">Notified consumers (comma-separated)</span>
            <input
              className="input mt-0.5"
              value={freezeDraft.notified_consumers}
              disabled={!canDecide || busy}
              onChange={(e) =>
                setFreezeDraft((p) => ({ ...p, notified_consumers: e.target.value }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={freezeDraft.deferred}
              disabled={!canDecide || busy}
              onChange={(e) =>
                setFreezeDraft((p) => ({ ...p, deferred: e.target.checked }))
              }
            />
            Defer freeze (requires Change Board note)
          </label>
          {freezeDraft.deferred && (
            <label className="block text-xs">
              <span className="text-tm-gray-500">Deferred note</span>
              <textarea
                className="input mt-0.5 min-h-[56px]"
                value={freezeDraft.deferred_note}
                disabled={!canDecide || busy}
                onChange={(e) =>
                  setFreezeDraft((p) => ({ ...p, deferred_note: e.target.value }))
                }
              />
            </label>
          )}
          {canDecide && (
            <button
              className="btn w-full text-xs sm:w-auto"
              disabled={busy}
              onClick={() =>
                onSaveFreeze({
                  ...freezeDraft,
                  in_scope_systems: freezeDraft.in_scope_systems
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  notified_consumers: freezeDraft.notified_consumers
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            >
              Save register
            </button>
          )}
        </div>
        {freezeItems.length > 0 && (
          <div className="max-w-2xl">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
              Linked checklist
            </h4>
            <ul className="space-y-2">
              {freezeItems.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center gap-2 rounded-lg border border-tm-gray-200 px-3 py-2 text-sm"
                >
                  <span
                    className={
                      it.done || it.status === "done" ? "badge-success" : "badge-neutral"
                    }
                  >
                    {it.status || (it.done ? "done" : "open")}
                  </span>
                  {it.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (view === "decisions") {
    const missing: string[] = readyChecks?.checks?.find((c: any) => c.id === "decisions")
      ?.detail?.missing || [];
    return (
      <div className="-m-5 flex min-h-[calc(100vh-11rem)] flex-row">
        <div className="flex min-h-0 flex-1 flex-col p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Wave-1 decisions (proposal §10)</h3>
              <p className="mt-1 max-w-2xl text-sm text-tm-gray-600">
                Record scope, platform, reference model, and usage window before Discovery. Minimum
                required decisions must be <strong>decided</strong> (or deferred with a reason) to
                pass Ready.
              </p>
            </div>
            {canDecide && (
              <button
                className="btn"
                disabled={busy}
                onClick={onAcceptDecisionDefaults}
              >
                Accept demo defaults
              </button>
            )}
          </div>
          {missing.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn">
              Still required: {missing.join(", ")}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-tm-gray-200">
            <table className="w-full">
              <thead className="sticky top-0 bg-tm-gray-50">
                <tr>
                  <th className="table-th px-4">Decision</th>
                  <th className="table-th">Status</th>
                  <th className="table-th px-4">Value</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => (
                  <tr
                    key={d.id}
                    className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                      selectedDecisionId === d.id ? "bg-tm-magenta-light/60" : ""
                    }`}
                    onClick={() => setSelectedDecisionId(d.id)}
                  >
                    <td className="table-td px-4">
                      <div className="text-sm font-medium text-tm-ink">{d.id}</div>
                      <div className="text-xs text-tm-gray-500 line-clamp-2">{d.question}</div>
                      {d.required_for_ready && (
                        <span className="mt-1 inline-block text-[10px] font-semibold uppercase text-tm-magenta">
                          Required
                        </span>
                      )}
                    </td>
                    <td className="table-td">
                      <span
                        className={
                          d.status === "decided"
                            ? "badge-success"
                            : d.status === "deferred"
                              ? "badge-neutral"
                              : "badge bg-amber-50 text-warn"
                        }
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="table-td px-4 text-xs text-tm-gray-600">
                      {d.value || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <InspectorPanel
          open={!!selectedDecision}
          title={selectedDecision?.id || "Decision"}
          onClose={() => setSelectedDecisionId(null)}
        >
          {selectedDecision ? (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-tm-gray-600">{selectedDecision.question}</p>
              <label className="block text-xs">
                <span className="text-tm-gray-500">Status</span>
                <select
                  className="input mt-0.5"
                  value={decDraft.status}
                  disabled={!canDecide || busy}
                  onChange={(e) => setDecDraft((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="open">open</option>
                  <option value="decided">decided</option>
                  <option value="deferred">deferred</option>
                </select>
              </label>
              <label className="block text-xs">
                <span className="text-tm-gray-500">Value</span>
                <textarea
                  className="input mt-0.5 min-h-[88px]"
                  value={decDraft.value}
                  disabled={!canDecide || busy}
                  onChange={(e) => setDecDraft((p) => ({ ...p, value: e.target.value }))}
                />
              </label>
              <label className="block text-xs">
                <span className="text-tm-gray-500">Notes</span>
                <textarea
                  className="input mt-0.5 min-h-[56px]"
                  value={decDraft.notes}
                  disabled={!canDecide || busy}
                  onChange={(e) => setDecDraft((p) => ({ ...p, notes: e.target.value }))}
                />
              </label>
              {selectedDecision.decided_by && (
                <p className="text-[11px] text-tm-gray-500">
                  By {selectedDecision.decided_by}
                  {selectedDecision.decided_at ? ` · ${selectedDecision.decided_at}` : ""}
                </p>
              )}
              {canDecide && (
                <button
                  className="btn w-full text-xs"
                  disabled={busy}
                  onClick={() => onSaveDecision(selectedDecision.id, decDraft)}
                >
                  Save decision
                </button>
              )}
            </div>
          ) : null}
        </InspectorPanel>
      </div>
    );
  }

  if (view === "ready") {
    const checks = readyChecks?.checks || [];
    const hardPass = !!readyChecks?.passed;
    const soft = readyChecks?.soft_warnings || [];
    const hardChecks = checks.filter((c: any) => !c.soft);
    const hardPassed = hardChecks.filter((c: any) => c.passed).length;
    const failed = checks.filter((c: any) => !c.passed && !c.soft);
    const CHECK_HREF: Record<string, string> = {
      access: "/workspace/phase/0_mobilisation/access",
      decisions: "/workspace/phase/0_mobilisation/decisions",
      freeze: "/workspace/phase/0_mobilisation/freeze",
      team: "/workspace/phase/0_mobilisation/team",
      hub: "/workspace/phase/0_mobilisation/hub",
      sources: "/workspace/phase/1_discovery/sources",
    };
    return (
      <div className="space-y-4 p-5">
        <div className="card max-w-2xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">Mobilisation gate</h3>
              <p className="mt-1 text-sm text-tm-gray-600">
                Exit criterion: <strong>Team can read source and deploy to non-production</strong>.
                Auto-checks must pass before sign-off unlocks Discovery.
              </p>
            </div>
            <div className="text-right text-xs text-tm-gray-500">
              Hard checks
              <div className="text-lg font-semibold text-tm-ink">
                {hardPassed}/{hardChecks.length || "—"}
              </div>
            </div>
          </div>
          <ul className="space-y-2">
            {checks.map((c: any) => {
              const fix =
                c.fix_view && CHECK_HREF[c.fix_view]
                  ? CHECK_HREF[c.fix_view]
                  : c.fix_view
                    ? `/workspace/phase/0_mobilisation/${c.fix_view}`
                    : null;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-tm-gray-50 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    {c.label}
                    {c.soft ? (
                      <span className="ml-2 text-[10px] uppercase text-tm-gray-400">soft</span>
                    ) : null}
                    {!c.passed && c.detail?.missing?.length ? (
                      <span className="mt-0.5 block text-[11px] text-tm-gray-500">
                        Missing: {c.detail.missing.join(", ")}
                      </span>
                    ) : null}
                    {!c.passed && c.id === "hub" ? (
                      <span className="mt-0.5 block text-[11px] text-tm-gray-500">
                        Spoke {c.detail?.spoke_bound ? "bound" : "unbound"} · probe{" "}
                        {c.detail?.probe_ok ? "OK" : "needed"}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {!c.passed && fix && (
                      <a className="text-[11px] text-tm-magenta underline" href={fix}>
                        Fix
                      </a>
                    )}
                    <span className={c.passed ? "badge-success" : "badge bg-amber-50 text-warn"}>
                      {c.passed ? "pass" : "fail"}
                    </span>
                  </span>
                </li>
              );
            })}
            {!checks.length && (
              <li className="text-sm text-tm-gray-500">Loading checks…</li>
            )}
          </ul>
          {soft.length > 0 && (
            <p className="text-xs text-warn">
              Soft warnings (Ready still allowed): {soft.join(", ")}.
            </p>
          )}
          {failed.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn">
              Resolve: {failed.map((c: any) => c.id).join(", ")}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => {
              const done = g.items.filter(
                (i) => i.done || i.status === "done" || i.status === "na"
              ).length;
              return (
                <div key={g.id} className="rounded-lg bg-tm-gray-50 px-3 py-2 text-sm">
                  <div className="font-medium text-tm-ink">{g.title}</div>
                  <div className="text-xs text-tm-gray-500">
                    {done}/{g.items.length} complete
                  </div>
                </div>
              );
            })}
          </div>
          {!ready && !checks.find((c: any) => c.id === "estate")?.passed && (
            <a
              className="btn-secondary inline-flex text-xs"
              href="/workspace/phase/1_discovery/sources"
            >
              Bind estate → Discovery Sources
            </a>
          )}
          {ready ? (
            <div className="space-y-2">
              <div className="badge-success w-fit text-sm">
                Mobilisation complete — Discovery open
              </div>
              <a
                className="btn-secondary inline-flex text-xs"
                href="/workspace/phase/1_discovery/sources"
              >
                Continue → Discovery Sources
              </a>
            </div>
          ) : (
            <button
              className="btn"
              disabled={busy || !canReady || !hardPass}
              onClick={onReady}
            >
              {!canReady
                ? "Requires Architect / Change Board / Product Owner"
                : !hardPass
                  ? "Resolve failed Ready checks first"
                  : "Mark mobilisation ready → Discovery"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const activeGroup =
    view === "overview" ? null : groups.find((g) => g.id === view) || groups[0];

  if (!activeGroup) {
    return (
      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => {
            const done = g.items.filter(
              (i) => i.done || i.status === "done" || i.status === "na"
            ).length;
            return (
              <div key={g.id} className="card">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
                  {g.title}
                </div>
                <div className="mt-1 text-2xl font-bold text-tm-ink">
                  {done}/{g.items.length}
                </div>
                <p className="mt-1 text-xs text-tm-gray-500">{g.blurb}</p>
              </div>
            );
          })}
        </div>
        <p className="text-sm text-tm-gray-600">
          Open Access, Environments, UDP Hub, Tooling, Decisions, Team / RACI, or Change freeze
          from the left rail. Finish the Ready gate when checks pass.
        </p>
      </div>
    );
  }

  const doneCount = activeGroup.items.filter(
    (i) => i.done || i.status === "done" || i.status === "na"
  ).length;

  return (
    <div className="-m-5 flex min-h-[calc(100vh-11rem)] flex-row">
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{activeGroup.title}</h3>
            <p className="mt-1 max-w-2xl text-sm text-tm-gray-600">{activeGroup.blurb}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-tm-gray-500">
              {doneCount}/{activeGroup.items.length}
            </span>
            {canEdit && (
              <>
                <button
                  className="btn-secondary text-xs"
                  disabled={busy}
                  onClick={() => onBulkGroup(activeGroup.id, true, false)}
                >
                  Mark all done
                </button>
                <button
                  className="btn text-xs"
                  disabled={busy}
                  onClick={() => onBulkGroup(activeGroup.id, true, true)}
                >
                  Done + demo evidence
                </button>
              </>
            )}
          </div>
        </div>

        <ul className="space-y-2">
          {activeGroup.items.map((it) => {
            const st = it.status || (it.done ? "done" : "open");
            const needsEv =
              it.requires_evidence &&
              st === "done" &&
              !it.verified_at &&
              !it.evidence_url &&
              !it.notes;
            return (
              <li
                key={it.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 ${
                  selectedId === it.id
                    ? "border-tm-magenta/50 bg-tm-magenta-light/40"
                    : st === "done" || st === "na"
                      ? "border-tm-magenta/30 bg-tm-magenta-light/30"
                      : "border-tm-gray-200 bg-white"
                }`}
                onClick={() => setSelectedId(it.id)}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!!it.done || st === "done" || st === "na"}
                  disabled={busy || !canEdit}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onToggle(it.id, e.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-tm-ink">{it.label}</span>
                    <span className="badge-neutral text-[10px]">{st}</span>
                    {needsEv && (
                      <span className="text-[10px] font-semibold uppercase text-warn">
                        evidence gap
                      </span>
                    )}
                  </div>
                  {it.hint && <p className="mt-0.5 text-xs text-tm-gray-500">{it.hint}</p>}
                  {(it.owner_email || it.verified_at) && (
                    <p className="mt-1 text-[11px] text-tm-gray-500">
                      {it.owner_email || "—"}
                      {it.verified_at ? ` · verified ${it.verified_at}` : ""}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {view === "environments" && udpHub ? (
          <div className="pt-4">
            <UdpHubPanel
              hub={udpHub}
              busy={busy}
              canEdit={canEdit}
              onRefresh={onRefreshHub}
              onBindSpoke={onBindHubSpoke}
              onProbe={onProbeHub}
            />
          </div>
        ) : null}
      </div>

      <InspectorPanel
        open={!!selected}
        title={selected?.label || "Checklist item"}
        onClose={() => setSelectedId(null)}
      >
        {selected ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-tm-gray-500">{selected.hint}</p>
            <label className="block text-xs">
              <span className="text-tm-gray-500">Status</span>
              <select
                className="input mt-0.5"
                value={draft.status}
                disabled={!canEdit || busy}
                onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="open">open</option>
                <option value="done">done</option>
                <option value="blocked">blocked</option>
                <option value="na">n/a</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-tm-gray-500">Owner email</span>
              <input
                className="input mt-0.5"
                value={draft.owner_email}
                disabled={!canEdit || busy}
                onChange={(e) => setDraft((p) => ({ ...p, owner_email: e.target.value }))}
              />
            </label>
            <label className="block text-xs">
              <span className="text-tm-gray-500">Evidence URL</span>
              <input
                className="input mt-0.5"
                value={draft.evidence_url}
                disabled={!canEdit || busy}
                onChange={(e) => setDraft((p) => ({ ...p, evidence_url: e.target.value }))}
              />
            </label>
            <label className="block text-xs">
              <span className="text-tm-gray-500">Notes</span>
              <textarea
                className="input mt-0.5 min-h-[72px]"
                value={draft.notes}
                disabled={!canEdit || busy}
                onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              />
            </label>
            {selected.verified_at && (
              <p className="text-[11px] text-tm-gray-500">Verified at {selected.verified_at}</p>
            )}
            {canEdit && (
              <div className="flex flex-col gap-2">
                <button
                  className="btn w-full text-xs"
                  disabled={busy}
                  onClick={() =>
                    onSaveItem(selected.id, {
                      ...draft,
                      done: draft.status === "done" || draft.status === "na",
                    })
                  }
                >
                  Save evidence
                </button>
                <button
                  className="btn-secondary w-full text-xs"
                  disabled={busy}
                  onClick={() =>
                    onSaveItem(selected.id, {
                      ...draft,
                      done: true,
                      status: "done",
                      verified: true,
                    })
                  }
                >
                  Mark verified now
                </button>
              </div>
            )}
          </div>
        ) : null}
      </InspectorPanel>
    </div>
  );
}
