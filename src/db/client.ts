import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";

// Lazy singleton: we don't touch DATABASE_URL until the db is actually used, so
// `next build` (which imports these modules but doesn't query) never fails on a
// missing env var. The real connection is created on first access.
let _db: NeonHttpDatabase<typeof schema> | null = null;

function init(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  // Neon's HTTP driver is serverless-friendly (no persistent connections),
  // which is exactly what Vercel functions want.
  const sql = neon(connectionString);
  _db = drizzle(sql, { schema });
  return _db;
}

// A proxy so existing `import { db }` call sites keep working unchanged while
// initialization stays deferred to first use.
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const real = init();
    const value = Reflect.get(real, prop, real);
    // Bind methods to the real instance so `this` is correct (e.g. db.batch()).
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * Run several writes atomically. The neon-http driver has no interactive
 * transactions, but `db.batch([...])` executes the statements in a single
 * Postgres transaction (all-or-nothing). Pass client-generated UUIDs when a
 * later statement needs an id from an earlier one, since we can't read results
 * mid-batch.
 */
export async function atomic(ops: BatchItem<"pg">[]): Promise<void> {
  if (ops.length === 0) return;
  if (ops.length === 1) {
    await ops[0];
    return;
  }
  await db.batch(ops as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

export { schema };
