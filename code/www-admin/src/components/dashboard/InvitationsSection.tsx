import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { TeamInvitation } from "../../types";

type Props = {
  token: string;
  highlightedInvitationId: number | null;
  reloadSignal: number;
  onInvitationAccepted: () => Promise<void> | void;
  onUnauthorized: () => void;
};

export function InvitationsSection({
  token,
  highlightedInvitationId,
  reloadSignal,
  onInvitationAccepted,
  onUnauthorized,
}: Props) {
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadInvitations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.invitations.list(token);
      setInvitations(data.invitations);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations, reloadSignal]);

  function clearInvitationQueryParam(invitationId: number) {
    if (highlightedInvitationId !== invitationId) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("invitation");
    window.history.replaceState({}, "", url.toString());
  }

  async function handleAccept(invitationId: number) {
    setBusyId(invitationId);
    setError("");
    try {
      await api.invitations.accept(token, invitationId);
      await loadInvitations();
      await onInvitationAccepted();
      clearInvitationQueryParam(invitationId);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefuse(invitationId: number) {
    setBusyId(invitationId);
    setError("");
    try {
      await api.invitations.reject(token, invitationId);
      await loadInvitations();
      clearInvitationQueryParam(invitationId);
    } catch (err: unknown) {
      if (isUnauthorizedError(err)) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Mes invitations</h2>
        <button
          onClick={loadInvitations}
          className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
        >
          Actualiser
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400 py-4 text-center">Chargement...</p>
      ) : invitations.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Aucune invitation.
        </p>
      ) : (
        <div className="space-y-2">
          {invitations.map((invitation) => {
            const inviterLabel =
              [invitation.invited_by_first_name, invitation.invited_by_last_name]
                .filter(Boolean)
                .join(" ") ||
              invitation.invited_by_email ||
              invitation.invited_by_sub;

            return (
              <div
                key={invitation.id}
                className={`rounded-xl border px-4 py-3 ${
                  highlightedInvitationId === invitation.id
                    ? "invite-item-focus"
                    : "border-gray-100"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {invitation.team_name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Invite par {inviterLabel}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      invitation.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : invitation.status === "accepted"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {invitation.status}
                  </span>
                </div>

                {invitation.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleAccept(invitation.id)}
                      disabled={busyId === invitation.id}
                      className="flex-1 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      {busyId === invitation.id ? "..." : "Accepter"}
                    </button>
                    <button
                      onClick={() => handleRefuse(invitation.id)}
                      disabled={busyId === invitation.id}
                      className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                    >
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function isUnauthorizedError(err: unknown): err is { status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: unknown }).status === 401
  );
}
