import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";

type Params = { params: Promise<{ draftId: string }> };

// POST /api/approvals/:draftId/reject — discard a wish. Marking it "rejected"
// (rather than deleting) keeps it from being regenerated for the same occasion.
export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const user = await requireUser();
    const { draftId } = await params;

    const draft = await db.query.contentDrafts.findFirst({
      where: and(eq(contentDrafts.id, draftId), eq(contentDrafts.ownerUserId, user.id)),
    });
    if (!draft) return fail("Draft not found", 404);
    if (draft.status === "sent") return fail("This wish has already been sent.", 409);

    await db
      .update(contentDrafts)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(contentDrafts.id, draftId));
    return ok({ status: "rejected" });
  });
}
