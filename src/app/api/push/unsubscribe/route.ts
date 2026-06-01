import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ok, handle } from "@/lib/api";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";

const schema = z.object({ endpoint: z.string().url() });

// POST /api/push/unsubscribe — remove a subscription for the current user.
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const { endpoint } = schema.parse(await req.json());
    await db
      .delete(pushSubscriptions)
      .where(
        and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id))
      );
    return ok({ unsubscribed: true });
  });
}
