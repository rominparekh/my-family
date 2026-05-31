import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/db/client";
import { friends, specialDays, contentDrafts } from "@/db/schema";
import { nextOccurrence, prettyDate } from "@/lib/timezone";
import { Badge, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

function occasionName(type: string, label: string | null) {
  if (type === "birthday") return "Birthday";
  if (type === "anniversary") return "Anniversary";
  return label || "Special day";
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const dayRows = await db
    .select({
      friendId: friends.id,
      friendName: friends.name,
      timezone: friends.timezone,
      type: specialDays.type,
      label: specialDays.label,
      month: specialDays.month,
      day: specialDays.day,
    })
    .from(specialDays)
    .innerJoin(friends, eq(specialDays.friendId, friends.id))
    .where(eq(friends.ownerUserId, user.id));

  const upcoming = dayRows
    .map((r) => {
      const occ = nextOccurrence(r.month, r.day, r.timezone);
      return { ...r, ...occ };
    })
    .filter((r) => r.daysUntil <= 60)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 12);

  const pending = await db.query.contentDrafts.findMany({
    where: and(
      eq(contentDrafts.ownerUserId, user.id),
      inArray(contentDrafts.status, ["pending_approval", "changes_requested"])
    ),
    orderBy: [desc(contentDrafts.updatedAt)],
    with: { friend: true },
    limit: 5,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome{user.displayName ? `, ${user.displayName}` : ""} 👋
        </h1>
        <p className="text-neutral-500">Here&apos;s what&apos;s coming up.</p>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Waiting for your approval
          </h2>
          <div className="space-y-3">
            {pending.map((d) => (
              <Link key={d.id} href={`/approvals/${d.id}`}>
                <Card className="flex items-center justify-between transition hover:border-brand-300">
                  <div>
                    <p className="font-medium">{d.friend?.name}</p>
                    <p className="line-clamp-1 text-sm text-neutral-500">
                      {d.textBody || "Generating…"}
                    </p>
                  </div>
                  <Badge tone={d.status === "changes_requested" ? "amber" : "brand"}>
                    {d.status === "changes_requested" ? "Revising" : "Review"}
                  </Badge>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Upcoming celebrations
        </h2>
        {upcoming.length === 0 ? (
          <Card className="text-center text-neutral-500">
            No special days in the next two months.{" "}
            <Link href="/friends" className="font-medium text-brand-600 hover:underline">
              Add a friend
            </Link>{" "}
            to get started.
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {upcoming.map((u, i) => (
              <Card key={i} className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/friends/${u.friendId}`}
                    className="font-medium hover:underline"
                  >
                    {u.friendName}
                  </Link>
                  <p className="text-sm text-neutral-500">
                    {occasionName(u.type, u.label)} · {prettyDate(u.occasionDate, u.timezone)}
                  </p>
                </div>
                <Badge tone={u.daysUntil <= 3 ? "green" : "neutral"}>
                  {u.daysUntil === 0
                    ? "Today"
                    : u.daysUntil === 1
                      ? "Tomorrow"
                      : `${u.daysUntil} days`}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
