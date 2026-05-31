"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/components/ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/friends", label: "Friends" },
  { href: "/approvals", label: "Approvals" },
  { href: "/settings", label: "Settings" },
];

export default function AppNav({
  name,
  pendingCount,
}: {
  name: string;
  pendingCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-lg font-bold">
            🎉 {process.env.NEXT_PUBLIC_APP_NAME ?? "Parekh Family"}
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {LINKS.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "relative rounded-lg px-3 py-1.5 text-sm font-medium transition",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-neutral-600 hover:bg-neutral-100"
                  )}
                >
                  {l.label}
                  {l.href === "/approvals" && pendingCount > 0 && (
                    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs text-white">
                      {pendingCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-neutral-500 sm:inline">{name}</span>
          <button
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
