import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
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
  get(_target, prop, receiver) {
    const real = init();
    return Reflect.get(real, prop, receiver);
  },
});

export { schema };
