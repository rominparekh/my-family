import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { normalizeToE164 } from "@/lib/phone";
import { issueOtp } from "@/lib/auth/otp";
import { sendOtp, whatsappEnabled } from "@/lib/whatsapp/client";

const schema = z.object({ phone: z.string().min(5) });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const { phone } = schema.parse(body);

    const e164 = normalizeToE164(phone);
    if (!e164) {
      return fail("Please enter a full number including country code, e.g. +14155550123");
    }

    const code = await issueOtp(e164);

    try {
      await sendOtp(e164, code);
    } catch (err) {
      console.error("[request-otp] WhatsApp send failed:", err);
      return fail("Could not send the code over WhatsApp. Please try again.", 502);
    }

    // In dev (no WhatsApp creds) surface the code so the flow is testable.
    const devCode = whatsappEnabled() ? undefined : code;
    return ok({ sent: true, phone: e164, devCode });
  });
}
