import { and, eq, lt, notInArray, isNotNull } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { db } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_GENERATION_MS = 60 * 60 * 1000; // claimed but never generated > 1h
const PAST_DELIVERY_GRACE_MS = 6 * 60 * 60 * 1000; // delivery window missed by > 6h

/**
 * Self-healing sweep (run a few times a day). Catches drafts that fell through
 * the workflow because a run crashed or a deploy interrupted a long wait:
 *
 *  - Stuck in `draft` (claimed but never generated): release the claim and
 *    re-emit the occasion so a healthy worker picks it up.
 *  - Past its delivery time and still not `sent`: mark `failed` and emit an
 *    error log so it surfaces in monitoring rather than failing silently.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return fail("Unauthorized", 401);
  }

  const now = Date.now();
  let requeued = 0;
  let failed = 0;

  // 1. Claimed-but-never-generated drafts → release and re-emit.
  const stuckGeneration = await db
    .select()
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.status, "draft"),
        isNotNull(contentDrafts.claimedAt),
        lt(contentDrafts.claimedAt, new Date(now - STALE_GENERATION_MS))
      )
    );

  for (const d of stuckGeneration) {
    await db
      .update(contentDrafts)
      .set({ claimedAt: null })
      .where(eq(contentDrafts.id, d.id));
    await inngest.send({
      name: "occasion/upcoming",
      id: `reconcile:${d.specialDayId}:${d.occasionDate}:${now}`,
      data: {
        specialDayId: d.specialDayId,
        occasionDate: d.occasionDate,
        ownerUserId: d.ownerUserId,
        friendId: d.friendId,
        scheduledFor: (d.scheduledFor ?? new Date()).toISOString(),
        kind: d.kind,
      },
    });
    requeued++;
    log.warn("reconcile.requeued", { draftId: d.id });
  }

  // 2. Past delivery and not sent → mark failed + alert.
  const pastDue = await db
    .select()
    .from(contentDrafts)
    .where(
      and(
        notInArray(contentDrafts.status, ["sent", "failed"]),
        isNotNull(contentDrafts.scheduledFor),
        lt(contentDrafts.scheduledFor, new Date(now - PAST_DELIVERY_GRACE_MS))
      )
    );

  for (const d of pastDue) {
    await db
      .update(contentDrafts)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(contentDrafts.id, d.id));
    failed++;
    log.error("reconcile.past_due_failed", {
      draftId: d.id,
      friendId: d.friendId,
      occasionDate: d.occasionDate,
      prevStatus: d.status,
    });
  }

  log.info("cron.reconcile", { requeued, failed });
  return ok({ requeued, failed });
}
