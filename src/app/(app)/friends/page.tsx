import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/db/client";
import { friends } from "@/db/schema";
import { Badge, Card } from "@/components/ui";
import AddFriendPanel from "@/components/friends/AddFriendPanel";
import PendingConnections from "@/components/friends/PendingConnections";

export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const all = await db.query.friends.findMany({
    where: eq(friends.ownerUserId, user.id),
    orderBy: [desc(friends.createdAt)],
    with: { relationships: true, specialDays: true },
  });
  const pending = all.filter((f) => f.status === "pending");
  const list = all.filter((f) => f.status !== "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Friends &amp; family</h1>
          <p className="text-neutral-500">{list.length} people</p>
        </div>
      </div>

      <PendingConnections
        pending={pending.map((f) => ({
          id: f.id,
          name: f.name,
          relation: f.relationships[0]?.relationType ?? null,
        }))}
      />

      <AddFriendPanel />

      {list.length === 0 ? (
        <Card className="text-center text-neutral-500">
          No one here yet. Add your first friend above.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((f) => (
            <Link key={f.id} href={`/friends/${f.id}`}>
              <Card className="h-full transition hover:border-brand-300">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    {f.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{f.name}</p>
                    <p className="truncate text-xs text-neutral-400">
                      {f.phoneE164 ?? "No phone"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {f.relationships.map((r) => (
                    <Badge key={r.id} tone="brand">
                      {r.relationType}
                    </Badge>
                  ))}
                  {f.specialDays.length > 0 && (
                    <Badge tone="neutral">
                      {f.specialDays.length} special{" "}
                      {f.specialDays.length === 1 ? "day" : "days"}
                    </Badge>
                  )}
                  {f.linkedUserId && <Badge tone="green">on platform</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
