import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { otpRequests } from "@/db/schema";

// Tunables. Conservative defaults that still allow legitimate retries.
const MIN_INTERVAL_SECONDS = 30; // between two requests for the same phone
const MAX_PER_PHONE_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 15;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; reason: "too_soon" | "phone_hourly" | "ip_hourly"; retryAfterSeconds: number };

function since(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

async function countSince(column: "phone" | "ip", value: string, after: Date): Promise<number> {
  const col = column === "phone" ? otpRequests.phoneE164 : otpRequests.ip;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(otpRequests)
    .where(and(eq(col, value), gte(otpRequests.createdAt, after)));
  return row?.n ?? 0;
}

/** Check (but do not record) whether an OTP may be issued for this phone/IP. */
export async function checkOtpRateLimit(
  phoneE164: string,
  ip: string | null
): Promise<RateLimitResult> {
  // Minimum spacing between requests for the same phone.
  const recent = await countSince("phone", phoneE164, since(MIN_INTERVAL_SECONDS));
  if (recent > 0) {
    return { ok: false, reason: "too_soon", retryAfterSeconds: MIN_INTERVAL_SECONDS };
  }

  const perPhone = await countSince("phone", phoneE164, since(3600));
  if (perPhone >= MAX_PER_PHONE_PER_HOUR) {
    return { ok: false, reason: "phone_hourly", retryAfterSeconds: 3600 };
  }

  if (ip) {
    const perIp = await countSince("ip", ip, since(3600));
    if (perIp >= MAX_PER_IP_PER_HOUR) {
      return { ok: false, reason: "ip_hourly", retryAfterSeconds: 3600 };
    }
  }

  return { ok: true };
}

/** Record that an OTP was issued (call after a successful send). */
export async function recordOtpRequest(phoneE164: string, ip: string | null): Promise<void> {
  await db.insert(otpRequests).values({ phoneE164, ip });
}

/** Best-effort client IP from proxy headers. */
export function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
