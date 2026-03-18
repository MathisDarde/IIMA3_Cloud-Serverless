import {
  CognitoIdentityProviderClient,
  GetUserCommand,
  ListUsersCommand,
  AdminUpdateUserAttributesCommand,
  UpdateUserAttributesCommand,
  AttributeType,
  SignUpCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || "eu-west-3",
});
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

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

  const result = await client.send(
    new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID!,
      Username: email,
      Password: password,
      UserAttributes: userAttributes,
    }),
  );
  return result.UserSub!;
}

export async function login(email: string, password: string) {
  const result = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: process.env.COGNITO_CLIENT_ID!,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    }),
  );
  return result.AuthenticationResult!;
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
