import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser } from "../services/cognito";
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
  const firstName = pickAttribute(cognitoUser.UserAttributes, "given_name");
  const lastName = pickAttribute(cognitoUser.UserAttributes, "family_name");

  if (!sub) {
    throw new Error("Invalid Cognito user: missing sub");
  }

  if (!email) {
    throw new Error("Invalid Cognito user: missing email");
  }

  const existing = await db.query(
    "SELECT id FROM users WHERE cognito_sub = $1",
    [sub],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    const updateResult = await db.query(
      `UPDATE users
       SET email = COALESCE($1, email),
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id`,
      [email, firstName, lastName, existing.rows[0].id],
    );

    return { userId: updateResult.rows[0].id as number, email };
  }

  const inserted = await db.query(
    `INSERT INTO users (cognito_sub, email, first_name, last_name, role, updated_at)
     VALUES ($1, $2, $3, $4, 'user', NOW())
     RETURNING id`,
    [sub, email, firstName, lastName],
  );

  return { userId: inserted.rows[0].id as number, email };
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
          error:
            "Unable to use teams service. Check database connectivity/migrations.",
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

teams.get("/:id/members", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const teamId = Number(c.req.param("id"));
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

teams.post("/:id/invitations", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const teamId = Number(c.req.param("id"));
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

  const inviteeUser = await db.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
    [inviteeEmail],
  );
  const inviteeUserId = inviteeUser.rows[0]?.id ?? null;

  if (inviteeUserId) {
    const alreadyMember = await db.query(
      "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
      [teamId, inviteeUserId],
    );

    if (alreadyMember.rowCount) {
      return c.json({ error: "User is already a member of this team" }, 409);
    }
  }

  try {
    const invitation = await db.query(
      `INSERT INTO team_invitations (team_id, invited_by_user_id, invitee_email, invitee_user_id, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id, team_id, invited_by_user_id, invitee_email, invitee_user_id, status, created_at`,
      [teamId, currentUser.userId, inviteeEmail, inviteeUserId],
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

teams.get("/invitations/me", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const invitations = await db.query(
    `SELECT ti.id,
            ti.team_id,
            t.name AS team_name,
            ti.invitee_email,
            ti.status,
            ti.created_at,
            ti.responded_at,
            inviter.email AS invited_by_email,
            inviter.first_name AS invited_by_first_name,
            inviter.last_name AS invited_by_last_name
     FROM team_invitations ti
     JOIN teams t ON t.id = ti.team_id
     JOIN users inviter ON inviter.id = ti.invited_by_user_id
     WHERE LOWER(ti.invitee_email) = LOWER($1)
     ORDER BY ti.created_at DESC`,
    [currentUser.email],
  );

  return c.json({ invitations: invitations.rows });
});

teams.patch("/invitations/:invitationId/accept", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const invitationId = Number(c.req.param("invitationId"));
  if (!Number.isFinite(invitationId)) {
    return c.json({ error: "Invalid invitation id" }, 400);
  }

  const invitation = await db.query(
    `SELECT id, team_id, status, invitee_email
     FROM team_invitations
     WHERE id = $1`,
    [invitationId],
  );

  if (!invitation.rowCount) {
    return c.json({ error: "Invitation not found" }, 404);
  }

  const invite = invitation.rows[0];
  if (String(invite.status) !== "pending") {
    return c.json({ error: "Invitation is no longer pending" }, 409);
  }

  if (
    String(invite.invitee_email).toLowerCase() !==
    currentUser.email.toLowerCase()
  ) {
    return c.json({ error: "Forbidden: this invitation is not for you" }, 403);
  }

  await db.query("BEGIN");
  try {
    await db.query(
      `UPDATE team_invitations
       SET status = 'accepted',
           invitee_user_id = $1,
           responded_at = NOW()
       WHERE id = $2`,
      [currentUser.userId, invitationId],
    );

    await db.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [invite.team_id, currentUser.userId],
    );

    await db.query("COMMIT");
  } catch (acceptError) {
    await db.query("ROLLBACK");
    throw acceptError;
  }

  return c.json({ message: "Invitation accepted" });
});

teams.patch("/invitations/:invitationId/refuse", async (c) => {
  const { error, currentUser } = await requireCurrentUser(c);
  if (error || !currentUser) return error;

  const invitationId = Number(c.req.param("invitationId"));
  if (!Number.isFinite(invitationId)) {
    return c.json({ error: "Invalid invitation id" }, 400);
  }

  const updated = await db.query(
    `UPDATE team_invitations
     SET status = 'declined',
         invitee_user_id = $1,
         responded_at = NOW()
     WHERE id = $2
       AND status = 'pending'
       AND LOWER(invitee_email) = LOWER($3)
     RETURNING id`,
    [currentUser.userId, invitationId, currentUser.email],
  );

  if (!updated.rowCount) {
    return c.json({ error: "Invitation not found or not pending" }, 404);
  }

  return c.json({ message: "Invitation declined" });
});

export default teams;
