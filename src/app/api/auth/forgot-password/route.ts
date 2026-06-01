import { eq } from "drizzle-orm";
import { ok, handle } from "@/lib/api";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { forgotPasswordInput } from "@/lib/validation";
import { issueResetToken } from "@/lib/auth/reset";
import { sendEmail, emailEnabled } from "@/lib/email";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// POST /api/auth/forgot-password — email a reset link if the account exists.
export async function POST(req: Request) {
  return handle(async () => {
    const { email } = forgotPasswordInput.parse(await req.json());

    const user = (
      await db.select().from(users).where(eq(users.email, email)).limit(1)
    )[0];

    let devLink: string | undefined;
    if (user) {
      const token = await issueResetToken(user.id);
      const link = `${appUrl()}/reset-password?token=${token}`;
      const { delivered } = await sendEmail({
        to: email,
        subject: "Reset your Parekh Family password",
        text: `Reset your password: ${link}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
        html: `<p>Reset your Parekh Family password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
      });
      // In dev (no email provider) surface the link so reset is testable.
      if (!delivered && !emailEnabled()) devLink = link;
    }

    // Always succeed — never reveal whether an account exists.
    return ok({ sent: true, devLink });
  });
}
