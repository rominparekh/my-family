"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Badge, Button, Card, Textarea } from "@/components/ui";

interface Draft {
  id: string;
  status: string;
  textBody: string | null;
  mediaUrls: string[];
  friendName: string;
  occasionWhen: string;
}
interface Message {
  id: string;
  role: string;
  body: string;
  createdAt: string;
}

const FINAL = ["approved", "scheduled", "sent"];

export default function ApprovalPanel({
  draft,
  messages,
}: {
  draft: Draft;
  messages: Message[];
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const locked = FINAL.includes(draft.status);

  async function respond(decision: "approved" | "changes") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/approvals/${draft.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          decision === "approved" ? { decision } : { decision, feedback }
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
      setFeedback("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/approvals" className="text-sm text-neutral-500 hover:underline">
        ← All approvals
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">A wish for {draft.friendName}</h1>
          <p className="text-neutral-500">For {draft.occasionWhen}</p>
        </div>
        <Badge tone={locked ? "green" : draft.status === "changes_requested" ? "amber" : "brand"}>
          {draft.status.replace("_", " ")}
        </Badge>
      </div>

      <Card className="space-y-4">
        <div className="rounded-xl bg-neutral-50 p-4 text-lg leading-relaxed">
          {draft.textBody || "Generating…"}
        </div>
        {draft.mediaUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {draft.mediaUrls.slice(0, 3).map((url) => (
              <div key={url} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
                <Image src={url} alt="" fill className="object-cover" />
              </div>
            ))}
          </div>
        )}
        {draft.textBody && (
          <p className="text-xs text-neutral-400">{draft.textBody.length}/300 characters</p>
        )}
      </Card>

      {!locked && (
        <Card className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={() => respond("approved")} disabled={busy}>
              👍 Approve
            </Button>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-neutral-700">Or ask for changes</p>
            <Textarea
              rows={2}
              placeholder="e.g. make it funnier, mention their new puppy…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <Button
              variant="ghost"
              className="mt-2"
              disabled={busy || feedback.trim().length === 0}
              onClick={() => respond("changes")}
            >
              Request changes
            </Button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </Card>
      )}

      {locked && (
        <Card className="text-sm text-neutral-600">
          {draft.status === "sent"
            ? "This wish has been delivered. 🎉"
            : "Approved — we'll deliver it on the day, in your friend's timezone."}
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          History
        </h2>
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "ml-8 bg-brand-50 text-brand-900"
                  : m.role === "assistant"
                    ? "mr-8 bg-white text-neutral-800 border border-neutral-200"
                    : "text-center text-xs text-neutral-400"
              }`}
            >
              {m.body}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
