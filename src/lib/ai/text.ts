import Anthropic from "@anthropic-ai/sdk";
import { CONTENT_LIMITS } from "@/lib/constants";
import { bedrockEnabled, generateWithBedrock } from "@/lib/ai/bedrock";
import { truncateGraphemes } from "@/lib/text-utils";

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
  lines.push("Also pick a short GIF search phrase to accompany the message:");
  lines.push(
    `- 2-4 words for finding a GIF on Giphy that fits the OCCASION and the message's mood/details.`
  );
  lines.push(
    `- Lead with the occasion (e.g. "happy ${ctx.occasion}"), then add a theme drawn ONLY from the message/notes (e.g. flowers, hug, hiking).`
  );
  lines.push(`- Keep it broad enough to return results; do NOT invent topics not in the context.`);
  lines.push("");
  lines.push('Output ONLY a JSON object: {"message": "<the message>", "gif_query": "<phrase>"}');
  return lines.join("\n");
}

function parseGeneration(raw: string): { message: string; gifQuery?: string } {
  // Strip code fences the model might add, then try to parse the JSON object.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const obj = JSON.parse(cleaned) as { message?: string; gif_query?: string };
    if (obj && typeof obj.message === "string") {
      return { message: obj.message, gifQuery: obj.gif_query?.trim() || undefined };
    }
  } catch {
    /* not JSON — fall back to treating the whole output as the message */
  }
  return { message: raw.trim().replace(/^["']|["']$/g, "") };
}

export interface WishTextResult {
  text: string;
  gifQuery?: string;
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
    return {
      text: base.slice(0, CONTENT_LIMITS.TEXT_MAX_CHARS),
      gifQuery: `happy ${ctx.occasion}`,
      model: "fallback",
      usage: zeroUsage,
    };
  };

  const logFail = (where: string, err: unknown) =>
    console.error(
      JSON.stringify({
        level: "error",
        msg: "ai.text.generation_failed",
        where,
        err: err instanceof Error ? err.message : String(err),
      })
    );

  // Prefer Amazon Bedrock when a Bedrock API key is present.
  if (bedrockEnabled()) {
    try {
      const r = await generateWithBedrock(buildPrompt(ctx), 400);
      if (!r.text) return fallback();
      const parsed = parseGeneration(r.text);
      return {
        text: enforceLimit(parsed.message),
        gifQuery: parsed.gifQuery,
        model: r.model,
        usage: r.usage,
      };
    } catch (err) {
      logFail("bedrock", err);
      return fallback();
    }
  }

  // No Anthropic key either — use the simple template (keeps the flow runnable).
  if (!process.env.ANTHROPIC_API_KEY) return fallback();

  try {
    const msg = await client().messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!text) return fallback();
    const parsed = parseGeneration(text);

    // Cache token fields exist at runtime; read them defensively across SDK versions.
    const u = msg.usage as {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
    return {
      text: enforceLimit(parsed.message),
      gifQuery: parsed.gifQuery,
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
    logFail("anthropic", err);
    return fallback();
  }
}

function enforceLimit(text: string): string {
  // Grapheme-aware so we never split an emoji (which would render as "�").
  const { text: truncated, truncated: wasTruncated } = truncateGraphemes(
    text,
    CONTENT_LIMITS.TEXT_MAX_CHARS
  );
  if (!wasTruncated) return text;
  // Trim back to the last sentence/word boundary (these are ASCII, safe to slice).
  const lastStop = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf(" ")
  );
  if (lastStop > 40) return truncated.slice(0, lastStop + 1).trim();
  return truncated.trim();
}
