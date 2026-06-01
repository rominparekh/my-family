import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { registerInput } from "@/lib/validation";

// POST /api/auth/register — create an account with username + password.
export async function POST(req: Request) {
  return handle(async () => {
    const { username, password, displayName, timezone } = registerInput.parse(await req.json());

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (existing.length) {
      return fail("That username is taken. Try another.", 409);
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({
      id: userId,
      username,
      passwordHash,
      displayName: displayName ?? null,
      timezone: timezone ?? "UTC",
    });

    await createSession({ userId, username });
    return ok({ userId }, { status: 201 });
  });
}
