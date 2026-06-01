import { eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { resetPasswordInput } from "@/lib/validation";
import { consumeResetToken } from "@/lib/auth/reset";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

// POST /api/auth/reset-password — set a new password using a valid reset token.
export async function POST(req: Request) {
  return handle(async () => {
    const { token, password } = resetPasswordInput.parse(await req.json());

    const userId = await consumeResetToken(token);
    if (!userId) return fail("This reset link is invalid or has expired.", 400);

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();

    // Log them in after a successful reset.
    await createSession({ userId, email: user.email ?? undefined });
    return ok({ reset: true });
  });
}
