import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "../services/cognito";

type CognitoAttr = { Name?: string; Value?: string };

const projects = new Hono();

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

  const existing = await db.query(
    "SELECT id FROM users WHERE cognito_sub = $1",
    [sub],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    return existing.rows[0].id as number;
  }

  const inserted = await db.query(
    `INSERT INTO users (cognito_sub, role)
     VALUES ($1, 'user')
     ON CONFLICT (cognito_sub) DO NOTHING
     RETURNING id`,
    [sub],
  );
  if (inserted.rowCount && inserted.rowCount > 0) {
    return inserted.rows[0].id as number;
  }

  const fallback = await db.query(
    "SELECT id FROM users WHERE cognito_sub = $1",
    [sub],
  );
  if (!fallback.rowCount) throw new Error("User not found in database");
  return fallback.rows[0].id as number;
}

async function requireCurrentUserId(c: any) {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return { error: c.json({ error: "Missing Bearer token" }, 401), userId: null };
  }

  try {
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

// GET /projects/:projectId
projects.get("/:projectId", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("projectId"));
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

// PATCH /projects/:projectId
projects.patch("/:projectId", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("projectId"));
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

// DELETE /projects/:projectId
projects.delete("/:projectId", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const projectId = Number(c.req.param("projectId"));
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
