"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";

type Mode = "signin" | "register";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "signin"
          ? { identifier: email, password }
          : { email, password, displayName: displayName || undefined, phone: phone || undefined, timezone };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const issue = json.issues?.fieldErrors
          ? Object.values(json.issues.fieldErrors).flat()[0]
          : null;
        throw new Error(issue || json.error || "Something went wrong");
      }
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="mb-5 flex gap-1 rounded-lg bg-neutral-100 p-1">
        <button
          type="button"
          onClick={() => { setMode("signin"); setError(null); }}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${mode === "signin" ? "bg-white shadow-sm" : "text-neutral-500"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode("register"); setError(null); }}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${mode === "register" ? "bg-white shadow-sm" : "text-neutral-500"}`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && (
          <div>
            <Label>Your name</Label>
            <Input placeholder="Romin Parekh" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
        )}
        <div>
          <Label>Email</Label>
          <Input
            // signin accepts a legacy username too, so don't force email validation
            type={mode === "register" ? "email" : "text"}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </div>
        {mode === "register" && (
          <div>
            <Label>Phone (optional)</Label>
            <Input
              placeholder="+14155550123"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Add it now and anyone who already added you will appear in your Friends tab.
            </p>
          </div>
        )}
        <div>
          <Label>Password</Label>
          <Input
            type="password"
            placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading
            ? mode === "signin" ? "Signing in…" : "Creating…"
            : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      {mode === "signin" && (
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </p>
      )}
    </Card>
  );
}
