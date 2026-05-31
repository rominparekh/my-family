import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/db/client";
import { friends } from "@/db/schema";
import FriendEditor from "@/components/friends/FriendEditor";

export const dynamic = "force-dynamic";

export default async function FriendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;
  const { id } = await params;

  const friend = await db.query.friends.findFirst({
    where: and(eq(friends.id, id), eq(friends.ownerUserId, user.id)),
    with: { relationships: true, specialDays: true, photos: true },
  });
  if (!friend) notFound();

  return <FriendEditor friend={JSON.parse(JSON.stringify(friend))} />;
}
