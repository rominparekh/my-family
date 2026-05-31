import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { specialDays } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { specialDayInput } from "@/lib/validation";
import { getOwnedFriend } from "@/lib/friends";

type Params = { params: Promise<{ id: string }> };

// POST /api/friends/:id/special-days
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    const d = specialDayInput.parse(await req.json());
    const [day] = await db
      .insert(specialDays)
      .values({
        friendId: friend.id,
        type: d.type,
        label: d.label ?? null,
        month: d.month,
        day: d.day,
        year: d.year ?? null,
        recurring: d.recurring,
      })
      .returning();
    return ok(day, { status: 201 });
  });
}

// DELETE /api/friends/:id/special-days?dayId=...
export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    const dayId = new URL(req.url).searchParams.get("dayId");
    if (!dayId) return fail("dayId is required");

    const existing = await db.query.specialDays.findFirst({
      where: eq(specialDays.id, dayId),
    });
    if (!existing || existing.friendId !== friend.id) {
      return fail("Special day not found", 404);
    }
    await db.delete(specialDays).where(eq(specialDays.id, dayId));
    return ok({ deleted: true });
  });
}
