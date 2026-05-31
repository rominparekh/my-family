import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { invites } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { getOwnedFriend } from "@/lib/friends";
import { sendText } from "@/lib/whatsapp/client";
import { log } from "@/lib/log";

const INVITE_TTL_DAYS = 30;

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// POST /api/friends/:id/invite — invite an unregistered friend to join.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await params;
    const friend = await getOwnedFriend(id, user.id);
    if (!friend) return fail("Friend not found", 404);
    if (!friend.phoneE164 || !friend.phoneHash) {
      return fail("Add a phone number for this friend before inviting them.");
    }
    if (friend.linkedUserId) {
      return fail("This friend is already on the platform.", 409);
    }

    // Reuse an existing pending invite for the same person if present.
    const existing = await db.query.invites.findFirst({
      where: and(
        eq(invites.friendId, friend.id),
        eq(invites.status, "pending")
      ),
    });

    const token = existing?.token ?? randomBytes(16).toString("hex");
    const link = `${appUrl()}/invite/${token}`;
    const inviterName = user.displayName ?? "A friend";
    const message = `${inviterName} invited you to Parekh Family 🎉 — a private space to celebrate the people you love. Join: ${link}`;

    let waMessageId: string | null = null;
    try {
      // NOTE: business-initiated WhatsApp messages outside the 24h window require
      // an approved template. For production invites, send via an approved
      // marketing/utility template (or SMS via Twilio). sendText works in dev and
      // within an open session window.
      waMessageId = await sendText(friend.phoneE164, message);
    } catch (err) {
      log.error("invite.send_failed", { err: String(err) });
      return fail("Could not send the invite right now. Please try again.", 502);
    }

    if (existing) {
      await db
        .update(invites)
        .set({ sentAt: new Date(), waMessageId })
        .where(eq(invites.id, existing.id));
      return ok({ invite: { ...existing, sentAt: new Date(), waMessageId }, link });
    }

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
    const [invite] = await db
      .insert(invites)
      .values({
        inviterUserId: user.id,
        friendId: friend.id,
        phoneE164: friend.phoneE164,
        phoneHash: friend.phoneHash,
        token,
        channel: "whatsapp",
        waMessageId,
        sentAt: new Date(),
        expiresAt,
      })
      .returning();

    log.info("invite.sent", { inviteId: invite.id, friendId: friend.id });
    return ok({ invite, link }, { status: 201 });
  });
}
