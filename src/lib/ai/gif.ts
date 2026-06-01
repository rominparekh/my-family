import { log } from "@/lib/log";

// Sourcing GIFs from Giphy. The chosen GIF's URL is appended to the wish text as
// a link (WhatsApp shows it as an animated preview when sent via wa.me).

export function gifEnabled(): boolean {
  return Boolean(process.env.GIPHY_API_KEY);
}

export function gifProviderName(): string {
  return gifEnabled() ? "giphy" : "none";
}

/** Find a single relevant GIF for the query; returns a direct GIF URL or null. */
export async function findGif(query: string): Promise<string | null> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    log.warn("gif.skip_no_key", { query });
    return null;
  }
  try {
    const url =
      `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}` +
      `&q=${encodeURIComponent(query)}&limit=1&rating=g&bundle=messaging_non_clips`;
    const res = await fetch(url);
    if (!res.ok) {
      log.error("gif.search_failed", { status: res.status });
      return null;
    }
    const json = (await res.json()) as {
      data?: { images?: { original?: { url?: string }; downsized_medium?: { url?: string } } }[];
    };
    const img = json.data?.[0]?.images;
    return img?.downsized_medium?.url ?? img?.original?.url ?? null;
  } catch (err) {
    log.error("gif.error", { err: String(err) });
    return null;
  }
}
