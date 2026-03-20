import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { Task, TeamMember } from "../../types";
import { AssetsSection } from "./AssetsSection";

type Props = {
    token: string;
    projectId: number;
    members: TeamMember[];
    onUnauthorized: () => void;
};

const STATUS_OPTIONS = [
    { value: "todo", label: "À faire", color: "bg-gray-100 text-gray-600" },
    {
        value: "in_progress",
        label: "En cours",
        color: "bg-blue-100 text-blue-700",
    },
    { value: "done", label: "Terminé", color: "bg-green-100 text-green-700" },
];

function statusStyle(status: string) {
    return (
        STATUS_OPTIONS.find((s) => s.value === status)?.color ??
        "bg-gray-100 text-gray-500"
    );
}
function statusLabel(status: string) {
    return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function TasksSection({
    token,
    projectId,
    members,
    onUnauthorized,
}: Props) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<Task | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({ name: "", description: "" });
    const [createBusy, setCreateBusy] = useState(false);

    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: "", description: "" });
    const [editBusy, setEditBusy] = useState(false);

    useEffect(() => {
        loadTasks();
    }, [projectId]);

    async function loadTasks() {
        setLoading(true);
        setError("");
        setSelected(null);
        try {
            const data = await api.tasks.list(token, projectId);
            setTasks(data.tasks);
        } catch (err: any) {
            if (err?.status === 401) {
                onUnauthorized();
                return;
            }
            setError(err instanceof Error ? err.message : "Erreur");
        } finally {
            setLoading(false);
        }
    }

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreateBusy(true);
        try {
            const data = await api.tasks.create(token, projectId, {
                name: createForm.name,
                description: createForm.description || undefined,
            });
            setTasks((t) => [data.task, ...t]);
            setCreateForm({ name: "", description: "" });
            setShowCreate(false);
        } catch (err: any) {
            if (err?.status === 401) {
                onUnauthorized();
                return;
            }
            setError(err instanceof Error ? err.message : "Erreur");
        } finally {
            setCreateBusy(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selected) return;
        setEditBusy(true);
        try {
            const data = await api.tasks.update(token, selected.id, {
                name: editForm.name || undefined,
                description: editForm.description || undefined,
            });
            const updated = data.task;
            setTasks((t) =>
                t.map((tk) => (tk.id === updated.id ? updated : tk)),
            );
            setSelected(updated);
            setEditing(false);
        } catch (err: any) {
            if (err?.status === 401) {
                onUnauthorized();
                return;
            }
            setError(err instanceof Error ? err.message : "Erreur");
        } finally {
            setEditBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!selected || !confirm(`Supprimer la tâche "${selected.name}" ?`))
            return;
        try {
            await api.tasks.delete(token, selected.id);
            setTasks((t) => t.filter((tk) => tk.id !== selected.id));
            setSelected(null);
        } catch (err: any) {
            if (err?.status === 401) {
                onUnauthorized();
                return;
            }
            setError(err instanceof Error ? err.message : "Erreur");
        }
    };

    const handleStatusChange = async (taskId: number, status: string) => {
        try {
            const data = await api.tasks.updateStatus(token, taskId, status);
            const updated = data.task;
            setTasks((t) =>
                t.map((tk) => (tk.id === updated.id ? updated : tk)),
            );
            if (selected?.id === updated.id) setSelected(updated);
        } catch (err: any) {
            if (err?.status === 401) {
                onUnauthorized();
                return;
            }
            setError(err instanceof Error ? err.message : "Erreur");
        }
    };

    const handleAssign = async (taskId: number, cognito_sub: string) => {
        try {
            const data = await api.tasks.assign(
                token,
                taskId,
                cognito_sub || null,
            );
            const updated = data.task;
            setTasks((t) =>
                t.map((tk) => (tk.id === updated.id ? updated : tk)),
            );
            if (selected?.id === updated.id) setSelected(updated);
        } catch (err: any) {
            if (err?.status === 401) {
                onUnauthorized();
                return;
            }
            setError(err instanceof Error ? err.message : "Erreur");
        }
    };

    function memberName(sub: string | null) {
        if (!sub) return "Non assigné";
        const m = members.find((m) => m.cognito_sub === sub);
        if (!m) return "Inconnu";
        return (
            [m.first_name, m.last_name].filter(Boolean).join(" ") ||
            m.email ||
            "Inconnu"
        );
    }

    return (
        <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900">
                    Tâches
                </h3>
                <button
                    onClick={() => setShowCreate((v) => !v)}
                    className="text-sm bg-violet-600 hover:bg-violet-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                    + Nouvelle tâche
                </button>
            </div>

            {error && (
                <div className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {showCreate && (
                <form
                    onSubmit={handleCreate}
                    className="mb-4 p-4 bg-violet-50 rounded-xl space-y-3"
                >
                    <h4 className="text-sm font-semibold text-violet-800">
                        Nouvelle tâche
                    </h4>
                    <Field label="Nom">
                        <input
                            type="text"
                            value={createForm.name}
                            onChange={(e) =>
                                setCreateForm((p) => ({
                                    ...p,
                                    name: e.target.value,
                                }))
                            }
                            className="input"
                            required
                            autoFocus
                        />
                    </Field>
                    <Field label="Description (optionnelle)">
                        <textarea
                            value={createForm.description}
                            onChange={(e) =>
                                setCreateForm((p) => ({
                                    ...p,
                                    description: e.target.value,
                                }))
                            }
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
                <p className="text-sm text-gray-400 py-4 text-center">
                    Chargement...
                </p>
            ) : tasks.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                    Aucune tâche pour le moment.
                </p>
            ) : (
                <div className="space-y-2">
                    {tasks.map((task) => (
                        <button
                            key={task.id}
                            onClick={() => {
                                setSelected(task);
                                setEditing(false);
                                setEditForm({
                                    name: task.name,
                                    description: task.description ?? "",
                                });
                            }}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                                selected?.id === task.id
                                    ? "border-violet-300 bg-violet-50"
                                    : "border-gray-100 hover:border-violet-200 hover:bg-gray-50"
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-gray-900 text-sm">
                                    {task.name}
                                </span>
                                <span
                                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle(task.status)}`}
                                >
                                    {statusLabel(task.status)}
                                </span>
                            </div>
                            {task.description && (
                                <p className="text-xs text-gray-500 mt-1 truncate">
                                    {task.description}
                                </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                                Assigné à : {memberName(task.assigned_to)}
                            </p>
                        </button>
                    ))}
                </div>
            )}

            {selected && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    {!editing ? (
                        <>
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                    <h4 className="font-semibold text-gray-900">
                                        {selected.name}
                                    </h4>
                                    {selected.description && (
                                        <p className="text-sm text-gray-500 mt-1">
                                            {selected.description}
                                        </p>
                                    )}

                                    {/* Statut */}
                                    <div className="mt-3">
                                        <span className="text-xs font-medium text-gray-600 block mb-1">
                                            Statut
                                        </span>
                                        <div className="flex gap-2">
                                            {STATUS_OPTIONS.map((s) => (
                                                <button
                                                    key={s.value}
                                                    onClick={() =>
                                                        handleStatusChange(
                                                            selected.id,
                                                            s.value,
                                                        )
                                                    }
                                                    className={`text-xs px-3 py-1 rounded-full font-medium border transition-colors ${
                                                        selected.status ===
                                                        s.value
                                                            ? s.color +
                                                              " border-transparent"
                                                            : "border-gray-200 text-gray-500 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Assignation */}
                                    <div className="mt-3">
                                        <span className="text-xs font-medium text-gray-600 block mb-1">
                                            Assigné à
                                        </span>
                                        <select
                                            value={selected.assigned_to ?? ""}
                                            onChange={(e) =>
                                                handleAssign(
                                                    selected.id,
                                                    e.target.value,
                                                )
                                            }
                                            className="input text-sm"
                                        >
                                            <option value="">
                                                Non assigné
                                            </option>
                                            {members.map((m) => (
                                                <option
                                                    key={m.cognito_sub}
                                                    value={m.cognito_sub}
                                                >
                                                    {[m.first_name, m.last_name]
                                                        .filter(Boolean)
                                                        .join(" ") || m.email}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="flex gap-2 shrink-0 ml-4">
                                    <button
                                        onClick={() => setEditing(true)}
                                        className="text-xs text-violet-600 hover:text-violet-800 font-medium border border-violet-200 px-3 py-1.5 rounded-lg"
                                    >
                                        Modifier
                                    </button>
                                    <button
                                        onClick={handleDelete}
                                        className="text-xs text-red-600 hover:text-red-800 font-medium border border-red-200 px-3 py-1.5 rounded-lg"
                                    >
                                        Supprimer
                                    </button>
                                </div>
                            </div>
                            <AssetsSection
                                token={token}
                                taskId={selected.id}
                                onUnauthorized={onUnauthorized}
                            />
                        </>
                    ) : (
                        <form onSubmit={handleUpdate} className="space-y-3">
                            <h4 className="text-sm font-semibold text-gray-800">
                                Modifier la tâche
                            </h4>
                            <Field label="Nom">
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) =>
                                        setEditForm((p) => ({
                                            ...p,
                                            name: e.target.value,
                                        }))
                                    }
                                    className="input"
                                    required
                                />
                            </Field>
                            <Field label="Description">
                                <textarea
                                    value={editForm.description}
                                    onChange={(e) =>
                                        setEditForm((p) => ({
                                            ...p,
                                            description: e.target.value,
                                        }))
                                    }
                                    className="input resize-none"
                                    rows={2}
                                />
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
        </div>
    );
}

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">
                {label}
            </span>
            {children}
        </label>
    );
}
