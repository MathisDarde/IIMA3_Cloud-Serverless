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

export type TeamInvitation = {
  id: number;
  team_id: number;
  team_name: string;
  invitee_email: string;
  status: "pending" | "accepted" | "declined" | string;
  created_at: string;
  responded_at: string | null;
  invited_by_sub: string;
  invited_by_first_name: string | null;
  invited_by_last_name: string | null;
  invited_by_email: string | null;
};

export type Asset = {
  id: number;
  task_id: number;
  filename: string;
  s3_key: string;
  size_bytes: number | null;
  content_type: string | null;
  created_at: string;
  download_url: string;
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

export type Task = {
  id: number;
  project_id: number;
  name: string;
  description: string | null;
  status: "todo" | "in_progress" | "done" | string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};