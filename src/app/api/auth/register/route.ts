import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { registerInput } from "@/lib/validation";
import { normalizeToE164, hashPhone } from "@/lib/phone";
import { establishConnections } from "@/lib/friends";

// POST /api/auth/register — create an account with email + password.
export async function POST(req: Request) {
  return handle(async () => {
    const { email, password, displayName, phone, timezone } = registerInput.parse(
      await req.json()
    );

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length) {
      return fail("An account with that email already exists.", 409);
    }

    let phoneE164: string | null = null;
    let phoneHash: string | null = null;
    if (phone) {
      phoneE164 = normalizeToE164(phone);
      if (!phoneE164) return fail("Phone must include a country code, e.g. +14155550123");
      phoneHash = hashPhone(phoneE164);
      const clash = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneE164, phoneE164))
        .limit(1);
      if (clash[0]) return fail("That phone number is already in use.", 409);
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    const tz = timezone ?? "UTC";
    await db.insert(users).values({
      id: userId,
      email,
      passwordHash,
      displayName: displayName ?? null,
      phoneE164,
      phoneHash,
      timezone: tz,
    });

    // If they signed up with a phone, link anyone who already added them and
    // create reciprocal pending connections.
    if (phoneHash) {
      await establishConnections({ id: userId, phoneHash, timezone: tz });
    }

    await createSession({ userId, email });
    return ok({ userId }, { status: 201 });
  });
}
