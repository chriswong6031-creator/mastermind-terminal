import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./fin.css";
import "./observatory.css";
import { LangProvider } from "@/lib/i18n";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Mastermind Terminal",
  description: "Institutional charting — proprietary confluence signals, macro regime, and an AI copilot.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before first paint (no flash): pick the up/down color scheme + language from a saved
// override, else from the browser locale. CN/HK/TW/MO (red = up) → "east"; everywhere else → "west".
const LOCALE_INIT = `(function(){try{
  var L=((navigator.languages&&navigator.languages[0])||navigator.language||'').toLowerCase();
  var ud=localStorage.getItem('mm.updown'); if(ud!=='east'&&ud!=='west') ud=/zh|hans|hant|-cn|-hk|-tw|-mo/.test(L)?'east':'west';
  document.documentElement.setAttribute('data-updown',ud);
  var lg=localStorage.getItem('mm.lang'); if(lg!=='zh'&&lg!=='en') lg=/^zh/.test(L)?'zh':'en';
  document.documentElement.setAttribute('data-lang',lg);
}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: LOCALE_INIT }} /></head>
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}
