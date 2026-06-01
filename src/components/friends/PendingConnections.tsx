"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

interface Pending {
  id: string;
  name: string;
  relation?: string | null;
}

export default function PendingConnections({ pending }: { pending: Pending[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (pending.length === 0) return null;

  async function act(id: string, action: "approve" | "dismiss") {
    setBusy(id);
    try {
      if (action === "approve") {
        await fetch(`/api/friends/${id}/approve`, { method: "POST" });
      } else {
        await fetch(`/api/friends/${id}`, { method: "DELETE" });
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 border-brand-300 bg-brand-50/40">
      <h2 className="font-semibold">Connection requests</h2>
      <p className="text-sm text-neutral-600">
        These people added you. Approve to add them to your friends.
      </p>
      <ul className="space-y-2">
        {pending.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
          >
            <span className="text-sm">
              <span className="font-medium">{p.name}</span>
              {p.relation ? <span className="text-neutral-500"> · your {p.relation}</span> : null}
            </span>
            <span className="flex gap-2">
              <Button onClick={() => act(p.id, "approve")} disabled={busy === p.id}>
                Approve
              </Button>
              <Button variant="ghost" onClick={() => act(p.id, "dismiss")} disabled={busy === p.id}>
                Dismiss
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
