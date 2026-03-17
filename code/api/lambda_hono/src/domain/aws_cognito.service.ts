import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  ListUsersCommand,
  AdminUpdateUserAttributesCommand,
  AttributeType,
} from '@aws-sdk/client-cognito-identity-provider'

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-west-3' })
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!

export async function getUserBySub(sub: string) {
  const result = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `sub = "${sub}"`,
      Limit: 1,
    })
  )
  return result.Users?.[0] ?? null
}

export async function getUserByEmail(email: string) {
  const result = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`,
      Limit: 1,
    })
  )
  return result.Users?.[0] ?? null
}

export async function updateUserBySub(sub: string, attributes: Record<string, string>) {
  const user = await getUserBySub(sub)
  if (!user?.Username) throw new Error(`User not found for sub: ${sub}`)

  const userAttributes: AttributeType[] = Object.entries(attributes).map(([Name, Value]) => ({
    Name,
    Value,
  }))

  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: user.Username,
      UserAttributes: userAttributes,
    })
  )
}
