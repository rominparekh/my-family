import { desc, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
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

    const [friend] = await db
      .insert(friends)
      .values({
        ownerUserId: user.id,
        name: input.name,
        phoneE164,
        phoneHash,
        timezone: input.timezone,
        notes: input.notes ?? null,
        linkedUserId: linkable?.id ?? null,
      })
      .returning();

    if (input.relationType) {
      await db.insert(relationships).values({
        ownerUserId: user.id,
        friendId: friend.id,
        relationType: input.relationType,
      });
    }

    if (input.specialDays?.length) {
      await db.insert(specialDays).values(
        input.specialDays.map((d) => ({
          friendId: friend.id,
          type: d.type,
          label: d.label ?? null,
          month: d.month,
          day: d.day,
          year: d.year ?? null,
          recurring: d.recurring,
        }))
      );
    }

    return ok(
      {
        friend,
        linkedTo: linkable
          ? { userId: linkable.id, displayName: linkable.displayName }
          : null,
      },
      { status: 201 }
    );
  });
}
