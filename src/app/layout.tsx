import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHIK Live - Self-Hosted Identity Kernel",
  description: "A real-time multimodal agent with a visible identity kernel. Demonstrating that AI agent continuity should exist as an explicit substrate.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
