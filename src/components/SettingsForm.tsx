"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";

export default function SettingsForm({
  initial,
}: {
  initial: {
    displayName: string;
    timezone: string;
    discoverable: boolean;
    username: string;
    phoneE164: string;
  };
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [discoverable, setDiscoverable] = useState(initial.discoverable);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, timezone, discoverable }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
      setMsg("Saved.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <Label>Username</Label>
        <Input value={initial.username} disabled />
      </div>
      <div>
        <Label>Display name</Label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div>
        <Label>Your timezone (IANA)</Label>
        <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
      </div>
      <label className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={discoverable}
          onChange={(e) => setDiscoverable(e.target.checked)}
        />
        <span className="text-sm text-neutral-700">
          <span className="font-medium">Discoverable by phone number.</span> Lets friends
          who add your number auto-link to your account. Turn off to stay private.
        </span>
      </label>
      {msg && <p className="text-sm text-neutral-600">{msg}</p>}
      <Button onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </Card>
  );
}
