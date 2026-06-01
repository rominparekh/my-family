"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input, Label } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      setDevLink(json?.data?.devLink ?? null);
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <div className="mb-6 text-center">
        <div className="mb-2 text-4xl">🔑</div>
        <h1 className="text-2xl font-bold">Reset your password</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      <Card>
        {done ? (
          <div className="space-y-3 text-sm text-neutral-700">
            <p>If an account exists for {email}, a reset link is on its way.</p>
            {devLink && (
              <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                Dev mode (no email provider): <a className="font-medium underline" href={devLink}>open reset link</a>
              </p>
            )}
            <Link href="/login" className="text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="none"
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending…" : "Send reset link"}
            </Button>
            <Link href="/login" className="block text-center text-sm text-neutral-500 hover:underline">
              Back to sign in
            </Link>
          </form>
        )}
      </Card>
    </main>
  );
}
