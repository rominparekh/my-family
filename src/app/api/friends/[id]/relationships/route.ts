import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { relationships } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { relationshipInput } from "@/lib/validation";
import { getOwnedFriend } from "@/lib/friends";

type Params = { params: Promise<{ id: string }> };

// POST /api/friends/:id/relationships — set/add a relationship type.
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    const { relationType } = relationshipInput.parse(await req.json());

    // Idempotent on (friend, relationType) thanks to the unique index.
    const existing = await db.query.relationships.findFirst({
      where: and(
        eq(relationships.friendId, friend.id),
        eq(relationships.relationType, relationType)
      ),
    });
    if (existing) return ok(existing);

    const [rel] = await db
      .insert(relationships)
      .values({ ownerUserId: user.id, friendId: friend.id, relationType })
      .returning();
    return ok(rel, { status: 201 });
  });
}

// DELETE /api/friends/:id/relationships?relId=...
export async function DELETE(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    const relId = new URL(req.url).searchParams.get("relId");
    if (!relId) return fail("relId is required");

    const existing = await db.query.relationships.findFirst({
      where: eq(relationships.id, relId),
    });
    if (!existing || existing.friendId !== friend.id) {
      return fail("Relationship not found", 404);
    }
    await db.delete(relationships).where(eq(relationships.id, relId));
    return ok({ deleted: true });
  });
}
