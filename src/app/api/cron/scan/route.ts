import { eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { db } from "@/db/client";
import { specialDays, friends } from "@/db/schema";
import { nextOccurrence } from "@/lib/timezone";
import { inngest } from "@/inngest/client";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function leadDays(): number {
  const n = Number(process.env.APPROVAL_LEAD_DAYS ?? "3");
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * Runs hourly (vercel.json cron). Finds special days whose next occurrence is
 * within the lead window and emits one `occasion/upcoming` event per occasion.
 *
 * Crucially, the cron does NOT write the draft. It only emits an event with a
 * deterministic dedup id; the Inngest function creates and atomically claims the
 * draft. That removes the previous "insert succeeds, send fails → orphaned draft"
 * failure mode entirely — re-emitting the same event is always safe.
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
      preferredKind: friends.preferredContentKind,
    })
    .from(specialDays)
    .innerJoin(friends, eq(specialDays.friendId, friends.id));

  let scanned = 0;
  const events: {
    name: "occasion/upcoming";
    id: string;
    data: {
      specialDayId: string;
      occasionDate: string;
      ownerUserId: string;
      friendId: string;
      scheduledFor: string;
      kind: "text" | "photo" | "video";
    };
  }[] = [];

  for (const row of rows) {
    scanned++;
    const occ = nextOccurrence(row.month, row.day, row.timezone);
    if (occ.daysUntil > lead) continue;

    events.push({
      name: "occasion/upcoming",
      // Dedup id: collapses duplicate hourly emits for the same occasion at the
      // event layer. The function's claim is the ultimate guard.
      id: `occasion:${row.dayId}:${occ.occasionDate}`,
      data: {
        specialDayId: row.dayId,
        occasionDate: occ.occasionDate,
        ownerUserId: row.ownerUserId,
        friendId: row.friendId,
        scheduledFor: occ.deliveryAt.toISOString(),
        kind: row.preferredKind,
      },
    });
  }

  // Batched send (one network round-trip) instead of N awaited sends.
  if (events.length > 0) await inngest.send(events);

  log.info("cron.scan", { scanned, queued: events.length, leadDays: lead });
  return ok({ scanned, queued: events.length, leadDays: lead });
}
