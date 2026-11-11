import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "@/lib/email-templates";
import { publicSiteOrigin } from "@/lib/app-origin";

type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

/**
 * Email delivery via Resend.
 *
 * Requires RESEND_API_KEY and EMAIL_FROM. When they are absent (local dev),
 * nothing is sent. Password-reset links are only delivered by email and are
 * never returned in HTTP responses. Registration still returns verification
 * links outside production.
 *
 * Message bodies contain verification and reset tokens, so nothing here logs
 * the body, the link, or the recipient.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Absolute app URL for email links (verify / reset).
 * Prefer AUTH_URL when it is a public origin. Never emit localhost — those
 * links cannot be opened by other people, so fall back to the canonical
 * StudySphere origin instead.
 */
export function appUrl(path = ""): string {
  const base = publicSiteOrigin();
  const normalizedPath = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${base}${normalizedPath}`;
}

/** Resolves to false when the message could not be handed to the provider. */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[email] RESEND_API_KEY / EMAIL_FROM are not set; cannot deliver "${mail.subject}"`,
      );
    } else {
      console.info(`[email] provider not configured, skipped "${mail.subject}"`);
    }
    return false;
  }

  try {
    const payload: Record<string, unknown> = {
      from: process.env.EMAIL_FROM,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    };
    if (mail.html) payload.html = mail.html;

    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        `[email] provider rejected "${mail.subject}" with status ${response.status}`,
      );
      return false;
    }

    return true;
  } catch {
    console.error(`[email] delivery failed for "${mail.subject}"`);
    return false;
  }
}

export async function sendVerificationEmail(options: {
  to: string;
  name: string;
  verifyUrl: string;
}): Promise<boolean> {
  const template = buildVerificationEmail({
    name: options.name,
    verifyUrl: options.verifyUrl,
  });
  return sendMail({
    to: options.to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

export async function sendPasswordResetEmail(options: {
  to: string;
  resetUrl: string;
}): Promise<boolean> {
  const template = buildPasswordResetEmail({ resetUrl: options.resetUrl });
  return sendMail({
    to: options.to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
