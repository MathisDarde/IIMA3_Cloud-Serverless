import type { AuthTokens, Profile, AdminStats, AdminUser } from "../types";

const BASE = import.meta.env.VITE_BASE_API_URL || "/api";

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
        login: (body: { email: string; password: string }) =>
            request<AuthTokens>("/auth/login", {
                method: "POST",
                body: JSON.stringify(body),
            }),

        getProfile: (token: string) =>
            request<{ profile: Profile }>("/auth/profile", {}, token),
    },

    admin: {
        getStats: (token: string) =>
            request<{ stats: AdminStats }>("/admin/stats", {}, token),

        getUsers: (token: string) =>
            request<{ users: AdminUser[] }>("/admin/users", {}, token),
    },
};
