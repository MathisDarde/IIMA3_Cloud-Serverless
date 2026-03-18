const BASE = import.meta.env.VITE_BASE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof payload?.error === "string" ? payload.error : "Erreur API";
    throw new ApiError(message, res.status);
  }
  return payload as T;
}

export const api = {
  auth: {
    register: (body: {
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
    }) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),

    login: (body: { email: string; password: string }) =>
      request<{ access_token: string; id_token: string; refresh_token: string }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify(body) },
      ),

    confirmEmail: (body: { email: string; code: string }) =>
      request("/auth/confirm-email", { method: "POST", body: JSON.stringify(body) }),

    resendCode: (email: string) =>
      request("/auth/resend-confirmation-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),

    getProfile: (token: string) => request<{ profile: any }>("/auth/profile", {}, token),

    updateProfile: (token: string, body: { first_name?: string; last_name?: string }) =>
      request<{ profile: any }>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify(body),
      }, token),
  },

  teams: {
    list: (token: string) =>
      request<{ teams: any[] }>("/teams", {}, token),

    create: (token: string, name: string) =>
      request<{ team: any }>("/teams", {
        method: "POST",
        body: JSON.stringify({ name }),
      }, token),

    getMembers: (token: string, teamId: number) =>
      request<{ members: any[] }>(`/teams/${teamId}/members`, {}, token),
  },

  projects: {
    list: (token: string, teamId: number) =>
      request<{ projects: any[] }>(`/projects?team_id=${teamId}`, {}, token),

    create: (token: string, body: { team_id: number; name: string; description?: string }) =>
      request<{ project: any }>("/projects", {
        method: "POST",
        body: JSON.stringify(body),
      }, token),

    get: (token: string, id: number) =>
      request<{ project: any }>(`/projects/${id}`, {}, token),

    update: (
      token: string,
      id: number,
      body: { name?: string; description?: string; status?: string },
    ) =>
      request<{ project: any }>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }, token),

    delete: (token: string, id: number) =>
      request<{ message: string }>(`/projects/${id}`, { method: "DELETE" }, token),
  },
};
