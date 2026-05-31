import { and, eq, isNull } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { contentDrafts, draftMessages, friends, users, notifications } from "@/db/schema";
import { generateForDraft } from "@/lib/ai/generate";
import { sendApprovalRequest, sendText, sendImage, sendVideo } from "@/lib/whatsapp/client";
import { prettyDate } from "@/lib/timezone";
import { MAX_REVISION_ROUNDS, CONTENT_LIMITS } from "@/lib/constants";
import { log } from "@/lib/log";

/**
 * The heart of the platform. For one upcoming occasion:
 *   create+claim draft → generate → request approval → wait for reply →
 *   regenerate on feedback (bounded) → schedule → deliver on the day (friend's tz).
 *
 * Reliability properties:
 *  - The draft is created AND claimed here (not in the cron), via an atomic
 *    compare-and-swap on `claimedAt`. Only the run that wins the claim proceeds;
 *    duplicate emits from the hourly cron exit cleanly. No orphaned drafts.
 *  - Each WhatsApp send is its own `step.run`, so Inngest's at-least-once retries
 *    of *later* steps never re-send an earlier message. Delivery also re-checks
 *    `status` so a fully-sent draft is never re-sent.
 */
export const generateAndApprove = inngest.createFunction(
  {
    id: "generate-and-approve",
    concurrency: { limit: 20 },
    // Belt-and-suspenders against duplicate cron emits; the claim is the real guard.
    idempotency: "event.data.specialDayId + '-' + event.data.occasionDate",
  },
  { event: "occasion/upcoming" },
  async ({ event, step }) => {
    const { specialDayId, occasionDate, ownerUserId, friendId, scheduledFor, kind } =
      event.data;

    // 1. Create the draft idempotently and atomically claim it.
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

      // Compare-and-swap: only one run flips claimedAt from NULL.
      const won = await db
        .update(contentDrafts)
        .set({ claimedAt: new Date() })
        .where(and(eq(contentDrafts.id, draft.id), isNull(contentDrafts.claimedAt)))
        .returning({ id: contentDrafts.id });

      return { draftId: draft.id, claimed: won.length > 0 };
    });

    const logger = log.child({ draftId: claim.draftId, fn: "generate-and-approve" });

    if (!claim.claimed) {
      logger.info("skip.already-claimed");
      return { draftId: claim.draftId, skipped: "already-claimed" };
    }
    const draftId = claim.draftId;

    // 2. Generate the first draft and persist it.
    await step.run("generate-initial", async () => {
      const content = await generateForDraft(draftId);
      await persistContent(draftId, content, 0);
      logger.info("generated", { revision: 0 });
    });

    // 3. Ask the owner to approve.
    await step.run("request-approval", () => requestApproval(draftId));

    // 4. Approval loop with bounded regenerations.
    let approved = false;
    for (let round = 0; round < MAX_REVISION_ROUNDS && !approved; round++) {
      const draft = await step.run(`load-draft-${round}`, () => loadDraft(draftId));

      const reply = await step.waitForEvent(`await-reply-${round}`, {
        event: "approval/responded",
        // The triggering event doesn't carry draftId (the fn created it), so we
        // match the incoming reply against this run's known draftId.
        if: `async.data.draftId == "${draftId}"`,
        timeout: draft.scheduledFor ?? "3d",
      });

      if (!reply) {
        logger.info("approval.timeout", { round });
        break; // proceed with latest draft
      }
      if (reply.data.decision === "approved") {
        approved = true;
        break;
      }

      await step.run(`regenerate-${round}`, async () => {
        const content = await generateForDraft(draftId, reply.data.feedback);
        await persistContent(draftId, content, round + 1);
        logger.info("regenerated", { revision: round + 1 });
      });
      await step.run(`re-request-approval-${round}`, () => requestApproval(draftId));
    }

    // 5. Mark approved/scheduled and clear the user's active-approval pointer.
    const scheduledAt = await step.run("mark-approved", async () => {
      const [d] = await db
        .update(contentDrafts)
        .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
        .where(eq(contentDrafts.id, draftId))
        .returning();
      await db
        .update(users)
        .set({ activeApprovalDraftId: null })
        .where(eq(users.activeApprovalDraftId, draftId));
      return (d.scheduledFor ?? new Date()).toISOString();
    });

    // 6. Wait until the friend's local delivery time.
    await step.sleepUntil("wait-for-the-day", new Date(scheduledAt));

    // 7. Deliver — each send is its own idempotent step.
    const plan = await step.run("prepare-delivery", () => prepareDelivery(draftId));
    if (plan.alreadySent) {
      logger.info("deliver.skip-already-sent");
      return { draftId, delivered: false, reason: "already-sent" };
    }
    if (plan.recipient) {
      if (plan.kind === "video" && plan.mediaUrls[0]) {
        await step.run("send-video", () =>
          sendVideo(plan.recipient!, plan.mediaUrls[0], plan.text)
        );
      } else if (plan.mediaUrls.length > 0) {
        const urls = plan.mediaUrls.slice(0, CONTENT_LIMITS.PHOTO_MAX_COUNT);
        for (let i = 0; i < urls.length; i++) {
          await step.run(`send-media-${i}`, () =>
            sendImage(plan.recipient!, urls[i], i === 0 ? plan.text : undefined)
          );
        }
      } else {
        await step.run("send-text", () => sendText(plan.recipient!, plan.text));
      }
    }
    await step.run("mark-sent", () => markSent(draftId, Boolean(plan.recipient)));
    logger.info("delivered", { recipient: Boolean(plan.recipient) });

    return { draftId, delivered: true };
  }
);

// ── helpers ──

async function persistContent(
  draftId: string,
  content: { textBody: string; mediaUrls: string[]; prompt: string },
  revision: number
) {
  await db
    .update(contentDrafts)
    .set({
      textBody: content.textBody,
      mediaUrls: content.mediaUrls,
      generationPrompt: content.prompt,
      revision,
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
}

async function loadDraft(draftId: string) {
  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, draftId),
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);
  return draft;
}

async function requestApproval(draftId: string) {
  const draft = await loadDraft(draftId);
  const owner = await db.query.users.findFirst({ where: eq(users.id, draft.ownerUserId) });
  const friend = await db.query.friends.findFirst({ where: eq(friends.id, draft.friendId) });
  if (!owner || !friend) throw new Error("Owner/friend missing for approval");

  const when = prettyDate(draft.occasionDate, friend.timezone);
  const preview =
    `🎉 A wish for ${friend.name} (${when}):\n\n"${draft.textBody ?? ""}"\n\n` +
    `Reply 👍 to approve, or tell me what to change.`;

  let waMessageId: string | null = null;
  if (owner.phoneE164) {
    waMessageId = await sendApprovalRequest(owner.phoneE164, draftId, preview);
  }

  await db.insert(notifications).values({
    userId: owner.id,
    draftId,
    channel: "whatsapp",
    type: "approval_request",
    waMessageId,
    status: waMessageId ? "sent" : "skipped",
  });

  // Point this user's free-text replies at this draft (see webhook routing).
  await db
    .update(users)
    .set({ activeApprovalDraftId: draftId })
    .where(eq(users.id, owner.id));

  await db.insert(draftMessages).values({
    draftId,
    role: "system",
    channel: "web",
    body: `Approval requested for ${friend.name}'s ${when} wish.`,
  });
}

interface DeliveryPlan {
  recipient: string | null;
  text: string;
  mediaUrls: string[];
  kind: string;
  alreadySent: boolean;
}

async function prepareDelivery(draftId: string): Promise<DeliveryPlan> {
  const draft = await loadDraft(draftId);
  if (draft.status === "sent") {
    return { recipient: null, text: "", mediaUrls: [], kind: draft.kind, alreadySent: true };
  }
  const friend = await db.query.friends.findFirst({ where: eq(friends.id, draft.friendId) });
  const owner = await db.query.users.findFirst({ where: eq(users.id, draft.ownerUserId) });
  if (!friend) throw new Error("Friend missing for delivery");

  return {
    // Prefer the friend's number; otherwise the owner can forward it.
    recipient: friend.phoneE164 ?? owner?.phoneE164 ?? null,
    text: draft.textBody ?? "",
    mediaUrls: draft.mediaUrls ?? [],
    kind: draft.kind,
    alreadySent: false,
  };
}

async function markSent(draftId: string, hadRecipient: boolean) {
  const draft = await loadDraft(draftId);
  await db
    .update(contentDrafts)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(contentDrafts.id, draftId));
  await db.insert(notifications).values({
    userId: draft.ownerUserId,
    draftId,
    channel: "whatsapp",
    type: "delivered",
    status: hadRecipient ? "sent" : "skipped",
  });
}
