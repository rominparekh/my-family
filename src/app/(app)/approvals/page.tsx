import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import { Badge, Card } from "@/components/ui";
import { prettyDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const drafts = await db.query.contentDrafts.findMany({
    where: and(
      eq(contentDrafts.ownerUserId, user.id),
      inArray(contentDrafts.status, ["pending_approval", "changes_requested", "approved", "scheduled"])
    ),
    orderBy: [desc(contentDrafts.updatedAt)],
    with: { friend: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approvals</h1>
        <p className="text-neutral-500">Review and approve wishes before they go out.</p>
      </div>

      {drafts.length === 0 ? (
        <Card className="text-center text-neutral-500">
          Nothing to review right now. We&apos;ll prepare wishes a few days before each
          special day.
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <Link key={d.id} href={`/approvals/${d.id}`}>
              <Card className="flex items-center justify-between transition hover:border-brand-300">
                <div className="min-w-0">
                  <p className="font-medium">{d.friend?.name}</p>
                  <p className="line-clamp-1 text-sm text-neutral-500">{d.textBody}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    For {d.friend ? prettyDate(d.occasionDate, d.friend.timezone) : d.occasionDate}
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "brand" | "amber" | "green" | "neutral"; label: string }> = {
    pending_approval: { tone: "brand", label: "Needs review" },
    changes_requested: { tone: "amber", label: "Revising" },
    approved: { tone: "green", label: "Approved" },
    scheduled: { tone: "green", label: "Scheduled" },
  };
  const v = map[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
