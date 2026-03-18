import {
  AdminInitiateAuthCommand,
  AdminUpdateUserAttributesCommand,
  AttributeType,
  ConfirmSignUpCommand,
  CognitoIdentityProviderClient,
  GetUserCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  UpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createHmac } from "node:crypto";
import { requireEnv } from "../env";

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "eu-west-3",
});
const USER_POOL_ID = requireEnv("COGNITO_USER_POOL_ID");
const CLIENT_ID = requireEnv("COGNITO_CLIENT_ID");
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;

function buildSecretHash(username: string) {
  if (!CLIENT_SECRET) return undefined;
  return createHmac("sha256", CLIENT_SECRET)
    .update(`${username}${CLIENT_ID}`)
    .digest("base64");
}

function buildAuthParameters(username: string, password: string) {
  const authParameters: Record<string, string> = {
    USERNAME: username,
    PASSWORD: password,
  };

  const secretHash = buildSecretHash(username);
  if (secretHash) {
    authParameters.SECRET_HASH = secretHash;
  }

  return authParameters;
}

export async function getUserBySub(sub: string) {
  const result = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `sub = "${sub}"`,
      Limit: 1,
    }),
  );
  return result.Users?.[0] ?? null;
}

export async function getUserByEmail(email: string) {
  const result = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`,
      Limit: 1,
    }),
  );
  return result.Users?.[0] ?? null;
}

export async function register(
  email: string,
  password: string,
  attributes?: Record<string, string | undefined>,
) {
  const userAttributes: AttributeType[] = [{ Name: "email", Value: email }];

  if (attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      if (value) {
        userAttributes.push({ Name: name, Value: value });
      }
    }
  }

  const secretHash = buildSecretHash(email);

  const result = await client.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: userAttributes,
      SecretHash: secretHash,
    }),
  );
  return result.UserSub!;
}

export async function login(email: string, password: string) {
  const authParameters = buildAuthParameters(email, password);

  try {
    const result = await client.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: authParameters,
      }),
    );

    if (result.ChallengeName) {
      const challengeError = new Error(
        `Authentication challenge required: ${result.ChallengeName}`,
      );
      (challengeError as any).name = "CognitoChallengeException";
      throw challengeError;
    }

    if (!result.AuthenticationResult) {
      throw new Error("Missing authentication result from Cognito");
    }

    return result.AuthenticationResult!;
  } catch (error: any) {
    const detail =
      typeof error?.message === "string" ? error.message.toLowerCase() : "";

    // Some app clients do not allow USER_PASSWORD_AUTH.
    if (
      error?.name !== "InvalidParameterException" ||
      !detail.includes("auth flow")
    ) {
      throw error;
    }

    const adminResult = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: authParameters,
      }),
    );

    if (adminResult.ChallengeName) {
      const challengeError = new Error(
        `Authentication challenge required: ${adminResult.ChallengeName}`,
      );
      (challengeError as any).name = "CognitoChallengeException";
      throw challengeError;
    }

    if (!adminResult.AuthenticationResult) {
      throw new Error("Missing authentication result from Cognito");
    }

    return adminResult.AuthenticationResult!;
  }
}

export async function updateUserBySub(
  sub: string,
  attributes: Record<string, string>,
) {
  const user = await getUserBySub(sub);
  if (!user?.Username) throw new Error(`User not found for sub: ${sub}`);

  const userAttributes: AttributeType[] = Object.entries(attributes).map(
    ([Name, Value]) => ({
      Name,
      Value,
    }),
  );

  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: user.Username,
      UserAttributes: userAttributes,
    }),
  );
}

export async function getCurrentUser(accessToken: string) {
  return client.send(
    new GetUserCommand({
      AccessToken: accessToken,
    }),
  );
}

export async function updateCurrentUserAttributes(
  accessToken: string,
  attributes: Record<string, string>,
) {
  const userAttributes: AttributeType[] = Object.entries(attributes).map(
    ([Name, Value]) => ({
      Name,
      Value,
    }),
  );

  await client.send(
    new UpdateUserAttributesCommand({
      AccessToken: accessToken,
      UserAttributes: userAttributes,
    }),
  );
}

export async function confirmEmail(email: string, code: string) {
  const secretHash = buildSecretHash(email);

  await client.send(
    new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      SecretHash: secretHash,
    }),
  );
}

export async function resendConfirmationCode(email: string) {
  const secretHash = buildSecretHash(email);

  await client.send(
    new ResendConfirmationCodeCommand({
      ClientId: CLIENT_ID,
      Username: email,
      SecretHash: secretHash,
    }),
  );
}
