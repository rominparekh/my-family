import { z } from "zod";
import { ok, handle } from "@/lib/api";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// POST /api/push/subscribe — register (or re-point) a browser push subscription.
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const sub = schema.parse(await req.json());
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

    await db
      .insert(pushSubscriptions)
      .values({
        userId: user.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
      });

    return ok({ subscribed: true });
  });
}
