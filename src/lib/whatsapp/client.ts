import { toWaRecipient } from "@/lib/phone";

const GRAPH_VERSION = "v21.0";

function config() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  return { phoneNumberId, accessToken };
}

/** True when real WhatsApp credentials are configured. */
export function whatsappEnabled(): boolean {
  const { phoneNumberId, accessToken } = config();
  return Boolean(phoneNumberId && accessToken);
}

async function postMessage(payload: Record<string, unknown>): Promise<string | null> {
  const { phoneNumberId, accessToken } = config();

  // In local/dev without credentials we log instead of throwing, so the whole
  // flow remains runnable end-to-end.
  if (!phoneNumberId || !accessToken) {
    console.warn("[whatsapp] credentials missing — would have sent:", JSON.stringify(payload));
    return null;
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { messages?: { id: string }[] };
  return json.messages?.[0]?.id ?? null;
}

/**
 * Send a login OTP via an approved AUTHENTICATION template.
 * The template must have one body parameter (the code) and a URL/copy-code button
 * whose parameter is also the code, per Meta's authentication-template spec.
 */
export async function sendOtp(toE164: string, code: string): Promise<string | null> {
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME ?? "otp_login";
  const lang = process.env.WHATSAPP_OTP_TEMPLATE_LANG ?? "en_US";

  return postMessage({
    to: toWaRecipient(toE164),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: code }],
        },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: code }],
        },
      ],
    },
  });
}

/** Plain text message (used within the 24h customer-service window). */
export async function sendText(toE164: string, body: string): Promise<string | null> {
  return postMessage({
    to: toWaRecipient(toE164),
    type: "text",
    text: { preview_url: false, body },
  });
}

/**
 * Approval request with inline buttons. The button IDs encode the draft id so the
 * webhook can route the tap back to the right Inngest wait.
 */
export async function sendApprovalRequest(
  toE164: string,
  draftId: string,
  preview: string
): Promise<string | null> {
  return postMessage({
    to: toWaRecipient(toE164),
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: preview.slice(0, 1024),
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: `approve:${draftId}`, title: "👍 Approve" },
          },
          {
            type: "reply",
            reply: { id: `changes:${draftId}`, title: "✏️ Request changes" },
          },
        ],
      },
    },
  });
}

/** Send one or more images (used for delivering the final wish). */
export async function sendImage(toE164: string, imageUrl: string, caption?: string) {
  return postMessage({
    to: toWaRecipient(toE164),
    type: "image",
    image: { link: imageUrl, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}
