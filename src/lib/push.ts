import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { pushSubscriptions } from "@/db/schema";
import { log } from "@/lib/log";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function pushEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // deep link opened on click
  tag?: string;
}

/**
 * Send a push notification to every subscription a user has registered.
 * Returns how many were delivered. Prunes subscriptions the push service
 * reports as gone (404/410).
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) {
    log.warn("push.skip_no_vapid", { userId });
    return 0;
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription is dead — remove it.
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
          log.info("push.pruned_dead_subscription", { userId, id: s.id });
        } else {
          log.error("push.send_failed", { userId, status, err: String(err) });
        }
      }
    })
  );

  log.info("push.sent", { userId, sent, total: subs.length });
  return sent;
}
