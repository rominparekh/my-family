import Link from "next/link";
import { getSession } from "@/lib/auth/session";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 text-5xl">🎉</div>
      <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
        Never miss the moments that matter.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-neutral-600">
        A private space for the people you love. Add your family and friends, their
        birthdays and anniversaries, and we&apos;ll craft a heartfelt wish — for your
        approval — right on time, in their timezone.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href={session ? "/dashboard" : "/login"}
          className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          {session ? "Go to dashboard" : "Get started"}
        </Link>
      </div>
      <p className="mt-6 text-xs text-neutral-400">
        Create an account with a username and password.
      </p>
    </main>
  );
}
