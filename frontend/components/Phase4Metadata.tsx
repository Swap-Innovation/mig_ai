"use client";

import { useEffect, useMemo, useState } from "react";
import { InspectorPanel } from "@/components/shell/InspectorPanel";
import { DataToolbar } from "@/components/shell/DataToolbar";

type SubTab =
  | "overview"
  | "entities"
  | "catalogue"
  | "completeness"
  | "gate";

const SUBTABS: { id: SubTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "entities", label: "Entity metadata" },
  { id: "catalogue", label: "Catalogue & tags" },
  { id: "completeness", label: "Completeness" },
  { id: "gate", label: "Phase gate" },
];

const EMPTY_FORM = {
  entity_key: "Party",
  business_term: "",
  definition: "",
  owner: "",
  steward: "",
  system_of_record: "",
  criticality: "business-critical",
  sensitivity: "personal",
  lawful_basis: "contract",
  retention_days: 2555,
  freshness_sla_hours: 24,
  quality_rules: [] as string[],
  consumers: [] as string[],
  policy_tags: [] as string[],
};

const REQUIRED_KEYS = ["Party", "CustomerAccount"];

type Props = {
  project: any;
  metadata: any[];
  completeness: any | null;
  tags: Record<string, string[]>;
  mappingApproved: boolean;
  mappings?: any[];
  sidStandards?: any | null;
  busy: boolean;
  msg: string;
  sessionRole: string;
  onSeed: () => void;
  onSave: (body: any) => void;
  onComplete: () => void;
  /** Workspace mode: hide outer chrome and show a single view */
  embedded?: boolean;
  view?: string;
};

export function Phase4Metadata({
  project,
  metadata,
  completeness,
  tags,
  mappingApproved,
  mappings = [],
  sidStandards = null,
  busy,
  msg,
  sessionRole,
  onSeed,
  onSave,
  onComplete,
  embedded = false,
  view,
}: Props) {
  const initial = (view as SubTab) || (embedded ? "entities" : "overview");
  const [sub, setSub] = useState<SubTab>(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>("Party");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [tagInput, setTagInput] = useState("");
  const [consumerInput, setConsumerInput] = useState("");
  const [ruleInput, setRuleInput] = useState("");

  useEffect(() => {
    if (view && SUBTABS.some((t) => t.id === view)) {
      setSub(view as SubTab);
    }
  }, [view]);

  const canEdit = [
    "product_owner",
    "architect",
    "engineer",
    "data_owner",
    "data_steward",
    "change_board",
  ].includes(sessionRole);
  const canGate = [
    "product_owner",
    "change_board",
    "data_owner",
    "architect",
    "engineer",
  ].includes(sessionRole);

  const requiredKeys = useMemo((): string[] => {
    const fromApi = (completeness?.checks || []).map((c: { entity_key: string }) =>
      String(c.entity_key)
    );
    if (fromApi.length) return fromApi;
    const fromMaps = Array.from(
      new Set(
        mappings
          .map((m) => String(m.entity || "").trim())
          .filter(Boolean)
      )
    ).sort();
    return fromMaps.length ? fromMaps : [...REQUIRED_KEYS];
  }, [completeness, mappings]);

  const sourceByEntity = useMemo(() => {
    const map = new Map<
      string,
      {
        domain: string;
        sources: string[];
        mapping_count: number;
        attributes: {
          attribute: string;
          legacy_column?: string;
          legacy_object?: string;
          conformance?: string;
        }[];
      }
    >();
    for (const c of completeness?.checks || completeness?.entities || []) {
      const key = String(c.entity_key || "");
      if (!key) continue;
      map.set(key, {
        domain: c.domain || "",
        sources: c.sources || [],
        mapping_count: c.mapping_count || 0,
        attributes: c.attributes || [],
      });
    }
    for (const m of mappings) {
      const key = String(m.entity || "").trim();
      if (!key) continue;
      const cur = map.get(key) || {
        domain: "",
        sources: [] as string[],
        mapping_count: 0,
        attributes: [] as {
          attribute: string;
          legacy_column?: string;
          legacy_object?: string;
          conformance?: string;
        }[],
      };
      if (m.domain && !cur.domain) cur.domain = m.domain;
      if (m.legacy_object && !cur.sources.includes(m.legacy_object)) {
        cur.sources = [...cur.sources, m.legacy_object];
      }
      cur.mapping_count += 1;
      const attr = String(m.attribute || "").trim();
      if (attr && !cur.attributes.some((a) => a.attribute === attr && a.legacy_column === m.legacy_column)) {
        cur.attributes = [
          ...cur.attributes,
          {
            attribute: attr,
            legacy_column: m.legacy_column || "",
            legacy_object: m.legacy_object || "",
            conformance: m.conformance || "",
          },
        ];
      }
      map.set(key, cur);
    }
    return map;
  }, [completeness, mappings]);

  const catalogueAttrsByEntity = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const d of sidStandards?.domains || []) {
      for (const e of d.entities || []) {
        const name = String(e.name || "");
        if (!name) continue;
        out.set(
          name,
          (e.attributes || []).map((a: { name?: string }) => String(a.name || "")).filter(Boolean)
        );
      }
    }
    return out;
  }, [sidStandards]);

  const entityRows = useMemo(() => {
    const keys = new Set<string>([
      ...requiredKeys,
      ...metadata.map((m) => m.entity_key),
      ...Array.from(sourceByEntity.keys()),
    ]);
    return Array.from(keys)
      .sort()
      .map((key) => {
        const row = metadata.find((m) => m.entity_key === key);
        const ok = !!(row?.owner && row?.steward && row?.definition && row?.sensitivity);
        const src = sourceByEntity.get(key);
        return {
          key,
          row,
          ok,
          required: requiredKeys.includes(key),
          domain: src?.domain || "",
          sources: src?.sources || [],
          mappingCount: src?.mapping_count || 0,
          attributes: src?.attributes || [],
          catalogueAttrs: catalogueAttrsByEntity.get(key) || [],
        };
      });
  }, [metadata, requiredKeys, sourceByEntity, catalogueAttrsByEntity]);

  // Prefer first incomplete / first required when selection is stale
  useEffect(() => {
    if (!entityRows.length) return;
    if (selectedKey && entityRows.some((e) => e.key === selectedKey)) return;
    const draft = entityRows.find((e) => e.required && !e.ok) || entityRows[0];
    setSelectedKey(draft.key);
  }, [entityRows, selectedKey]);

  const hasMappedEntities = useMemo(
    () => mappings.some((m) => String(m.entity || "").trim()),
    [mappings]
  );

  const missingSeedCount = useMemo(() => {
    const mappedKeys = new Set(
      mappings.map((m) => String(m.entity || "").trim()).filter(Boolean)
    );
    if (!mappedKeys.size) return 0;
    const have = new Set(metadata.map((m) => m.entity_key));
    let n = 0;
    for (const k of mappedKeys) {
      if (!have.has(k)) n += 1;
    }
    return n;
  }, [mappings, metadata]);

  // Auto-seed any SID entities from Workbench mappings that are not yet in catalogue
  useEffect(() => {
    if (!embedded || !canEdit || busy) return;
    if (!hasMappedEntities && !mappingApproved) return;
    if (metadata.length > 0 && missingSeedCount === 0) return;
    onSeed();
    // intentionally when mappings introduce new entities
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, hasMappedEntities, mappingApproved, missingSeedCount, metadata.length]);

  const filteredEntities = useMemo(() => {
    if (!q) return entityRows;
    const needle = q.toLowerCase();
    return entityRows.filter((e) => {
      const hay =
        `${e.key} ${e.domain} ${e.sources.join(" ")} ${e.row?.owner || ""} ${e.row?.business_term || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [entityRows, q]);

  const selected = useMemo(
    () =>
      selectedKey != null
        ? metadata.find((m) => m.entity_key === selectedKey) || null
        : null,
    [metadata, selectedKey]
  );

  const selectedEntityRow = useMemo(
    () => entityRows.find((e) => e.key === selectedKey) || null,
    [entityRows, selectedKey]
  );

  useEffect(() => {
    if (selected) {
      setForm({
        entity_key: selected.entity_key,
        business_term: selected.business_term || "",
        definition: selected.definition || "",
        owner: selected.owner || "",
        steward: selected.steward || "",
        system_of_record: selected.system_of_record || "",
        criticality: selected.criticality || "analytical",
        sensitivity: selected.sensitivity || "internal",
        lawful_basis: selected.lawful_basis || "",
        retention_days: selected.retention_days ?? 2555,
        freshness_sla_hours: selected.freshness_sla_hours ?? 24,
        quality_rules: selected.quality_rules || [],
        consumers: selected.consumers || [],
        policy_tags: selected.policy_tags || [],
      });
    } else if (selectedKey) {
      setForm({ ...EMPTY_FORM, entity_key: selectedKey });
    }
  }, [selected, selectedKey]);

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden" : "space-y-4"}>
      {embedded && !hasMappedEntities ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-warn">
          Run SID mapping on Align → Workbench first — Entities lists every TM Forum
          SID entity found in those mappings.
        </div>
      ) : null}
      {embedded && hasMappedEntities && !mappingApproved ? (
        <div className="shrink-0 border-b border-brand-line bg-brand-500/5 px-4 py-2 text-xs text-brand-600">
          Showing {entityRows.length} TM Forum SID entit
          {entityRows.length === 1 ? "y" : "ies"} from Workbench mappings. Approve the
          pack on Align → Approve when ownership looks right.
        </div>
      ) : null}
      {embedded && msg ? (
        <div className="shrink-0 border-b border-brand-line bg-brand-500/5 px-4 py-2 text-xs text-brand-600">
          {msg}
        </div>
      ) : null}
      {!embedded && (
        <>
      <header className="card flex flex-wrap items-start justify-between gap-4 !py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tm-magenta">
            Align · Business Metadata
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-tm-ink">
            Meaning, ownership & classification
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-tm-gray-600">
            Capture glossary terms, named owners and stewards, system of record, criticality,
            sensitivity, retention, freshness/quality expectations, and known consumers. Metadata
            is loaded as catalogue <strong>tags</strong> so classification can drive access policy
            and lifecycle — not spreadsheets.
          </p>
          <p className="mt-2 text-xs text-tm-gray-500">
            <span className="font-semibold text-tm-ink">Exit criterion:</span> Every in-scope entity
            has an owner, definition, and classification.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            disabled={busy || !mappingApproved}
            onClick={onSeed}
            title={!mappingApproved ? "Approve mapping on the Align gate first" : undefined}
          >
            Seed Party / CustomerAccount
          </button>
        </div>
      </header>

      {!mappingApproved && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-warn">
          SID mappings must be architect-approved before metadata is treated as Wave-1
          authoritative context.
        </div>
      )}

      {msg && (
        <div className="rounded-xl border border-tm-magenta/20 bg-tm-magenta-light px-4 py-3 text-sm text-tm-magenta-dark">
          {msg}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Entities captured" value={metadata.length} hint="Business metadata records" />
        <Kpi
          label="Completeness"
          value={
            completeness?.complete
              ? "Ready"
              : completeness
                ? "Incomplete"
                : "—"
          }
          hint="Owner + definition + sensitivity"
          accent={!!completeness?.complete}
        />
        <Kpi
          label="Policy tags"
          value={Object.keys(tags || {}).length}
          hint="Dataplex-stub catalogue entries"
        />
        <Kpi
          label="Phase gate"
          value={project.metadata_complete ? "Passed" : "Open"}
          hint="Product Owner / Change Board"
        />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-tm-gray-200 bg-white p-1 shadow-card">
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              sub === t.id
                ? "bg-tm-magenta text-white"
                : "text-tm-gray-600 hover:bg-tm-gray-50 hover:text-tm-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
        </>
      )}

      {sub === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card lg:col-span-2 space-y-4">
            <h3 className="text-base font-semibold">Phase 4 checklist</h3>
            <Check done={!!mappingApproved} title="Mapping pack approved & promoted" />
            <Check done={metadata.length > 0} title="Business metadata records created" />
            <Check
              done={requiredKeys.every((k) => metadata.some((m) => m.entity_key === k && m.owner))}
              title="Named owners assigned (not teams)"
            />
            <Check
              done={requiredKeys.every((k) =>
                metadata.some((m) => m.entity_key === k && m.definition)
              )}
              title="Glossary definitions captured"
            />
            <Check
              done={requiredKeys.every((k) =>
                metadata.some((m) => m.entity_key === k && m.sensitivity)
              )}
              title="Sensitivity / classification set"
            />
            <Check
              done={Object.keys(tags || {}).length > 0}
              title="Policy tags projected to catalogue"
            />
            <Check done={!!project.metadata_complete} title="Phase gate marked complete" />
          </div>
          <div className="card space-y-3 text-sm text-tm-gray-600">
            <h3 className="text-base font-semibold text-tm-ink">Required fields (per entity)</h3>
            <ul className="space-y-1.5 text-xs">
              {[
                "Business term & definition",
                "Data owner & steward (named)",
                "Source system of record",
                "Criticality",
                "Sensitivity + lawful basis",
                "Retention & deletion obligation",
                "Freshness & quality expectations",
                "Known consumers",
              ].map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tm-magenta" />
                  {f}
                </li>
              ))}
            </ul>
            <p className="rounded-lg bg-tm-gray-50 p-3 text-xs">
              Unowned entities are <strong>not migrated</strong> — owner assignment is a phase exit
              criterion.
            </p>
          </div>
        </div>
      )}

      {sub === "entities" && (
        <div
          className={
            embedded
              ? "flex min-h-0 flex-1 flex-row overflow-hidden"
              : "flex min-h-[560px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DataToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Search entity, owner, term, source…"
              countLabel={`${filteredEntities.length} TM Forum entities`}
              actions={
                canEdit ? (
                  <button
                    className="btn-ghost text-xs"
                    disabled={busy || !hasMappedEntities}
                    title={
                      !hasMappedEntities
                        ? "Run Workbench mapping first"
                        : "Seed owner / definition / classification for every mapped SID entity"
                    }
                    onClick={onSeed}
                  >
                    Seed from mappings
                  </button>
                ) : null
              }
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-4">SID entity</th>
                    <th className="table-th">Domain</th>
                    <th className="table-th">Attrs</th>
                    <th className="table-th">Source objects</th>
                    <th className="table-th">Owner</th>
                    <th className="table-th px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntities.map((e) => (
                    <tr
                      key={e.key}
                      className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                        selectedKey === e.key ? "bg-tm-magenta-light/60" : ""
                      }`}
                      onClick={() => setSelectedKey(e.key)}
                    >
                      <td className="table-td px-4">
                        <span className="font-semibold text-tm-ink">{e.key}</span>
                        {e.row?.business_term ? (
                          <span className="mt-0.5 block text-xs text-tm-gray-500">
                            {e.row.business_term}
                          </span>
                        ) : null}
                      </td>
                      <td className="table-td text-xs text-tm-gray-600">
                        {e.domain || "—"}
                      </td>
                      <td className="table-td tabular-nums text-xs text-tm-gray-600">
                        {e.attributes.length || e.catalogueAttrs.length || "—"}
                      </td>
                      <td className="table-td">
                        {e.sources.length ? (
                          <span className="font-mono text-[10px] text-tm-gray-600">
                            {e.sources.slice(0, 2).join(", ")}
                            {e.sources.length > 2
                              ? ` +${e.sources.length - 2}`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-xs text-tm-gray-400">—</span>
                        )}
                      </td>
                      <td className="table-td text-xs">{e.row?.owner || "—"}</td>
                      <td className="table-td px-4">
                        <span className={`badge ${e.ok ? "badge-success" : "badge-neutral"}`}>
                          {e.ok ? "complete" : e.required ? "draft" : "extra"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!filteredEntities.length ? (
                    <tr>
                      <td
                        className="table-td px-4 text-tm-gray-500"
                        colSpan={6}
                      >
                        No SID entities yet — run mapping on Workbench, then return here
                        (or Seed from mappings).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <aside
            className={`flex w-[420px] shrink-0 flex-col border-l border-brand-line bg-white ${
              selectedKey ? "" : "hidden"
            }`}
          >
            <div className="flex items-center justify-between border-b border-brand-line px-3 py-2.5">
              <h3 className="truncate text-sm font-semibold text-brand-ink">
                Edit — {selectedKey}
              </h3>
              <button
                type="button"
                className="btn-ghost !py-1"
                onClick={() => setSelectedKey(null)}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
              {!canEdit && (
                <span className="text-xs text-tm-gray-500">Read-only for your role</span>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Business term">
                  <input
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.business_term}
                    onChange={(e) => setForm({ ...form, business_term: e.target.value })}
                  />
                </Field>
                <Field label="Entity key">
                  <input className="input" disabled value={form.entity_key} />
                </Field>
                <Field label="Definition" className="sm:col-span-2">
                  <textarea
                    className="input min-h-[72px]"
                    disabled={!canEdit || busy}
                    value={form.definition}
                    onChange={(e) => setForm({ ...form, definition: e.target.value })}
                  />
                </Field>
                <Field label="Data owner (named)">
                  <input
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.owner}
                    onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  />
                </Field>
                <Field label="Data steward">
                  <input
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.steward}
                    onChange={(e) => setForm({ ...form, steward: e.target.value })}
                  />
                </Field>
                <Field label="System of record">
                  <input
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.system_of_record}
                    onChange={(e) => setForm({ ...form, system_of_record: e.target.value })}
                  />
                </Field>
                <Field label="Criticality">
                  <select
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.criticality}
                    onChange={(e) => setForm({ ...form, criticality: e.target.value })}
                  >
                    <option value="regulatory">regulatory</option>
                    <option value="business-critical">business-critical</option>
                    <option value="operational">operational</option>
                    <option value="analytical">analytical</option>
                  </select>
                </Field>
                <Field label="Sensitivity">
                  <select
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.sensitivity}
                    onChange={(e) => setForm({ ...form, sensitivity: e.target.value })}
                  >
                    <option value="public">public</option>
                    <option value="internal">internal</option>
                    <option value="personal">personal</option>
                    <option value="special-category">special-category</option>
                  </select>
                </Field>
                <Field label="Lawful basis">
                  <input
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.lawful_basis}
                    onChange={(e) => setForm({ ...form, lawful_basis: e.target.value })}
                  />
                </Field>
                <Field label="Retention (days)">
                  <input
                    type="number"
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.retention_days}
                    onChange={(e) =>
                      setForm({ ...form, retention_days: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Freshness SLO (hours)">
                  <input
                    type="number"
                    className="input"
                    disabled={!canEdit || busy}
                    value={form.freshness_sla_hours}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        freshness_sla_hours: Number(e.target.value) || 0,
                      })
                    }
                  />
                </Field>
              </div>

              <ChipEditor
                label="Policy tags"
                values={form.policy_tags}
                input={tagInput}
                setInput={setTagInput}
                disabled={!canEdit || busy}
                onAdd={() => {
                  if (!tagInput.trim()) return;
                  setForm({
                    ...form,
                    policy_tags: Array.from(
                      new Set([...form.policy_tags, tagInput.trim()])
                    ),
                  });
                  setTagInput("");
                }}
                onRemove={(v) =>
                  setForm({
                    ...form,
                    policy_tags: form.policy_tags.filter((x) => x !== v),
                  })
                }
              />
              <ChipEditor
                label="Known consumers"
                values={form.consumers}
                input={consumerInput}
                setInput={setConsumerInput}
                disabled={!canEdit || busy}
                onAdd={() => {
                  if (!consumerInput.trim()) return;
                  setForm({
                    ...form,
                    consumers: Array.from(
                      new Set([...form.consumers, consumerInput.trim()])
                    ),
                  });
                  setConsumerInput("");
                }}
                onRemove={(v) =>
                  setForm({
                    ...form,
                    consumers: form.consumers.filter((x) => x !== v),
                  })
                }
              />
              <ChipEditor
                label="Quality rules"
                values={form.quality_rules}
                input={ruleInput}
                setInput={setRuleInput}
                disabled={!canEdit || busy}
                onAdd={() => {
                  if (!ruleInput.trim()) return;
                  setForm({
                    ...form,
                    quality_rules: Array.from(
                      new Set([...form.quality_rules, ruleInput.trim()])
                    ),
                  });
                  setRuleInput("");
                }}
                onRemove={(v) =>
                  setForm({
                    ...form,
                    quality_rules: form.quality_rules.filter((x) => x !== v),
                  })
                }
              />

              {selectedEntityRow ? (
                <div className="rounded-md border border-brand-line bg-tm-gray-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
                    TM Forum · mapped attributes
                  </p>
                  <p className="mt-1 text-[11px] text-tm-gray-500">
                    {selectedEntityRow.domain
                      ? `${selectedEntityRow.domain}.${selectedEntityRow.key}`
                      : selectedEntityRow.key}
                    {selectedEntityRow.mappingCount
                      ? ` · ${selectedEntityRow.mappingCount} mapping rows`
                      : ""}
                  </p>
                  {selectedEntityRow.attributes.length ? (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                      {selectedEntityRow.attributes.map((a, i) => (
                        <li
                          key={`${a.attribute}-${a.legacy_column}-${i}`}
                          className="flex items-start justify-between gap-2 text-[11px]"
                        >
                          <span className="font-medium text-tm-ink">
                            {a.attribute}
                          </span>
                          <span className="truncate font-mono text-tm-gray-500">
                            {a.legacy_column || "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : selectedEntityRow.catalogueAttrs.length ? (
                    <p className="mt-2 text-[11px] text-tm-gray-600">
                      Catalogue attrs: {selectedEntityRow.catalogueAttrs.join(", ")}
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-tm-gray-500">
                      No attributes mapped yet for this entity.
                    </p>
                  )}
                  {selectedEntityRow.sources.length ? (
                    <p className="mt-2 truncate text-[10px] text-tm-gray-500">
                      Sources: {selectedEntityRow.sources.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <button
                className="btn"
                disabled={!canEdit || busy || !selectedKey}
                onClick={() => onSave(form)}
              >
                Save metadata
              </button>
            </div>
          </aside>
        </div>
      )}

      {sub === "catalogue" && (
        <div
          className={
            embedded
              ? "-m-5 flex min-h-[calc(100vh-11rem)] flex-row"
              : "flex min-h-[480px] flex-row overflow-hidden rounded-xl border border-tm-gray-200 bg-white"
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DataToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Search catalogue…"
              countLabel={`${filteredEntities.filter((e) => e.row).length} entries`}
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-4">Term</th>
                    <th className="table-th">Entity</th>
                    <th className="table-th">Owner</th>
                    <th className="table-th px-4">Sensitivity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntities
                    .filter((e) => e.row)
                    .map((e) => (
                      <tr
                        key={e.key}
                        className={`cursor-pointer hover:bg-tm-magenta-light/40 ${
                          selectedKey === e.key ? "bg-tm-magenta-light/60" : ""
                        }`}
                        onClick={() => setSelectedKey(e.key)}
                      >
                        <td className="table-td px-4 font-medium">
                          {e.row?.business_term || e.key}
                        </td>
                        <td className="table-td text-xs text-tm-magenta">{e.key}</td>
                        <td className="table-td text-xs">{e.row?.owner || "—"}</td>
                        <td className="table-td px-4">
                          <span className="badge-magenta">{e.row?.sensitivity}</span>
                        </td>
                      </tr>
                    ))}
                  {!metadata.length && (
                    <tr>
                      <td className="table-td px-4 text-tm-gray-500" colSpan={4}>
                        No catalogue entries yet — seed or save entity metadata.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <InspectorPanel
            open={!!selected}
            title={selected?.business_term || selected?.entity_key || "Catalogue"}
            onClose={() => setSelectedKey(null)}
          >
            {selected ? (
              <div className="space-y-3 text-sm">
                <p className="text-xs text-tm-gray-600">
                  {selected.definition || "No definition"}
                </p>
                <dl className="grid grid-cols-1 gap-2 text-xs">
                  <Meta label="Owner" value={selected.owner || "—"} />
                  <Meta label="SoR" value={selected.system_of_record || "—"} />
                  <Meta label="Criticality" value={selected.criticality} />
                  <Meta label="Retention" value={`${selected.retention_days}d`} />
                </dl>
                <div className="flex flex-wrap gap-1">
                  {(selected.policy_tags || []).map((t: string) => (
                    <span key={t} className="badge-magenta">
                      {t}
                    </span>
                  ))}
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-tm-gray-500">
                    Dataplex-stub tags
                  </h4>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-tm-gray-50 p-2 text-[11px] text-tm-gray-700">
                    {JSON.stringify(tags?.[selected.entity_key] || tags || {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </InspectorPanel>
        </div>
      )}

      {sub === "completeness" && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-base font-semibold">Completeness checklist</h3>
            <p className="mt-1 text-sm text-tm-gray-600">
              Gate status:{" "}
              <strong className={completeness?.complete ? "text-good" : "text-warn"}>
                {completeness?.complete ? "ready for phase gate" : "incomplete"}
              </strong>
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(completeness?.checks || requiredKeys.map((k) => ({ entity_key: k, complete: false, missing: ["owner", "definition", "sensitivity"] }))).map(
              (c: any) => (
                <div
                  key={c.entity_key}
                  className={`card border ${
                    c.complete ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.entity_key}</span>
                    <span className={c.complete ? "badge-success" : "badge bg-amber-50 text-warn"}>
                      {c.complete ? "complete" : "missing fields"}
                    </span>
                  </div>
                  {!c.complete && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-warn">
                      {(c.missing || []).map((m: string) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    className="btn-ghost mt-3 text-xs"
                    onClick={() => {
                      setSelectedKey(c.entity_key);
                      setSub("entities");
                    }}
                  >
                    Edit entity
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {sub === "gate" && (
        <div className="card max-w-2xl space-y-4">
          <h3 className="text-base font-semibold">Align metadata gate</h3>
          <p className="text-sm text-tm-gray-600">
            Completing metadata unlocks Pilot — LLM-assisted delivery for Party
            &amp; Customer Account.
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between rounded-lg bg-tm-gray-50 px-3 py-2">
              <span>Entities with metadata</span>
              <strong>{metadata.length}</strong>
            </li>
            <li className="flex justify-between rounded-lg bg-tm-gray-50 px-3 py-2">
              <span>Completeness</span>
              <strong>{completeness?.complete ? "Pass" : "Fail"}</strong>
            </li>
            <li className="flex justify-between rounded-lg bg-tm-gray-50 px-3 py-2">
              <span>Catalogue tags</span>
              <strong>{Object.keys(tags || {}).length}</strong>
            </li>
          </ul>
          {project.metadata_complete ? (
            <div className="badge-success w-fit text-sm">
              Metadata complete — use Suite Gallery in the header
            </div>
          ) : (
            <p className="text-xs text-tm-gray-500">
              Use{" "}
              <span className="font-medium text-tm-ink">Complete → Build</span> in
              the page header when completeness passes
              {canGate ? "" : " (requires Product Owner, Data Owner, or Change Board)"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`label ${className}`}>
      {label}
      {children}
    </label>
  );
}

function ChipEditor({
  label,
  values,
  input,
  setInput,
  onAdd,
  onRemove,
  disabled,
}: {
  label: string;
  values: string[];
  input: string;
  setInput: (v: string) => void;
  onAdd: () => void;
  onRemove: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-tm-gray-700">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {values.map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => onRemove(v)}
            className="badge-magenta"
            title="Remove"
          >
            {v} ×
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="input !mt-0"
          disabled={disabled}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={`Add ${label.toLowerCase()}…`}
        />
        <button type="button" className="btn-secondary shrink-0" disabled={disabled} onClick={onAdd}>
          Add
        </button>
      </div>
    </div>
  );
}

function Check({ done, title }: { done: boolean; title: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          done ? "bg-tm-magenta" : "bg-tm-gray-300"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-tm-ink" : "text-tm-gray-500"}>{title}</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`card ${accent ? "border-tm-magenta/40 bg-tm-magenta-light/40" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-tm-gray-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-tm-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-tm-gray-500">{hint}</div>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg bg-tm-gray-50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-tm-gray-500">{label}</div>
      <div className="truncate font-medium">{String(value)}</div>
    </div>
  );
}
