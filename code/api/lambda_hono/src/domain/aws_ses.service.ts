import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const client = new SESClient({ region: process.env.AWS_REGION || 'eu-west-3' })
const FROM_EMAIL = process.env.SES_FROM_EMAIL!

export async function sendInvitationEmail(to: string, teamName: string, token: string) {
  const inviteUrl = `${process.env.APP_URL}/invite?token=${token}`

  await client.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: `You're invited to join ${teamName}` },
        Body: {
          Html: {
            Data: `
              <h2>You've been invited to join <strong>${teamName}</strong></h2>
              <p>Click the link below to accept the invitation:</p>
              <a href="${inviteUrl}">${inviteUrl}</a>
              <p>This link expires in 24 hours.</p>
            `,
          },
          Text: {
            Data: `You've been invited to join ${teamName}. Accept here: ${inviteUrl}`,
          },
        },
      },
    })
  )
}
