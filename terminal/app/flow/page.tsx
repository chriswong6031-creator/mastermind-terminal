"use client";
import { LangProvider } from "@/lib/i18n";
import FlowView from "@/components/FlowView";
import Script from "next/script";

export const dynamic = "force-dynamic";

// Mount LangProvider here so /flow visitors get real i18n without relying on
// the root layout.  The inline script runs before hydration and seeds data-lang
// from the persisted mm.lang key so the provider reads the right value on first
// mount — matching the behaviour of a site-wide locale-init script.
export default function FlowPage() {
  return (
    <LangProvider>
      <Script id="flow-locale-init" strategy="beforeInteractive">{`
        (function(){
          try {
            var lg = localStorage.getItem("mm.lang");
            if (lg === "zh" || lg === "en") {
              document.documentElement.setAttribute("data-lang", lg);
            }
          } catch(e) {}
        })();
      `}</Script>
      <FlowView />
    </LangProvider>
  );
}
