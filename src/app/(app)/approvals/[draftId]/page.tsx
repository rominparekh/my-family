import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/db/client";
import { contentDrafts, draftMessages } from "@/db/schema";
import { prettyDate } from "@/lib/timezone";
import ApprovalPanel from "@/components/approvals/ApprovalPanel";

export const dynamic = "force-dynamic";

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { draftId } = await params;

  const draft = await db.query.contentDrafts.findFirst({
    where: and(eq(contentDrafts.id, draftId), eq(contentDrafts.ownerUserId, user.id)),
    with: { friend: true },
  });
  if (!draft) notFound();

  const messages = await db.query.draftMessages.findMany({
    where: eq(draftMessages.draftId, draftId),
    orderBy: [asc(draftMessages.createdAt)],
  });

  const occasionWhen = draft.friend
    ? prettyDate(draft.occasionDate, draft.friend.timezone)
    : draft.occasionDate;

  return (
    <ApprovalPanel
      draft={{
        id: draft.id,
        status: draft.status,
        textBody: draft.textBody,
        mediaUrls: draft.mediaUrls,
        friendName: draft.friend?.name ?? "Friend",
        occasionWhen,
      }}
      messages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
