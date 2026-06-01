import { toWaRecipient } from "@/lib/phone";
import { log } from "@/lib/log";

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
    log.warn("whatsapp.skip_no_credentials", { to: payload.to, type: payload.type });
    return null;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  log.info("whatsapp.request", {
    to: payload.to,
    type: payload.type,
    phoneNumberId,
    url,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  // Read the body once as text, then parse — so we can log it either way.
  const bodyText = await res.text();
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    /* leave as text */
  }

  if (!res.ok) {
    log.error("whatsapp.response_error", { status: res.status, to: payload.to, body });
    throw new Error(`WhatsApp send failed (${res.status}): ${bodyText}`);
  }

  const json = body as {
    messages?: { id: string; message_status?: string }[];
    contacts?: { input?: string; wa_id?: string }[];
  };
  const messageId = json.messages?.[0]?.id ?? null;
  log.info("whatsapp.response_ok", {
    status: res.status,
    to: payload.to,
    messageId,
    // "accepted" here means WhatsApp queued it — NOT that it reached the phone.
    messageStatus: json.messages?.[0]?.message_status,
    // wa_id present + matching means the number is a valid WhatsApp user.
    waId: json.contacts?.[0]?.wa_id,
    input: json.contacts?.[0]?.input,
  });
  return messageId;
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

/** Send a video (the Phase-2 video wish). Meta fetches the link at send time, so
 *  it must be a stable, public HTTPS URL (we persist generated media to Blob). */
export async function sendVideo(toE164: string, videoUrl: string, caption?: string) {
  return postMessage({
    to: toWaRecipient(toE164),
    type: "video",
    video: { link: videoUrl, ...(caption ? { caption: caption.slice(0, 1024) } : {}) },
  });
}
