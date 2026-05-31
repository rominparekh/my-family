import { and, desc, eq, inArray } from "drizzle-orm";
import { db, atomic } from "@/db/client";
import { contentDrafts, draftMessages, notifications, users } from "@/db/schema";
import { inngest } from "@/inngest/client";

const ACTIONABLE = ["pending_approval", "changes_requested"] as const;

export const APPROVE_WORDS = ["yes", "y", "ok", "okay", "approve", "approved", "👍", "👍🏻", "👍🏼", "👍🏽", "👍🏾", "👍🏿", "perfect", "great", "love it", "lgtm"];

export function looksLikeApproval(text: string): boolean {
  const t = text.trim().toLowerCase();
  return APPROVE_WORDS.includes(t) || t.startsWith("👍");
}

/** The user's most recent draft that is awaiting a response. */
export async function latestActionableDraft(ownerUserId: string) {
  const rows = await db
    .select()
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.ownerUserId, ownerUserId),
        inArray(contentDrafts.status, [...ACTIONABLE])
      )
    )
    .orderBy(desc(contentDrafts.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function actionableById(draftId: string, ownerUserId: string) {
  const d = await db.query.contentDrafts.findFirst({
    where: and(eq(contentDrafts.id, draftId), eq(contentDrafts.ownerUserId, ownerUserId)),
  });
  return d && (ACTIONABLE as readonly string[]).includes(d.status) ? d : null;
}

/**
 * Resolve which draft a WhatsApp reply refers to, most-precise first:
 *   1. If the reply quotes a message (context.id), map it to the approval
 *      notification we sent → that exact draft.
 *   2. Otherwise the user's `activeApprovalDraftId` pointer (set when we last
 *      asked them to approve).
 *   3. Last resort: their most-recently-updated actionable draft.
 * This removes the ambiguity that existed when several drafts were pending.
 */
export async function resolveDraftForReply(
  ownerUserId: string,
  quotedMessageId?: string | null
) {
  if (quotedMessageId) {
    const notif = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.waMessageId, quotedMessageId),
        eq(notifications.userId, ownerUserId)
      ),
    });
    if (notif?.draftId) {
      const d = await actionableById(notif.draftId, ownerUserId);
      if (d) return d;
    }
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, ownerUserId) });
  if (user?.activeApprovalDraftId) {
    const d = await actionableById(user.activeApprovalDraftId, ownerUserId);
    if (d) return d;
  }

  return latestActionableDraft(ownerUserId);
}

export type Decision = "approved" | "changes";

/**
 * Applies an approval decision: records the user's message, updates draft status,
 * and signals the waiting Inngest workflow. Used by both the WhatsApp webhook and
 * the in-app approval UI.
 */
export async function applyDecision(opts: {
  draftId: string;
  decision: Decision;
  feedback?: string;
  channel: "whatsapp" | "web";
}): Promise<void> {
  const { draftId, decision, feedback, channel } = opts;

  // Record the reply and move the draft's status atomically.
  await atomic([
    db.insert(draftMessages).values({
      draftId,
      role: "user",
      channel,
      body: decision === "approved" ? "👍 Approved" : feedback ?? "Requested changes",
    }),
    db
      .update(contentDrafts)
      .set({
        status: decision === "approved" ? "approved" : "changes_requested",
        updatedAt: new Date(),
      })
      .where(eq(contentDrafts.id, draftId)),
  ]);

  // Signal the workflow only after the DB commit succeeds.
  await inngest.send({
    name: "approval/responded",
    data: { draftId, decision, feedback, channel },
  });
}
