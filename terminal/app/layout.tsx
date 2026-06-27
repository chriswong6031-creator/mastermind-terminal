import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mastermind Terminal",
  description: "Institutional charting — proprietary confluence signals, macro regime, and an Opus AI copilot.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
