import { z } from "zod";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { normalizeToE164, hashPhone } from "@/lib/phone";
import { establishConnections } from "@/lib/friends";

const schema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  discoverable: z.boolean().optional(),
  // Pass "" / null to clear the phone, or a number to set it.
  phone: z.string().trim().max(40).nullable().optional(),
});

// PATCH /api/me — update the current user's profile.
export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = schema.parse(await req.json());

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (input.displayName !== undefined) updates.displayName = input.displayName;
    if (input.timezone !== undefined) updates.timezone = input.timezone;
    if (input.discoverable !== undefined) updates.discoverable = input.discoverable;

    if (input.phone !== undefined) {
      if (!input.phone) {
        updates.phoneE164 = null;
        updates.phoneHash = null;
      } else {
        const e164 = normalizeToE164(input.phone);
        if (!e164) {
          return fail("Phone must include a country code, e.g. +14155550123");
        }
        // Enforce phone uniqueness across users (it's a unique column).
        const clash = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.phoneE164, e164))
          .limit(1);
        if (clash[0] && clash[0].id !== user.id) {
          return fail("That phone number is already in use on another account.", 409);
        }
        updates.phoneE164 = e164;
        updates.phoneHash = hashPhone(e164);
      }
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();

    // If a phone was just added, link anyone who already added this person and
    // create reciprocal pending connections.
    let reciprocals = 0;
    if (input.phone && updated.phoneHash) {
      reciprocals = await establishConnections({
        id: updated.id,
        phoneHash: updated.phoneHash,
        timezone: updated.timezone,
      });
    }

    return ok({
      displayName: updated.displayName,
      timezone: updated.timezone,
      discoverable: updated.discoverable,
      phoneE164: updated.phoneE164,
      reciprocals,
    });
  });
}
