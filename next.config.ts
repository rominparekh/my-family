import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless"],
  images: {
    remotePatterns: [
      // Vercel Blob public URLs (production media)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Stub image provider (local dev when Blob isn't configured)
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
};

export default nextConfig;
