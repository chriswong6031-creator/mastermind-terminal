"use client";
import Script from "next/script";
import { LangProvider } from "@/lib/i18n";
import FlowView from "@/components/FlowView";

// Client wrapper that mounts LangProvider for the /flow route.
// The beforeInteractive Script seeds data-lang from localStorage("mm.lang")
// before hydration so the provider reads the persisted lang on first mount.
export default function FlowPageRoot() {
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
