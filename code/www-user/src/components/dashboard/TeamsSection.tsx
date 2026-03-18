import { useState } from "react";
import { api } from "../../lib/api";
import { ProjectsSection } from "./ProjectsSection";
import type { Team, TeamMember } from "../../types";

type Props = {
  token: string;
  teams: Team[];
  onTeamCreated: (team: Team) => void;
  onInvitationCreated: () => Promise<void> | void;
  onUnauthorized: () => void;
};

export function TeamsSection({
  token,
  teams,
  onTeamCreated,
  onInvitationCreated,
  onUnauthorized,
}: Props) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"projects" | "members">(
    "projects",
  );

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState("");
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateBusy(true);
    setError("");
    try {
      const data = await api.teams.create(token, createName.trim());
      onTeamCreated(data.team);
      setCreateName("");
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

  const handleSelectTeam = async (team: Team) => {
    setSelectedTeam(team);
    setActiveTab("projects");
    setMembers([]);
    setInviteEmail("");
    setInviteFeedback("");
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeam) return;

    setInviteBusy(true);
    setInviteFeedback("");
    setError("");

    try {
      const data = await api.teams.invite(
        token,
        selectedTeam.id,
        inviteEmail.trim(),
      );
      setInviteEmail("");
      setInviteFeedback(
        data.warning ??
          "Invitation envoyee. La personne la verra dans son espace.",
      );
      await onInvitationCreated();
    } catch (err: any) {
      if (err?.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setInviteBusy(false);
    }
  };

  const loadMembers = async (team: Team) => {
    setMembersLoading(true);
    try {
      const data = await api.teams.getMembers(token, team.id);
      setMembers(data.members);
    } catch (err: any) {
      if (err?.status === 401) {
        onUnauthorized();
        return;
      }
    } finally {
      setMembersLoading(false);
    }
  };

  const handleTabChange = (tab: "projects" | "members") => {
    setActiveTab(tab);
    if (tab === "members" && selectedTeam && members.length === 0) {
      loadMembers(selectedTeam);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Mes équipes</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="text-sm bg-violet-600 hover:bg-violet-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            + Nouvelle équipe
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {showCreate && (
          <form onSubmit={handleCreate} className="mb-4 flex gap-2">
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Nom de l'équipe"
              className="input flex-1"
              required
              autoFocus
            />
            <button
              type="submit"
              disabled={createBusy}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {createBusy ? "..." : "Créer"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm px-3 py-2 rounded-lg transition-colors"
            >
              ✕
            </button>
          </form>
        )}

        {teams.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Aucune équipe pour le moment.
          </p>
        ) : (
          <div className="space-y-2">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => handleSelectTeam(team)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                  selectedTeam?.id === team.id
                    ? "border-violet-300 bg-violet-50"
                    : "border-gray-100 hover:border-violet-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 text-sm">
                    {team.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      {team.member_count} membre(s)
                    </span>
                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium capitalize">
                      {team.role}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedTeam && (
        <div>
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Inviter dans {selectedTeam.name}
            </h2>
            {inviteFeedback && (
              <div className="mb-3 rounded-lg bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-sm">
                {inviteFeedback}
              </div>
            )}
            <form onSubmit={handleInvite} className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="input flex-1"
                placeholder="email@exemple.com"
                required
              />
              <button
                type="submit"
                disabled={inviteBusy}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {inviteBusy ? "..." : "Inviter"}
              </button>
            </form>
          </section>

          <div className="flex border-b border-gray-200 mb-4">
            <TabBtn
              active={activeTab === "projects"}
              onClick={() => handleTabChange("projects")}
            >
              Projets
            </TabBtn>
            <TabBtn
              active={activeTab === "members"}
              onClick={() => handleTabChange("members")}
            >
              Membres
            </TabBtn>
          </div>

          {activeTab === "projects" && (
            <ProjectsSection
              token={token}
              teamId={selectedTeam.id}
              teamRole={selectedTeam.role}
              onUnauthorized={onUnauthorized}
            />
          )}

          {activeTab === "members" && (
            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Membres — {selectedTeam.name}
              </h2>
              {membersLoading ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Chargement...
                </p>
              ) : members.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Aucun membre.
                </p>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {m.first_name || m.last_name
                            ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()
                            : m.email ?? m.cognito_sub}
                        </p>
                        {m.email && (
                          <p className="text-xs text-gray-400">{m.email}</p>
                        )}
                      </div>
                      <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium capitalize">
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
        active
          ? "border-violet-600 text-violet-700"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {children}
    </button>
  );
}
