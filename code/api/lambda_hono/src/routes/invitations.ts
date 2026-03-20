import { Hono } from "hono";
import { db } from "../db";
import { getCurrentUser, getUserBySub } from "../services/cognito";

type CognitoAttr = { Name?: string; Value?: string };

const invitations = new Hono();

function getAccessTokenFromHeader(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim();
}

function pickAttribute(attributes: CognitoAttr[] | undefined, name: string) {
  return attributes?.find((attr) => attr.Name === name)?.Value ?? null;
}

async function requireCurrentUser(c: any) {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return { error: c.json({ error: "Missing Bearer token" }, 401), userId: null, email: null };
  }

  try {
    const cognitoUser = await getCurrentUser(accessToken);
    const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
    const email = pickAttribute(cognitoUser.UserAttributes, "email");

    if (!sub) {
      return { error: c.json({ error: "Invalid token" }, 401), userId: null, email: null };
    }

    const existing = await db.query("SELECT id FROM users WHERE cognito_sub = $1", [sub]);
    if (!existing.rowCount) {
      return { error: c.json({ error: "User not found" }, 401), userId: null, email: null };
    }

    return { error: null, userId: existing.rows[0].id as number, email: email as string };
  } catch {
    return { error: c.json({ error: "Unauthorized" }, 401), userId: null, email: null };
  }
}

// GET /invitations — list my invitations
invitations.get("/", async (c) => {
  const { error, email } = await requireCurrentUser(c);
  if (error || !email) return error;

  const result = await db.query(
    `SELECT ti.id,
            ti.team_id,
            t.name AS team_name,
            ti.invitee_email,
            ti.status,
            ti.created_at,
            ti.responded_at,
            inviter.cognito_sub AS invited_by_sub
     FROM team_invitations ti
     JOIN teams t ON t.id = ti.team_id
     JOIN users inviter ON inviter.id = ti.invited_by_user_id
     WHERE LOWER(ti.invitee_email) = LOWER($1)
     ORDER BY ti.created_at DESC`,
    [email],
  );

  const enriched = await Promise.all(
    result.rows.map(async (inv) => {
      try {
        const cognitoUser = await getUserBySub(inv.invited_by_sub);
        const attrs = cognitoUser?.Attributes;
        const firstName = attrs?.find((a: CognitoAttr) => a.Name === "given_name")?.Value ?? null;
        const lastName = attrs?.find((a: CognitoAttr) => a.Name === "family_name")?.Value ?? null;
        const inviterEmail = attrs?.find((a: CognitoAttr) => a.Name === "email")?.Value ?? null;
        return {
          ...inv,
          invited_by_first_name: firstName,
          invited_by_last_name: lastName,
          invited_by_email: inviterEmail,
        };
      } catch {
        return { ...inv, invited_by_first_name: null, invited_by_last_name: null, invited_by_email: null };
      }
    }),
  );

  return c.json({ invitations: enriched });
});

// POST /invitations/:invitationId/accept
invitations.post("/:invitationId/accept", async (c) => {
  const { error, userId, email } = await requireCurrentUser(c);
  if (error || !userId || !email) return error;

  const invitationId = Number(c.req.param("invitationId"));
  if (!Number.isFinite(invitationId)) return c.json({ error: "Invalid invitation id" }, 400);

  const invitation = await db.query(
    "SELECT id, team_id, status, invitee_email FROM team_invitations WHERE id = $1",
    [invitationId],
  );

  if (!invitation.rowCount) return c.json({ error: "Invitation not found" }, 404);

  const invite = invitation.rows[0];
  if (String(invite.status) !== "pending") return c.json({ error: "Invitation is no longer pending" }, 409);

  if (String(invite.invitee_email).toLowerCase() !== email.toLowerCase()) {
    return c.json({ error: "Forbidden: this invitation is not for you" }, 403);
  }

  await db.query("BEGIN");
  try {
    await db.query(
      `UPDATE team_invitations
       SET status = 'accepted', invitee_user_id = $1, responded_at = NOW()
       WHERE id = $2`,
      [userId, invitationId],
    );
    await db.query(
      `INSERT INTO team_members (team_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [invite.team_id, userId],
    );
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }

  return c.json({ message: "Invitation accepted" });
});

// POST /invitations/:invitationId/reject
invitations.post("/:invitationId/reject", async (c) => {
  const { error, userId, email } = await requireCurrentUser(c);
  if (error || !userId || !email) return error;

  const invitationId = Number(c.req.param("invitationId"));
  if (!Number.isFinite(invitationId)) return c.json({ error: "Invalid invitation id" }, 400);

  const updated = await db.query(
    `UPDATE team_invitations
     SET status = 'declined', invitee_user_id = $1, responded_at = NOW()
     WHERE id = $2 AND status = 'pending' AND LOWER(invitee_email) = LOWER($3)
     RETURNING id`,
    [userId, invitationId, email],
  );

  if (!updated.rowCount) return c.json({ error: "Invitation not found or not pending" }, 404);

  return c.json({ message: "Invitation declined" });
});

export default invitations;
