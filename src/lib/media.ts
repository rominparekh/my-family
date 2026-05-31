import { put } from "@vercel/blob";
import { log } from "@/lib/log";

/**
 * Persist provider-generated media into Vercel Blob and return stable public
 * URLs. This matters because WhatsApp *fetches the media link at send time* — a
 * transient or expiring provider URL would fail delivery silently. Storing our
 * own copy also makes drafts reproducible and auditable.
 *
 * Falls back to the original URLs when Blob isn't configured (local dev) so the
 * pipeline stays runnable.
 */
export async function persistRemoteMedia(
  urls: string[],
  opts: { draftId: string; kind: string }
): Promise<string[]> {
  if (urls.length === 0) return [];
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    log.warn("media.persist.skipped_no_blob", { draftId: opts.draftId });
    return urls;
  }

  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const src = urls[i];
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "application/octet-stream";
      const ext = extFor(contentType, opts.kind);
      const blob = await put(
        `drafts/${opts.draftId}/${Date.now()}-${i}.${ext}`,
        await res.arrayBuffer(),
        { access: "public", addRandomSuffix: true, contentType }
      );
      out.push(blob.url);
    } catch (err) {
      log.error("media.persist.failed", { draftId: opts.draftId, src, err: String(err) });
      // Keep the original URL rather than dropping the media entirely.
      out.push(src);
    }
  }
  return out;
}

function extFor(contentType: string, kind: string): string {
  if (contentType.includes("mp4") || kind === "video") return "mp4";
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}
