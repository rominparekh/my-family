import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { users, friends, relationships } from "@/db/schema";
import { hashPhone } from "@/lib/phone";
import { log } from "@/lib/log";

// Relationship inverse: if A is B's <key>, then B is A's <value>.
const INVERSE_RELATION: Record<string, string> = {
  spouse: "spouse",
  partner: "partner",
  sibling: "sibling",
  friend: "friend",
  colleague: "colleague",
  other: "other",
  parent: "child",
  child: "parent",
  grandparent: "grandchild",
  grandchild: "grandparent",
};

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

/**
 * Called when a user's phone is set/verified. For everyone who already added
 * this person as a friend (matched by phone hash):
 *   1. link their friend record to this account, and
 *   2. create a reciprocal "pending" friend on this user's side pointing back at
 *      them (with the inverse relationship), so the new user sees them in their
 *      Friends tab awaiting approval.
 */
export async function establishConnections(user: {
  id: string;
  phoneHash: string | null;
  timezone: string;
}): Promise<number> {
  if (!user.phoneHash) return 0;

  // Friend records others created for this person.
  const incoming = await db
    .select()
    .from(friends)
    .where(and(eq(friends.phoneHash, user.phoneHash), ne(friends.ownerUserId, user.id)));

  let created = 0;
  for (const f of incoming) {
    // 1. Link their record to this account.
    await db.update(friends).set({ linkedUserId: user.id }).where(eq(friends.id, f.id));

    // Skip if this user already has a friend pointing back at that owner.
    const already = await db
      .select({ id: friends.id })
      .from(friends)
      .where(and(eq(friends.ownerUserId, user.id), eq(friends.linkedUserId, f.ownerUserId)))
      .limit(1);
    if (already[0]) continue;

    const owner = (
      await db.select().from(users).where(eq(users.id, f.ownerUserId)).limit(1)
    )[0];
    if (!owner) continue;

    // 2. Create the reciprocal pending friend.
    const [recip] = await db
      .insert(friends)
      .values({
        ownerUserId: user.id,
        name: owner.displayName || "Someone you know",
        phoneE164: owner.phoneE164,
        phoneHash: owner.phoneHash,
        timezone: owner.timezone || user.timezone,
        linkedUserId: owner.id,
        status: "pending",
      })
      .returning();
    created++;

    // Mirror the relationship with its inverse, if one was set.
    const rel = (
      await db.select().from(relationships).where(eq(relationships.friendId, f.id)).limit(1)
    )[0];
    const inverse = rel ? INVERSE_RELATION[rel.relationType] : undefined;
    if (inverse) {
      await db.insert(relationships).values({
        ownerUserId: user.id,
        friendId: recip.id,
        relationType: inverse as typeof rel.relationType,
      });
    }
  }

  if (created > 0) log.info("friends.reciprocal_created", { userId: user.id, created });
  return created;
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
