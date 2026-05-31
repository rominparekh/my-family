import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invites, users } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Invite landing: validates the token and sends the invitee to sign-in with their
 * number prefilled. Acceptance itself happens automatically on sign-up (the phone
 * hash auto-links friend records and marks the invite accepted).
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await db.query.invites.findFirst({
    where: eq(invites.token, token),
  });

  // Already a member? Just send them to sign in.
  if (invite) {
    const already = await db.query.users.findFirst({
      where: and(eq(users.phoneHash, invite.phoneHash)),
    });
    const expired = invite.expiresAt && invite.expiresAt.getTime() < Date.now();
    if (!already && !expired && invite.status === "pending") {
      redirect(`/login?invited=1&phone=${encodeURIComponent(invite.phoneE164)}`);
    }
  }

  // Invalid/expired/used — still let them sign in normally.
  redirect("/login");
}
