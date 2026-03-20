import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sesClient = new SESClient({
  region: process.env.AWS_REGION || "eu-west-3",
});

function readTemplate(): string {
  const candidates = [
    join(__dirname, "emails", "invitation.html"),               // Lambda: dist/emails/
    join(__dirname, "..", "emails", "invitation.html"),         // Docker: src/emails/
    join(process.cwd(), "src", "emails", "invitation.html"),   // fallback
  ];
  for (const p of candidates) {
    try { return readFileSync(p, "utf-8"); } catch {}
  }
  throw new Error("Cannot find invitation.html template");
}

function buildInvitationHtml(vars: {
  TEAM_NAME: string;
  INVITER_NAME: string;
  INVITER_EMAIL: string;
  INVITEE_NAME: string;
  INVITEE_EMAIL: string;
}): string {
  let html = readTemplate();
  for (const [key, value] of Object.entries(vars)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

export async function sendTeamInvitationEmail(params: {
  toEmail: string;
  teamName: string;
  inviterName: string;
  inviterEmail: string;
  inviteeName?: string;
}) {
  const fromEmail = process.env.SES_FROM_EMAIL;
  if (!fromEmail) throw new Error("Missing SES_FROM_EMAIL environment variable");

  const html = buildInvitationHtml({
    TEAM_NAME: params.teamName,
    INVITER_NAME: params.inviterName,
    INVITER_EMAIL: params.inviterEmail,
    INVITEE_NAME: params.inviteeName || params.toEmail,
    INVITEE_EMAIL: params.toEmail,
  });

  await sesClient.send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [params.toEmail] },
      Message: {
        Subject: {
          Data: `Invitation : rejoignez l'équipe ${params.teamName}`,
          Charset: "UTF-8",
        },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: {
            Data: `${params.inviterName} vous a invité à rejoindre l'équipe ${params.teamName}.`,
            Charset: "UTF-8",
          },
        },
      },
    }),
  );
}
