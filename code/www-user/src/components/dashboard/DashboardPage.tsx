import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ProfileSection } from "./ProfileSection";
import { TeamsSection } from "./TeamsSection";
import type { Profile, Team } from "../../types";

type Props = {
  token: string;
  onLogout: () => void;
  onUnauthorized: () => void;
};

export function DashboardPage({ token, onLogout, onUnauthorized }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.auth.getProfile(token).then((d) => setProfile(d.profile)),
      api.teams.list(token).then((d) => setTeams(d.teams)),
    ])
      .catch((err: any) => {
        if (err?.status === 401) onUnauthorized();
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-violet-700">Plateforme Collaborative</h1>
          {profile && (
            <p className="text-sm text-gray-500 mt-0.5">
              Bonjour, {profile.first_name ?? profile.email} 👋
            </p>
          )}
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
        >
          Se déconnecter
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <ProfileSection
          profile={profile}
          token={token}
          onUpdate={setProfile}
          onUnauthorized={onUnauthorized}
        />
        <TeamsSection
          token={token}
          teams={teams}
          onTeamCreated={(team) => setTeams((p) => [team, ...p])}
          onUnauthorized={onUnauthorized}
        />
      </main>
    </div>
  );
}
