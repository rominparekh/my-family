// Build a WhatsApp "click to chat" (wa.me) deep link. Opening it launches the
// USER's own WhatsApp with the message pre-filled and addressed to the friend —
// so the wish is sent person-to-person (guaranteed delivery, no 24h window, no
// template), the user just taps send. This is the officially-supported way to
// have a message come "from the user" rather than the business number.
export function buildWaShareLink(
  phoneE164: string | null | undefined,
  text: string
): string {
  const digits = (phoneE164 ?? "").replace(/\D/g, "");
  const encoded = encodeURIComponent(text);
  // With a number → opens the chat with that friend; without → WhatsApp lets the
  // user pick the recipient.
  return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/**
 * Compose the shareable text for a draft. wa.me carries text only, so for
 * photo/video wishes we append the (public) media links — the friend can tap to
 * view them.
 */
export function composeShareText(textBody: string | null, mediaUrls: string[]): string {
  const parts = [textBody?.trim() || ""];
  if (mediaUrls.length > 0) parts.push(mediaUrls.join("\n"));
  return parts.filter(Boolean).join("\n\n");
}
