import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { friends } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { getOwnedFriend } from "@/lib/friends";

type Params = { params: Promise<{ id: string }> };

// POST /api/friends/:id/approve — accept a pending reciprocal connection.
export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    await db
      .update(friends)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(friends.id, id));
    return ok({ status: "active" });
  });
}
