import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { applyDecision } from "@/lib/approvals";

const schema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approved") }),
  z.object({ decision: z.literal("changes"), feedback: z.string().trim().min(1).max(1000) }),
]);

type Params = { params: Promise<{ draftId: string }> };

// POST /api/approvals/:draftId/respond
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { draftId } = await params;

    const draft = await db.query.contentDrafts.findFirst({
      where: and(eq(contentDrafts.id, draftId), eq(contentDrafts.ownerUserId, user.id)),
    });
    if (!draft) return fail("Draft not found", 404);
    if (["sent", "approved", "scheduled"].includes(draft.status)) {
      return fail(`This wish is already ${draft.status}.`, 409);
    }

    const input = schema.parse(await req.json());
    await applyDecision({
      draftId,
      decision: input.decision,
      feedback: input.decision === "changes" ? input.feedback : undefined,
      channel: "web",
    });

    return ok({ decision: input.decision });
  });
}
