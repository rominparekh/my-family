import { eq, or } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginInput } from "@/lib/validation";

// POST /api/auth/login — email (preferred) or legacy username + password.
export async function POST(req: Request) {
  return handle(async () => {
    const { identifier, password } = loginInput.parse(await req.json());
    const id = identifier.toLowerCase();

    const rows = await db
      .select()
      .from(users)
      .where(or(eq(users.email, id), eq(users.username, id)))
      .limit(1);
    const user = rows[0];

    // Generic message so we don't reveal which accounts exist.
    const invalid = () => fail("Incorrect email or password.", 401);
    if (!user || !user.passwordHash) return invalid();

    const okPass = await verifyPassword(password, user.passwordHash);
    if (!okPass) return invalid();

    await createSession({
      userId: user.id,
      email: user.email ?? undefined,
      username: user.username ?? undefined,
    });
    return ok({ userId: user.id });
  });
}
