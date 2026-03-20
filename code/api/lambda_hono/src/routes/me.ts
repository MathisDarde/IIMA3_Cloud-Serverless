import { Hono } from "hono";
import { getCurrentUser, updateCurrentUserAttributes } from "../services/cognito";
import { db } from "../db";

const me = new Hono();

function getAccessTokenFromHeader(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim();
}

function pickAttribute(attrs: { Name?: string; Value?: string }[] | undefined, name: string) {
  return attrs?.find((a) => a.Name === name)?.Value ?? null;
}

me.get("/", async (c) => {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) return c.json({ error: "Missing Bearer token" }, 401);

  try {
    const cognitoUser = await getCurrentUser(accessToken);
    const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
    const email = pickAttribute(cognitoUser.UserAttributes, "email");
    const firstName = pickAttribute(cognitoUser.UserAttributes, "given_name");
    const lastName = pickAttribute(cognitoUser.UserAttributes, "family_name");

    if (!sub) return c.json({ error: "Invalid user profile" }, 400);

    let dbProfile: any = null;
    try {
      const dbUser = await db.query(
        "SELECT id, role, created_at FROM users WHERE cognito_sub = $1",
        [sub],
      );
      dbProfile = dbUser.rows[0] ?? null;
    } catch {
      dbProfile = null;
    }

    return c.json({
      profile: {
        id: dbProfile?.id ?? null,
        sub,
        email,
        first_name: firstName,
        last_name: lastName,
        role: dbProfile?.role ?? "user",
        created_at: dbProfile?.created_at ?? null,
      },
    });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

me.patch("/", async (c) => {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) return c.json({ error: "Missing Bearer token" }, 401);

  const { first_name, last_name } = await c.req.json();
  if (first_name == null && last_name == null) return c.json({ error: "Nothing to update" }, 400);

  try {
    const cognitoUser = await getCurrentUser(accessToken);
    const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
    if (!sub) return c.json({ error: "Invalid user profile" }, 400);

    const attributesToUpdate: Record<string, string> = {};
    if (first_name != null) attributesToUpdate.given_name = String(first_name);
    if (last_name != null) attributesToUpdate.family_name = String(last_name);

    await updateCurrentUserAttributes(accessToken, attributesToUpdate);

    return c.json({
      profile: {
        sub,
        email: pickAttribute(cognitoUser.UserAttributes, "email"),
        first_name: first_name ?? pickAttribute(cognitoUser.UserAttributes, "given_name"),
        last_name: last_name ?? pickAttribute(cognitoUser.UserAttributes, "family_name"),
      },
    });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

export default me;
