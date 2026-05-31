import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, contentDrafts } from "@/db/schema";
import { sendText } from "@/lib/whatsapp/client";
import { applyDecision, looksLikeApproval, latestActionableDraft } from "@/lib/approvals";

export const dynamic = "force-dynamic";

// ── Webhook verification (GET) ──
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ── Incoming messages (POST) ──
export async function POST(req: Request) {
  const raw = await req.text();

  if (!verifySignature(req, raw)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhook;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  try {
    await processWebhook(payload);
  } catch (err) {
    // Always 200 so Meta doesn't hammer retries; we log for ourselves.
    console.error("[whatsapp webhook] processing error:", err);
  }
  return new Response("ok", { status: 200 });
}

function verifySignature(req: Request, raw: string): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return true; // not configured — skip (dev)

  const header = req.headers.get("x-hub-signature-256");
  if (!header) return false;
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function processWebhook(payload: WhatsAppWebhook) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value?.messages ?? [];
      for (const msg of messages) {
        await handleMessage(msg);
      }
    }
  }
}

async function handleMessage(msg: WhatsAppMessage) {
  const fromE164 = "+" + msg.from;
  const user = await db.query.users.findFirst({
    where: eq(users.phoneE164, fromE164),
  });
  if (!user) return; // message from an unknown number

  // 1. Interactive button taps carry the draft id directly.
  if (msg.type === "interactive" && msg.interactive?.button_reply) {
    const id = msg.interactive.button_reply.id; // "approve:<draftId>" | "changes:<draftId>"
    const [action, draftId] = id.split(":");
    if (!draftId) return;

    if (action === "approve") {
      await applyDecision({ draftId, decision: "approved", channel: "whatsapp" });
      await sendText(fromE164, "👍 Approved! I'll send it on the day.");
    } else if (action === "changes") {
      // Don't signal yet — prompt for the actual change, handled as the next text.
      await db
        .update(contentDrafts)
        .set({ status: "changes_requested" })
        .where(eq(contentDrafts.id, draftId));
      await sendText(fromE164, "Sure — what would you like me to change?");
    }
    return;
  }

  // 2. Plain text: either an approval word or free-text feedback.
  if (msg.type === "text" && msg.text?.body) {
    const body = msg.text.body.trim();
    const draft = await latestActionableDraft(user.id);
    if (!draft) {
      await sendText(fromE164, "Nothing's waiting for your approval right now 🙂");
      return;
    }

    if (looksLikeApproval(body)) {
      await applyDecision({ draftId: draft.id, decision: "approved", channel: "whatsapp" });
      await sendText(fromE164, "👍 Approved! I'll send it on the day.");
    } else {
      await applyDecision({
        draftId: draft.id,
        decision: "changes",
        feedback: body,
        channel: "whatsapp",
      });
      await sendText(fromE164, "Got it — reworking it now. I'll send a new version to review.");
    }
  }
}

// ── Minimal payload types ──
interface WhatsAppWebhook {
  entry?: {
    changes?: {
      value?: { messages?: WhatsAppMessage[] };
    }[];
  }[];
}

interface WhatsAppMessage {
  from: string;
  type: string;
  text?: { body: string };
  interactive?: {
    button_reply?: { id: string; title: string };
  };
}
