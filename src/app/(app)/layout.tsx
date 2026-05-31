import { redirect } from "next/navigation";
import { and, eq, inArray, count } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/db/client";
import { contentDrafts } from "@/db/schema";
import AppNav from "@/components/AppNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ value: pendingCount }] = await db
    .select({ value: count() })
    .from(contentDrafts)
    .where(
      and(
        eq(contentDrafts.ownerUserId, user.id),
        inArray(contentDrafts.status, ["pending_approval", "changes_requested"])
      )
    );

  return (
    <div className="min-h-screen">
      <AppNav name={user.displayName ?? user.phoneE164} pendingCount={Number(pendingCount)} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
