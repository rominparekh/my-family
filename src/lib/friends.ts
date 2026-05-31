import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, friends } from "@/db/schema";
import { hashPhone } from "@/lib/phone";

/**
 * Discovery: given a friend's phone number, find a registered, discoverable user
 * to auto-link to. We match on the salted phone hash so we never need to compare
 * raw numbers across accounts.
 */
export async function findLinkableUser(
  e164: string | null,
  excludeUserId: string
): Promise<{ id: string; displayName: string | null } | null> {
  if (!e164) return null;
  const h = hashPhone(e164);
  const rows = await db
    .select({ id: users.id, displayName: users.displayName, discoverable: users.discoverable })
    .from(users)
    .where(eq(users.phoneHash, h))
    .limit(1);

  const match = rows[0];
  if (!match || match.id === excludeUserId || !match.discoverable) return null;
  return { id: match.id, displayName: match.displayName };
}

/** Ensure a friend belongs to the given owner; returns it or null. */
export async function getOwnedFriend(friendId: string, ownerUserId: string) {
  const rows = await db
    .select()
    .from(friends)
    .where(and(eq(friends.id, friendId), eq(friends.ownerUserId, ownerUserId)))
    .limit(1);
  return rows[0] ?? null;
}
