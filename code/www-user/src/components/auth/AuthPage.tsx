import { useState } from "react";
import { api } from "../../lib/api";

type Props = {
  onLogin: (token: string) => void;
  invitationId: number | null;
};

type AuthTab = "login" | "register" | "confirm";

export function AuthPage({ onLogin, invitationId }: Props) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", first_name: "", last_name: "" });
  const [confirmForm, setConfirmForm] = useState({ email: "", code: "" });

  const clear = () => { setError(""); setSuccess(""); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); clear(); setBusy(true);
    try {
      const data = await api.auth.login(loginForm);
      onLogin(data.access_token);
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur de connexion"); }
    finally { setBusy(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); clear(); setBusy(true);
    try {
      await api.auth.register(registerForm);
      setConfirmForm((p) => ({ ...p, email: registerForm.email }));
      setTab("confirm");
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur d'inscription"); }
    finally { setBusy(false); }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault(); clear(); setBusy(true);
    try {
      await api.auth.confirmEmail(confirmForm);
      setSuccess("Email confirmé ! Vous pouvez vous connecter.");
      setLoginForm((p) => ({ ...p, email: confirmForm.email }));
      setTab("login");
    } catch (err) { setError(err instanceof Error ? err.message : "Erreur de confirmation"); }
    finally { setBusy(false); }
  };

  const handleResend = async () => {
    clear(); setBusy(true);
    try { await api.auth.resendCode(confirmForm.email); setSuccess("Nouveau code envoyé."); }
    catch (err) { setError(err instanceof Error ? err.message : "Erreur"); }
    finally { setBusy(false); }
  };

  const tabs: { key: AuthTab; label: string }[] = [
    { key: "login", label: "Connexion" },
    { key: "register", label: "Inscription" },
  ];

  const inputStyle: React.CSSProperties = {
    border: "1px solid #e0e0e0", borderRadius: "8px", padding: "10px 14px",
    fontSize: "14px", outline: "none", color: "#111", background: "#fafafa",
    width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue', sans-serif", padding: "16px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "32px", gap: "12px" }}>
          <div style={{ width: "48px", height: "48px", background: "#111", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: "20px", color: "#fff" }}>
            P
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "800", fontFamily: "Georgia, serif", color: "#111" }}>
              Plateforme Collaborative
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#999" }}>Gérez vos équipes et projets</p>
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #e8e8e8", overflow: "hidden" }}>
          {tab === "confirm" ? (
            <div style={{ padding: "32px 28px" }}>
              <div style={{ marginBottom: "20px" }}>
                <h2 style={{ margin: "0 0 4px", fontSize: "17px", fontWeight: "700", color: "#111" }}>Confirmez votre email</h2>
                <p style={{ margin: 0, fontSize: "14px", color: "#666" }}>Un code de vérification a été envoyé à <strong>{confirmForm.email}</strong>.</p>
              </div>
              {error && (
                <div style={{ marginBottom: "20px", padding: "12px 16px", background: "#fff5f5", border: "1px solid #ffd0d0", borderRadius: "8px", fontSize: "14px", color: "#cc0000" }}>
                  {error}
                </div>
              )}
              {success && (
                <div style={{ marginBottom: "20px", padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "14px", color: "#166534" }}>
                  {success}
                </div>
              )}
              <form onSubmit={handleConfirm} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <InputField label="Email">
                  <input type="email" value={confirmForm.email} onChange={(e) => setConfirmForm((p) => ({ ...p, email: e.target.value }))} style={inputStyle} required onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                </InputField>
                <InputField label="Code de vérification">
                  <input type="text" value={confirmForm.code} onChange={(e) => setConfirmForm((p) => ({ ...p, code: e.target.value }))} style={inputStyle} required onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                </InputField>
                <SubmitBtn loading={busy}>Valider mon email</SubmitBtn>
                <button type="button" onClick={handleResend} disabled={busy || !confirmForm.email} style={{ background: "none", border: "none", cursor: "pointer", color: "#666", fontSize: "13px", textDecoration: "underline", padding: 0, opacity: busy || !confirmForm.email ? 0.4 : 1 }}>
                  Renvoyer le code
                </button>
              </form>
              <button type="button" onClick={() => { clear(); setTab("login"); }} style={{ marginTop: "20px", background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: "13px", padding: 0 }}>
                ← Retour à la connexion
              </button>
            </div>
          ) : (
            <>
              {invitationId && (
                <div style={{ padding: "12px 24px", borderBottom: "1px solid #fde68a", background: "#fffbeb", fontSize: "13px", color: "#92400e" }}>
                  Vous avez été invité à rejoindre une équipe. Connectez-vous pour répondre.
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid #f0f0f0" }}>
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { clear(); setTab(t.key); }}
                    style={{
                      flex: 1, padding: "14px 8px", fontSize: "13px", fontWeight: "600", border: "none", cursor: "pointer",
                      background: tab === t.key ? "#fff" : "#fafafa",
                      color: tab === t.key ? "#111" : "#aaa",
                      borderBottom: tab === t.key ? "2px solid #111" : "2px solid transparent",
                      transition: "all 0.15s",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div style={{ padding: "28px 28px" }}>
                {error && (
                  <div style={{ marginBottom: "20px", padding: "12px 16px", background: "#fff5f5", border: "1px solid #ffd0d0", borderRadius: "8px", fontSize: "14px", color: "#cc0000" }}>
                    {error}
                  </div>
                )}
                {success && (
                  <div style={{ marginBottom: "20px", padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "14px", color: "#166534" }}>
                    {success}
                  </div>
                )}

                {tab === "login" && (
                  <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <InputField label="Email">
                      <input type="email" value={loginForm.email} onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))} style={inputStyle} required onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                    </InputField>
                    <InputField label="Mot de passe">
                      <input type="password" value={loginForm.password} onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))} style={inputStyle} required onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                    </InputField>
                    <SubmitBtn loading={busy}>Se connecter</SubmitBtn>
                  </form>
                )}

                {tab === "register" && (
                  <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                      <InputField label="Prénom">
                        <input type="text" value={registerForm.first_name} onChange={(e) => setRegisterForm((p) => ({ ...p, first_name: e.target.value }))} style={inputStyle} onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                      </InputField>
                      <InputField label="Nom">
                        <input type="text" value={registerForm.last_name} onChange={(e) => setRegisterForm((p) => ({ ...p, last_name: e.target.value }))} style={inputStyle} onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                      </InputField>
                    </div>
                    <InputField label="Email">
                      <input type="email" value={registerForm.email} onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))} style={inputStyle} required onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                    </InputField>
                    <InputField label="Mot de passe">
                      <input type="password" value={registerForm.password} onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))} style={inputStyle} required onFocus={(e) => (e.currentTarget.style.borderColor = "#111")} onBlur={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")} />
                    </InputField>
                    <SubmitBtn loading={busy}>Créer mon compte</SubmitBtn>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InputField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <span style={{ fontSize: "13px", fontWeight: "600", color: "#444" }}>{label}</span>
      {children}
    </label>
  );
}

function SubmitBtn({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{ marginTop: "4px", background: loading ? "#555" : "#111", color: "#fff", border: "none", borderRadius: "8px", padding: "12px", fontSize: "14px", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", transition: "background 0.15s" }}
      onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#333"; }}
      onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#111"; }}
    >
      {loading ? "Chargement…" : children}
    </button>
  );
}
