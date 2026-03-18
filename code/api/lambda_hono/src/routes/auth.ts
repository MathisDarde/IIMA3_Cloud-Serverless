import { Hono } from "hono";
import {
  confirmEmail,
  getUserByEmail,
  getCurrentUser,
  login,
  register,
  resendConfirmationCode,
  updateCurrentUserAttributes,
} from "../services/cognito";
import { db } from "../db";

const auth = new Hono();

function getAccessTokenFromHeader(authorizationHeader: string | undefined) {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return authorizationHeader.slice("Bearer ".length).trim();
}

function pickAttribute(
  attributes: { Name?: string; Value?: string }[] | undefined,
  name: string,
) {
  return attributes?.find((attr) => attr.Name === name)?.Value ?? null;
}

function isDbConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("password authentication failed") ||
    message.includes("client password must be a string") ||
    message.includes("sasl")
  );
}

function getCognitoErrorMessage(error: any) {
  const detail = typeof error?.message === "string" ? error.message : "";

  switch (error?.name) {
    case "NotAuthorizedException":
      if (detail.toLowerCase().includes("secret hash")) {
        return "Cognito client secret is required. Set COGNITO_CLIENT_SECRET in backend env.";
      }
      return "Invalid email or password";
    case "UserNotFoundException":
      return "User not found";
    case "UserNotConfirmedException":
      return "User is not confirmed yet";
    case "CodeMismatchException":
      return "Invalid verification code";
    case "ExpiredCodeException":
      return "Verification code has expired";
    case "CognitoChallengeException":
      if (detail.includes("NEW_PASSWORD_REQUIRED")) {
        return "New password is required for this account before login.";
      }
      return detail;
    case "InvalidPasswordException":
      return "Password does not meet policy requirements";
    case "InvalidParameterException":
      if (detail.toLowerCase().includes("auth flow")) {
        return "Cognito app client auth flow is not enabled";
      }
      return detail || "Invalid request parameters";
    case "TooManyRequestsException":
      return "Too many attempts, try again later";
    default:
      return "Unable to complete authentication request";
  }
}

function getErrorDetails(error: any) {
  if (process.env.NODE_ENV === "production") return undefined;
  return {
    name: error?.name ?? "UnknownError",
    message: error?.message ?? "No message",
  };
}

function getCognitoErrorStatus(error: any) {
  const detail =
    typeof error?.message === "string" ? error.message.toLowerCase() : "";

  if (
    error?.name === "NotAuthorizedException" &&
    detail.includes("secret hash")
  )
    return 500;
  if (error?.name === "ResourceNotFoundException") return 500;
  if (
    error?.name === "InvalidParameterException" &&
    detail.includes("auth flow")
  )
    return 500;
  if (error?.name === "CognitoChallengeException") return 403;
  if (error?.name === "CodeMismatchException") return 400;
  if (error?.name === "ExpiredCodeException") return 400;

  if (
    error?.name === "NotAuthorizedException" ||
    error?.name === "UserNotFoundException" ||
    error?.name === "UserNotConfirmedException"
  ) {
    return 401;
  }

  return 500;
}

async function upsertUserInDbFromIdentity(params: {
  sub: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}) {
  if (!params.email) {
    return null;
  }

  const result = await db.query(
    `INSERT INTO users (cognito_sub, email, first_name, last_name, role, updated_at)
     VALUES ($1, $2, $3, $4, 'user', NOW())
     ON CONFLICT (cognito_sub)
     DO UPDATE SET
       email = EXCLUDED.email,
       first_name = COALESCE(EXCLUDED.first_name, users.first_name),
       last_name = COALESCE(EXCLUDED.last_name, users.last_name),
       updated_at = NOW()
     RETURNING id, cognito_sub, email, first_name, last_name, role, created_at, updated_at`,
    [params.sub, params.email, params.first_name, params.last_name],
  );

  return result.rows[0] ?? null;
}

auth.post("/register", async (c) => {
  const { email, password, first_name, last_name } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  try {
    const existing = await db.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return c.json({ error: "Email already used" }, 409);
    }
  } catch {
    // If DB is unavailable, rely on Cognito uniqueness for registration.
  }

  try {
    const cognitoSub = await register(email, password, {
      given_name: first_name,
      family_name: last_name,
    });

    try {
      const syncedUser = await upsertUserInDbFromIdentity({
        sub: cognitoSub,
        email,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
      });

      return c.json({ user: syncedUser }, 201);
    } catch {
      console.error("DB sync failed after register", { email });
      return c.json(
        {
          user: {
            id: null,
            cognito_sub: cognitoSub,
            email,
            first_name: first_name ?? null,
            last_name: last_name ?? null,
            role: "user",
            created_at: null,
            updated_at: null,
          },
          warning: "User created in Cognito, but database is unavailable.",
        },
        201,
      );
    }
  } catch (error: any) {
    console.error("Register failed", {
      name: error?.name,
      message: error?.message,
    });

    if (error?.name === "UsernameExistsException") {
      try {
        const cognitoUser = await getUserByEmail(email);
        const sub = pickAttribute(cognitoUser?.Attributes, "sub");
        if (sub) {
          await upsertUserInDbFromIdentity({
            sub,
            email,
            first_name: first_name ?? null,
            last_name: last_name ?? null,
          });
        }
      } catch {
        console.error("DB reconciliation failed for existing Cognito user", {
          email,
        });
        // No-op: keep 409 behavior while attempting DB reconciliation.
      }

      return c.json({ error: "Email already used" }, 409);
    }
    if (isDbConnectionError(error)) {
      return c.json(
        { error: "Database connection failed. Check DB credentials." },
        500,
      );
    }
    return c.json(
      { error: getCognitoErrorMessage(error), details: getErrorDetails(error) },
      500,
    );
  }
});

auth.post("/login", async (c) => {
  let email = "";
  let password = "";

  try {
    const body = await c.req.json();
    email = body?.email ?? "";
    password = body?.password ?? "";
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  try {
    const tokens = await login(email, password);

    if (!tokens?.AccessToken) {
      return c.json({ error: "Unable to login user" }, 401);
    }

    try {
      const cognitoUser = await getCurrentUser(tokens.AccessToken);
      const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
      const identityEmail = pickAttribute(cognitoUser.UserAttributes, "email");
      const firstName = pickAttribute(cognitoUser.UserAttributes, "given_name");
      const lastName = pickAttribute(cognitoUser.UserAttributes, "family_name");

      if (sub) {
        await upsertUserInDbFromIdentity({
          sub,
          email: identityEmail,
          first_name: firstName,
          last_name: lastName,
        });
      }
    } catch {
      console.error("DB sync failed after login", { email });
      // Login still succeeds even if DB sync is temporarily unavailable.
    }

    return c.json({
      access_token: tokens.AccessToken,
      id_token: tokens.IdToken,
      refresh_token: tokens.RefreshToken,
    });
  } catch (error: any) {
    console.error("Login failed", {
      name: error?.name,
      message: error?.message,
    });

    return c.json(
      { error: getCognitoErrorMessage(error), details: getErrorDetails(error) },
      getCognitoErrorStatus(error),
    );
  }
});

auth.post("/confirm-email", async (c) => {
  let email = "";
  let code = "";

  try {
    const body = await c.req.json();
    email = String(body?.email ?? "").trim();
    code = String(body?.code ?? "").trim();
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  if (!email || !code) {
    return c.json({ error: "Email and verification code are required" }, 400);
  }

  try {
    await confirmEmail(email, code);
    return c.json({ message: "Email confirmed" }, 200);
  } catch (error: any) {
    return c.json(
      { error: getCognitoErrorMessage(error), details: getErrorDetails(error) },
      getCognitoErrorStatus(error),
    );
  }
});

auth.post("/resend-confirmation-code", async (c) => {
  let email = "";

  try {
    const body = await c.req.json();
    email = String(body?.email ?? "").trim();
  } catch {
    return c.json({ error: "Invalid JSON payload" }, 400);
  }

  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  try {
    await resendConfirmationCode(email);
    return c.json({ message: "Confirmation code resent" }, 200);
  } catch (error: any) {
    return c.json(
      { error: getCognitoErrorMessage(error), details: getErrorDetails(error) },
      getCognitoErrorStatus(error),
    );
  }
});

auth.get("/profile", async (c) => {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return c.json({ error: "Missing Bearer token" }, 401);
  }

  try {
    const cognitoUser = await getCurrentUser(accessToken);
    const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
    const email = pickAttribute(cognitoUser.UserAttributes, "email");
    const firstName = pickAttribute(cognitoUser.UserAttributes, "given_name");
    const lastName = pickAttribute(cognitoUser.UserAttributes, "family_name");

    if (!sub) {
      return c.json({ error: "Invalid user profile" }, 400);
    }

    let dbProfile: any = null;

    try {
      const dbUser = await db.query(
        "SELECT id, role, created_at, updated_at, first_name, last_name, email FROM users WHERE cognito_sub = $1",
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
        email: dbProfile?.email ?? email,
        first_name: dbProfile?.first_name ?? firstName,
        last_name: dbProfile?.last_name ?? lastName,
        role: dbProfile?.role ?? "user",
        created_at: dbProfile?.created_at ?? null,
        updated_at: dbProfile?.updated_at ?? null,
      },
    });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

auth.patch("/profile", async (c) => {
  const accessToken = getAccessTokenFromHeader(c.req.header("Authorization"));
  if (!accessToken) {
    return c.json({ error: "Missing Bearer token" }, 401);
  }

  const { first_name, last_name } = await c.req.json();

  if (first_name == null && last_name == null) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  try {
    const cognitoUser = await getCurrentUser(accessToken);
    const sub = pickAttribute(cognitoUser.UserAttributes, "sub");
    if (!sub) {
      return c.json({ error: "Invalid user profile" }, 400);
    }

    const attributesToUpdate: Record<string, string> = {};
    if (first_name != null) attributesToUpdate.given_name = String(first_name);
    if (last_name != null) attributesToUpdate.family_name = String(last_name);

    if (Object.keys(attributesToUpdate).length > 0) {
      await updateCurrentUserAttributes(accessToken, attributesToUpdate);
    }

    let updatedProfile: any = null;

    try {
      const updated = await db.query(
        `UPDATE users
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             updated_at = NOW()
         WHERE cognito_sub = $3
         RETURNING id, cognito_sub, email, first_name, last_name, role, created_at, updated_at`,
        [first_name ?? null, last_name ?? null, sub],
      );
      updatedProfile = updated.rows[0] ?? null;
    } catch {
      updatedProfile = null;
    }

    return c.json({
      profile: updatedProfile ?? {
        id: null,
        cognito_sub: sub,
        email: pickAttribute(cognitoUser.UserAttributes, "email"),
        first_name:
          first_name ?? pickAttribute(cognitoUser.UserAttributes, "given_name"),
        last_name:
          last_name ?? pickAttribute(cognitoUser.UserAttributes, "family_name"),
        role: "user",
        created_at: null,
        updated_at: null,
      },
    });
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }
});

export default auth;
