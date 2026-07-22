"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { BrandLockup, BrandMark } from "@/components/BrandMark";
import { TOP, Glyph as NavGlyph } from "@/components/AppNav";
import SettingsMenu from "@/components/SettingsMenu";
import { useT } from "@/lib/i18n";

/**
 * Shared mobile top-bar + slide-in drawer used by both the /terminal shell and
 * the (shell) app2 routes (screener / options / alerts / scripts / portfolio).
 *
 * Mirrors the exact .mobilebar / .m-drawer CSS classes already defined in
 * globals.css so no new visual idiom is introduced. The drawer items derive
 * from AppNav's TOP export (single source of truth) — the seven sidebar items.
 *
 * Props
 * -----
 * email          — passed to SettingsMenu (cosmetic; guest = "")
 * fromMacro      — when true, shows a prominent "back" pill in the left slot
 *                  and moves the hamburger to the right cluster
 * onBack         — called when the Back pill is tapped (fromMacro only)
 * onOpenCopilot  — optional: when provided the AI star button calls this
 *                  instead of navigating to /terminal?ai=1
 * activeKey      — override the auto-derived active nav key (rarely needed;
 *                  the derived path-prefix key is correct for every workspace)
 */
export interface MobileNavProps {
  email: string;
  fromMacro?: boolean;
  onBack?: () => void;
  onOpenCopilot?: () => void;
  activeKey?: string;
  /** Retained for call-site compatibility; the drawer derives Research's active state
   *  from mm:pane-state, so no per-call terminal flag is needed. */
  isTerminal?: boolean;
}

export default function MobileNav({
  email,
  fromMacro = false,
  onBack,
  onOpenCopilot,
  activeKey: activeKeyProp,
  isTerminal: _isTerminal = false,
}: MobileNavProps) {
  const [drawer, setDrawer] = useState(false);
  const navPath = usePathname();
  const t = useT();

  // Research (the analysis MegaPane) has no route of its own — it opens over the chart.
  // Track the REAL overlay state from the mm:pane-state event TerminalShell broadcasts
  // so the drawer lights Research while the pane is open (mirrors AppNav). Seeded from
  // the URL on mount (client-only read — no useSearchParams).
  const [paneOpen, setPaneOpen] = useState(false);
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("pane");
      if (window.location.pathname.startsWith("/terminal") && p) setPaneOpen(true);
    } catch {}
    const h = (e: Event) => setPaneOpen(!!(e as CustomEvent).detail);
    window.addEventListener("mm:pane-state", h);
    return () => window.removeEventListener("mm:pane-state", h);
  }, []);

  // Active key = path prefix per workspace, mirroring AppNav. On the chart, Research
  // lights while the analysis pane is open (else Chart). Chart is the default/center.
  const derivedKey = activeKeyProp ?? (
    navPath.startsWith("/screener") ? "screener"
    : navPath.startsWith("/options") ? "options"
    : navPath.startsWith("/alerts") ? "alerts"
    : navPath.startsWith("/scripts") ? "scripts"
    : navPath.startsWith("/portfolio") ? "portfolio"
    : (navPath.startsWith("/terminal") && paneOpen) ? "research"
    : "chart"
  );

  const handleAI = () => {
    setDrawer(false);
    if (onOpenCopilot) {
      onOpenCopilot();
    } else {
      window.location.href = "/terminal?ai=1";
    }
  };

  return (
    <>
      {/* ── mobile top bar ── */}
      <div className={`mobilebar${fromMacro ? " from-macro" : ""}`}>
        {fromMacro
          ? (
            <button className="m-back-prom breathe" onClick={onBack} aria-label={t("backToDashboard")}>
              <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
              <span>{t("dashboard")}</span>
            </button>
          )
          : (
            <button className="m-ic" onClick={() => setDrawer(true)} aria-label="Menu">
              <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
          )}
        <span className="m-brand"><BrandMark size={22} /><b>MASTERMIND</b></span>
        <div className="m-right">
          {fromMacro && (
            <button className="m-ic" onClick={() => setDrawer(true)} aria-label="Menu">
              <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
          )}
          <button className="m-ic" onClick={handleAI} aria-label="Mastermind AI">
            <svg viewBox="0 0 24 24" style={{ fill: "var(--brand-2)", stroke: "none" }}>
              <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
            </svg>
          </button>
          <SettingsMenu email={email} />
        </div>
      </div>

      {/* ── drawer scrim ── */}
      <div
        className={`m-drawer-scrim${drawer ? " open" : ""}`}
        onClick={() => setDrawer(false)}
      />

      {/* ── slide-in drawer ── */}
      <div className={`m-drawer${drawer ? " open" : ""}`}>
        <div className="m-drawer-h"><BrandLockup /></div>
        <nav className="m-nav">
          {TOP.map((it) => {
            const on = it.k === derivedKey;
            return (
              <Link
                key={it.k}
                href={it.href}
                className={on ? "on" : ""}
                onClick={() => {
                  setDrawer(false);
                  // On the chart, Research/Chart toggle the in-shell MegaPane via events
                  // (same path, so the href alone wouldn't re-fire the deep-link effect).
                  if (navPath.startsWith("/terminal")) {
                    if (it.k === "research") window.dispatchEvent(new CustomEvent("mm:open-pane", { detail: "overview" }));
                    else if (it.k === "chart") window.dispatchEvent(new CustomEvent("mm:close-pane"));
                  }
                }}
              >
                <NavGlyph k={it.k} />
                {t(it.k, it.label)}
              </Link>
            );
          })}
          <button onClick={handleAI}>
            <svg viewBox="0 0 24 24" style={{ fill: "var(--brand-2)", stroke: "none" }}>
              <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
            </svg>
            {t("ai")}
          </button>
        </nav>
        <div className="m-drawer-ft"><SettingsMenu email={email} /></div>
      </div>
    </>
  );
}
