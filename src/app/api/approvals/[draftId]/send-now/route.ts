import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { contentDrafts, friends, notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { sendText, sendImage, sendVideo } from "@/lib/whatsapp/client";
import { CONTENT_LIMITS } from "@/lib/constants";

export const maxDuration = 60;

/**
 * TEST helper: deliver a draft over WhatsApp right now, bypassing the scheduled
 * Inngest delivery. Sends to the friend's number if set, otherwise to you.
 * Note: plain wish messages are session messages — they deliver only inside a
 * 24-hour window (i.e. after the recipient has messaged your business number),
 * which is how you can test sending WITHOUT the approved otp_login template.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { draftId } = await params;

    const draft = await db.query.contentDrafts.findFirst({
      where: and(eq(contentDrafts.id, draftId), eq(contentDrafts.ownerUserId, user.id)),
    });
    if (!draft) return fail("Draft not found", 404);

    const friend = await db.query.friends.findFirst({ where: eq(friends.id, draft.friendId) });
    const recipient = friend?.phoneE164 ?? user.phoneE164 ?? null;
    if (!recipient) {
      return fail(
        "No phone number to send to. Add your phone in Settings (or a phone for this friend).",
        400
      );
    }

    const text = draft.textBody ?? "";
    try {
      if (draft.kind === "video" && draft.mediaUrls[0]) {
        await sendVideo(recipient, draft.mediaUrls[0], text);
      } else if (draft.mediaUrls.length > 0) {
        const urls = draft.mediaUrls.slice(0, CONTENT_LIMITS.PHOTO_MAX_COUNT);
        for (let i = 0; i < urls.length; i++) {
          await sendImage(recipient, urls[i], i === 0 ? text : undefined);
        }
      } else {
        await sendText(recipient, text);
      }
    } catch (err) {
      return fail(`WhatsApp send failed: ${err instanceof Error ? err.message : String(err)}`, 502);
    }

    await db
      .update(contentDrafts)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
      .where(eq(contentDrafts.id, draftId));
    await db.insert(notifications).values({
      userId: user.id,
      draftId,
      channel: "whatsapp",
      type: "delivered",
      status: "sent",
    });

    return ok({ sent: true, to: recipient });
  });
}
