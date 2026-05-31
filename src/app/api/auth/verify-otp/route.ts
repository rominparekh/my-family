import { randomUUID } from "crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db, atomic } from "@/db/client";
import { users, friends, invites } from "@/db/schema";
import { normalizeToE164, hashPhone } from "@/lib/phone";
import { verifyOtp } from "@/lib/auth/otp";
import { createSession } from "@/lib/auth/session";

const schema = z.object({
  phone: z.string().min(5),
  code: z.string().regex(/^\d{4,8}$/),
  displayName: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const { phone, code, displayName, timezone } = schema.parse(body);

    const e164 = normalizeToE164(phone);
    if (!e164) return fail("Invalid phone number");

    const result = await verifyOtp(e164, code);
    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found: "No active code — please request a new one.",
        expired: "That code expired — please request a new one.",
        too_many_attempts: "Too many attempts — request a new code.",
        mismatch: "That code is incorrect.",
      };
      return fail(messages[result.reason] ?? "Verification failed", 401);
    }

    // Upsert the user.
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.phoneE164, e164))
      .limit(1);

    let user = existing[0];
    if (!user) {
      const userId = randomUUID();
      const phoneHash = hashPhone(e164);
      // Create the user, auto-link any pre-existing friend records that point at
      // this number, and mark any pending invites accepted — atomically, so we
      // never end up half-linked on partial failure.
      await atomic([
        db.insert(users).values({
          id: userId,
          phoneE164: e164,
          phoneHash,
          displayName: displayName ?? null,
          timezone: timezone ?? "UTC",
          waVerified: true,
        }),
        db.update(friends).set({ linkedUserId: userId }).where(eq(friends.phoneHash, phoneHash)),
        db
          .update(invites)
          .set({ status: "accepted", acceptedUserId: userId, acceptedAt: new Date() })
          .where(and(eq(invites.phoneHash, phoneHash), eq(invites.status, "pending"))),
      ]);
      const inserted = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      user = inserted[0];
    } else {
      const updates: Partial<typeof users.$inferInsert> = { waVerified: true };
      if (displayName && !user.displayName) updates.displayName = displayName;
      if (timezone && user.timezone === "UTC") updates.timezone = timezone;
      await db.update(users).set(updates).where(eq(users.id, user.id));
    }

    await createSession({ userId: user.id, phoneE164: e164 });
    return ok({ userId: user.id });
  });
}
