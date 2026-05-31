import { createHash } from "crypto";

/**
 * Lightweight E.164 normalization.
 *
 * We deliberately avoid a heavy phone-parsing dependency for the MVP. Rules:
 *  - strip everything except digits and a leading "+"
 *  - if it already starts with "+", trust it
 *  - "00" international prefix becomes "+"
 *  - otherwise we require the caller to pass a full international number
 *
 * Returns null if it can't produce something that looks like E.164.
 */
export function normalizeToE164(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[^\d+]/g, "");

  if (s.startsWith("00")) {
    s = "+" + s.slice(2);
  }
  if (!s.startsWith("+")) {
    // No country code — can't safely guess one.
    return null;
  }
  const digits = s.slice(1);
  if (digits.length < 8 || digits.length > 15) return null;
  return "+" + digits;
}

/** Phone number with no "+" — the format the WhatsApp Cloud API "to" field wants. */
export function toWaRecipient(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * Privacy-preserving hash for discovery matching. We salt with SESSION_SECRET
 * so the hashes aren't a plain rainbow-table-able SHA of the number.
 */
export function hashPhone(e164: string): string {
  const salt = process.env.SESSION_SECRET ?? "parekh-family-dev-salt";
  return createHash("sha256").update(`${salt}:${e164}`).digest("hex");
}
