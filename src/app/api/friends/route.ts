import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { ok, fail, handle } from "@/lib/api";
import { db, atomic } from "@/db/client";
import { friends, relationships, specialDays } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { normalizeToE164, hashPhone } from "@/lib/phone";
import { createFriendInput } from "@/lib/validation";
import { findLinkableUser } from "@/lib/friends";

// GET /api/friends — list the current user's friends.
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const rows = await db.query.friends.findMany({
      where: eq(friends.ownerUserId, user.id),
      orderBy: [desc(friends.createdAt)],
      with: {
        relationships: true,
        specialDays: true,
      },
    });
    return ok(rows);
  });
}

// POST /api/friends — create a friend (+ optional relationship & special days).
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = createFriendInput.parse(await req.json());

    let phoneE164: string | null = null;
    let phoneHash: string | null = null;
    if (input.phone) {
      phoneE164 = normalizeToE164(input.phone);
      if (!phoneE164) return fail("Phone must include a country code, e.g. +14155550123");
      phoneHash = hashPhone(phoneE164);
    }

    const linkable = await findLinkableUser(phoneE164, user.id);

    // Client-generated id so the relationship/special-day inserts can reference
    // it within one atomic batch (no mid-transaction read).
    const friendId = randomUUID();
    const friendValues = {
      id: friendId,
      ownerUserId: user.id,
      name: input.name,
      phoneE164,
      phoneHash,
      timezone: input.timezone,
      notes: input.notes ?? null,
      linkedUserId: linkable?.id ?? null,
    };

    const ops: BatchItem<"pg">[] = [db.insert(friends).values(friendValues)];
    if (input.relationType) {
      ops.push(
        db.insert(relationships).values({
          ownerUserId: user.id,
          friendId,
          relationType: input.relationType,
        })
      );
    }
    if (input.specialDays?.length) {
      ops.push(
        db.insert(specialDays).values(
          input.specialDays.map((d) => ({
            friendId,
            type: d.type,
            label: d.label ?? null,
            month: d.month,
            day: d.day,
            year: d.year ?? null,
            recurring: d.recurring,
          }))
        )
      );
    }

    await atomic(ops);

    return ok(
      {
        friend: friendValues,
        linkedTo: linkable
          ? { userId: linkable.id, displayName: linkable.displayName }
          : null,
      },
      { status: 201 }
    );
  });
}
