import { useEffect, useState } from "react";
import { FolderOpen, Trash2, X } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

type ProjectSummary = {
  id: number;
  name: string;
  thumbnailDataUrl: string | null;
  totalUsd: number;
  createdAt: string;
  updatedAt: string;
};

export default function MyProjectsModal({ open, onClose, onLoadProject, onDeleted }: {
  open: boolean;
  onClose: () => void;
  onLoadProject: (id: number) => Promise<void>;
  onDeleted: (id: number) => void;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch(`${API}/api/projects`, { credentials: "include" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load projects");
        if (!Array.isArray(data)) throw new Error("Projects response was invalid");
        return data as ProjectSummary[];
      })
      .then(data => { if (active) setProjects(data); })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : "Could not load projects"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);

  const loadProject = async (id: number) => {
    setLoadingId(id);
    setError("");
    try {
      await onLoadProject(id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this design");
    } finally {
      setLoadingId(null);
    }
  };

  const deleteProject = async (project: ProjectSummary) => {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    setError("");
    try {
      const response = await fetch(`${API}/api/projects/${project.id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete project");
      setProjects(current => current.filter(item => item.id !== project.id));
      onDeleted(project.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete project");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="my-projects-title" className="panel flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl">
        <header className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-2"><FolderOpen size={18} className="text-amber-300" /><h2 id="my-projects-title" className="font-semibold">My Projects</h2></div>
          <button type="button" onClick={onClose} aria-label="Close projects"><X size={18} /></button>
        </header>
        <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
          {loading && <p role="status" className="text-sm text-white/60">Loading your projects…</p>}
          {!loading && projects.length === 0 && !error && <p className="text-sm text-white/50">No saved designs yet.</p>}
          {projects.map(project => (
            <article key={project.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/10 p-3 sm:flex-row">
              {project.thumbnailDataUrl
                ? <img src={project.thumbnailDataUrl} alt="" className="h-28 w-full rounded-lg bg-black/20 object-cover sm:w-40" />
                : <div aria-hidden="true" className="grid h-28 w-full place-items-center rounded-lg bg-black/20 text-xs text-white/30 sm:w-40">No preview</div>}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium">{project.name}</h3>
                <p className="mt-1 text-xs text-white/50">Updated {new Date(project.updatedAt).toLocaleString()}</p>
                <p className="mt-1 text-sm text-amber-300">BOM total: ${project.totalUsd.toFixed(2)}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={loadingId !== null} onClick={() => void loadProject(project.id)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">
                    {loadingId === project.id ? "Loading…" : "Load Design"}
                  </button>
                  <button type="button" disabled={loadingId !== null} onClick={() => void deleteProject(project)} className="flex items-center gap-1 rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 disabled:opacity-50">
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        </div>
      </section>
    </div>
  );
}
