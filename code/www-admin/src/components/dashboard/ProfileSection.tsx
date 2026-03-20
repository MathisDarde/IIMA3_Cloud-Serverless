import { useState } from "react";
import { api } from "../../lib/api";
import type { Profile } from "../../types";

type Props = {
  profile: Profile | null;
  token: string;
  onUpdate: (profile: Profile) => void;
  onUnauthorized: () => void;
};

export function ProfileSection({ profile, token, onUpdate, onUnauthorized }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    first_name: profile?.first_name ?? "",
    last_name: profile?.last_name ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api.auth.updateProfile(token, form);
      onUpdate(data.profile);
      setEditing(false);
    } catch (err: any) {
      if (err?.status === 401) { onUnauthorized(); return; }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Mon profil</h2>
        {!editing && (
          <button
            onClick={() => {
              setForm({ first_name: profile?.first_name ?? "", last_name: profile?.last_name ?? "" });
              setEditing(true);
            }}
            className="text-sm text-gray-900 hover:text-gray-800 font-medium"
          >
            Modifier
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="space-y-2 text-sm">
          <Row label="Email" value={profile?.email ?? "—"} />
          <Row label="Prénom" value={profile?.first_name ?? "—"} />
          <Row label="Nom" value={profile?.last_name ?? "—"} />
          <Row label="Rôle" value={profile?.role ?? "user"} />
        </dl>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Field label="Prénom">
            <input
              type="text"
              value={form.first_name}
              onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
              className="input"
            />
          </Field>
          <Field label="Nom">
            <input
              type="text"
              value={form.last_name}
              onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
              className="input"
            />
          </Field>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {busy ? "Sauvegarde..." : "Sauvegarder"}
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
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-900 font-medium">{value}</dd>
    </div>
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
