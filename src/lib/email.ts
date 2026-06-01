import { Resend } from "resend";
import { log } from "@/lib/log";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress(): string {
  return process.env.RESEND_FROM || "Parekh Family <onboarding@resend.dev>";
}

/**
 * Send a transactional email via Resend. When RESEND_API_KEY isn't set, logs the
 * email instead of sending (dev fallback) and reports `delivered: false` so
 * callers can surface the content (e.g. a reset link) directly.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ delivered: boolean }> {
  if (!process.env.RESEND_API_KEY) {
    log.warn("email.dev_fallback", { to: opts.to, subject: opts.subject, text: opts.text });
    return { delivered: false };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    return { delivered: true };
  } catch (err) {
    log.error("email.send_failed", { err: String(err) });
    return { delivered: false };
  }
}
