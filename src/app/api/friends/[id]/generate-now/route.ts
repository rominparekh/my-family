import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { contentDrafts, draftMessages, specialDays } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { getOwnedFriend } from "@/lib/friends";
import { nextOccurrence } from "@/lib/timezone";
import { generateForDraft } from "@/lib/ai/generate";

export const maxDuration = 60;

/**
 * TEST helper: synchronously generate a wish for this friend's nearest special
 * day and put it into `pending_approval`, so it shows up in the Approvals inbox
 * for review — without waiting on the cron + Inngest workflow. Useful before the
 * full orchestration/WhatsApp path is live.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);

    const days = await db.query.specialDays.findMany({
      where: eq(specialDays.friendId, friend.id),
    });
    if (days.length === 0) {
      return fail("Add a special day for this friend first, then generate.", 400);
    }

    // Pick the nearest upcoming occasion.
    const nearest = days
      .map((d) => ({ day: d, occ: nextOccurrence(d.month, d.day, friend.timezone) }))
      .sort((a, b) => a.occ.daysUntil - b.occ.daysUntil)[0];

    // Idempotent create for this occasion, then load it.
    await db
      .insert(contentDrafts)
      .values({
        ownerUserId: user.id,
        friendId: friend.id,
        specialDayId: nearest.day.id,
        occasionDate: nearest.occ.occasionDate,
        kind: friend.preferredContentKind,
        status: "draft",
        scheduledFor: nearest.occ.deliveryAt,
        claimedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [contentDrafts.specialDayId, contentDrafts.occasionDate],
      });

    const draft = await db.query.contentDrafts.findFirst({
      where: and(
        eq(contentDrafts.specialDayId, nearest.day.id),
        eq(contentDrafts.occasionDate, nearest.occ.occasionDate)
      ),
    });
    if (!draft) return fail("Could not create draft", 500);

    // Generate synchronously and persist as pending_approval.
    const content = await generateForDraft(draft.id);
    await db
      .update(contentDrafts)
      .set({
        textBody: content.textBody,
        mediaUrls: content.mediaUrls,
        generationPrompt: content.prompt,
        status: "pending_approval",
        updatedAt: new Date(),
      })
      .where(eq(contentDrafts.id, draft.id));
    await db.insert(draftMessages).values({
      draftId: draft.id,
      role: "assistant",
      channel: "web",
      body: content.textBody,
    });

    return ok({ draftId: draft.id, textBody: content.textBody, kind: draft.kind });
  });
}
