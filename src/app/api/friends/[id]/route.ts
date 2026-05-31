import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { friends } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { normalizeToE164, hashPhone } from "@/lib/phone";
import { updateFriendInput } from "@/lib/validation";
import { findLinkableUser, getOwnedFriend } from "@/lib/friends";

type Params = { params: Promise<{ id: string }> };

// GET /api/friends/:id — full friend detail.
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await db.query.friends.findFirst({
      where: and(eq(friends.id, id), eq(friends.ownerUserId, user.id)),
      with: { relationships: true, specialDays: true, photos: true },
    });
    if (!friend) return fail("Friend not found", 404);
    return ok(friend);
  });
}

// PATCH /api/friends/:id
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getOwnedFriend(id, user.id);
    if (!existing) return fail("Friend not found", 404);

    const input = updateFriendInput.parse(await req.json());
    const updates: Partial<typeof friends.$inferInsert> = { updatedAt: new Date() };

    if (input.name !== undefined) updates.name = input.name;
    if (input.timezone !== undefined) updates.timezone = input.timezone;
    if (input.notes !== undefined) updates.notes = input.notes;

    if (input.phone !== undefined) {
      if (input.phone === null || input.phone === "") {
        updates.phoneE164 = null;
        updates.phoneHash = null;
        updates.linkedUserId = null;
      } else {
        const e164 = normalizeToE164(input.phone);
        if (!e164) return fail("Phone must include a country code");
        updates.phoneE164 = e164;
        updates.phoneHash = hashPhone(e164);
        const linkable = await findLinkableUser(e164, user.id);
        updates.linkedUserId = linkable?.id ?? null;
      }
    }

    const [updated] = await db
      .update(friends)
      .set(updates)
      .where(eq(friends.id, id))
      .returning();
    return ok(updated);
  });
}

// DELETE /api/friends/:id
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const existing = await getOwnedFriend(id, user.id);
    if (!existing) return fail("Friend not found", 404);
    await db.delete(friends).where(eq(friends.id, id));
    return ok({ deleted: true });
  });
}
