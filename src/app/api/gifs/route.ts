import { ok, handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/current-user";
import { findGifs, gifEnabled } from "@/lib/ai/gif";

// GET /api/gifs?q=happy+birthday — search GIFs to pick from.
export async function GET(req: Request) {
  return handle(async () => {
    await requireUser();
    const q = (new URL(req.url).searchParams.get("q") || "").trim();
    if (!gifEnabled()) return ok({ enabled: false, gifs: [] });
    if (!q) return ok({ enabled: true, gifs: [] });
    const gifs = await findGifs(q, 12);
    return ok({ enabled: true, gifs });
  });
}
