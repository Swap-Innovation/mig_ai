"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Meta } from "@/components/phases/discovery/shared";
import { phaseHref } from "@/lib/phases";

type ConnectTab = "sample" | "zip" | "git";

const MARKER_LABELS: Record<string, string> = {
  orchestration: "Orchestration",
  scripts: "Scripts",
  sql: "SQL",
  catalog: "Catalog",
  usage: "Usage",
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  sample: "Catalogue",
  upload: "Upload",
  git: "Repository",
};

type Props = {
  estate: any | null;
  samples: any[];
  project?: any | null;
  inventoryCount?: number;
  discoveryRun?: any | null;
  busy: boolean;
  msg?: string;
  onBindSample: (sampleId?: string) => void;
  onUploadZip: (file: File) => void;
  onBindGit: (payload: {
    url: string;
    branch: string;
    path_prefix: string;
    token?: string;
  }) => void;
  onSyncGit: (token?: string) => void;
  onRunDiscovery: () => void;
  llmStatus?: any | null;
};

function friendlyHint(raw?: string, bound?: boolean, ready?: boolean): string {
  if (ready) return "Source is ready. Start discovery to scan the estate leaf→root.";
  if (!bound) return "Connect a legacy data warehouse source to begin discovery.";
  if (!raw) return "Review source contents, then start discovery.";
  // Soften backend demo phrasing
  if (/ready to run/i.test(raw)) return "Source is ready. Start discovery to scan the estate leaf→root.";
  if (/not bound/i.test(raw)) return "Connect a legacy data warehouse source to begin discovery.";
  if (/incomplete/i.test(raw) || /missing/i.test(raw)) {
    return raw.replace(/^Incomplete — /i, "Missing folders: ").replace(/^missing:\s*/i, "Missing folders: ");
  }
  return raw;
}

export function SourcesView({
  estate,
  samples,
  project,
  inventoryCount = 0,
  discoveryRun,
  busy,
  msg,
  onBindSample,
  onUploadZip,
  onBindGit,
  onSyncGit,
  onRunDiscovery,
  llmStatus,
}: Props) {
  const boundSlug = estate?.sample_slug || project?.sample_slug || "";
  const legacySamples = useMemo(
    () => samples.filter((s) => s.has_legacy),
    [samples]
  );

  const [gitUrl, setGitUrl] = useState("");
  const [gitBranch, setGitBranch] = useState("main");
  const [gitPrefix, setGitPrefix] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [selectedSample, setSelectedSample] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectTab, setConnectTab] = useState<ConnectTab>("sample");
  const [treeOpen, setTreeOpen] = useState(false);
  const [zipUploading, setZipUploading] = useState(false);

  useEffect(() => {
    if (boundSlug) {
      setSelectedSample(boundSlug);
      setConnectOpen(false);
    } else if (legacySamples.length === 1) {
      setSelectedSample(legacySamples[0].id);
      setConnectOpen(true);
    } else if (!estate?.exists) {
      setConnectOpen(true);
    }
  }, [boundSlug, legacySamples, estate?.exists]);

  useEffect(() => {
    const ready = !!estate?.readiness?.score?.ready;
    setTreeOpen(!!estate?.exists && !ready);
  }, [estate?.exists, estate?.readiness?.score?.ready]);

  const discoveryActive = ["queued", "running"].includes(
    String(discoveryRun?.status || "").toLowerCase()
  );
  const readiness = estate?.readiness;
  const markers: any[] = readiness?.markers || [];
  const ready = !!readiness?.score?.ready;
  const bound = !!estate?.exists;

  const statusBadge = !bound
    ? { cls: "badge-neutral", label: "Not connected" }
    : ready
      ? { cls: "badge-success", label: "Ready" }
      : { cls: "badge bg-amber-50 text-warn", label: "Incomplete" };

  function confirmSwitch(nextLabel: string): boolean {
    if (!bound) return true;
    if (inventoryCount <= 0 && !discoveryRun) return true;
    return window.confirm(
      `Change source to “${nextLabel}”? You may need to run discovery again.`
    );
  }

  function handleBindSample() {
    const sid = selectedSample || legacySamples[0]?.id;
    if (!sid) return;
    if (boundSlug && sid === boundSlug) return;
    if (!confirmSwitch(sid)) return;
    onBindSample(sid);
  }

  async function handleZip(file: File) {
    if (!confirmSwitch(file.name)) return;
    setZipUploading(true);
    try {
      await Promise.resolve(onUploadZip(file));
    } finally {
      setZipUploading(false);
    }
  }

  function handleGitBind() {
    if (!gitUrl.trim()) return;
    if (!confirmSwitch(gitUrl.trim())) return;
    onBindGit({
      url: gitUrl.trim(),
      branch: gitBranch || "main",
      path_prefix: gitPrefix,
      token: gitToken || undefined,
    });
  }

  const cursorReady = llmStatus?.cursor_configured !== false;
  const canRun = bound && !busy && !discoveryActive && cursorReady;
  const runDisabledReason = !bound
    ? "Connect a source first"
    : !cursorReady
      ? "Set CURSOR_API_KEY in backend/.env for live Cursor agents"
      : discoveryActive
        ? "Discovery in progress"
        : busy
          ? "Please wait…"
          : null;

  const typeLabel =
    SOURCE_TYPE_LABELS[String(estate?.legacy_source_type || "")] ||
    estate?.legacy_source_type ||
    "—";

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Source</h3>
            <p className="mt-1 text-sm text-tm-gray-600">
              {friendlyHint(
                estate?.discovery_hint || readiness?.discovery_hint,
                bound,
                ready
              )}
            </p>
          </div>
          <span className={statusBadge.cls}>{statusBadge.label}</span>
        </div>

        {bound ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <Meta label="Connection" value={typeLabel} />
              <Meta label="Name" value={estate.estate_label || boundSlug || "—"} />
              <Meta label="Files" value={estate.file_count ?? "—"} />
              <Meta
                label="Last synced"
                value={
                  estate.last_synced_at
                    ? String(estate.last_synced_at).replace("T", " ").slice(0, 19)
                    : "—"
                }
              />
              {estate.git_commit ? (
                <Meta label="Commit" value={estate.git_commit} />
              ) : null}
            </div>
            <div className="rounded-lg bg-tm-gray-50 p-3 font-mono text-xs text-tm-gray-600 break-all">
              {estate.legacy_root || "—"}
            </div>
          </>
        ) : (
          <p className="text-sm text-tm-gray-500">
            No source connected. Open <strong>Change source</strong> below to use a catalogue
            project, upload, or repository.
          </p>
        )}

        {markers.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-tm-gray-500">
              Contents
              {readiness?.score
                ? ` · ${readiness.score.present}/${readiness.score.total}`
                : ""}
            </div>
            <div className="flex flex-wrap gap-2">
              {markers.map((m) => (
                <span
                  key={m.id}
                  className={m.present ? "badge-success" : "badge bg-amber-50 text-warn"}
                  title={m.matched_path || m.paths?.join(", ")}
                >
                  {MARKER_LABELS[m.id] || m.label}
                  {m.present && m.file_count != null ? ` · ${m.file_count}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-tm-gray-100 pt-4">
          <button
            className="btn"
            disabled={!canRun}
            title={runDisabledReason || undefined}
            onClick={onRunDiscovery}
          >
            {discoveryActive ? "Scanning…" : "Start discovery"}
          </button>
          <Link
            href={phaseHref("1_discovery", "console")}
            className="btn-secondary text-xs"
          >
            View activity
          </Link>
          {estate?.legacy_source_type === "git" && (
            <button
              className="btn-secondary text-xs"
              disabled={busy}
              onClick={() => onSyncGit(gitToken || undefined)}
            >
              Sync
            </button>
          )}
          {runDisabledReason && (
            <span className="text-xs text-tm-gray-500">{runDisabledReason}</span>
          )}
        </div>
        {bound && (
          <p className="text-xs text-tm-gray-500">
            Starts discovery scan agents on Activity (structure → SQL → scripts → DAGs →
            catalog). Run inventory agents separately on Inventory for catalog & lineage.
            Requires <span className="font-medium text-tm-ink">CURSOR_API_KEY</span>.
          </p>
        )}
        {llmStatus && llmStatus.cursor_configured === false && (
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Cursor key not configured. Add <code className="font-medium">CURSOR_API_KEY</code> to{" "}
            <code className="font-medium">backend/.env</code> (Cursor Dashboard → Integrations), then
            restart the API.
          </p>
        )}
      </div>

      {bound && (estate?.tree_preview || []).length > 0 && (
        <div className="card space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-tm-ink"
            onClick={() => setTreeOpen((o) => !o)}
          >
            <span>Files</span>
            <span className="text-xs font-normal text-tm-gray-500">
              {treeOpen ? "Hide" : "Show"} · {(estate.tree_preview || []).length}
            </span>
          </button>
          {treeOpen && (
            <div className="max-h-56 overflow-auto rounded-xl border border-tm-gray-200">
              <table className="w-full">
                <thead className="sticky top-0 bg-tm-gray-50">
                  <tr>
                    <th className="table-th px-3">Path</th>
                    <th className="table-th">Type</th>
                    <th className="table-th px-3">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {(estate.tree_preview || []).map((e: any, i: number) => (
                    <tr key={`${e.path}-${i}`}>
                      <td className="table-td px-3 font-mono text-xs">{e.path}</td>
                      <td className="table-td text-xs">{e.type}</td>
                      <td className="table-td px-3 text-xs">
                        {e.size != null ? e.size.toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="card space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setConnectOpen((o) => !o)}
        >
          <div>
            <h3 className="text-base font-semibold">Change source</h3>
            <p className="mt-0.5 text-xs text-tm-gray-500">
              Catalogue, upload, or repository
            </p>
          </div>
          <span className="text-xs text-tm-gray-500">{connectOpen ? "Hide" : "Show"}</span>
        </button>

        {connectOpen && (
          <div className="space-y-4 border-t border-tm-gray-100 pt-3">
            <div className="flex flex-wrap gap-1 rounded-lg bg-tm-gray-50 p-1">
              {(
                [
                  ["sample", "Catalogue"],
                  ["zip", "Upload"],
                  ["git", "Repository"],
                ] as [ConnectTab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                    connectTab === id
                      ? "bg-white text-tm-ink shadow-sm"
                      : "text-tm-gray-500 hover:text-tm-ink"
                  }`}
                  onClick={() => setConnectTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {connectTab === "sample" && (
              <div className="space-y-3">
                <p className="text-sm text-tm-gray-600">
                  Connect a curated warehouse project with SQL, scripts, schedules, catalog, and
                  usage evidence.
                </p>
                {!samples.length ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-warn">
                    No catalogue projects available.
                  </div>
                ) : (
                  <select
                    className="input"
                    value={selectedSample}
                    onChange={(e) => setSelectedSample(e.target.value)}
                  >
                    <option value="">Select a project…</option>
                    {samples.map((s) => {
                      const boundHere = s.id === boundSlug;
                      const disabled = !s.has_legacy;
                      return (
                        <option key={s.id} value={s.id} disabled={disabled}>
                          {s.name}
                          {s.wave != null ? ` · Wave ${s.wave}` : ""}
                          {boundHere ? " · Current" : ""}
                          {disabled ? " · Unavailable" : ""}
                        </option>
                      );
                    })}
                  </select>
                )}
                {selectedSample && (
                  <p className="text-xs text-tm-gray-500">
                    {samples.find((s) => s.id === selectedSample)?.description || ""}
                  </p>
                )}
                <button
                  className="btn w-full sm:w-auto"
                  disabled={
                    busy ||
                    !selectedSample ||
                    !samples.find((s) => s.id === selectedSample)?.has_legacy
                  }
                  onClick={handleBindSample}
                >
                  {selectedSample === boundSlug ? "Connected" : "Connect"}
                </button>
              </div>
            )}

            {connectTab === "zip" && (
              <div className="space-y-3">
                <p className="text-sm text-tm-gray-600">
                  Upload an archive of SQL, scripts, schedules, catalog, and usage folders.
                </p>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  className="block w-full text-sm"
                  disabled={busy || zipUploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      void handleZip(f).then(() => {
                        e.target.value = "";
                      });
                    }
                  }}
                />
                {(busy || zipUploading) && (
                  <p className="text-xs text-tm-gray-500">Uploading…</p>
                )}
              </div>
            )}

            {connectTab === "git" && (
              <div className="space-y-3">
                <p className="text-sm text-tm-gray-600">
                  Connect a Git repository that contains warehouse ETL and SQL definitions.
                </p>
                <input
                  className="input"
                  placeholder="https://github.com/org/warehouse.git"
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input"
                    placeholder="Branch"
                    value={gitBranch}
                    onChange={(e) => setGitBranch(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Path prefix (optional)"
                    value={gitPrefix}
                    onChange={(e) => setGitPrefix(e.target.value)}
                  />
                </div>
                <input
                  className="input"
                  type="password"
                  placeholder="Access token (optional)"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                />
                <button
                  className="btn w-full sm:w-auto"
                  disabled={busy || !gitUrl.trim()}
                  onClick={handleGitBind}
                >
                  Connect repository
                </button>
                {msg && (msg.toLowerCase().includes("git") || msg.toLowerCase().includes("clone")) && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-bad">
                    {msg}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
