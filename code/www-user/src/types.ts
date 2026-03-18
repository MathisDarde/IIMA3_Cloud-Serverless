export type AuthTokens = {
  access_token: string;
  id_token: string;
  refresh_token: string;
};

export type Profile = {
  id: number | null;
  sub?: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Team = {
  id: number;
  name: string;
  created_at: string;
  created_by: number;
  role: string;
  member_count: number;
};

export type TeamMember = {
  id: number;
  cognito_sub: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string;
  joined_at: string;
};

export type Project = {
  id: number;
  team_id: number;
  name: string;
  description: string | null;
  status: "active" | "archived" | string;
  created_at: string;
  updated_at: string;
};
