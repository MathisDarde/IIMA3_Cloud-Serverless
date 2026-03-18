import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "../services/cognito";

type CognitoAttr = { Name?: string; Value?: string };

const projects = new Hono();

let projectsSchemaReady = false;

async function ensureProjectsSchema() {
  if (projectsSchemaReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
  );

  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects(team_id)",
  );

  projectsSchemaReady = true;
}

function getAccessTokenFromHeader(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim();
}

function pickAttribute(attributes: CognitoAttr[] | undefined, name: string) {
  return attributes?.find((attr) => attr.Name === name)?.Value ?? null;
}

async function resolveCurrentUserId(accessToken: string): Promise<number> {
  const cognitoUser = await getCurrentUser(accessToken);
  const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
  if (!sub) throw new Error("Invalid Cognito user: missing sub");

  const result = await db.query("SELECT id FROM users WHERE cognito_sub = $1", [
    sub,
  ]);
  if (!result.rowCount) throw new Error("User not found in database");
  return result.rows[0].id as number;
}

async function requireCurrentUserId(c: any) {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return { error: c.json({ error: "Missing Bearer token" }, 401), userId: null };
  }

  try {
    await ensureProjectsSchema();
    const userId = await resolveCurrentUserId(accessToken);
    return { error: null, userId };
  } catch (error) {
    console.error("Unable to resolve current user for projects", error);
    return {
      error: c.json(
        {
          error: "Unable to use projects service. Check database connectivity.",
          details:
            process.env.NODE_ENV === "production"
              ? undefined
              : String((error as Error)?.message),
        },
        500,
      ),
      userId: null,
    };
  }
}

async function requireTeamMembership(
  userId: number,
  teamId: number,
): Promise<boolean> {
  const result = await db.query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// POST /projects — create a project
projects.post("/", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const { team_id, name, description } = await c.req.json();
  const teamId = Number(team_id);

  if (!Number.isFinite(teamId)) {
    return c.json({ error: "team_id is required" }, 400);
  }

  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) {
    return c.json({ error: "Project name is required" }, 400);
  }

  const isMember = await requireTeamMembership(userId, teamId);
  if (!isMember) {
    return c.json({ error: "Forbidden: you are not a member of this team" }, 403);
  }

  const result = await db.query(
    `INSERT INTO projects (team_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, team_id, name, description, status, created_at, updated_at`,
    [teamId, normalizedName, description ?? null],
  );

  return c.json({ project: result.rows[0] }, 201);
});

// GET /projects?team_id=X — list projects for a team
projects.get("/", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const teamId = Number(c.req.query("team_id"));
  if (!Number.isFinite(teamId)) {
    return c.json({ error: "team_id query param is required" }, 400);
  }

  const isMember = await requireTeamMembership(userId, teamId);
  if (!isMember) {
    return c.json({ error: "Forbidden: you are not a member of this team" }, 403);
  }

  const result = await db.query(
    `SELECT id, team_id, name, description, status, created_at, updated_at
     FROM projects
     WHERE team_id = $1
     ORDER BY created_at DESC`,
    [teamId],
  );

  return c.json({ projects: result.rows });
});

// GET /projects/:id — get a project
projects.get("/:id", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("id"));
  if (!Number.isFinite(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }

  const projectResult = await db.query(
    "SELECT id, team_id, name, description, status, created_at, updated_at FROM projects WHERE id = $1",
    [projectId],
  );

  if (!projectResult.rowCount) {
    return c.json({ error: "Project not found" }, 404);
  }

  const project = projectResult.rows[0];

  const isMember = await requireTeamMembership(userId, project.team_id);
  if (!isMember) {
    return c.json({ error: "Forbidden: you are not a member of this team" }, 403);
  }

  return c.json({ project });
});

// PATCH /projects/:id — update a project
projects.patch("/:id", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("id"));
  if (!Number.isFinite(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }

  const projectResult = await db.query(
    "SELECT id, team_id FROM projects WHERE id = $1",
    [projectId],
  );

  if (!projectResult.rowCount) {
    return c.json({ error: "Project not found" }, 404);
  }

  const project = projectResult.rows[0];

  const isMember = await requireTeamMembership(userId, project.team_id);
  if (!isMember) {
    return c.json({ error: "Forbidden: you are not a member of this team" }, 403);
  }

  const { name, description, status } = await c.req.json();

  if (name == null && description == null && status == null) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  const result = await db.query(
    `UPDATE projects
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         status = COALESCE($3, status),
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, team_id, name, description, status, created_at, updated_at`,
    [name ?? null, description ?? null, status ?? null, projectId],
  );

  return c.json({ project: result.rows[0] });
});

// DELETE /projects/:id — delete a project
projects.delete("/:id", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("id"));
  if (!Number.isFinite(projectId)) {
    return c.json({ error: "Invalid project id" }, 400);
  }

  const projectResult = await db.query(
    "SELECT id, team_id FROM projects WHERE id = $1",
    [projectId],
  );

  if (!projectResult.rowCount) {
    return c.json({ error: "Project not found" }, 404);
  }

  const project = projectResult.rows[0];

  const memberResult = await db.query(
    "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2",
    [project.team_id, userId],
  );

  if (!memberResult.rowCount) {
    return c.json({ error: "Forbidden: you are not a member of this team" }, 403);
  }

  const role = memberResult.rows[0].role;
  if (role !== "owner" && role !== "admin") {
    return c.json({ error: "Forbidden: only owners and admins can delete projects" }, 403);
  }

  await db.query("DELETE FROM projects WHERE id = $1", [projectId]);

  return c.json({ message: "Project deleted" });
});

export default projects;
