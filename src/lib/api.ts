import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth/current-user";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Wraps an API handler to translate common errors into clean responses. */
export function handle(
  fn: () => Promise<NextResponse>
): Promise<NextResponse> {
  return fn().catch((err) => {
    if (err instanceof UnauthorizedError) {
      return fail("Not authenticated", 401);
    }
    if (err instanceof ZodError) {
      return fail("Validation failed", 422, { issues: err.flatten() });
    }
    console.error("[api] unhandled error:", err);
    return fail("Internal server error", 500);
  });
}
