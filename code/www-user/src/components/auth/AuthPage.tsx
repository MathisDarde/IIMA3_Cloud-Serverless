import { useState } from "react";
import { api, ApiError } from "../../lib/api";

type Props = {
  onLogin: (token: string) => void;
};

type AuthTab = "login" | "register" | "confirm";

export function AuthPage({ onLogin }: Props) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [confirmForm, setConfirmForm] = useState({ email: "", code: "" });

  const clear = () => { setError(""); setSuccess(""); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    setBusy(true);
    try {
      const data = await api.auth.login(loginForm);
      onLogin(data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    setBusy(true);
    try {
      await api.auth.register(registerForm);
      setSuccess("Compte créé ! Vérifiez votre email pour activer votre compte.");
      setConfirmForm((prev) => ({ ...prev, email: registerForm.email }));
      setTab("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur d'inscription");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    setBusy(true);
    try {
      await api.auth.confirmEmail(confirmForm);
      setSuccess("Email confirmé ! Vous pouvez maintenant vous connecter.");
      setLoginForm((prev) => ({ ...prev, email: confirmForm.email }));
      setTab("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de confirmation");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    clear();
    setBusy(true);
    try {
      await api.auth.resendCode(confirmForm.email);
      setSuccess("Nouveau code envoyé.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { key: AuthTab; label: string }[] = [
    { key: "login", label: "Connexion" },
    { key: "register", label: "Inscription" },
    { key: "confirm", label: "Confirmer l'email" },
  ];

  return (
    <div className="min-h-screen bg-violet-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-violet-700 font-serif">Plateforme Collaborative</h1>
          <p className="text-gray-500 mt-2 text-sm">Gérez vos équipes et projets</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { clear(); setTab(t.key); }}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "text-violet-700 border-b-2 border-violet-600 bg-violet-50"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm">
                {success}
              </div>
            )}

            {tab === "login" && (
              <form onSubmit={handleLogin} className="space-y-4">
                <Field label="Email">
                  <input
                    type="email"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Mot de passe">
                  <input
                    type="password"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                    className="input"
                    required
                  />
                </Field>
                <Btn loading={busy}>Se connecter</Btn>
              </form>
            )}

            {tab === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Prénom">
                    <input
                      type="text"
                      value={registerForm.first_name}
                      onChange={(e) => setRegisterForm((p) => ({ ...p, first_name: e.target.value }))}
                      className="input"
                    />
                  </Field>
                  <Field label="Nom">
                    <input
                      type="text"
                      value={registerForm.last_name}
                      onChange={(e) => setRegisterForm((p) => ({ ...p, last_name: e.target.value }))}
                      className="input"
                    />
                  </Field>
                </div>
                <Field label="Email">
                  <input
                    type="email"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Mot de passe">
                  <input
                    type="password"
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))}
                    className="input"
                    required
                  />
                </Field>
                <Btn loading={busy}>Créer mon compte</Btn>
              </form>
            )}

            {tab === "confirm" && (
              <form onSubmit={handleConfirm} className="space-y-4">
                <p className="text-sm text-gray-500">
                  Entrez le code de vérification reçu par email.
                </p>
                <Field label="Email">
                  <input
                    type="email"
                    value={confirmForm.email}
                    onChange={(e) => setConfirmForm((p) => ({ ...p, email: e.target.value }))}
                    className="input"
                    required
                  />
                </Field>
                <Field label="Code de vérification">
                  <input
                    type="text"
                    value={confirmForm.code}
                    onChange={(e) => setConfirmForm((p) => ({ ...p, code: e.target.value }))}
                    className="input"
                    required
                  />
                </Field>
                <Btn loading={busy}>Valider mon email</Btn>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={busy || !confirmForm.email}
                  className="w-full text-sm text-violet-600 hover:text-violet-800 disabled:opacity-40"
                >
                  Renvoyer le code
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
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

function Btn({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
    >
      {loading ? "Chargement..." : children}
    </button>
  );
}
