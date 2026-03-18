import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

type AuthTokens = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
};

type Profile = {
  id: number | null;
  sub?: string;
  cognito_sub?: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

type Team = {
  id: number;
  name: string;
  created_at: string;
  created_by: number;
  role: string;
  member_count: number;
};

type TeamMember = {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  joined_at: string;
};

type AppView = "auth" | "dashboard";

const ACCESS_TOKEN_STORAGE_KEY = "user.access_token";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function getStoredToken() {
  return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) ?? "";
}

async function handleApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === "string" ? payload.error : "Erreur API";
    throw new Error(message);
  }
  return payload as T;
}

function App() {
  const [token, setToken] = useState(getStoredToken);
  const [view, setView] = useState<AppView>(token ? "dashboard" : "auth");
  const [registerForm, setRegisterForm] = useState({
    email: "",
    password: "",
    first_name: "",
    last_name: "",
  });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [verificationForm, setVerificationForm] = useState({
    email: "",
    code: "",
  });
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "" });
  const [teamForm, setTeamForm] = useState({ name: "" });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isLoggedIn = useMemo(() => token.trim().length > 0, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    void fetchProfile(token);
    void fetchTeams(token);
  }, []);

  const clearFeedback = () => {
    setError("");
    setSuccess("");
  };

  const onRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    try {
      await handleApiResponse<{ user: Profile }>(
        await fetch(`${API_BASE_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registerForm),
        }),
      );

      setPendingVerificationEmail(registerForm.email);
      setVerificationForm({ email: registerForm.email, code: "" });
      setSuccess(
        "Compte cree. Saisissez le code recu par email pour activer votre compte.",
      );
      setRegisterForm({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
      });
    } catch (apiError) {
      setError(
        apiError instanceof Error ? apiError.message : "Echec de l inscription",
      );
    } finally {
      setBusy(false);
    }
  };

  const onConfirmEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    try {
      await handleApiResponse<{ message: string }>(
        await fetch(`${API_BASE_URL}/auth/confirm-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(verificationForm),
        }),
      );

      setPendingVerificationEmail("");
      setSuccess("Email confirme. Vous pouvez maintenant vous connecter.");
      setLoginForm((prev) => ({ ...prev, email: verificationForm.email }));
      setVerificationForm((prev) => ({ ...prev, code: "" }));
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Echec de la verification",
      );
    } finally {
      setBusy(false);
    }
  };

  const onResendConfirmationCode = async () => {
    clearFeedback();
    setBusy(true);

    try {
      await handleApiResponse<{ message: string }>(
        await fetch(`${API_BASE_URL}/auth/resend-confirmation-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: verificationForm.email }),
        }),
      );

      setSuccess("Un nouveau code de verification a ete envoye.");
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Echec du renvoi du code",
      );
    } finally {
      setBusy(false);
    }
  };

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    try {
      const payload = await handleApiResponse<AuthTokens>(
        await fetch(`${API_BASE_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loginForm),
        }),
      );

      const accessToken = payload.access_token ?? "";
      if (!accessToken) {
        throw new Error("Token d acces manquant");
      }

      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
      setToken(accessToken);
      setView("dashboard");
      setSuccess("Connexion reussie.");
      setLoginForm({ email: "", password: "" });
      await fetchProfile(accessToken);
      await fetchTeams(accessToken);
    } catch (apiError) {
      setError(
        apiError instanceof Error ? apiError.message : "Echec de la connexion",
      );
    } finally {
      setBusy(false);
    }
  };

  const fetchProfile = async (accessToken = token) => {
    clearFeedback();
    setBusy(true);

    try {
      const payload = await handleApiResponse<{ profile: Profile }>(
        await fetch(`${API_BASE_URL}/auth/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      const currentProfile = payload.profile;
      setProfile(currentProfile);
      setEditForm({
        first_name: currentProfile.first_name ?? "",
        last_name: currentProfile.last_name ?? "",
      });
      setSuccess("Profil charge.");
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Impossible de charger le profil",
      );
    } finally {
      setBusy(false);
    }
  };

  const onUpdateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    try {
      const payload = await handleApiResponse<{ profile: Profile }>(
        await fetch(`${API_BASE_URL}/auth/profile`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(editForm),
        }),
      );

      setProfile(payload.profile);
      setSuccess("Profil mis a jour.");
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Echec de la mise a jour",
      );
    } finally {
      setBusy(false);
    }
  };

  const fetchTeams = async (accessToken = token) => {
    try {
      const payload = await handleApiResponse<{ teams: Team[] }>(
        await fetch(`${API_BASE_URL}/teams`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );

      setTeams(payload.teams);
      if (payload.teams.length === 0) {
        setSelectedTeamId(null);
        setTeamMembers([]);
      }
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Impossible de charger les equipes",
      );
    }
  };

  const onCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearFeedback();
    setBusy(true);

    try {
      const payload = await handleApiResponse<{ team: Team }>(
        await fetch(`${API_BASE_URL}/teams`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(teamForm),
        }),
      );

      setSuccess("Equipe creee.");
      setTeamForm({ name: "" });
      setTeams((prev) => [payload.team, ...prev]);
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Echec de creation de l equipe",
      );
    } finally {
      setBusy(false);
    }
  };

  const fetchTeamMembers = async (teamId: number) => {
    clearFeedback();
    setBusy(true);
    setSelectedTeamId(teamId);

    try {
      const payload = await handleApiResponse<{ members: TeamMember[] }>(
        await fetch(`${API_BASE_URL}/teams/${teamId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      setTeamMembers(payload.members);
      setSuccess("Membres de l equipe charges.");
    } catch (apiError) {
      setError(
        apiError instanceof Error
          ? apiError.message
          : "Impossible de charger les membres de l equipe",
      );
    } finally {
      setBusy(false);
    }
  };

  const onLogout = () => {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    setToken("");
    setProfile(null);
    setTeams([]);
    setTeamMembers([]);
    setSelectedTeamId(null);
    setEditForm({ first_name: "", last_name: "" });
    setTeamForm({ name: "" });
    setView("auth");
    clearFeedback();
  };

  const authView = (
    <main className="grid">
      <section className="card">
        <h2>Inscription</h2>
        <form className="stack" onSubmit={onRegister}>
          <label>
            Email
            <input
              type="email"
              value={registerForm.email}
              onChange={(event) =>
                setRegisterForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
              required
            />
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              value={registerForm.password}
              onChange={(event) =>
                setRegisterForm((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              required
            />
          </label>

          <label>
            Prenom
            <input
              type="text"
              value={registerForm.first_name}
              onChange={(event) =>
                setRegisterForm((prev) => ({
                  ...prev,
                  first_name: event.target.value,
                }))
              }
            />
          </label>

          <label>
            Nom
            <input
              type="text"
              value={registerForm.last_name}
              onChange={(event) =>
                setRegisterForm((prev) => ({
                  ...prev,
                  last_name: event.target.value,
                }))
              }
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Chargement..." : "Creer mon compte"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Connexion</h2>
        {pendingVerificationEmail ? (
          <p className="hint">
            Validez d abord votre email ({pendingVerificationEmail}) pour
            activer la connexion.
          </p>
        ) : null}
        <form className="stack" onSubmit={onLogin}>
          <label>
            Email
            <input
              type="email"
              value={loginForm.email}
              onChange={(event) =>
                setLoginForm((prev) => ({ ...prev, email: event.target.value }))
              }
              required
            />
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              required
            />
          </label>

          <button
            type="submit"
            disabled={busy || Boolean(pendingVerificationEmail)}
          >
            {busy ? "Chargement..." : "Se connecter"}
          </button>
        </form>
      </section>

      <section className="card card-wide">
        <h2>Verification email</h2>
        <p className="hint">
          Cette etape est obligatoire apres inscription. Entrez le code recu par
          email.
        </p>
        <form className="stack" onSubmit={onConfirmEmail}>
          <label>
            Email
            <input
              type="email"
              value={verificationForm.email}
              onChange={(event) =>
                setVerificationForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
              required
            />
          </label>

          <label>
            Code de verification
            <input
              type="text"
              value={verificationForm.code}
              onChange={(event) =>
                setVerificationForm((prev) => ({
                  ...prev,
                  code: event.target.value,
                }))
              }
              required
            />
          </label>

          <button
            type="submit"
            disabled={busy || !verificationForm.email || !verificationForm.code}
          >
            {busy ? "Chargement..." : "Valider mon email"}
          </button>

          <button
            type="button"
            className="ghost"
            onClick={onResendConfirmationCode}
            disabled={busy || !verificationForm.email}
          >
            Renvoyer le code
          </button>
        </form>
      </section>
    </main>
  );

  const dashboardView = (
    <main className="grid">
      <section className="card card-wide">
        <div className="top-row">
          <h2>Tableau de bord</h2>
          <button className="ghost" onClick={onLogout} type="button">
            Se deconnecter
          </button>
        </div>
        <p className="hint">
          Depuis cette page, vous pouvez gerer votre profil et vos equipes.
        </p>
      </section>

      <section className="card card-wide">
        <h2>Profil</h2>

        <div className="actions">
          <button
            type="button"
            onClick={() => fetchProfile()}
            disabled={!isLoggedIn || busy}
          >
            Recharger le profil
          </button>
        </div>

        <div className="profile-box">
          <p>
            <strong>Email:</strong> {profile?.email ?? "Non renseigne"}
          </p>
          <p>
            <strong>Prenom:</strong> {profile?.first_name ?? "Non renseigne"}
          </p>
          <p>
            <strong>Nom:</strong> {profile?.last_name ?? "Non renseigne"}
          </p>
          <p>
            <strong>Role:</strong> {profile?.role ?? "user"}
          </p>
        </div>

        <form className="stack" onSubmit={onUpdateProfile}>
          <label>
            Nouveau prenom
            <input
              type="text"
              value={editForm.first_name}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  first_name: event.target.value,
                }))
              }
              disabled={!isLoggedIn}
            />
          </label>

          <label>
            Nouveau nom
            <input
              type="text"
              value={editForm.last_name}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  last_name: event.target.value,
                }))
              }
              disabled={!isLoggedIn}
            />
          </label>

          <button type="submit" disabled={!isLoggedIn || busy}>
            {busy ? "Chargement..." : "Mettre a jour le profil"}
          </button>
        </form>
      </section>

      <section className="card card-wide">
        <h2>Equipes</h2>

        <form className="stack" onSubmit={onCreateTeam}>
          <label>
            Nom de l equipe
            <input
              type="text"
              value={teamForm.name}
              onChange={(event) => setTeamForm({ name: event.target.value })}
              disabled={!isLoggedIn}
              required
            />
          </label>

          <button type="submit" disabled={!isLoggedIn || busy}>
            {busy ? "Chargement..." : "Creer une equipe"}
          </button>
        </form>

        <div className="actions">
          <button
            type="button"
            onClick={() => fetchTeams()}
            disabled={!isLoggedIn || busy}
          >
            Recharger mes equipes
          </button>
        </div>

        {teams.length === 0 ? (
          <p className="hint">Aucune equipe pour le moment.</p>
        ) : (
          <div className="team-list">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                className={`team-item ${selectedTeamId === team.id ? "team-item-selected" : ""}`}
                onClick={() => fetchTeamMembers(team.id)}
                disabled={!isLoggedIn || busy}
              >
                <span>{team.name}</span>
                <small>{team.member_count} membre(s)</small>
              </button>
            ))}
          </div>
        )}

        {selectedTeamId ? (
          <div className="profile-box">
            <p>
              <strong>Membres:</strong>
            </p>
            {teamMembers.length === 0 ? (
              <p>Aucun membre trouve.</p>
            ) : (
              teamMembers.map((member) => (
                <p key={member.id}>
                  {member.first_name ?? ""} {member.last_name ?? ""} -{" "}
                  {member.email} ({member.role})
                </p>
              ))
            )}
          </div>
        ) : null}
      </section>
    </main>
  );

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Plateforme Collaborative</p>
        <h1>
          {view === "auth" ? "Espace utilisateur" : "Accueil utilisateur"}
        </h1>
        <p className="subtitle">
          {view === "auth"
            ? "Creez votre compte, confirmez votre email puis connectez-vous."
            : "Consultez votre profil et gerez vos equipes depuis ce tableau de bord."}
        </p>
      </header>

      {error ? <p className="feedback error">{error}</p> : null}
      {success ? <p className="feedback success">{success}</p> : null}

      {view === "auth" ? authView : dashboardView}
    </div>
  );
}

export default App;
