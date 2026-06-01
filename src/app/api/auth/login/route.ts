import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginInput } from "@/lib/validation";

// POST /api/auth/login — username + password.
export async function POST(req: Request) {
  return handle(async () => {
    const { username, password } = loginInput.parse(await req.json());

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    const user = rows[0];

    // Generic message either way so we don't reveal which usernames exist.
    const invalid = () => fail("Incorrect username or password.", 401);
    if (!user || !user.passwordHash) return invalid();

    const okPass = await verifyPassword(password, user.passwordHash);
    if (!okPass) return invalid();

    await createSession({ userId: user.id, username: user.username ?? undefined });
    return ok({ userId: user.id });
  });
}
