import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.APP_NAME ?? "Parekh Family",
  description: "A private space to celebrate the people you love.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
