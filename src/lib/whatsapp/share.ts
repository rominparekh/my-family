// Build a WhatsApp "click to chat" (wa.me) deep link. Opening it launches the
// USER's own WhatsApp with the message pre-filled and addressed to the friend —
// so the wish is sent person-to-person (guaranteed delivery, no 24h window, no
// template), the user just taps send. This is the officially-supported way to
// have a message come "from the user" rather than the business number.
import { stripLoneSurrogates } from "@/lib/text-utils";

export function buildWaShareLink(
  phoneE164: string | null | undefined,
  text: string
): string {
  const digits = (phoneE164 ?? "").replace(/\D/g, "");
  // Strip any unpaired surrogates so encodeURIComponent can't throw and the
  // emoji always survive the round-trip into WhatsApp.
  const encoded = encodeURIComponent(stripLoneSurrogates(text));
  // With a number → opens the chat with that friend; without → WhatsApp lets the
  // user pick the recipient.
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/**
 * A direct Giphy file URL (media*.giphy.com/.../giphy.gif) is long and WhatsApp
 * only shows a weak link card for it. The Giphy *page* URL (giphy.com/gifs/<id>)
 * is short and renders as an animated preview, so convert when we recognise one.
 */
export function toShareableMediaUrl(url: string): string {
  const m = url.match(/\/([A-Za-z0-9]{6,})\/giphy\.\w+(?:[?#]|$)/);
  if (m && /giphy\.com/.test(url)) return `https://giphy.com/gifs/${m[1]}`;
  return url;
}

/**
 * Compose the shareable text for a draft. wa.me carries text only, so for
 * photo/GIF wishes we append the (public) media links — the friend taps to view
 * them (GIF links render as an animated WhatsApp preview).
 */
export function composeShareText(textBody: string | null, mediaUrls: string[]): string {
  const parts = [textBody?.trim() || ""];
  if (mediaUrls.length > 0) parts.push(mediaUrls.map(toShareableMediaUrl).join("\n"));
  return parts.filter(Boolean).join("\n\n");
}
