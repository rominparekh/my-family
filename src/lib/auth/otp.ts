import { createHash, randomInt } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { otpCodes } from "@/db/schema";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateCode(): string {
  // 6-digit, zero-padded.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Create and persist a new OTP for a phone number, returning the plaintext code. */
export async function issueOtp(phoneE164: string): Promise<string> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  // Invalidate any outstanding codes for this phone.
  await db.delete(otpCodes).where(eq(otpCodes.phoneE164, phoneE164));

  await db.insert(otpCodes).values({
    phoneE164,
    codeHash: hashCode(code),
    expiresAt,
  });

  return code;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" };

/** Verify a submitted code; consumes it on success. */
export async function verifyOtp(phoneE164: string, code: string): Promise<VerifyResult> {
  const rows = await db
    .select()
    .from(otpCodes)
    .where(eq(otpCodes.phoneE164, phoneE164))
    .limit(1);

  const record = rows[0];
  if (!record || record.consumedAt) return { ok: false, reason: "not_found" };
  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (record.attempts >= MAX_ATTEMPTS)
    return { ok: false, reason: "too_many_attempts" };

  if (record.codeHash !== hashCode(code)) {
    await db
      .update(otpCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(otpCodes.id, record.id));
    return { ok: false, reason: "mismatch" };
  }

  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(eq(otpCodes.id, record.id));

  return { ok: true };
}
