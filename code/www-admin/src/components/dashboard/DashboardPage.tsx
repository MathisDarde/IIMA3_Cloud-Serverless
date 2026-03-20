import { useState, useRef, useEffect } from "react";
import { api } from "../../lib/api";
import { ProfileSection } from "./ProfileSection";
import { TeamsSection } from "./TeamsSection";
import { InvitationsSection } from "./InvitationsSection";
import type { Profile, Team } from "../../types";

const BASE = import.meta.env.VITE_BASE_API_URL || "";

type Section = "dashboard" | "users" | "backups" | "teams" | "invitations" | "profile";
type StatsData = { users: number; teams: number; projects: number; tasks: number };
type ApiUser = { id: number; cognito_sub: string; role: string; created_at: string; email: string | null; first_name: string | null; last_name: string | null };
type Backup = { id: number; s3_key: string; size_bytes: number | null; status: string; created_at: string };

const IconDashboard = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);
const IconUsers = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconBackup = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
  </svg>
);
const IconTeams = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconInvitations = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const IconProfile = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconLogout = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const StatCard = ({ label, value, dark }: { label: string; value: number; dark: boolean }) => (
  <div className={`rounded-2xl p-7 flex flex-col gap-3 border transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg cursor-default ${dark ? "bg-gray-900 text-white border-gray-800" : "bg-white text-gray-900 border-gray-200"}`}>
    <div className="text-4xl font-extrabold font-serif leading-none">{value.toLocaleString()}</div>
    <div className="text-xs font-semibold uppercase tracking-widest opacity-60">{label}</div>
  </div>
);

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = { token: string; onLogout: () => void };

export default function AdminDashboard({ token, onLogout }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [search, setSearch] = useState("");
  const [invitationsReloadSignal, setInvitationsReloadSignal] = useState(0);
  const [statsData, setStatsData] = useState<StatsData>({ users: 0, teams: 0, projects: 0, tasks: 0 });
  const [apiUsers, setApiUsers] = useState<ApiUser[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);

  const dashboardRef = useRef<HTMLDivElement>(null);
  const usersRef = useRef<HTMLDivElement>(null);
  const backupsRef = useRef<HTMLDivElement>(null);
  const teamsRef = useRef<HTMLDivElement>(null);
  const invitationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const sectionRefs: Record<Section, React.RefObject<HTMLDivElement | null>> = {
    dashboard: dashboardRef,
    users: usersRef,
    backups: backupsRef,
    teams: teamsRef,
    invitations: invitationsRef,
    profile: profileRef,
  };

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/stats`).then((r) => r.json()),
      fetch(`${BASE}/users`).then((r) => r.json()),
      fetch(`${BASE}/backups`).then((r) => r.json()),
      api.auth.getProfile(token).catch(() => ({ profile: null })),
      api.teams.list(token).catch(() => ({ teams: [] })),
    ]).then(([s, u, b, p, t]) => {
      setStatsData(s);
      setApiUsers(u.users ?? []);
      setBackups(b.backups ?? []);
      if (p.profile) setProfile(p.profile);
      setTeams(t.teams ?? []);
    }).finally(() => setAdminLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollTo = (section: Section) => {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredUsers = apiUsers.filter((u) => {
    const q = search.toLowerCase();
    return (
      String(u.id).includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q)
    );
  });

  const sidebarItems: { id: Section; icon: React.ReactNode; label: string }[] = [
    { id: "dashboard", icon: <IconDashboard />, label: "Dashboard" },
    { id: "users", icon: <IconUsers />, label: "Utilisateurs" },
    { id: "backups", icon: <IconBackup />, label: "Sauvegardes" },
    { id: "teams", icon: <IconTeams />, label: "Équipes" },
    { id: "invitations", icon: <IconInvitations />, label: "Invitations" },
    { id: "profile", icon: <IconProfile />, label: "Profil" },
  ];

  const SectionHeader = ({ label, sub }: { label: string; sub: string }) => (
    <div className="mb-8">
      <p className="text-xs text-gray-400 tracking-widest uppercase mb-1">{sub}</p>
      <h1 className="text-3xl font-extrabold text-gray-900 font-serif">{label}</h1>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="bg-gray-900 flex flex-col items-center py-6 gap-2 shrink-0 sticky top-0 h-screen" style={{ width: "72px" }}>
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-lg text-gray-900 mb-4">A</div>

        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollTo(item.id)}
            title={item.label}
            className={`w-11 h-11 rounded-xl border-0 flex items-center justify-center cursor-pointer transition-all duration-150 ${
              activeSection === item.id ? "bg-white text-gray-900" : "bg-transparent text-white/45 hover:bg-white/10"
            }`}
          >
            {item.icon}
          </button>
        ))}

        <div className="flex-1" />

        <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm mb-2">
          {profile?.first_name?.[0] ?? profile?.email?.[0]?.toUpperCase() ?? "A"}
        </div>

        <button
          title="Déconnexion"
          onClick={onLogout}
          className="w-11 h-11 rounded-xl border-0 bg-transparent text-white/35 flex items-center justify-center cursor-pointer transition-all duration-150 hover:text-red-400 hover:bg-red-500/10"
        >
          <IconLogout />
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto px-12 py-10 flex flex-col gap-20">

        {/* DASHBOARD */}
        <section ref={dashboardRef}>
          <div className="flex justify-between items-start mb-10">
            <div>
              <p className="text-xs text-gray-400 tracking-widest uppercase mb-1">Espace Administrateur</p>
              <h1 className="text-3xl font-extrabold text-gray-900 font-serif">
                Bonjour{profile?.first_name ? `, ${profile.first_name}` : ""} 👋
              </h1>
            </div>
            <div className="bg-white rounded-xl px-4 py-2.5 border border-gray-200 flex flex-col items-end">
              <span className="font-bold text-sm text-gray-900">
                {profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : profile?.email ?? "Admin"}
              </span>
              <span className="text-xs text-gray-400">{profile?.email ?? ""}</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 tracking-widest uppercase mb-5">Statistiques globales</p>
          {adminLoading ? (
            <p className="text-gray-400 text-sm">Chargement…</p>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Utilisateurs" value={statsData.users} dark={true} />
              <StatCard label="Équipes" value={statsData.teams} dark={false} />
              <StatCard label="Projets" value={statsData.projects} dark={true} />
              <StatCard label="Tâches" value={statsData.tasks} dark={false} />
            </div>
          )}
        </section>

        {/* USERS */}
        <section ref={usersRef}>
          <div className="flex justify-between items-start mb-6">
            <SectionHeader label="Utilisateurs" sub="Gestion" />
            <div className="flex items-center gap-2 bg-white rounded-xl px-4 py-3 border border-gray-200 w-72">
              <span className="text-gray-400"><IconSearch /></span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="border-none outline-none text-sm text-gray-900 bg-transparent w-full"
              />
              {search && <button onClick={() => setSearch("")} className="text-gray-400 text-lg leading-none bg-none border-none cursor-pointer p-0">×</button>}
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-4">{filteredUsers.length} utilisateur{filteredUsers.length > 1 ? "s" : ""}</p>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {["ID", "Nom", "Email", "Rôle", "Inscription"].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => (
                  <tr key={u.id} className={`transition-colors hover:bg-gray-50 ${i < filteredUsers.length - 1 ? "border-b border-gray-50" : ""}`}>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900">#{u.id}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-900">
                      {u.first_name || u.last_name
                        ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500">{u.email ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.role === "admin" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {new Date(u.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-300">Aucun utilisateur trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* BACKUPS */}
        <section ref={backupsRef}>
          <SectionHeader label="Sauvegardes" sub="Base de données" />
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Fichier S3", "Taille", "Statut", "Date"].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backups.map((b, i) => (
                  <tr key={b.id} className={`transition-colors hover:bg-gray-50 ${i < backups.length - 1 ? "border-b border-gray-50" : ""}`}>
                    <td className="px-5 py-3.5 text-xs text-gray-500 font-mono max-w-xs truncate">{b.s3_key}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{formatBytes(b.size_bytes)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${b.status === "success" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {new Date(b.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
                {backups.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-300">Aucune sauvegarde</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* TEAMS */}
        <section ref={teamsRef}>
          <SectionHeader label="Équipes" sub="Collaboration" />
          <TeamsSection
            token={token}
            teams={teams}
            onTeamCreated={(team) => setTeams((p) => [team, ...p])}
            onInvitationCreated={() => setInvitationsReloadSignal((s) => s + 1)}
            onUnauthorized={onLogout}
          />
        </section>

        {/* INVITATIONS */}
        <section ref={invitationsRef}>
          <SectionHeader label="Invitations" sub="Équipes" />
          <InvitationsSection
            token={token}
            highlightedInvitationId={null}
            reloadSignal={invitationsReloadSignal}
            onInvitationAccepted={async () => {
              const data = await api.teams.list(token);
              setTeams(data.teams);
            }}
            onUnauthorized={onLogout}
          />
        </section>

        {/* PROFILE */}
        <section ref={profileRef} className="pb-16">
          <SectionHeader label="Profil" sub="Mon compte" />
          <ProfileSection
            profile={profile}
            token={token}
            onUpdate={setProfile}
            onUnauthorized={onLogout}
          />
        </section>
      </main>
    </div>
  );
}
