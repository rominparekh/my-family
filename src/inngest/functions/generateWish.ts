import { and, eq, isNull } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { contentDrafts, draftMessages } from "@/db/schema";
import { generateForDraft } from "@/lib/ai/generate";
import { log } from "@/lib/log";

/**
 * Advance generation (generation-only role). For one upcoming occasion:
 *   create the draft idempotently → atomically claim it → generate the wish →
 *   leave it `pending_approval` for the owner to review and send (via the
 *   in-app wa.me "Send via WhatsApp" button). The daily cron's reminder push
 *   nudges the owner on the day.
 *
 * No WhatsApp approval request, no wait-for-reply, no scheduled auto-delivery —
 * delivery is the owner's one-tap action under the current model. Inngest is
 * used purely for durable, retryable, fanned-out generation ahead of time.
 */
export const generateWish = inngest.createFunction(
  {
    id: "generate-wish",
    // Inngest free plan caps function concurrency at 5.
    concurrency: { limit: 5 },
    // Collapse duplicate cron emits for the same occasion.
    idempotency: "event.data.specialDayId + '-' + event.data.occasionDate",
  },
  { event: "occasion/upcoming" },
  async ({ event, step }) => {
    const { specialDayId, occasionDate, ownerUserId, friendId, scheduledFor, kind } =
      event.data;

    // 1. Create the draft idempotently and atomically claim it (only one run
    //    proceeds even if the occasion is emitted multiple times).
    const claim = await step.run("ensure-and-claim", async () => {
      await db
        .insert(contentDrafts)
        .values({
          ownerUserId,
          friendId,
          specialDayId,
          occasionDate,
          kind,
          status: "draft",
          scheduledFor: new Date(scheduledFor),
        })
        .onConflictDoNothing({
          target: [contentDrafts.specialDayId, contentDrafts.occasionDate],
        });

      const [draft] = await db
        .select({ id: contentDrafts.id })
        .from(contentDrafts)
        .where(
          and(
            eq(contentDrafts.specialDayId, specialDayId),
            eq(contentDrafts.occasionDate, occasionDate)
          )
        )
        .limit(1);

      const won = await db
        .update(contentDrafts)
        .set({ claimedAt: new Date() })
        .where(and(eq(contentDrafts.id, draft.id), isNull(contentDrafts.claimedAt)))
        .returning({ id: contentDrafts.id });

      return { draftId: draft.id, claimed: won.length > 0 };
    });

    if (!claim.claimed) {
      return { draftId: claim.draftId, skipped: "already-claimed" };
    }
    const draftId = claim.draftId;

    // 2. Generate the wish and leave it ready for review.
    await step.run("generate", async () => {
      const content = await generateForDraft(draftId);
      await db
        .update(contentDrafts)
        .set({
          textBody: content.textBody,
          mediaUrls: content.mediaUrls,
          generationPrompt: content.prompt,
          status: "pending_approval",
          updatedAt: new Date(),
        })
        .where(eq(contentDrafts.id, draftId));
      await db.insert(draftMessages).values({
        draftId,
        role: "assistant",
        channel: "web",
        body: content.textBody,
      });
      log.info("inngest.generated", { draftId });
    });

    return { draftId, status: "pending_approval" };
  }
);
