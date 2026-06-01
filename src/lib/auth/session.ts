import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "pf_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set. See .env.example.");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email?: string;
  username?: string;
  phoneE164?: string;
}

// A session is valid as long as it carries a userId; the identifier (email,
// username, or phone) is informational.
function toSession(payload: Record<string, unknown>): SessionPayload | null {
  if (typeof payload.userId !== "string") return null;
  const s: SessionPayload = { userId: payload.userId };
  if (typeof payload.email === "string") s.email = payload.email;
  if (typeof payload.username === "string") s.username = payload.username;
  if (typeof payload.phoneE164 === "string") s.phoneE164 = payload.phoneE164;
  return s;
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return toSession(payload);
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** For edge middleware where we can't hit the DB — just verifies the JWT. */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return toSession(payload);
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
