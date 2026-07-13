"use client";
/**
 * coach.tsx — spotlight-overlay engine for the options desk tutorial.
 *
 * Mechanics (adapted from MomoEdge learning/coach.js, rewritten in React/TSX):
 *
 *   - Steps declare { targetSelector, placement, … }
 *   - A dimmed full-screen mask with a cutout around the target element
 *     is rendered via position:fixed + SVG clip-path.
 *   - Tooltip card renders adjacent to the target (placement-aware, auto-flips
 *     on viewport overflow).
 *   - When a selector matches nothing, the step degrades to a centered modal.
 *   - Completion + per-module progress persisted in localStorage under
 *     'flowdesk.tutorial' (distinct from MomoEdge's key).
 *   - Resize/scroll: spotlight position is recomputed via ResizeObserver +
 *     window scroll listener.
 *
 * No new npm dependencies. Uses React only.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { TutorialStep } from "./steps";
import { TUTORIAL_STEPS } from "./steps";
import { getTutStr } from "./tutorialStrings";
import type { Lang } from "@/lib/i18n";

// ─── localStorage schema ───────────────────────────────────────────────────────

const LS_KEY = "flowdesk.tutorial";

export interface ModuleProgress {
  done: boolean;
  completedAt: string | null; // ISO-8601 or null
}

export interface TutorialProgress {
  modules: Record<number, ModuleProgress>;
}

function loadProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as TutorialProgress;
  } catch {}
  return { modules: {} };
}

function saveProgress(p: TutorialProgress): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {}
}

export function markModuleDone(moduleId: number): void {
  const p = loadProgress();
  p.modules[moduleId] = { done: true, completedAt: new Date().toISOString() };
  saveProgress(p);
}

export function isModuleDone(moduleId: number): boolean {
  return loadProgress().modules[moduleId]?.done === true;
}

export function isModuleUnlocked(moduleId: number): boolean {
  if (moduleId === 1) return true;
  return isModuleDone(moduleId - 1);
}

export function allDoneCount(): number {
  const p = loadProgress();
  return Object.values(p.modules).filter((m) => m.done).length;
}

export { loadProgress };

// ─── Target rect helpers ──────────────────────────────────────────────────────

interface Rect { x: number; y: number; w: number; h: number }

const PAD = 8; // spotlight padding around target

function queryRect(selector: string): Rect | null {
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
  } catch {
    return null;
  }
}

// ─── Tooltip placement logic ──────────────────────────────────────────────────

interface TooltipPos {
  top: number;
  left: number;
  transform: string;
}

const TIP_W = 380;
const TIP_H_EST = 240; // rough estimate for overflow guard
const TIP_GAP = 14;    // gap between spotlight edge and tooltip

function computeTooltipPos(
  rect: Rect | null,
  placement: TutorialStep["placement"],
  vw: number,
  vh: number,
): TooltipPos {
  if (!rect || placement === "center") {
    return {
      top: vh / 2,
      left: vw / 2,
      transform: "translate(-50%, -50%)",
    };
  }

  // Try requested placement; fall back if overflow
  const tryPlace = (p: TutorialStep["placement"]): TooltipPos | null => {
    switch (p) {
      case "top": {
        const left = Math.max(8, Math.min(vw - TIP_W - 8, rect.x + rect.w / 2 - TIP_W / 2));
        const top = rect.y - TIP_H_EST - TIP_GAP;
        if (top < 8) return null;
        return { top, left, transform: "none" };
      }
      case "bottom": {
        const left = Math.max(8, Math.min(vw - TIP_W - 8, rect.x + rect.w / 2 - TIP_W / 2));
        const top = rect.y + rect.h + TIP_GAP;
        if (top + TIP_H_EST > vh - 8) return null;
        return { top, left, transform: "none" };
      }
      case "left": {
        const top = Math.max(8, Math.min(vh - TIP_H_EST - 8, rect.y + rect.h / 2 - TIP_H_EST / 2));
        const left = rect.x - TIP_W - TIP_GAP;
        if (left < 8) return null;
        return { top, left, transform: "none" };
      }
      case "right": {
        const top = Math.max(8, Math.min(vh - TIP_H_EST - 8, rect.y + rect.h / 2 - TIP_H_EST / 2));
        const left = rect.x + rect.w + TIP_GAP;
        if (left + TIP_W > vw - 8) return null;
        return { top, left, transform: "none" };
      }
      default:
        return null;
    }
  };

  // Fallback order
  const ORDER: TutorialStep["placement"][] = [
    placement,
    placement === "top" ? "bottom" : "top",
    placement === "left" ? "right" : "left",
    "center",
  ];

  for (const p of ORDER) {
    const pos = p === "center" ? null : tryPlace(p);
    if (pos) return pos;
  }
  // Ultimate fallback: centered
  return { top: vh / 2, left: vw / 2, transform: "translate(-50%, -50%)" };
}

// ─── Coach context ─────────────────────────────────────────────────────────────

interface CoachState {
  active: boolean;
  moduleId: number | null;
  stepIndex: number;
  steps: TutorialStep[];
  lang: Lang;
}

interface CoachCtx {
  state: CoachState;
  startModule: (moduleId: number, lang: Lang) => void;
  next: () => void;
  back: () => void;
  stop: () => void;
}

const CoachContext = createContext<CoachCtx | null>(null);

export function useCoach(): CoachCtx {
  const ctx = useContext(CoachContext);
  if (!ctx) throw new Error("useCoach must be used inside CoachProvider");
  return ctx;
}

interface CoachProviderProps {
  children: React.ReactNode;
  onModuleComplete?: (moduleId: number) => void;
}

export function CoachProvider({ children, onModuleComplete }: CoachProviderProps) {
  const [state, setState] = useState<CoachState>({
    active: false,
    moduleId: null,
    stepIndex: 0,
    steps: [],
    lang: "en",
  });

  const startModule = useCallback((moduleId: number, lang: Lang) => {
    const steps = TUTORIAL_STEPS.filter((s) => s.module === moduleId);
    setState({ active: true, moduleId, stepIndex: 0, steps, lang });
  }, []);

  const next = useCallback(() => {
    setState((prev) => {
      if (!prev.active) return prev;
      const nextIdx = prev.stepIndex + 1;
      if (nextIdx >= prev.steps.length) {
        // Module complete
        if (prev.moduleId !== null) {
          markModuleDone(prev.moduleId);
          onModuleComplete?.(prev.moduleId);
        }
        return { ...prev, active: false, stepIndex: 0 };
      }
      return { ...prev, stepIndex: nextIdx };
    });
  }, [onModuleComplete]);

  const back = useCallback(() => {
    setState((prev) => {
      if (!prev.active || prev.stepIndex === 0) return prev;
      return { ...prev, stepIndex: prev.stepIndex - 1 };
    });
  }, []);

  const stop = useCallback(() => {
    setState((prev) => ({ ...prev, active: false }));
  }, []);

  return (
    <CoachContext.Provider value={{ state, startModule, next, back, stop }}>
      {children}
      {state.active && <SpotlightOverlay state={state} next={next} back={back} stop={stop} />}
    </CoachContext.Provider>
  );
}

// ─── SpotlightOverlay ─────────────────────────────────────────────────────────

interface SpotlightOverlayProps {
  state: CoachState;
  next: () => void;
  back: () => void;
  stop: () => void;
}

function SpotlightOverlay({ state, next, back, stop }: SpotlightOverlayProps) {
  const { steps, stepIndex, lang } = state;
  const step = steps[stepIndex];
  const t = (key: Parameters<typeof getTutStr>[1]) => getTutStr(lang, key);

  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Measure target and viewport
  const measure = useCallback(() => {
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    if (step.targetSelector) {
      setRect(queryRect(step.targetSelector));
    } else {
      setRect(null);
    }
  }, [step.targetSelector]);

  // Initial measure + re-measure on step change
  useEffect(() => {
    measure();
    // Scroll target into view if possible
    if (step.targetSelector) {
      try {
        const el = document.querySelector(step.targetSelector);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {}
    }
  }, [step, measure]);

  // Resize observer + scroll listener
  useEffect(() => {
    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    const onScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? "";
      if (["input", "textarea", "select", "button", "a"].includes(tag)) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back, stop]);

  if (!step || !vw || !vh) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const isCentered = !rect || step.placement === "center";
  const totalSteps = steps.length;
  const stepLabel = t("stepPill")
    .replace("{n}", String(stepIndex + 1))
    .replace("{total}", String(totalSteps));

  const tipPos = computeTooltipPos(rect, step.placement, vw, vh);
  const title = getTutStr(lang, step.titleKey);
  const body = getTutStr(lang, step.bodyKey);
  const disclaimer = t("disclaimer");

  // ── SVG clip path for the dimmed mask with cutout ─────────────────────────
  // We use a full-screen rect minus the target rect as a cutout.
  // SVG evenodd fill rule creates the "hole".

  const maskSvg = !isCentered && rect
    ? `M0,0 H${vw} V${vh} H0 Z M${rect.x},${rect.y} H${rect.x + rect.w} V${rect.y + rect.h} H${rect.x} Z`
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        pointerEvents: "none",
      }}
    >
      {/* Dimmed mask */}
      {maskSvg ? (
        <svg
          style={{
            position: "fixed",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          <path
            d={maskSvg}
            fillRule="evenodd"
            fill="rgba(0,0,0,0.72)"
            style={{ transition: "d 0.35s ease" }}
          />
        </svg>
      ) : (
        /* Centered modal: full dim */
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.72)",
            pointerEvents: "auto",
          }}
          aria-hidden="true"
          onClick={stop}
        />
      )}

      {/* Spotlight border ring (non-centered only) */}
      {!isCentered && rect && (
        <div
          style={{
            position: "fixed",
            top: rect.y,
            left: rect.x,
            width: rect.w,
            height: rect.h,
            borderRadius: 6,
            boxShadow: "0 0 0 2px var(--brand-2, #00ffa3)",
            transition: "all 0.35s ease",
            pointerEvents: "none",
          }}
          aria-hidden="true"
        />
      )}

      {/* Tooltip card */}
      <div
        style={{
          position: "fixed",
          top: tipPos.top,
          left: tipPos.left,
          transform: tipPos.transform,
          width: TIP_W,
          maxWidth: "calc(100vw - 32px)",
          background: "var(--panel, #141414)",
          border: "1px solid var(--brand-2, #00ffa3)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          padding: "18px 20px 14px",
          pointerEvents: "auto",
          zIndex: 9001,
        }}
      >
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, marginBottom: 14, alignItems: "center" }}>
          {steps.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === stepIndex ? 14 : 7,
                height: 7,
                borderRadius: 4,
                background: i === stepIndex
                  ? "var(--brand-2, #00ffa3)"
                  : i < stepIndex
                  ? "var(--text-2, #888)"
                  : "var(--panel-3, #2a2a2a)",
                transition: "all 0.2s ease",
              }}
              aria-hidden="true"
            />
          ))}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--brand-2, #00ffa3)",
              letterSpacing: "0.06em",
            }}
          >
            {stepLabel}
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--text, #f0f0f0)",
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>

        {/* Body */}
        <div
          style={{
            fontSize: 12,
            color: "var(--text-2, #aaa)",
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          {body}
        </div>

        {/* Disclaimer */}
        <div
          style={{
            fontSize: 10,
            color: "var(--muted, #666)",
            fontStyle: "italic",
            marginBottom: 14,
            lineHeight: 1.4,
          }}
        >
          {disclaimer}
        </div>

        {/* Nav row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Skip */}
          <button
            onClick={stop}
            style={BTN_GHOST}
          >
            {t("btnSkip")}
          </button>

          <div style={{ flex: 1 }} />

          {/* Back */}
          <button
            onClick={back}
            disabled={isFirst}
            style={{ ...BTN_SECONDARY, opacity: isFirst ? 0.35 : 1 }}
          >
            {t("btnBack")}
          </button>

          {/* Next / Finish */}
          <button
            onClick={next}
            style={BTN_PRIMARY}
          >
            {isLast ? t("btnFinish") : t("btnNext")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Button styles ─────────────────────────────────────────────────────────────

const BTN_BASE: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 14px",
  lineHeight: 1,
  transition: "opacity 0.15s ease",
};

const BTN_PRIMARY: React.CSSProperties = {
  ...BTN_BASE,
  background: "var(--brand-2, #00ffa3)",
  color: "#000",
};

const BTN_SECONDARY: React.CSSProperties = {
  ...BTN_BASE,
  background: "var(--panel-3, #2a2a2a)",
  color: "var(--text, #f0f0f0)",
  border: "1px solid var(--line, #333)",
};

const BTN_GHOST: React.CSSProperties = {
  ...BTN_BASE,
  background: "transparent",
  color: "var(--muted, #666)",
  fontSize: 11,
  padding: "4px 8px",
};
