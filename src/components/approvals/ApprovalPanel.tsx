"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import { buildWaShareLink, composeShareText } from "@/lib/whatsapp/share";
import { graphemeLength } from "@/lib/text-utils";

interface Draft {
  id: string;
  status: string;
  kind: string;
  textBody: string | null;
  mediaUrls: string[];
  friendName: string;
  friendPhone: string | null;
  occasionWhen: string;
  costUsd: number;
}
interface Message {
  id: string;
  role: string;
  body: string;
  createdAt: string;
}

const FINAL = ["approved", "scheduled", "sent", "rejected"];

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
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  async function sendNow() {
    setBusy(true);
    setSendMsg(null);
    try {
      const res = await fetch(`/api/approvals/${draft.id}/send-now`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
      setSendMsg(`Sent to ${json.data?.to ?? "recipient"}.`);
      router.refresh();
    } catch (e) {
      setSendMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

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

  async function reject() {
    if (!confirm("Reject this wish? It won't be sent or regenerated.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/approvals/${draft.id}/reject`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || "Failed");
      router.push("/approvals");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  const shareText = composeShareText(draft.textBody, draft.mediaUrls);
  const waLink = buildWaShareLink(draft.friendPhone, shareText);

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
        {draft.kind === "gif" && draft.mediaUrls[0] ? (
          <div className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={draft.mediaUrls[0]}
              alt="GIF"
              className="max-h-72 rounded-lg bg-neutral-100"
            />
            <p className="text-xs text-neutral-400">
              This GIF is attached as a link — it sends with your message.
            </p>
          </div>
        ) : (
          draft.mediaUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {draft.mediaUrls.slice(0, 3).map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
                  <Image src={url} alt="" fill className="object-cover" />
                </div>
              ))}
            </div>
          )
        )}
        <div className="flex items-center justify-between">
          {draft.textBody && (
            <p className="text-xs text-neutral-400">{graphemeLength(draft.textBody)}/300 characters</p>
          )}
          {draft.costUsd > 0 && (
            <p className="text-xs text-neutral-400">
              Generation cost: ${draft.costUsd.toFixed(draft.costUsd < 0.01 ? 4 : 2)}
            </p>
          )}
        </div>
      </Card>

      {draft.textBody && draft.status !== "rejected" && (
        <Card className="space-y-2 border-green-300 bg-green-50/40">
          <h2 className="font-semibold">Send via WhatsApp — from you 💬</h2>
          <p className="text-sm text-neutral-600">
            Opens <span className="font-medium">your</span> WhatsApp with this message ready to
            send to {draft.friendName}
            {draft.friendPhone ? ` (${draft.friendPhone})` : ""}. It comes straight from you, so
            it always delivers — no 24-hour window, no templates.
          </p>
          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500">Exactly what gets sent:</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-800">
{shareText}
            </pre>
            {draft.kind === "gif" && (
              <p className="mt-1 text-xs text-neutral-400">
                The Giphy link previews as an animated GIF in WhatsApp.
              </p>
            )}
          </div>
          <a href={waLink} target="_blank" rel="noopener noreferrer">
            <Button>Open WhatsApp to send</Button>
          </a>
          {!draft.friendPhone && (
            <p className="text-xs text-amber-700">
              No phone saved for {draft.friendName} — WhatsApp will ask you to pick the
              recipient. Add their number on the friend page to pre-address it.
            </p>
          )}
        </Card>
      )}

      {!locked && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Your decision</h2>

          {/* Primary actions: a clear, evenly-spaced row. */}
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => respond("approved")} disabled={busy}>
              👍 Approve
            </Button>
            <Button variant="danger" onClick={reject} disabled={busy}>
              🗑 Reject
            </Button>
          </div>

          {/* Secondary action: ask for changes. */}
          <div className="border-t border-neutral-200 pt-3">
            <p className="mb-1 text-sm font-medium text-neutral-700">Not quite right? Ask for changes</p>
            <Textarea
              rows={2}
              placeholder="e.g. make it funnier, mention their new puppy…"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <Button
              variant="secondary"
              className="mt-2"
              disabled={busy || feedback.trim().length === 0}
              onClick={() => respond("changes")}
            >
              ✏️ Request changes
            </Button>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </Card>
      )}

      {locked && (
        <Card className="text-sm text-neutral-600">
          {draft.status === "sent"
            ? "This wish has been delivered. 🎉"
            : draft.status === "rejected"
              ? "You rejected this wish — it won't be sent."
              : "Approved! Use “Send via WhatsApp” above to send it (or send it on the day)."}
        </Card>
      )}

      {draft.status !== "sent" && draft.status !== "rejected" && (
        <Card className="space-y-2 border-brand-200">
          <h2 className="text-sm font-semibold">Send now (test)</h2>
          <p className="text-sm text-neutral-600">
            Deliver this over WhatsApp immediately, skipping the scheduled send. Plain
            wishes only deliver if the recipient has messaged your business number in the
            last 24h (no template needed).
          </p>
          <Button variant="ghost" onClick={sendNow} disabled={busy}>
            {busy ? "Sending…" : "Send now"}
          </Button>
          {sendMsg && <p className="text-sm text-neutral-600">{sendMsg}</p>}
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
