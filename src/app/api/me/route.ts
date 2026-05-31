import { z } from "zod";
import { eq } from "drizzle-orm";
import { ok, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";

const schema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  discoverable: z.boolean().optional(),
});

// PATCH /api/me — update the current user's profile.
export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = schema.parse(await req.json());
    const [updated] = await db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    return ok({
      displayName: updated.displayName,
      timezone: updated.timezone,
      discoverable: updated.discoverable,
    });
  });
}
