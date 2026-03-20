import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser, getUserBySub } from "../services/cognito";
import { sendTeamInvitationEmail } from "../services/ses";

type CognitoAttr = { Name?: string; Value?: string };

type CurrentUserContext = {
  userId: number;
  email: string;
};

const teams = new Hono();
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
    `CREATE TABLE IF NOT EXISTS team_invitations (
      id SERIAL PRIMARY KEY,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invitee_email VARCHAR(255) NOT NULL,
      invitee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      responded_at TIMESTAMP
    )`,
  );

  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id)",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_team_invitations_invitee_email ON team_invitations(LOWER(invitee_email))",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status)",
  );
  await db.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_team_invitations_pending ON team_invitations(team_id, LOWER(invitee_email)) WHERE status = 'pending'",
  );

  teamsSchemaReady = true;
}

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

async function getOrCreateCurrentDbUser(
  accessToken: string,
): Promise<CurrentUserContext> {
  const cognitoUser = await getCurrentUser(accessToken);
  const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
  const email = pickAttribute(cognitoUser.UserAttributes, "email");

  if (!sub) throw new Error("Invalid Cognito user: missing sub");
  if (!email) throw new Error("Invalid Cognito user: missing email");

  const existing = await db.query(
    "SELECT id FROM users WHERE cognito_sub = $1",
    [sub],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return { userId: existing.rows[0].id as number, email };
  }

  const inserted = await db.query(
    `INSERT INTO users (cognito_sub, role)
     VALUES ($1, 'user')
     ON CONFLICT (cognito_sub) DO NOTHING
     RETURNING id`,
    [sub],
  );

  if (inserted.rowCount && inserted.rowCount > 0) {
    return { userId: inserted.rows[0].id as number, email };
  }

  const fallback = await db.query(
    "SELECT id FROM users WHERE cognito_sub = $1",
    [sub],
  );
  return { userId: fallback.rows[0].id as number, email };
}

async function requireCurrentUser(c: any) {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return {
      error: c.json({ error: "Missing Bearer token" }, 401),
      currentUser: null,
    };
  }

  try {
    await ensureTeamsSchema();
    const currentUser = await getOrCreateCurrentDbUser(accessToken);
    return { error: null, currentUser };
  } catch (error) {
    console.error("Unable to resolve current user for teams", error);
    return {
      error: c.json(
        {
          error: "Unable to use teams service. Check database connectivity/migrations.",
          details:
            process.env.NODE_ENV === "production"
              ? undefined
              : String((error as Error)?.message),
        },
        500,
      ),
      currentUser: null,
    };
  }
}

// POST /teams
teams.post("/", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const { name } = await c.req.json();
  const normalizedName = String(name ?? "").trim();

  if (!normalizedName) {
    return c.json({ error: "Team name is required" }, 400);
  }

  const teamResult = await db.query(
    `INSERT INTO teams (name, created_by)
     VALUES ($1, $2)
     RETURNING id, name, created_by, created_at`,
    [normalizedName, currentUser.userId],
  );

  const team = teamResult.rows[0];

  await db.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [team.id, currentUser.userId],
  );

  return c.json({ team }, 201);
});

// GET /teams
teams.get("/", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

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
    [currentUser.userId],
  );

  return c.json({ teams: result.rows });
});

// GET /teams/:teamId
teams.get("/:teamId", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const teamId = Number(c.req.param("teamId"));
  if (!Number.isFinite(teamId)) return c.json({ error: "Invalid team id" }, 400);

  const membership = await db.query(
    "SELECT tm.role FROM team_members tm WHERE tm.team_id = $1 AND tm.user_id = $2",
    [teamId, currentUser.userId],
  );

  if (!membership.rowCount) {
    return c.json({ error: "Forbidden: you are not a member of this team" }, 403);
  }

  const result = await db.query(
    `SELECT t.id,
            t.name,
            t.created_at,
            t.created_by,
            $2::text AS role,
            COUNT(tm.user_id)::INT AS member_count
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id
     WHERE t.id = $1
     GROUP BY t.id, t.name, t.created_at, t.created_by`,
    [teamId, membership.rows[0].role],
  );

  if (!result.rowCount) return c.json({ error: "Team not found" }, 404);

  return c.json({ team: result.rows[0] });
});

// GET /teams/:teamId/members
teams.get("/:teamId/members", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const teamId = Number(c.req.param("teamId"));
  if (!Number.isFinite(teamId)) {
    return c.json({ error: "Invalid team id" }, 400);
  }

  const membership = await db.query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, currentUser.userId],
  );

  if (!membership.rowCount) {
    return c.json(
      { error: "Forbidden: you are not a member of this team" },
      403,
    );
  }

  const members = await db.query(
    `SELECT u.id,
            u.cognito_sub,
            tm.role,
            tm.joined_at
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at ASC`,
    [teamId],
  );

  const membersWithProfile = await Promise.all(
    members.rows.map(async (m) => {
      try {
        const cognitoUser = await getUserBySub(m.cognito_sub);
        const attrs = cognitoUser?.Attributes;
        return {
          ...m,
          email: attrs?.find((a: CognitoAttr) => a.Name === "email")?.Value ?? null,
          first_name: attrs?.find((a: CognitoAttr) => a.Name === "given_name")?.Value ?? null,
          last_name: attrs?.find((a: CognitoAttr) => a.Name === "family_name")?.Value ?? null,
        };
      } catch {
        return { ...m, email: null, first_name: null, last_name: null };
      }
    }),
  );

  return c.json({ members: membersWithProfile });
});

// POST /teams/:teamId/invitations
teams.post("/:teamId/invitations", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const teamId = Number(c.req.param("teamId"));
  if (!Number.isFinite(teamId)) {
    return c.json({ error: "Invalid team id" }, 400);
  }

  const { email } = await c.req.json();
  const inviteeEmail = String(email ?? "")
    .trim()
    .toLowerCase();

  if (!inviteeEmail) {
    return c.json({ error: "Invitee email is required" }, 400);
  }

  const membership = await db.query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, currentUser.userId],
  );

  if (!membership.rowCount) {
    return c.json({ error: "Only team members can send invitations" }, 403);
  }

  const teamExists = await db.query(
    "SELECT id, name FROM teams WHERE id = $1",
    [teamId],
  );
  if (!teamExists.rowCount) {
    return c.json({ error: "Team not found" }, 404);
  }

  const teamName = String(teamExists.rows[0].name);

  try {
    const invitation = await db.query(
      `INSERT INTO team_invitations (team_id, invited_by_user_id, invitee_email, invitee_user_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, team_id, invited_by_user_id, invitee_email, invitee_user_id, status, created_at`,
      [teamId, currentUser.userId, inviteeEmail, null],
    );

    let warning: string | undefined;
    try {
      await sendTeamInvitationEmail({
        toEmail: inviteeEmail,
        teamName,
        inviterName: currentUser.email,
        invitationId: invitation.rows[0].id,
      });
    } catch (mailError) {
      console.error("Failed to send invitation email", mailError);
      warning =
        "Invitation created, but email could not be sent. Check SES configuration.";
    }

    return c.json({ invitation: invitation.rows[0], warning }, 201);
  } catch (insertError: any) {
    if (insertError?.code === "23505") {
      return c.json(
        { error: "A pending invitation already exists for this email" },
        409,
      );
    }
    throw insertError;
  }
});

// POST /teams/:teamId/projects
teams.post("/:teamId/projects", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const teamId = Number(c.req.param("teamId"));
  if (!Number.isFinite(teamId)) return c.json({ error: "Invalid team id" }, 400);

  const isMember = await db.query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, currentUser.userId],
  );
  if (!isMember.rowCount) return c.json({ error: "Forbidden: you are not a member of this team" }, 403);

  await ensureProjectsSchema();

  const { name, description } = await c.req.json();
  const normalizedName = String(name ?? "").trim();
  if (!normalizedName) return c.json({ error: "Project name is required" }, 400);

  const result = await db.query(
    `INSERT INTO projects (team_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, team_id, name, description, status, created_at, updated_at`,
    [teamId, normalizedName, description ?? null],
  );

  return c.json({ project: result.rows[0] }, 201);
});

// GET /teams/:teamId/projects
teams.get("/:teamId/projects", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const teamId = Number(c.req.param("teamId"));
  if (!Number.isFinite(teamId)) return c.json({ error: "Invalid team id" }, 400);

  const isMember = await db.query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, currentUser.userId],
  );
  if (!isMember.rowCount) return c.json({ error: "Forbidden: you are not a member of this team" }, 403);

  await ensureProjectsSchema();

  const result = await db.query(
    `SELECT id, team_id, name, description, status, created_at, updated_at
     FROM projects
     WHERE team_id = $1
     ORDER BY created_at DESC`,
    [teamId],
  );

  return c.json({ projects: result.rows });
});

export default teams;
