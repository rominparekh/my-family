"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";

type Step = "phone" | "code";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [timezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  );
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not send code");
      setDevCode(json.data?.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, displayName, timezone }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Verification failed");
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
      {step === "phone" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <Label>Your name</Label>
            <Input
              placeholder="Romin Parekh"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div>
            <Label>Phone number</Label>
            <Input
              placeholder="+1 415 555 0123"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              required
            />
            <p className="mt-1 text-xs text-neutral-400">
              Include your country code.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          {devCode && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Dev mode (no WhatsApp configured): your code is{" "}
              <span className="font-mono font-bold">{devCode}</span>
            </p>
          )}
          <div>
            <Label>Enter the 6-digit code</Label>
            <Input
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={6}
              required
            />
            <p className="mt-1 text-xs text-neutral-400">Sent to {phone}</p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Verifying…" : "Verify & continue"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-neutral-500 hover:underline"
            onClick={() => setStep("phone")}
          >
            Use a different number
          </button>
        </form>
      )}
    </Card>
  );
}
