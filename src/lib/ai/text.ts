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

export interface WishTextResult {
  text: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

/** Generate a wish message, guaranteed to respect the character limit. Returns
 *  token usage so the caller can attribute cost. */
export async function generateWishText(ctx: WishContext): Promise<WishTextResult> {
  const zeroUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

  const fallback = (): WishTextResult => {
    const base = `Happy ${ctx.occasion}, ${ctx.friendName}! Wishing you a wonderful day. — ${ctx.senderName}`;
    return { text: base.slice(0, CONTENT_LIMITS.TEXT_MAX_CHARS), model: "fallback", usage: zeroUsage };
  };

  // No key configured — use the simple template (keeps the flow runnable).
  if (!process.env.ANTHROPIC_API_KEY) return fallback();

  try {
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

    if (!text) return fallback();

    // Cache token fields exist at runtime; read them defensively across SDK versions.
    const u = msg.usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
    return {
      text: enforceLimit(text, ctx),
      model: MODEL,
      usage: {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (err) {
    // Invalid key, rate limit, model error, etc. — degrade gracefully rather than
    // failing the whole generate→approve flow. Surfaced in logs for debugging.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "ai.text.generation_failed",
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return fallback();
  }
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
