import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUsage } from "@/db/schema";
import { log } from "@/lib/log";

export interface RecordUsageInput {
  userId?: string | null;
  draftId?: string | null;
  kind: "text" | "image" | "video" | "gif";
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  units?: number;
  costUsd: number;
}

/** Append a usage row. Best-effort: a logging failure must never break generation. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId: input.userId ?? null,
      draftId: input.draftId ?? null,
      kind: input.kind,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      cacheReadTokens: input.cacheReadTokens ?? 0,
      cacheWriteTokens: input.cacheWriteTokens ?? 0,
      units: input.units ?? 0,
      costUsd: input.costUsd.toFixed(6),
    });
    log.info("ai.usage", {
      kind: input.kind,
      provider: input.provider,
      model: input.model,
      draftId: input.draftId,
      costUsd: Number(input.costUsd.toFixed(6)),
    });
  } catch (err) {
    log.error("ai.usage.record_failed", { err: String(err) });
  }
}

/** Total USD spent on a single draft (all revisions + media). */
export async function draftCostUsd(draftId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(eq(aiUsage.draftId, draftId));
  return Number(row?.total ?? 0);
}

/** Month-to-date spend for a user, broken down by kind. */
export async function userMonthToDate(userId: string): Promise<{
  totalUsd: number;
  byKind: Record<string, number>;
}> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const rows = await db
    .select({
      kind: aiUsage.kind,
      total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, monthStart)))
    .groupBy(aiUsage.kind);

  const byKind: Record<string, number> = {};
  let totalUsd = 0;
  for (const r of rows) {
    const n = Number(r.total);
    byKind[r.kind] = n;
    totalUsd += n;
  }
  return { totalUsd, byKind };
}

/** Recent usage rows for a user (admin/debug surface). */
export async function recentUsage(userId: string, limit = 20) {
  return db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.userId, userId))
    .orderBy(desc(aiUsage.createdAt))
    .limit(limit);
}
