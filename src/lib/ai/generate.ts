import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contentDrafts, friends, specialDays, relationships, users } from "@/db/schema";
import { generateWishText, type WishContext } from "@/lib/ai/text";
import { getImageProvider } from "@/lib/ai/image";
import { findGif, gifProviderName } from "@/lib/ai/gif";
import { persistRemoteMedia } from "@/lib/media";
import { recordUsage } from "@/lib/ai/usage";
import { textCostUsd, imageCostUsd } from "@/lib/ai/pricing";
import { CONTENT_LIMITS } from "@/lib/constants";

export interface GeneratedContent {
  textBody: string;
  mediaUrls: string[];
  prompt: string;
}

function occasionLabel(type: string, label: string | null): string {
  if (type === "birthday") return "birthday";
  if (type === "anniversary") return "anniversary";
  return label || "special day";
}

function yearsSince(year: number | null, occasionDate: string): number | undefined {
  if (!year) return undefined;
  const occasionYear = Number(occasionDate.slice(0, 4));
  const n = occasionYear - year;
  return n > 0 && n < 150 ? n : undefined;
}

/**
 * Build content for a draft. Pure-ish: reads the world, calls the models, and
 * returns the new content. Persistence is the caller's (Inngest step's) job so
 * each step stays idempotent and retryable.
 */
export async function generateForDraft(
  draftId: string,
  feedback?: string
): Promise<GeneratedContent> {
  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, draftId),
  });
  if (!draft) throw new Error(`Draft ${draftId} not found`);

  const friend = await db.query.friends.findFirst({
    where: eq(friends.id, draft.friendId),
  });
  if (!friend) throw new Error(`Friend ${draft.friendId} not found`);

  const day = await db.query.specialDays.findFirst({
    where: eq(specialDays.id, draft.specialDayId),
  });
  const owner = await db.query.users.findFirst({ where: eq(users.id, draft.ownerUserId) });
  const rels = await db.query.relationships.findMany({
    where: eq(relationships.friendId, friend.id),
  });

  const occasion = occasionLabel(day?.type ?? "custom", day?.label ?? null);

  const ctx: WishContext = {
    friendName: friend.name,
    senderName: owner?.displayName || "Your friend",
    relationType: rels[0]?.relationType,
    occasion,
    yearsCount: day ? yearsSince(day.year, draft.occasionDate) : undefined,
    notes: friend.notes ?? undefined,
    feedback,
    previousText: feedback ? draft.textBody ?? undefined : undefined,
  };

  const textResult = await generateWishText(ctx);
  const textBody = textResult.text;

  // Attribute the text generation cost to this draft + owner.
  await recordUsage({
    userId: draft.ownerUserId,
    draftId,
    kind: "text",
    provider: textResult.model === "fallback" ? "none" : "anthropic",
    model: textResult.model,
    inputTokens: textResult.usage.inputTokens,
    outputTokens: textResult.usage.outputTokens,
    cacheReadTokens: textResult.usage.cacheReadTokens,
    cacheWriteTokens: textResult.usage.cacheWriteTokens,
    costUsd: textCostUsd(textResult.model, textResult.usage),
  });

  const kind = draft.kind; // DB enum (text | photo | gif | legacy video)
  let mediaUrls: string[] = [];
  if (kind === "photo") {
    const provider = getImageProvider();
    const imagePrompt = `A warm, celebratory ${occasion} image for ${friend.name}${
      ctx.relationType ? ` (${ctx.relationType})` : ""
    }. Festive, heartfelt, tasteful. ${feedback ?? ""}`.trim();
    const generated = await provider.generate({
      prompt: imagePrompt,
      count: Math.min(CONTENT_LIMITS.PHOTO_MAX_COUNT, 1),
    });
    // Re-host into Blob so delivery uses stable URLs WhatsApp can fetch.
    mediaUrls = await persistRemoteMedia(generated, { draftId, kind });

    await recordUsage({
      userId: draft.ownerUserId,
      draftId,
      kind: "image",
      provider: provider.name,
      model: provider.name,
      units: generated.length,
      costUsd: imageCostUsd(provider.name, generated.length),
    });
  } else if (kind === "gif") {
    // A relevant GIF, sourced from Giphy and included as a link (wa.me is
    // text-only, so WhatsApp renders the link as an animated preview). The search
    // phrase comes from the same LLM call that wrote the message, so it reflects
    // the occasion + the message's actual content (not a generic guess).
    const query = textResult.gifQuery || `happy ${occasion}`;
    const gifUrl = await findGif(query);
    if (gifUrl) mediaUrls = [gifUrl];

    await recordUsage({
      userId: draft.ownerUserId,
      draftId,
      kind: "gif",
      provider: gifProviderName(),
      model: gifProviderName(),
      units: gifUrl ? 1 : 0,
      costUsd: 0,
    });
  }

  const prompt = `${occasion} | ${friend.name} | rel=${ctx.relationType ?? "—"} | feedback=${
    feedback ?? "—"
  }`;

  return { textBody, mediaUrls, prompt };
}
