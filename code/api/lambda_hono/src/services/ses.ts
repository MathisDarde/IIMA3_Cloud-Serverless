import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "eu-west-3",
});

function buildInvitationHtml(
  teamName: string,
  inviterName: string,
  invitationUrl: string,
) {
  return `
    <h2>Invitation d'equipe</h2>
    <p><strong>${inviterName}</strong> vous a invite a rejoindre l'equipe <strong>${teamName}</strong>.</p>
    <p>Cliquez ici pour voir et repondre a l'invitation:</p>
    <p><a href="${invitationUrl}">${invitationUrl}</a></p>
    <p>Vous pourrez accepter ou refuser apres connexion.</p>
  `;
}

export async function sendTeamInvitationEmail(params: {
  toEmail: string;
  teamName: string;
  inviterName: string;
  invitationId: number;
}) {
  const fromEmail = process.env.SES_FROM_EMAIL;
  const appUrl = process.env.APP_URL;

  if (!fromEmail) {
    throw new Error("Missing SES_FROM_EMAIL environment variable");
  }

  if (!appUrl) {
    throw new Error("Missing APP_URL environment variable");
  }

  const invitationUrl = `${appUrl.replace(/\/$/, "")}/?invitation=${params.invitationId}`;

  await sesClient.send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [params.toEmail] },
      Message: {
        Subject: {
          Data: `Invitation: rejoignez l'equipe ${params.teamName}`,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: buildInvitationHtml(
              params.teamName,
              params.inviterName,
              invitationUrl,
            ),
            Charset: "UTF-8",
          },
          Text: {
            Data: `${params.inviterName} vous a invite a rejoindre l'equipe ${params.teamName}. Repondre a l'invitation: ${invitationUrl}`,
            Charset: "UTF-8",
          },
        },
      },
    }),
  );
}
