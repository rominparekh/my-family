import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, type User } from "@/db/schema";
import { getSession } from "./session";

/** Resolves the full user row for the current session, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Throws if there's no authenticated user — for use in API routes. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
