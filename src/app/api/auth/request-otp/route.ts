import { z } from "zod";
import { ok, fail, handle } from "@/lib/api";
import { normalizeToE164 } from "@/lib/phone";
import { issueOtp } from "@/lib/auth/otp";
import { sendOtp, whatsappEnabled } from "@/lib/whatsapp/client";
import { checkOtpRateLimit, recordOtpRequest, clientIp } from "@/lib/auth/rate-limit";
import { log } from "@/lib/log";

const schema = z.object({ phone: z.string().min(5) });

export async function POST(req: Request) {
  return handle(async () => {
    const body = await req.json();
    const { phone } = schema.parse(body);

    const e164 = normalizeToE164(phone);
    if (!e164) {
      return fail("Please enter a full number including country code, e.g. +14155550123");
    }

    // Throttle before issuing/sending anything (prevents WhatsApp bombing and
    // cost abuse, and stops attempt-counter reset by re-requesting).
    const ip = clientIp(req);
    const limit = await checkOtpRateLimit(e164, ip);
    if (!limit.ok) {
      log.warn("otp.rate_limited", { reason: limit.reason, ip });
      const msg =
        limit.reason === "too_soon"
          ? "Please wait a moment before requesting another code."
          : "Too many code requests. Please try again later.";
      return fail(msg, 429, { retryAfterSeconds: limit.retryAfterSeconds });
    }

    const code = await issueOtp(e164);

    try {
      await sendOtp(e164, code);
    } catch (err) {
      log.error("otp.send_failed", { err: String(err) });
      return fail("Could not send the code over WhatsApp. Please try again.", 502);
    }

    await recordOtpRequest(e164, ip);

    // In dev (no WhatsApp creds) surface the code so the flow is testable.
    const devCode = whatsappEnabled() ? undefined : code;
    return ok({ sent: true, phone: e164, devCode });
  });
}
