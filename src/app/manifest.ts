import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: process.env.APP_NAME ?? "Parekh Family",
    short_name: "Parekh",
    description: "Celebrate the people you love — never miss a special day.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fdf4ff",
    theme_color: "#c026d3",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
