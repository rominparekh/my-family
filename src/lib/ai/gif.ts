import { log } from "@/lib/log";

// Sourcing GIFs from Giphy. The chosen GIF's URL is appended to the wish text as
// a link (WhatsApp shows it as an animated preview when sent via wa.me).

export function gifEnabled(): boolean {
  return Boolean(process.env.GIPHY_API_KEY);
}

export function gifProviderName(): string {
  return gifEnabled() ? "giphy" : "none";
}

type GiphyResult = {
  images?: { original?: { url?: string }; downsized_medium?: { url?: string } };
};

/** Search Giphy; returns up to `limit` direct GIF URLs (best match first). */
export async function findGifs(query: string, limit = 12): Promise<string[]> {
  const key = process.env.GIPHY_API_KEY;
  if (!key) {
    log.warn("gif.skip_no_key", { query });
    return [];
  }
  try {
    const url =
      `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}` +
      `&q=${encodeURIComponent(query)}&limit=${limit}&rating=g&bundle=messaging_non_clips`;
    const res = await fetch(url);
    if (!res.ok) {
      log.error("gif.search_failed", { status: res.status });
      return [];
    }
    const json = (await res.json()) as { data?: GiphyResult[] };
    return (json.data ?? [])
      .map((g) => g.images?.downsized_medium?.url ?? g.images?.original?.url)
      .filter((u): u is string => Boolean(u));
  } catch (err) {
    log.error("gif.error", { err: String(err) });
    return [];
  }
}

/** Find a single relevant GIF for the query; returns a direct GIF URL or null. */
export async function findGif(query: string): Promise<string | null> {
  const [first] = await findGifs(query, 1);
  return first ?? null;
}
