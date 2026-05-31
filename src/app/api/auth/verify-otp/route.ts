import { z } from "zod";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users, friends } from "@/db/schema";
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
      const inserted = await db
        .insert(users)
        .values({
          phoneE164: e164,
          phoneHash: hashPhone(e164),
          displayName: displayName ?? null,
          timezone: timezone ?? "UTC",
          waVerified: true,
        })
        .returning();
      user = inserted[0];

      // Auto-link: any friend records others created with this number can now
      // point at the real account (enables discovery / future invites).
      await db
        .update(friends)
        .set({ linkedUserId: user.id })
        .where(eq(friends.phoneHash, user.phoneHash));
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
