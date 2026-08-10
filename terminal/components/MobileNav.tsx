"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { BrandLockup, BrandMark } from "@/components/BrandMark";
import { TOP, Glyph as NavGlyph } from "@/components/AppNav";
import SettingsMenu from "@/components/SettingsMenu";
import { useT } from "@/lib/i18n";

/**
 * Shared mobile top-bar + slide-in drawer used by both the /terminal shell and
 * the five app2 routes (screener / portfolio / alerts / flow / scripts).
 *
 * Mirrors the exact .mobilebar / .m-drawer CSS classes already defined in
 * globals.css so no new visual idiom is introduced.
 *
 * Props
 * -----
 * email          — passed to SettingsMenu (cosmetic; guest = "")
 * fromMacro      — when true, shows a prominent "back" pill in the left slot
 *                  and moves the hamburger to the right cluster
 * onBack         — called when the Back pill is tapped (fromMacro only)
 * onOpenCopilot  — optional: when provided the AI star button calls this
 *                  instead of navigating to /terminal?ai=1
 * activeKey      — override the auto-derived active nav key (TerminalShell
 *                  needs this to highlight "analyst" when the pane is open)
 */
export interface MobileNavProps {
  email: string;
  fromMacro?: boolean;
  onBack?: () => void;
  onOpenCopilot?: () => void;
  activeKey?: string;
  /** When set, an "analyst" pane-open event is dispatched instead of navigation */
  isTerminal?: boolean;
}

export default function MobileNav({
  email,
  fromMacro = false,
  onBack,
  onOpenCopilot,
  activeKey: activeKeyProp,
  isTerminal = false,
}: MobileNavProps) {
  const [drawer, setDrawer] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const navPath = usePathname();
  const router = useRouter();
  const t = useT();

  const derivedKey = activeKeyProp ?? (
    navPath.startsWith("/screener") ? "screener"
    : navPath.startsWith("/scripts") ? "scripts"
    : navPath.startsWith("/portfolio") ? "portfolio"
    : navPath.startsWith("/alerts") ? "alerts"
    : navPath.startsWith("/flow") ? "flow"
    : navPath.startsWith("/heatmap") ? "heatmap"
    : "chart"
  );

  const handleAI = () => {
    closeDrawer();
    if (onOpenCopilot) {
      onOpenCopilot();
    } else {
      router.push("/terminal?ai=1");
    }
  };

  const handleAnalystClick = () => {
    closeDrawer();
    if (isTerminal) {
      window.dispatchEvent(new CustomEvent("mm:open-pane", { detail: "analyst" }));
    }
  };

  const openDrawer = () => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer(true);
  };

  const closeDrawer = () => setDrawer(false);

  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [drawer]);

  const quickItems = TOP.filter((item) => ["chart", "analyst", "screener", "portfolio"].includes(item.k));

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
            <button className="m-ic" onClick={openDrawer} aria-label="Menu" aria-expanded={drawer} aria-controls="mobile-navigation-drawer">
              <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
          )}
        <span className="m-brand"><BrandMark size={22} /><b>MASTERMIND</b></span>
        <div className="m-right">
          {fromMacro && (
            <button className="m-ic" onClick={openDrawer} aria-label="Menu" aria-expanded={drawer} aria-controls="mobile-navigation-drawer">
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
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* ── slide-in drawer ── */}
      <div
        id="mobile-navigation-drawer"
        className={`m-drawer${drawer ? " open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        aria-hidden={!drawer}
      >
        <div className="m-drawer-h">
          <BrandLockup />
          <button ref={closeRef} className="m-drawer-close" onClick={closeDrawer} aria-label="Close menu">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <nav className="m-nav" aria-label="Mobile primary">
          {TOP.map((it) => {
            const isAnalyst = it.k === "analyst";
            const on = it.k === derivedKey;
            if (isAnalyst && isTerminal) {
              return (
                <Link
                  key={it.k}
                  href={it.href}
                  className={on ? "on" : ""}
                  onClick={handleAnalystClick}
                  aria-current={on ? "page" : undefined}
                >
                  <NavGlyph k={it.k} />
                  {t(it.k, it.label)}
                </Link>
              );
            }
            return (
              <Link
                key={it.k}
                href={it.href}
                className={on ? "on" : ""}
                onClick={closeDrawer}
                aria-current={on ? "page" : undefined}
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

      {/* Native-app-style quick navigation; the full inventory remains in More. */}
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        {quickItems.map((it) => {
          const on = it.k === derivedKey;
          return (
            <Link
              key={it.k}
              href={it.href}
              className={on ? "on" : ""}
              onClick={it.k === "analyst" && isTerminal ? handleAnalystClick : undefined}
              aria-current={on ? "page" : undefined}
            >
              <NavGlyph k={it.k} />
              <span>{t(it.k, it.label)}</span>
            </Link>
          );
        })}
        <button onClick={openDrawer} aria-label="More navigation" aria-expanded={drawer} aria-controls="mobile-navigation-drawer">
          <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
          <span>{t("more")}</span>
        </button>
      </nav>
    </>
  );
}
