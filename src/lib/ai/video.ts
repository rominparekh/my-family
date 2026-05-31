import { CONTENT_LIMITS } from "@/lib/constants";

export interface VideoRequest {
  prompt: string;
  seconds?: number; // capped at VIDEO_MAX_SECONDS
}

export interface VideoResult {
  url: string;
  seconds: number;
}

export interface VideoProvider {
  name: string;
  generate(req: VideoRequest): Promise<VideoResult>;
}

function capSeconds(s?: number): number {
  return Math.min(s ?? CONTENT_LIMITS.VIDEO_MAX_SECONDS, CONTENT_LIMITS.VIDEO_MAX_SECONDS);
}

/**
 * Stub provider — returns a short public sample clip so the full video pipeline
 * (generate → persist to Blob → approve → deliver as WhatsApp video) is
 * exercisable without spending money. Swap VIDEO_PROVIDER=replicate|firefly later.
 */
const stubProvider: VideoProvider = {
  name: "stub",
  async generate({ seconds }) {
    return {
      // Small, royalty-free sample mp4.
      url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
      seconds: capSeconds(seconds),
    };
  },
};

const replicateProvider: VideoProvider = {
  name: "replicate",
  async generate() {
    // Implement with a real text-to-video model (e.g. Luma, Kling, Wan) via the
    // Replicate API when REPLICATE_API_TOKEN is set. Must clamp to <=30s.
    throw new Error(
      "Replicate video provider not yet implemented. Set VIDEO_PROVIDER=stub or implement src/lib/ai/video.ts."
    );
  },
};

const fireflyProvider: VideoProvider = {
  name: "firefly",
  async generate() {
    throw new Error(
      "Adobe Firefly video provider not yet implemented. Set VIDEO_PROVIDER=stub or implement src/lib/ai/video.ts."
    );
  },
};

export function getVideoProvider(): VideoProvider {
  switch ((process.env.VIDEO_PROVIDER ?? "stub").toLowerCase()) {
    case "replicate":
      return replicateProvider;
    case "firefly":
      return fireflyProvider;
    default:
      return stubProvider;
  }
}
