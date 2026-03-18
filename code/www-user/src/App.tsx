import { useState } from "react";
import { AuthPage } from "./components/auth/AuthPage";
import { DashboardPage } from "./components/dashboard/DashboardPage";

const TOKEN_KEY = "user.access_token";

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export default function App() {
  const [token, setToken] = useState(getStoredToken);
  const invitationIdParam = new URLSearchParams(window.location.search).get(
    "invitation",
  );
  const invitationId = invitationIdParam ? Number(invitationIdParam) : null;
  const isValidInvitationId =
    invitationId !== null && Number.isFinite(invitationId);

  const handleLogin = (accessToken: string) => {
    localStorage.setItem(TOKEN_KEY, accessToken);
    setToken(accessToken);
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
  };

  if (!token) {
    return (
      <AuthPage
        onLogin={handleLogin}
        invitationId={isValidInvitationId ? invitationId : null}
      />
    );
  }

  return (
    <DashboardPage
      token={token}
      onLogout={handleLogout}
      onUnauthorized={handleLogout}
      highlightedInvitationId={isValidInvitationId ? invitationId : null}
    />
  );
}
