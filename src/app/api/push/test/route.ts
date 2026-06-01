import { ok, fail, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/current-user";
import { pushToUser, pushEnabled } from "@/lib/push";

// POST /api/push/test — send a test notification to the current user's devices.
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    if (!pushEnabled()) return fail("Push is not configured (missing VAPID keys).", 503);
    const sent = await pushToUser(user.id, {
      title: "🎉 Parekh Family",
      body: "Notifications are working! We'll remind you when a wish is ready to send.",
      url: "/dashboard",
      tag: "test",
    });
    if (sent === 0) {
      return fail("No active subscriptions — enable notifications first.", 400);
    }
    return ok({ sent });
  });
}
