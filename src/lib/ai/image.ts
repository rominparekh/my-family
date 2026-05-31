import { CONTENT_LIMITS } from "@/lib/constants";

export interface ImageRequest {
  prompt: string;
  count?: number; // capped at PHOTO_MAX_COUNT
}

export interface ImageProvider {
  name: string;
  generate(req: ImageRequest): Promise<string[]>; // returns public URLs
}

/**
 * Stub provider — returns deterministic placeholder image URLs so the entire
 * generate → approve → deliver pipeline is exercisable without spending money or
 * wiring a real model. Swap IMAGE_PROVIDER=firefly|replicate later.
 */
const stubProvider: ImageProvider = {
  name: "stub",
  async generate({ prompt, count = 1 }) {
    const n = Math.min(count, CONTENT_LIMITS.PHOTO_MAX_COUNT);
    return Array.from({ length: n }, (_, i) => {
      const seed = encodeURIComponent(`${prompt.slice(0, 40)}-${i}`);
      // picsum is a free placeholder image service.
      return `https://picsum.photos/seed/${seed}/1024/1024`;
    });
  },
};

/**
 * Replicate placeholder — interface only. Fill in a real model call (e.g. SDXL,
 * Flux) when you add a REPLICATE_API_TOKEN. Throws clearly until then.
 */
const replicateProvider: ImageProvider = {
  name: "replicate",
  async generate() {
    throw new Error(
      "Replicate image provider not yet implemented. Set IMAGE_PROVIDER=stub or implement src/lib/ai/image.ts."
    );
  },
};

const fireflyProvider: ImageProvider = {
  name: "firefly",
  async generate() {
    throw new Error(
      "Adobe Firefly image provider not yet implemented. Set IMAGE_PROVIDER=stub or implement src/lib/ai/image.ts."
    );
  },
};

export function getImageProvider(): ImageProvider {
  switch ((process.env.IMAGE_PROVIDER ?? "stub").toLowerCase()) {
    case "replicate":
      return replicateProvider;
    case "firefly":
      return fireflyProvider;
    default:
      return stubProvider;
  }
}
