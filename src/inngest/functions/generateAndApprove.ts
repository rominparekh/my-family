import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { contentDrafts, draftMessages, friends, users, notifications } from "@/db/schema";
import { generateForDraft } from "@/lib/ai/generate";
import { sendApprovalRequest, sendText, sendImage } from "@/lib/whatsapp/client";
import { prettyDate } from "@/lib/timezone";
import { MAX_REVISION_ROUNDS } from "@/lib/constants";

/**
 * The heart of the platform. For one upcoming occasion:
 *   generate → request approval → wait for the user's reply (👍 / changes) →
 *   regenerate on feedback (bounded) → schedule → deliver on the day (friend's tz).
 *
 * Durable: each `step.run` is checkpointed and retried independently, and the
 * waits survive restarts/deploys.
 */
export const generateAndApprove = inngest.createFunction(
  { id: "generate-and-approve", concurrency: { limit: 20 } },
  { event: "occasion/upcoming" },
  async ({ event, step }) => {
    const { draftId } = event.data;

    // 1. Generate the first draft and persist it.
    await step.run("generate-initial", async () => {
      const content = await generateForDraft(draftId);
      await persistContent(draftId, content, 0);
    });

    // 2. Ask the owner to approve.
    await step.run("request-approval", () => requestApproval(draftId));

    // 3. Approval loop with bounded regenerations.
    let approved = false;
    for (let round = 0; round < MAX_REVISION_ROUNDS && !approved; round++) {
      const draft = await step.run(`load-draft-${round}`, () => loadDraft(draftId));

      const reply = await step.waitForEvent(`await-reply-${round}`, {
        event: "approval/responded",
        match: "data.draftId",
        // Wait right up until delivery time; if the user never replies we
        // fall through and still deliver the latest draft (better than silence).
        timeout: draft.scheduledFor ?? "3d",
      });

      if (!reply) break; // timed out — proceed with latest draft

      if (reply.data.decision === "approved") {
        approved = true;
        break;
      }

      // decision === "changes": regenerate using the feedback, then re-ask.
      await step.run(`regenerate-${round}`, async () => {
        const content = await generateForDraft(draftId, reply.data.feedback);
        await persistContent(draftId, content, round + 1);
      });
      await step.run(`re-request-approval-${round}`, () => requestApproval(draftId));
    }

    // 4. Mark approved/scheduled.
    const scheduledFor = await step.run("mark-approved", async () => {
      const [d] = await db
        .update(contentDrafts)
        .set({
          status: "approved",
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contentDrafts.id, draftId))
        .returning();
      return d.scheduledFor ?? new Date();
    });

    // 5. Wait until the friend's local delivery time.
    await step.sleepUntil("wait-for-the-day", new Date(scheduledFor));

    // 6. Deliver.
    await step.run("deliver", () => deliver(draftId));

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

  await db.insert(draftMessages).values({
    draftId,
    role: "system",
    channel: "web",
    body: `Approval requested for ${friend.name}'s ${when} wish.`,
  });
}

async function deliver(draftId: string) {
  const draft = await loadDraft(draftId);
  const friend = await db.query.friends.findFirst({ where: eq(friends.id, draft.friendId) });
  const owner = await db.query.users.findFirst({ where: eq(users.id, draft.ownerUserId) });
  if (!friend) throw new Error("Friend missing for delivery");

  const text = draft.textBody ?? "";
  // Prefer sending to the friend if we have their number; otherwise deliver to
  // the owner so they can forward it.
  const recipient = friend.phoneE164 ?? owner?.phoneE164 ?? null;

  if (recipient) {
    if (draft.mediaUrls.length > 0) {
      await sendImage(recipient, draft.mediaUrls[0], text);
      for (const url of draft.mediaUrls.slice(1, 3)) {
        await sendImage(recipient, url);
      }
    } else {
      await sendText(recipient, text);
    }
  }

  await db
    .update(contentDrafts)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(contentDrafts.id, draftId));

  if (owner) {
    await db.insert(notifications).values({
      userId: owner.id,
      draftId,
      channel: "whatsapp",
      type: "delivered",
      status: recipient ? "sent" : "skipped",
    });
  }
}
