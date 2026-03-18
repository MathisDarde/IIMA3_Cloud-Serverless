let teamsSchemaReady = false;

async function ensureTeamsSchema() {
  if (teamsSchemaReady) return;

  await db.query(
    `CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  );

  await db.query(
    `CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(50) NOT NULL DEFAULT 'member',
      joined_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (team_id, user_id)
    )`,
  );

  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id)",
  );

  teamsSchemaReady = true;
}
import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "../services/cognito";

type CognitoAttr = { Name?: string; Value?: string };

const teams = new Hono();

function getAccessTokenFromHeader(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim();
}

function pickAttribute(attributes: CognitoAttr[] | undefined, name: string) {
  return attributes?.find((attr) => attr.Name === name)?.Value ?? null;
}

async function getOrCreateCurrentDbUser(accessToken: string) {
  const cognitoUser = await getCurrentUser(accessToken);
  const sub = pickAttribute(cognitoUser.UserAttributes, "sub");

  if (!sub) {
    throw new Error("Invalid Cognito user: missing sub");
  }

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
  return fallback.rows[0].id as number;
}

async function requireCurrentUserId(c: any) {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return {
      error: c.json({ error: "Missing Bearer token" }, 401),
      userId: null,
    };
  }

  try {
    await ensureTeamsSchema();
    const userId = await getOrCreateCurrentDbUser(accessToken);
    return { error: null, userId };
  } catch (error) {
    console.error("Unable to resolve current user for teams", error);
    return {
      error: c.json(
        {
          error:
            "Unable to use teams service. Check database connectivity/migrations.",
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

teams.post("/", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const { name } = await c.req.json();
  const normalizedName = String(name ?? "").trim();

  if (!normalizedName) {
    return c.json({ error: "Team name is required" }, 400);
  }

  const teamResult = await db.query(
    `INSERT INTO teams (name, created_by)
     VALUES ($1, $2)
     RETURNING id, name, created_by, created_at`,
    [normalizedName, userId],
  );

  const team = teamResult.rows[0];

  await db.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [team.id, userId],
  );

  return c.json({ team }, 201);
});

teams.get("/", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const result = await db.query(
    `SELECT t.id,
            t.name,
            t.created_at,
            t.created_by,
            tm.role,
            COUNT(all_tm.user_id)::INT AS member_count
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     LEFT JOIN team_members all_tm ON all_tm.team_id = t.id
     WHERE tm.user_id = $1
     GROUP BY t.id, t.name, t.created_at, t.created_by, tm.role
     ORDER BY t.created_at DESC`,
    [userId],
  );

  return c.json({ teams: result.rows });
});

teams.get("/:id/members", async (c) => {
  const { error, userId } = await requireCurrentUserId(c);
  if (error || !userId) return error;

  const teamId = Number(c.req.param("id"));
  if (!Number.isFinite(teamId)) {
    return c.json({ error: "Invalid team id" }, 400);
  }

  const membership = await db.query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, userId],
  );

  if (!membership.rowCount) {
    return c.json(
      { error: "Forbidden: you are not a member of this team" },
      403,
    );
  }

  const members = await db.query(
    `SELECT u.id,
            u.email,
            u.first_name,
            u.last_name,
            tm.role,
            tm.joined_at
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at ASC`,
    [teamId],
  );

  return c.json({ members: members.rows });
});

export default teams;
