import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { TasksSection } from "./TasksSection";
import type { Project, TeamMember } from "../../types";

type Props = {
  token: string;
  teamId: number;
  teamRole: string;
  members: TeamMember[];
  onUnauthorized: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  archived: "Archivé",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-500",
};

export function ProjectsSection({ token, teamId, teamRole, members, onUnauthorized }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "" });
  const [createBusy, setCreateBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", status: "" });
  const [editBusy, setEditBusy] = useState(false);

  const canDelete = teamRole === "owner" || teamRole === "admin";

  useEffect(() => {
    loadProjects();
  }, [teamId]);

  async function loadProjects() {
    setLoading(true);
    setError("");
    setSelected(null);
    try {
      const data = await api.projects.list(token, teamId);
      setProjects(data.projects);
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateBusy(true);
    try {
      const data = await api.projects.create(token, {
        team_id: teamId,
        name: createForm.name,
        description: createForm.description || undefined,
      });
      setProjects((p) => [data.project, ...p]);
      setCreateForm({ name: "", description: "" });
      setShowCreate(false);
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleSelectProject = async (project: Project) => {
    setSelected(project);
    setEditing(false);
    setEditForm({
      name: project.name,
      description: project.description ?? "",
      status: project.status,
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setEditBusy(true);
    try {
      const data = await api.projects.update(token, selected.id, {
        name: editForm.name || undefined,
        description: editForm.description || undefined,
        status: editForm.status || undefined,
      });
      const updated = data.project;
      setProjects((p) => p.map((pr) => (pr.id === updated.id ? updated : pr)));
      setSelected(updated);
      setEditing(false);
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || !confirm(`Supprimer le projet "${selected.name}" ?`)) return;
    try {
      await api.projects.delete(token, selected.id);
      setProjects((p) => p.filter((pr) => pr.id !== selected.id));
      setSelected(null);
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur");
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Projets</h2>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="text-sm bg-violet-600 hover:bg-violet-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          + Nouveau projet
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-4 p-4 bg-violet-50 rounded-xl space-y-3">
          <h3 className="text-sm font-semibold text-violet-800">Nouveau projet</h3>
          <Field label="Nom du projet">
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              className="input"
              required
              autoFocus
            />
          </Field>
          <Field label="Description (optionnelle)">
            <textarea
              value={createForm.description}
              onChange={(e) => setCreateForm((p) => ({ ...p, description: e.target.value }))}
              className="input resize-none"
              rows={2}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createBusy}
              className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {createBusy ? "Création..." : "Créer"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Chargement...</p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Aucun projet pour le moment.</p>
      ) : (
        <div className="space-y-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleSelectProject(project)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                selected?.id === project.id
                  ? "border-violet-300 bg-violet-50"
                  : "border-gray-100 hover:border-violet-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 text-sm">{project.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-500"
                  }`}
                >
                  {STATUS_LABELS[project.status] ?? project.status}
                </span>
              </div>
              {project.description && (
                <p className="text-xs text-gray-500 mt-1 truncate">{project.description}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {!editing ? (
            <>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{selected.name}</h3>
                  {selected.description && (
                    <p className="text-sm text-gray-500 mt-1">{selected.description}</p>
                  )}
                  <span
                    className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                      STATUS_COLORS[selected.status] ?? "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <button
                    onClick={() => setEditing(true)}
                    className="text-xs text-violet-600 hover:text-violet-800 font-medium border border-violet-200 px-3 py-1.5 rounded-lg"
                  >
                    Modifier
                  </button>
                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-200 px-3 py-1.5 rounded-lg"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
              <TasksSection
                token={token}
                projectId={selected.id}
                members={members}
                onUnauthorized={onUnauthorized}
              />
            </>
          ) : (
            <form onSubmit={handleUpdate} className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Modifier le projet</h3>
              <Field label="Nom">
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="input"
                  required
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  className="input resize-none"
                  rows={2}
                />
              </Field>
              <Field label="Statut">
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value }))}
                  className="input"
                >
                  <option value="active">Actif</option>
                  <option value="archived">Archivé</option>
                </select>
              </Field>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={editBusy}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {editBusy ? "Sauvegarde..." : "Sauvegarder"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
    </label>
  );
}
