import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { db } from "@/db/client";
import { specialDays, friends, contentDrafts } from "@/db/schema";
import { nextOccurrence } from "@/lib/timezone";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function leadDays(): number {
  const n = Number(process.env.APPROVAL_LEAD_DAYS ?? "3");
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * Runs hourly (vercel.json cron). Finds special days whose next occurrence is
 * within the lead window and, for each, idempotently creates a draft and kicks
 * off the generate→approve→deliver workflow. The unique (specialDayId,
 * occasionDate) index makes re-runs safe.
 */
export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return fail("Unauthorized", 401);
  }

  const lead = leadDays();

  const rows = await db
    .select({
      dayId: specialDays.id,
      month: specialDays.month,
      day: specialDays.day,
      friendId: friends.id,
      ownerUserId: friends.ownerUserId,
      timezone: friends.timezone,
    })
    .from(specialDays)
    .innerJoin(friends, eq(specialDays.friendId, friends.id));

  let scanned = 0;
  let queued = 0;

  for (const row of rows) {
    scanned++;
    const occ = nextOccurrence(row.month, row.day, row.timezone);
    if (occ.daysUntil > lead) continue;

    // Idempotent insert: skip if a draft already exists for this occasion.
    const inserted = await db
      .insert(contentDrafts)
      .values({
        ownerUserId: row.ownerUserId,
        friendId: row.friendId,
        specialDayId: row.dayId,
        occasionDate: occ.occasionDate,
        kind: "text",
        status: "draft",
        scheduledFor: occ.deliveryAt,
      })
      .onConflictDoNothing({
        target: [contentDrafts.specialDayId, contentDrafts.occasionDate],
      })
      .returning({ id: contentDrafts.id });

    const draft = inserted[0];
    if (!draft) continue; // already existed

    await inngest.send({ name: "occasion/upcoming", data: { draftId: draft.id } });
    queued++;
  }

  return ok({ scanned, queued, leadDays: lead });
}
