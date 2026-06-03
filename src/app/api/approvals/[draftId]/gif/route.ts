import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ok, fail, handle } from "@/lib/api";
import { db } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { requireUser } from "@/lib/auth/current-user";

const schema = z.object({ url: z.string().url() });

// PATCH /api/approvals/:draftId/gif — replace the draft's GIF (message unchanged).
export async function PATCH(req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { draftId } = await params;
    const { url } = schema.parse(await req.json());

    // Only allow Giphy URLs (we render + send these).
    if (!/^https:\/\/([a-z0-9-]+\.)?giphy\.com\//.test(url)) {
      return fail("Only Giphy URLs are allowed.");
    }

    const draft = await db.query.contentDrafts.findFirst({
      where: and(eq(contentDrafts.id, draftId), eq(contentDrafts.ownerUserId, user.id)),
    });
    if (!draft) return fail("Draft not found", 404);
    if (draft.status === "sent") return fail("This wish has already been sent.", 409);

    await db
      .update(contentDrafts)
      .set({ mediaUrls: [url], kind: "gif", updatedAt: new Date() })
      .where(eq(contentDrafts.id, draftId));
    return ok({ url });
  });
}
