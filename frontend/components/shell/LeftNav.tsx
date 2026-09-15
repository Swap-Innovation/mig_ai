"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  GALLERY_TOOLS,
  getTool,
  toolHref,
  toolStatus,
  continuePhaseId,
  type SuiteToolId,
} from "@/lib/phases";
import { isAppSandboxProject } from "@/lib/appStore";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { Session } from "@/lib/api";

type Props = {
  session: Session;
  project: any | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSignOut: () => void;
  onToggleActivity?: () => void;
  activityOpen?: boolean;
  onToggleAbout?: () => void;
  aboutOpen?: boolean;
  msg?: string;
};

type CreateMode = "blank" | "scaffold" | "sample";

function pathToolId(pathname: string | null): SuiteToolId | null {
  const m = pathname?.match(/\/workspace\/tools\/([^/]+)/);
  return (m?.[1] as SuiteToolId) || null;
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const MODE_HELP: Record<CreateMode, string> = {
  scaffold:
    "Creates a new folder under sample-data/projects/ and binds this project to it.",
  blank: "Creates a DB project only. Bind an estate later in Discovery.",
  sample:
    "Attaches an existing catalogue estate that does not already have a project.",
};

function IconDashboard() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2.5" width="6.5" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="9" width="6.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconAppStore() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
      <rect x="3" y="3" width="5.5" height="5.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="3" width="5.5" height="5.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11.5" width="5.5" height="5.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconStageMap() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden>
      <rect x="3" y="3" width="5" height="5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="3" width="5" height="5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="12" width="5" height="5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="12" width="5" height="5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconFolder({ open = false }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden>
      {open ? (
        <>
          <path
            d="M2.5 7.5h15l-1.2 7.2a1.5 1.5 0 0 1-1.5 1.3H5.2a1.5 1.5 0 0 1-1.5-1.3L2.5 7.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M2.5 7.5V5.2A1.7 1.7 0 0 1 4.2 3.5h3.1l1.4 1.5h7.3c.7 0 1.3.5 1.5 1.2L17.5 7.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <path
          d="M3 6.2A1.7 1.7 0 0 1 4.7 4.5h3.2L9.4 6h6.4A1.6 1.6 0 0 1 17.4 7.6v7.2a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 14.8V6.2z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="none"
      aria-hidden
      className={`suite-nav-chevron ${open ? "is-open" : ""}`}
    >
      <path
        d="M4 2.5 8 6 4 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LeftNav({
  session,
  project,
  collapsed,
  onToggleCollapse,
  onSignOut,
  onToggleActivity,
  activityOpen,
  onToggleAbout,
  aboutOpen,
  msg,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    projects,
    samples,
    busy,
    selectProject,
    createProject,
    deleteProject,
  } = useWorkspace();
  const activeToolId = pathToolId(pathname);
  const activeTool = activeToolId ? getTool(activeToolId) : undefined;
  const isDashboard = pathname === "/workspace" || pathname === "/workspace/";
  const isAppStore = pathname?.startsWith("/workspace/apps");
  const isGallery = pathname?.startsWith("/workspace/gallery");
  const isStageContext = isGallery || !!activeTool;
  const mark = (activeTool?.shortName || "M").slice(0, 1).toUpperCase();
  const userInitial = (session.name || "U").trim().charAt(0).toUpperCase();

  const canMutate = ["engineer", "architect", "change_board", "product_owner"].includes(
    session.role
  );
  const canDelete = ["engineer", "architect", "change_board"].includes(session.role);

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<CreateMode>("scaffold");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [sampleId, setSampleId] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => setMounted(true), []);

  const sortedProjects = useMemo(
    () =>
      [...(projects || [])]
        .filter((p) => !isAppSandboxProject(p))
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        ),
    [projects]
  );

  const unboundSamples = useMemo(() => {
    const used = new Set(
      (projects || []).map((p) => p.sample_slug).filter(Boolean) as string[]
    );
    return (samples || []).filter((s) => s.id && !used.has(s.id));
  }, [projects, samples]);

  const activeId = project?.id as number | undefined;
  const deleteTarget = sortedProjects.find((p) => p.id === deleteId) || null;

  useEffect(() => {
    if (!showCreate) return;
    if (mode === "sample" && unboundSamples[0] && !sampleId) {
      setSampleId(unboundSamples[0].id);
    }
  }, [showCreate, mode, unboundSamples, sampleId]);

  useEffect(() => {
    if (!slugTouched && mode === "scaffold") {
      setSlug(slugify(name));
    }
  }, [name, mode, slugTouched]);

  function isProjectExpanded(id: number) {
    if (expandedIds[id] != null) return expandedIds[id];
    return id === activeId && isStageContext;
  }

  async function openProject(id: number, goGallery = true) {
    if (id !== activeId) {
      await selectProject(id);
    }
    setExpandedIds((m) => ({ ...m, [id]: true }));
    setProjectsOpen(true);
    if (goGallery) {
      router.push("/workspace/gallery");
    }
  }

  function toggleProject(id: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setExpandedIds((m) => ({
      ...m,
      [id]: !(m[id] != null ? m[id] : id === activeId && isStageContext),
    }));
  }

  function resetCreateForm() {
    setName("");
    setDescription("");
    setSlug("");
    setSlugTouched(false);
    setSampleId("");
    setMode("scaffold");
    setFormError("");
    setSubmitting(false);
  }

  async function onCreate() {
    if (submitting || busy) return;
    if (!name.trim()) {
      setFormError("Project name is required");
      return;
    }
    if (mode === "sample" && !sampleId) {
      setFormError("No unbound catalogue estate available — use Scaffold or Blank.");
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      const created = await createProject({
        name: name.trim(),
        description: description.trim(),
        scaffold: mode === "scaffold",
        slug: mode === "scaffold" ? slug.trim() || undefined : undefined,
        sample_id: mode === "sample" ? sampleId || undefined : undefined,
      });
      setShowCreate(false);
      resetCreateForm();
      if (created?.id) {
        setExpandedIds((m) => ({ ...m, [created.id]: true }));
        setProjectsOpen(true);
        router.push("/workspace/gallery");
      }
    } catch (e: any) {
      const err = String(e?.message || "Create failed");
      const unreachable = /cannot reach api|failed to fetch|networkerror|timed out/i.test(
        err
      );
      setFormError(
        unreachable
          ? "Cannot reach the API on :8000. Start the backend, then try Create again."
          : err
      );
      if (e?.status === 401 || /sign in again|session expired/i.test(err)) {
        window.location.href = "/";
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteConfirm() {
    if (!deleteId || submitting || busy) return;
    setSubmitting(true);
    try {
      await deleteProject(deleteId);
      setDeleteId(null);
      setExpandedIds((m) => {
        const next = { ...m };
        delete next[deleteId];
        return next;
      });
    } catch (e: any) {
      setFormError(e?.message || "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  const profileActions = (
    <div className="suite-nav-profile-actions">
      {onToggleAbout ? (
        <button
          type="button"
          className={`suite-nav-profile-action ${aboutOpen ? "is-active" : ""}`}
          onClick={onToggleAbout}
        >
          About
        </button>
      ) : null}
      {onToggleActivity ? (
        <button
          type="button"
          className={`suite-nav-profile-action ${activityOpen ? "is-active" : ""}`}
          onClick={onToggleActivity}
        >
          Activity
        </button>
      ) : null}
      <button type="button" className="suite-nav-profile-action" onClick={onSignOut}>
        Sign out
      </button>
    </div>
  );

  const createModal =
    showCreate && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onClick={() => {
              if (!submitting) {
                setShowCreate(false);
                setFormError("");
              }
            }}
          >
            <div
              className="w-full max-w-md rounded-xl border border-black/8 bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="create-project-title" className="text-sm font-semibold text-[#1d1d1f]">
                Create project
              </h2>
              <p className="mt-1 text-xs text-[#86868b]">
                Opens under Projects with its own Stage map.
              </p>

              <label className="mt-4 block text-xs font-medium text-[#6e6e73]">
                Name
                <input
                  className="input mt-1 w-full"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Resource Inventory Wave-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onCreate();
                    }
                  }}
                />
              </label>

              <label className="mt-3 block text-xs font-medium text-[#6e6e73]">
                Description
                <textarea
                  className="input mt-1 w-full"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["scaffold", "Scaffold estate"],
                    ["blank", "Blank project"],
                    ["sample", "Bind catalogue"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`btn-ghost text-xs ${mode === id ? "bg-black/[0.06] font-semibold" : ""}`}
                    onClick={() => {
                      setMode(id);
                      setFormError("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[#86868b]">{MODE_HELP[mode]}</p>

              {mode === "scaffold" ? (
                <label className="mt-3 block text-xs font-medium text-[#6e6e73]">
                  Slug (folder name)
                  <input
                    className="input mt-1 w-full font-mono"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(slugify(e.target.value) || e.target.value.toLowerCase());
                    }}
                    placeholder="auto from name"
                  />
                </label>
              ) : null}

              {mode === "sample" ? (
                <label className="mt-3 block text-xs font-medium text-[#6e6e73]">
                  Catalogue sample
                  <select
                    className="input mt-1 w-full"
                    value={sampleId}
                    onChange={(e) => setSampleId(e.target.value)}
                  >
                    {!unboundSamples.length ? (
                      <option value="">All catalogue estates already have projects</option>
                    ) : (
                      unboundSamples.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.id})
                        </option>
                      ))
                    )}
                  </select>
                </label>
              ) : null}

              {formError ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {formError}
                </p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  disabled={submitting}
                  onClick={() => {
                    setShowCreate(false);
                    setFormError("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn text-sm"
                  disabled={
                    submitting ||
                    busy ||
                    !name.trim() ||
                    (mode === "sample" && !sampleId)
                  }
                  onClick={() => void onCreate()}
                >
                  {submitting ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const deleteModal =
    deleteTarget && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => {
              if (!submitting) setDeleteId(null);
            }}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-black/8 bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-sm font-semibold text-[#1d1d1f]">Delete project</h2>
              <p className="mt-2 text-xs text-[#6e6e73]">
                Delete “{deleteTarget.name}”? Removes inventory and workspace data.
                {deleteTarget.managed
                  ? " Managed sample-data folder will be removed too."
                  : ""}
              </p>
              {formError ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {formError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-ghost text-sm"
                  disabled={submitting}
                  onClick={() => setDeleteId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn text-sm !bg-[#ff2d55]"
                  disabled={submitting || busy}
                  onClick={() => void onDeleteConfirm()}
                >
                  {submitting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <aside
      className={`ws-nav suite-nav flex flex-col ${
        collapsed ? "w-[64px]" : "w-[248px]"
      } shrink-0 transition-all`}
    >
      <div className="suite-nav-head">
        <Link href="/workspace" className="suite-nav-brand" title="Mirage Suite">
          <span className="suite-nav-brand-mark" aria-hidden>
            M
          </span>
          {!collapsed ? (
            <span className="suite-nav-brand-text">
              <span className="suite-nav-brand-name">Mirage</span>
              <span className="suite-nav-brand-sub">Suite</span>
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          className="suite-nav-collapse"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav className="suite-nav-body" aria-label="Suite">
        <Link
          href="/workspace"
          className={`suite-nav-item ${isDashboard ? "is-active" : ""}`}
          title="Portfolio dashboard"
        >
          <span className="suite-nav-icon">
            <IconDashboard />
          </span>
          {!collapsed && <span className="suite-nav-item-label">Dashboard</span>}
        </Link>

        <Link
          href="/workspace/apps"
          className={`suite-nav-item ${isAppStore ? "is-active" : ""}`}
          title="App Store — standalone apps"
        >
          <span className="suite-nav-icon">
            <IconAppStore />
          </span>
          {!collapsed && <span className="suite-nav-item-label">App Store</span>}
        </Link>

        {collapsed ? (
          <Link
            href="/workspace/gallery"
            className={`suite-nav-item ${isStageContext ? "is-active" : ""}`}
            title={project?.name ? `${project.name} · Stage map` : "Stage map"}
            onClick={() => setProjectsOpen(true)}
          >
            <span className="suite-nav-icon">
              <IconStageMap />
            </span>
          </Link>
        ) : (
          <div className="suite-nav-tree">
            <div className="suite-nav-section-row">
              <button
                type="button"
                className="suite-nav-tree-toggle"
                aria-expanded={projectsOpen}
                onClick={() => setProjectsOpen((v) => !v)}
                title={projectsOpen ? "Collapse Projects" : "Expand Projects"}
              >
                <IconChevron open={projectsOpen} />
              </button>
              <div className="suite-nav-section-label">
                <span>Projects</span>
                {canMutate ? (
                  <button
                    type="button"
                    className="suite-nav-section-action"
                    disabled={busy || submitting}
                    title="Create project"
                    onClick={() => {
                      setFormError("");
                      setDeleteId(null);
                      setShowCreate(true);
                    }}
                  >
                    New
                  </button>
                ) : null}
              </div>
            </div>

            {projectsOpen ? (
              <ul className="suite-nav-folders" aria-label="Projects">
                {sortedProjects.map((p) => {
                  const open = isProjectExpanded(p.id);
                  const active = p.id === activeId;
                  const cont = continuePhaseId(p);

                  return (
                    <li
                      key={p.id}
                      className={`suite-nav-folder ${active ? "is-current" : ""} ${
                        open ? "is-open" : ""
                      }`}
                    >
                      <div className="suite-nav-tree-row">
                        <button
                          type="button"
                          className="suite-nav-tree-toggle"
                          aria-expanded={open}
                          onClick={(e) => toggleProject(p.id, e)}
                          title={open ? "Collapse project" : "Expand project"}
                        >
                          <IconChevron open={open} />
                        </button>
                        <button
                          type="button"
                          className={`suite-nav-item suite-nav-folder-btn ${
                            active && isStageContext ? "is-active" : ""
                          }`}
                          title={p.sample_slug ? `${p.name} · ${p.sample_slug}` : p.name}
                          onClick={() => void openProject(p.id)}
                        >
                          <span className="suite-nav-icon suite-nav-folder-icon">
                            <IconFolder open={open && active} />
                          </span>
                          <span className="suite-nav-item-label truncate">
                            {p.name}
                          </span>
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="suite-nav-folder-delete"
                            title={`Delete ${p.name}`}
                            disabled={busy || submitting}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setFormError("");
                              setDeleteId(p.id);
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>

                      {open ? (
                        <ul className="suite-nav-stages" aria-label={`${p.name} stages`}>
                          <li>
                            <button
                              type="button"
                              className={`suite-nav-stage suite-nav-stage-map ${
                                active && isGallery && !activeTool ? "is-active" : ""
                              }`}
                              title={`${p.name} · Stage map`}
                              onClick={() => void openProject(p.id, true)}
                            >
                              <span className="suite-nav-stage-dot is-map" />
                              <span className="truncate">Stage map</span>
                            </button>
                          </li>
                          {GALLERY_TOOLS.map((tool) => {
                            const st = toolStatus(tool, p, cont);
                            const locked = st === "locked";
                            const doneStage = st === "complete";
                            const isHere = active && activeToolId === tool.id;
                            const className = [
                              "suite-nav-stage",
                              locked ? "is-locked" : "",
                              doneStage ? "is-done" : "",
                              isHere ? "is-active" : "",
                            ]
                              .filter(Boolean)
                              .join(" ");

                            if (locked || !active) {
                              return (
                                <li key={tool.id}>
                                  <button
                                    type="button"
                                    className={className}
                                    disabled={locked}
                                    title={
                                      locked
                                        ? `${tool.stageName} · Locked`
                                        : `${tool.stageName} · Open project first`
                                    }
                                    onClick={() => void openProject(p.id, false)}
                                  >
                                    <span className="suite-nav-stage-dot" />
                                    <span className="truncate">{tool.stageName}</span>
                                  </button>
                                </li>
                              );
                            }

                            return (
                              <li key={tool.id}>
                                <Link
                                  href={toolHref(tool.id)}
                                  className={className}
                                  title={`${tool.stageName} · ${tool.shortName}`}
                                >
                                  <span className="suite-nav-stage-dot" />
                                  <span className="truncate">{tool.stageName}</span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
                {!sortedProjects.length ? (
                  <li className="suite-nav-folders-empty">
                    No projects yet
                    {canMutate ? " — use New to create one" : ""}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        )}

        {activeTool && collapsed ? (
          <>
            <div className="suite-nav-divider" />
            <Link
              href={toolHref(activeTool.id)}
              title={`${activeTool.stageName} · ${activeTool.productName}`}
              className="suite-nav-item is-active suite-nav-item-tool"
            >
              <span className="suite-nav-tool-mark" aria-hidden>
                {mark}
              </span>
            </Link>
          </>
        ) : null}
      </nav>

      <div className={`suite-nav-profile ${collapsed ? "is-collapsed" : ""}`}>
        {collapsed ? (
          <>
            <button
              type="button"
              className="suite-nav-profile-avatar"
              title={`${session.name} · ${session.role}`}
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((v) => !v)}
            >
              {userInitial}
            </button>
            {profileOpen ? (
              <div className="suite-nav-profile-menu" role="menu">
                {profileActions}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="suite-nav-profile-user">
              <span className="suite-nav-profile-avatar" aria-hidden>
                {userInitial}
              </span>
              <span className="suite-nav-profile-meta">
                <span className="suite-nav-profile-name truncate">{session.name}</span>
                <span className="suite-nav-profile-role truncate">{session.role}</span>
              </span>
            </div>
            {msg ? (
              <p className="suite-nav-profile-msg" title={msg}>
                {msg}
              </p>
            ) : null}
            {profileActions}
          </>
        )}
      </div>

      {createModal}
      {deleteModal}
    </aside>
  );
}
