"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";

type Mode = "blank" | "scaffold" | "sample";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const MODE_HELP: Record<Mode, string> = {
  scaffold:
    "Creates a new folder under sample-data/projects/ and binds this project to it.",
  blank: "Creates a DB project only. Bind an estate later in Discovery.",
  sample:
    "Attaches an existing catalogue estate that does not already have a project.",
};

export function ProjectSwitcher() {
  const {
    project,
    projects,
    samples,
    session,
    busy,
    selectProject,
    createProject,
    deleteProject,
  } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [mode, setMode] = useState<Mode>("scaffold");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [sampleId, setSampleId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const canMutate = ["engineer", "architect", "change_board", "product_owner"].includes(
    session.role
  );
  const canDelete = ["engineer", "architect", "change_board"].includes(session.role);

  const unboundSamples = useMemo(() => {
    const used = new Set(
      (projects || []).map((p) => p.sample_slug).filter(Boolean) as string[]
    );
    return (samples || []).filter((s) => s.id && !used.has(s.id));
  }, [projects, samples]);

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

  function resetForm() {
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
      await createProject({
        name: name.trim(),
        description: description.trim(),
        scaffold: mode === "scaffold",
        slug: mode === "scaffold" ? slug.trim() || undefined : undefined,
        sample_id: mode === "sample" ? sampleId || undefined : undefined,
      });
      setShowCreate(false);
      setOpen(false);
      resetForm();
    } catch (e: any) {
      const msg = e?.message || "Create failed";
      setFormError(msg);
      setSubmitting(false);
      if (e?.status === 401 || /sign in again|session expired/i.test(msg)) {
        window.location.href = "/";
      }
    }
  }

  async function onDelete() {
    if (!project?.id || submitting || busy) return;
    setSubmitting(true);
    try {
      await deleteProject(project.id);
      setConfirmDelete(false);
      setOpen(false);
    } catch (e: any) {
      setFormError(e?.message || "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

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
              className="w-full max-w-md rounded-md border border-brand-line bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="create-project-title" className="text-sm font-semibold text-brand-ink">
                Create project
              </h2>
              <p className="mt-1 text-xs text-brand-muted">
                Spaces stay in sync with the API and optional folders under{" "}
                <code className="text-[11px]">sample-data/projects/</code>.
              </p>

              <label className="mt-4 block text-xs font-medium text-brand-slate">
                Name
                <input
                  className="mt-1 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
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

              <label className="mt-3 block text-xs font-medium text-brand-slate">
                Description
                <textarea
                  className="mt-1 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
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
                    className={`btn-ghost text-xs ${mode === id ? "bg-tm-gray-100 font-semibold" : ""}`}
                    onClick={() => {
                      setMode(id);
                      setFormError("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-brand-muted">{MODE_HELP[mode]}</p>

              {mode === "scaffold" ? (
                <label className="mt-3 block text-xs font-medium text-brand-slate">
                  Slug (folder name)
                  <input
                    className="mt-1 w-full rounded-md border border-brand-line px-3 py-2 text-sm font-mono"
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
                <label className="mt-3 block text-xs font-medium text-brand-slate">
                  Catalogue sample
                  <select
                    className="mt-1 w-full rounded-md border border-brand-line px-3 py-2 text-sm"
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

  return (
    <div className="relative">
      <button
        type="button"
        className="flex max-w-[240px] flex-col items-start rounded-md px-2 py-1 text-left hover:bg-tm-gray-100"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="truncate text-sm font-semibold text-brand-ink">
          {project?.name || "Select project"}
        </span>
        <span className="truncate text-[11px] text-brand-muted">
          {project?.sample_slug
            ? `Estate · ${project.sample_slug}`
            : project?.phase?.replace(/_/g, " ") || "No project"}
          <span className="ml-1 text-brand-line">▾</span>
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close project menu"
            onClick={() => {
              setOpen(false);
              setConfirmDelete(false);
            }}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-md border border-brand-line bg-white p-2 shadow-lg">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
              Projects
            </div>
            <ul className="max-h-56 overflow-auto">
              {(projects || []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`flex w-full items-start justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-tm-gray-50 ${
                      p.id === project?.id ? "bg-tm-gray-50 font-semibold" : ""
                    }`}
                    onClick={() => {
                      selectProject(p.id);
                      setOpen(false);
                      setConfirmDelete(false);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{p.name}</span>
                      <span className="block truncate text-[11px] font-normal text-brand-muted">
                        {p.sample_slug || p.estate_label || "unbound"}
                      </span>
                    </span>
                    {p.id === project?.id ? (
                      <span className="ml-2 shrink-0 text-[10px] text-brand-muted">active</span>
                    ) : null}
                  </button>
                </li>
              ))}
              {!projects?.length ? (
                <li className="px-2 py-3 text-xs text-brand-muted">No projects yet.</li>
              ) : null}
            </ul>

            <div className="mt-2 flex flex-wrap gap-2 border-t border-brand-line pt-2">
              {canMutate ? (
                <button
                  type="button"
                  className="btn text-xs"
                  disabled={busy || submitting}
                  onClick={() => {
                    setOpen(false);
                    setConfirmDelete(false);
                    setFormError("");
                    setShowCreate(true);
                  }}
                >
                  New project
                </button>
              ) : (
                <span className="px-1 text-[11px] text-brand-muted">
                  Sign in as engineer/architect to create projects
                </span>
              )}
              {canDelete && project ? (
                <button
                  type="button"
                  className="btn-ghost text-xs text-red-700"
                  disabled={busy || submitting}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete current
                </button>
              ) : null}
            </div>

            {confirmDelete ? (
              <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900">
                Delete “{project?.name}”? Removes inventory and workspace data.
                {project?.managed ? " Managed sample-data folder will be removed too." : ""}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn text-xs"
                    disabled={busy || submitting}
                    onClick={() => void onDelete()}
                  >
                    Confirm delete
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {createModal}
    </div>
  );
}
