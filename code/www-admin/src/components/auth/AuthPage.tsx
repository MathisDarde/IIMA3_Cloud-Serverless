import { useState } from "react";
import { api } from "../../lib/api";

type Props = {
  onLogin: (token: string) => void;
};

export function AuthPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api.auth.login({ email, password });
      onLogin(data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center font-sans px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center font-black text-xl text-white">
            A
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold font-serif text-gray-900">Administration</h1>
            <p className="text-xs text-gray-400 mt-1">Espace réservé aux administrateurs</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          {error && (
            <div className="mb-5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className={`mt-1 py-3 rounded-lg text-sm font-semibold text-white transition-colors ${
                busy ? "bg-gray-500 cursor-not-allowed" : "bg-gray-900 hover:bg-gray-700 cursor-pointer"
              }`}
            >
              {busy ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
