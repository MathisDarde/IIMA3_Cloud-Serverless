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

  if (error?.name === "NotAuthorizedException" && detail.includes("secret hash")) return 500;
  if (error?.name === "ResourceNotFoundException") return 500;
  if (error?.name === "InvalidParameterException" && detail.includes("auth flow")) return 500;
  if (error?.name === "CognitoChallengeException") return 403;
  if (error?.name === "CodeMismatchException") return 400;
  if (error?.name === "ExpiredCodeException") return 400;
  if (
    error?.name === "NotAuthorizedException" ||
    error?.name === "UserNotFoundException" ||
    error?.name === "UserNotConfirmedException"
  ) return 401;

  return 500;
}

// Upsert user in DB using only cognito_sub (no profile fields stored in DB)
async function upsertUserInDb(sub: string) {
  const result = await db.query(
    `INSERT INTO users (cognito_sub, role)
     VALUES ($1, 'user')
     ON CONFLICT (cognito_sub) DO NOTHING
     RETURNING id, cognito_sub, role, created_at`,
    [sub],
  );

  if (result.rowCount && result.rowCount > 0) {
    return result.rows[0];
  }

  const existing = await db.query(
    "SELECT id, cognito_sub, role, created_at FROM users WHERE cognito_sub = $1",
    [sub],
  );
  return existing.rows[0] ?? null;
}

auth.post("/register", async (c) => {
  const { email, password, first_name, last_name } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  try {
    const cognitoSub = await register(email, password, {
      given_name: first_name,
      family_name: last_name,
    });

    try {
      await upsertUserInDb(cognitoSub);
    } catch {
      console.error("DB sync failed after register", { email });
    }

    return c.json({ message: "Registration successful. Please confirm your email." }, 201);
  } catch (error: any) {
    console.error("Register failed", { name: error?.name, message: error?.message });

    if (error?.name === "UsernameExistsException") {
      try {
        const cognitoUser = await getUserByEmail(email);
        const sub = pickAttribute(cognitoUser?.Attributes, "sub");
        if (sub) await upsertUserInDb(sub);
      } catch {
        // no-op
      }
      return c.json({ error: "Email already used" }, 409);
    }

    return c.json(
      { error: getCognitoErrorMessage(error), details: getErrorDetails(error) },
      getCognitoErrorStatus(error),
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
      if (sub) await upsertUserInDb(sub);
    } catch {
      console.error("DB sync failed after login", { email });
    }

    return c.json({
      access_token: tokens.AccessToken,
      id_token: tokens.IdToken,
      refresh_token: tokens.RefreshToken,
    });
  } catch (error: any) {
    console.error("Login failed", { name: error?.name, message: error?.message });
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

export default auth;
