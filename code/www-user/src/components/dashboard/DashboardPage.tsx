import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { ProfileSection } from "./ProfileSection";
import { TeamsSection } from "./TeamsSection";
import { InvitationsSection } from "./InvitationsSection";
import type { Profile, Team } from "../../types";

type Section = "teams" | "invitations" | "profile";

type Props = {
  token: string;
  onLogout: () => void;
  onUnauthorized: () => void;
  highlightedInvitationId: number | null;
};

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

export function DashboardPage({ token, onLogout, onUnauthorized, highlightedInvitationId }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("teams");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [invitationsReloadSignal, setInvitationsReloadSignal] = useState(0);
  const [loading, setLoading] = useState(true);

  const teamsRef = useRef<HTMLDivElement>(null);
  const invitationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const sectionRefs: Record<Section, React.RefObject<HTMLDivElement | null>> = {
    teams: teamsRef,
    invitations: invitationsRef,
    profile: profileRef,
  };


  async function loadTeams() {
    const data = await api.teams.list(token);
    setTeams(data.teams);
  }

  useEffect(() => {
    Promise.all([
      api.auth.getProfile(token).then((d) => setProfile(d.profile)),
      loadTeams(),
    ])
      .catch((err: unknown) => { if ((err as { status?: number })?.status === 401) onUnauthorized(); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Chargement…</p>
      </div>
    );
  }

  const scrollTo = (section: Section) => {
    setActiveSection(section);
    sectionRefs[section].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sidebarItems: { id: Section; icon: React.ReactNode; label: string }[] = [
    { id: "teams", icon: <IconTeams />, label: "Équipes" },
    { id: "invitations", icon: <IconInvitations />, label: "Invitations" },
    { id: "profile", icon: <IconProfile />, label: "Profil" },
  ];

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <aside className="w-18 bg-gray-900 flex flex-col items-center py-6 gap-2 flex-shrink-0 sticky top-0 h-screen" style={{ width: "72px" }}>
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-lg text-gray-900 mb-4">
          P
        </div>

        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollTo(item.id)}
            title={item.label}
            className={`w-11 h-11 rounded-xl border-0 flex items-center justify-center cursor-pointer transition-all duration-150 ${
              activeSection === item.id
                ? "bg-white text-gray-900"
                : "bg-transparent text-white/45 hover:bg-white/10"
            }`}
          >
            {item.icon}
          </button>
        ))}

        <div className="flex-1" />

        <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm mb-2">
          {profile?.first_name?.[0]?.toUpperCase() ?? profile?.email?.[0]?.toUpperCase() ?? "U"}
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
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-gray-400 tracking-widest uppercase mb-1">Plateforme Collaborative</p>
            <h1 className="text-3xl font-extrabold text-gray-900 font-serif">
              Bonjour{profile?.first_name ? `, ${profile.first_name}` : ""} 👋
            </h1>
          </div>
          <div className="bg-white rounded-xl px-4 py-2.5 border border-gray-200 flex flex-col items-end">
            <span className="font-bold text-sm text-gray-900">
              {profile?.first_name && profile?.last_name
                ? `${profile.first_name} ${profile.last_name}`
                : profile?.email ?? ""}
            </span>
            <span className="text-xs text-gray-400">{profile?.email ?? ""}</span>
          </div>
        </div>

        {/* TEAMS */}
        <section ref={sectionRefs.teams}>
          <div className="mb-6">
            <p className="text-xs text-gray-400 tracking-widest uppercase mb-1">Collaboration</p>
            <h2 className="text-2xl font-extrabold text-gray-900 font-serif">Équipes</h2>
          </div>
          <TeamsSection
            token={token}
            teams={teams}
            onTeamCreated={(team) => setTeams((p) => [team, ...p])}
            onInvitationCreated={() => setInvitationsReloadSignal((s) => s + 1)}
            onUnauthorized={onUnauthorized}
          />
        </section>

        {/* INVITATIONS */}
        <section ref={sectionRefs.invitations}>
          <div className="mb-6">
            <p className="text-xs text-gray-400 tracking-widest uppercase mb-1">Équipes</p>
            <h2 className="text-2xl font-extrabold text-gray-900 font-serif">Invitations</h2>
          </div>
          <InvitationsSection
            token={token}
            highlightedInvitationId={highlightedInvitationId}
            reloadSignal={invitationsReloadSignal}
            onInvitationAccepted={loadTeams}
            onUnauthorized={onUnauthorized}
          />
        </section>

        {/* PROFILE */}
        <section ref={sectionRefs.profile} className="pb-16">
          <div className="mb-6">
            <p className="text-xs text-gray-400 tracking-widest uppercase mb-1">Mon compte</p>
            <h2 className="text-2xl font-extrabold text-gray-900 font-serif">Profil</h2>
          </div>
          <ProfileSection
            profile={profile}
            token={token}
            onUpdate={setProfile}
            onUnauthorized={onUnauthorized}
          />
        </section>
      </main>
    </div>
  );
}
