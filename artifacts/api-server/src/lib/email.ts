import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

/** Shown in the app and in every email. Markus, 24 Oct 2026. */
export const SUPPORT_EMAIL = "support@hypestapp.com";

/**
 * Email is OFF until both are set in Replit Secrets:
 *   EMAIL_SMTP_URL  e.g. smtps://<account>:<app password>@smtp.gmail.com:465 (Google Workspace app password)
 *   EMAIL_FROM      e.g. Hypest <support@hypestapp.com> (must be an address the account may send as)
 */
const smtpUrl = () => (process.env["EMAIL_SMTP_URL"] ?? "").trim();
const from = () => (process.env["EMAIL_FROM"] ?? "").trim();

export const emailOn = () => smtpUrl() !== "" && from() !== "";

let transport: Transporter | null = null;

/** Sends one plain-text email. Returns false (and logs, without the address) on any failure. Never throws. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!emailOn()) return false;
  try {
    transport ??= nodemailer.createTransport(smtpUrl());
    await transport.sendMail({ from: from(), to, subject, text: `${text}\n\nQuestions? ${SUPPORT_EMAIL}\n` });
    return true;
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), subject }, "email send failed");
    return false;
  }
}

/**
 * The site's own address for links in emails. Never taken from the request (a forged Host header could
 * send someone's reset link to another site): APP_BASE_URL if set, else Replit's published domain.
 */
export function siteUrl(): string | null {
  const base = (process.env["APP_BASE_URL"] ?? "").trim();
  if (base) return base.replace(/\/$/, "");
  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  return domain ? `https://${domain}` : null;
}
