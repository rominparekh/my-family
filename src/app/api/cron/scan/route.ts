import { and, eq } from "drizzle-orm";
import { ok, fail } from "@/lib/api";
import { db } from "@/db/client";
import { specialDays, friends, contentDrafts } from "@/db/schema";
import { nextOccurrence } from "@/lib/timezone";
import { inngest } from "@/inngest/client";
import { pushToUser } from "@/lib/push";
import { log } from "@/lib/log";

function occasionLabel(type: string, label: string | null): string {
  if (type === "birthday") return "birthday";
  if (type === "anniversary") return "anniversary";
  return label || "special day";
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function leadDays(): number {
  const n = Number(process.env.APPROVAL_LEAD_DAYS ?? "3");
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/**
 * Runs daily (vercel.json cron; Hobby plan allows one run/day). Finds special
 * days whose next occurrence is within the lead window and emits one
 * `occasion/upcoming` event per occasion. A daily cadence is sufficient because
 * the lead window (APPROVAL_LEAD_DAYS, default 3) gives multiple days of margin
 * to discover an occasion, and exact delivery timing is handled by the Inngest
 * function's sleepUntil — not this scan.
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
      type: specialDays.type,
      label: specialDays.label,
      month: specialDays.month,
      day: specialDays.day,
      friendId: friends.id,
      friendName: friends.name,
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

  // Occasions that are TODAY (in the friend's tz) → push a "ready to send" nudge.
  const dueToday: typeof rows = [];

  for (const row of rows) {
    scanned++;
    const occ = nextOccurrence(row.month, row.day, row.timezone);
    if (occ.daysUntil === 0) dueToday.push(row);
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

  // Send "send your wish today" push reminders. Deep-link to the prepared draft
  // if one exists, otherwise to the friend page (where they can Generate + send).
  let reminded = 0;
  for (const row of dueToday) {
    const occasionDate = nextOccurrence(row.month, row.day, row.timezone).occasionDate;
    const draft = await db.query.contentDrafts.findFirst({
      where: and(
        eq(contentDrafts.specialDayId, row.dayId),
        eq(contentDrafts.occasionDate, occasionDate)
      ),
    });
    const url = draft ? `/approvals/${draft.id}` : `/friends/${row.friendId}`;
    const occasion = occasionLabel(row.type, row.label);
    const sent = await pushToUser(row.ownerUserId, {
      title: `🎉 ${row.friendName}'s ${occasion} is today`,
      body: `Tap to send ${row.friendName} your wish.`,
      url,
      tag: `occasion:${row.dayId}:${occasionDate}`,
    });
    if (sent > 0) reminded++;
  }

  log.info("cron.scan", { scanned, queued: events.length, reminded, leadDays: lead });
  return ok({ scanned, queued: events.length, reminded, leadDays: lead });
}
