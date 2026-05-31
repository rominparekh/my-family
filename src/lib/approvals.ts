import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { contentDrafts, draftMessages } from "@/db/schema";
import { inngest } from "@/inngest/client";

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
        inArray(contentDrafts.status, ["pending_approval", "changes_requested"])
      )
    )
    .orderBy(desc(contentDrafts.updatedAt))
    .limit(1);
  return rows[0] ?? null;
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

  await db.insert(draftMessages).values({
    draftId,
    role: "user",
    channel,
    body: decision === "approved" ? "👍 Approved" : feedback ?? "Requested changes",
  });

  await db
    .update(contentDrafts)
    .set({
      status: decision === "approved" ? "approved" : "changes_requested",
      updatedAt: new Date(),
    })
    .where(eq(contentDrafts.id, draftId));

  await inngest.send({
    name: "approval/responded",
    data: { draftId, decision, feedback, channel },
  });
}
