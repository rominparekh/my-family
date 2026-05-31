import Anthropic from "@anthropic-ai/sdk";
import { CONTENT_LIMITS } from "@/lib/constants";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export interface WishContext {
  friendName: string;
  senderName: string;
  relationType?: string; // spouse, parent, friend, ...
  occasion: string; // "birthday", "anniversary", or a custom label
  yearsCount?: number; // age or years-married, when known
  notes?: string; // freeform notes about the friend
  feedback?: string; // user's requested modification, if regenerating
  previousText?: string; // the prior draft being revised
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new Anthropic({ apiKey });
}

function buildPrompt(ctx: WishContext): string {
  const lines: string[] = [];
  lines.push(`You are writing a warm, personal ${ctx.occasion} message.`);
  lines.push(`From: ${ctx.senderName}`);
  lines.push(`To: ${ctx.friendName}${ctx.relationType ? ` (their ${ctx.relationType})` : ""}`);
  if (ctx.yearsCount) lines.push(`Milestone: ${ctx.yearsCount} years`);
  if (ctx.notes) lines.push(`Things to weave in naturally: ${ctx.notes}`);
  lines.push("");
  lines.push("Rules:");
  lines.push(`- Hard limit: ${CONTENT_LIMITS.TEXT_MAX_CHARS} characters. Stay well under it.`);
  lines.push("- Sound like a real person, not a greeting card. Specific over generic.");
  lines.push("- 1-3 short sentences. A single relevant emoji is fine, no hashtags.");
  lines.push("- Do not invent facts that aren't given.");
  if (ctx.feedback) {
    lines.push("");
    lines.push(`Previous draft: "${ctx.previousText ?? ""}"`);
    lines.push(`Revise it per this feedback: "${ctx.feedback}"`);
  }
  lines.push("");
  lines.push("Output ONLY the message text, nothing else.");
  return lines.join("\n");
}

/** Generate a wish message, guaranteed to respect the character limit. */
export async function generateWishText(ctx: WishContext): Promise<string> {
  // Fallback when no API key — keeps the whole flow runnable in dev.
  if (!process.env.ANTHROPIC_API_KEY) {
    const base = `Happy ${ctx.occasion}, ${ctx.friendName}! Wishing you a wonderful day. — ${ctx.senderName}`;
    return base.slice(0, CONTENT_LIMITS.TEXT_MAX_CHARS);
  }

  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: buildPrompt(ctx) }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  return enforceLimit(text, ctx);
}

function enforceLimit(text: string, ctx: WishContext): string {
  if (text.length <= CONTENT_LIMITS.TEXT_MAX_CHARS) return text;
  // Trim to the last sentence/word boundary under the limit.
  const truncated = text.slice(0, CONTENT_LIMITS.TEXT_MAX_CHARS);
  const lastStop = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf(" ")
  );
  if (lastStop > 40) return truncated.slice(0, lastStop + 1).trim();
  void ctx;
  return truncated.trim();
}
