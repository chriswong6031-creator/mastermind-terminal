import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import ErrorMonitor from "@/components/ErrorMonitor";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mastermind Terminal",
  description: "Institutional charting — proprietary confluence signals, macro regime, and an Opus AI copilot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" className={inter.variable}>
      <body>
        {children}
        {/* First-party Umami tracker (proxied via next.config rewrites so it
            works from mainland China). Served same-origin → beacons to
            /api/send on our domain, not cloud.umami.is. */}
        <Script
          src="/stats/script.js"
          data-website-id="d7734c31-99fa-4949-bcde-bec41fbfb2cf"
          strategy="afterInteractive"
        />
        {/* Reports uncaught errors / promise rejections through the same beacon. */}
        <ErrorMonitor />
      </body>
    </html>
  );
}
