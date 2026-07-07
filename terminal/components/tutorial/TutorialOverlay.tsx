"use client";
/**
 * TutorialOverlay.tsx — module picker + coach runner for the options desk tutorial.
 *
 * Props:
 *   open:           boolean — whether the overlay is mounted
 *   onClose:        () => void — called when user closes the picker
 *   initialModule?: number (1–6) — if set, skips the picker and starts this module
 *
 * Usage:
 *   <TutorialOverlay open={open} onClose={() => setOpen(false)} />
 *   <TutorialOverlay open={open} onClose={() => setOpen(false)} initialModule={1} />
 *
 * Integrator wires the launch button + optional auto-prompt elsewhere.
 * This component does NOT modify FlowDeskView or any existing component.
 *
 * HONESTY DOCTRINE: all copy is in tutorialStrings.ts. No "validated" language.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { getTutStr, makeTutT } from "@/lib/tutorial/tutorialStrings";
import { MODULES } from "@/lib/tutorial/steps";
import {
  CoachProvider,
  useCoach,
  isModuleDone,
  isModuleUnlocked,
  allDoneCount,
} from "@/lib/tutorial/coach";

// ─── Public component ─────────────────────────────────────────────────────────

interface TutorialOverlayProps {
  open: boolean;
  onClose: () => void;
  initialModule?: number;
}

export function TutorialOverlay({ open, onClose, initialModule }: TutorialOverlayProps) {
  if (!open) return null;

  return (
    <CoachProvider onModuleComplete={() => { /* progress saved by markModuleDone */ }}>
      <TutorialOverlayInner onClose={onClose} initialModule={initialModule} />
    </CoachProvider>
  );
}

// ─── Inner component (has access to CoachProvider) ────────────────────────────

interface InnerProps {
  onClose: () => void;
  initialModule?: number;
}

function TutorialOverlayInner({ onClose, initialModule }: InnerProps) {
  const { lang } = useLang();
  const t = makeTutT(lang);
  const { state, startModule, stop } = useCoach();

  // Track progress as local state so re-completions force a re-render
  const [, setProgressVersion] = useState(0);
  const bumpProgress = useCallback(() => setProgressVersion((v) => v + 1), []);

  // Auto-start if initialModule provided
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (initialModule && !didAutoStart.current) {
      didAutoStart.current = true;
      if (isModuleUnlocked(initialModule)) {
        startModule(initialModule, lang);
      }
    }
  }, [initialModule, lang, startModule]);

  // If coach is active, don't show the picker (coach renders its own overlay)
  // When coach finishes, bump progress and show picker again
  const wasActiveRef = useRef(state.active);
  useEffect(() => {
    if (wasActiveRef.current && !state.active) {
      // Coach just finished a module
      bumpProgress();
    }
    wasActiveRef.current = state.active;
  }, [state.active, bumpProgress]);

  // Close handler: stop coach + call parent onClose
  const handleClose = useCallback(() => {
    stop();
    onClose();
  }, [stop, onClose]);

  // If coach is active, only render the close backdrop fallback.
  // The actual coach UI is rendered by CoachProvider.
  if (state.active) return null;

  const doneCount = allDoneCount();

  return (
    /* Full-screen backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("tutorialTitle")}
      style={BACKDROP}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Modal card */}
      <div style={MODAL_CARD}>
        {/* Header */}
        <div style={MODAL_HEADER}>
          <div>
            <div style={MODAL_TITLE}>{t("tutorialTitle")}</div>
            <div style={MODAL_SUBTITLE}>{t("tutorialSubtitle")}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={PROGRESS_BADGE}>
              {t("moduleProgress").replace("{n}", String(doneCount))}
            </span>
            <button
              onClick={handleClose}
              style={CLOSE_BTN}
              aria-label={t("btnClose")}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={PROG_TRACK}>
          <div
            style={{
              ...PROG_FILL,
              width: `${(doneCount / 6) * 100}%`,
              transition: "width 0.4s ease",
            }}
          />
        </div>

        {/* Module grid */}
        <div style={MODULE_GRID}>
          {MODULES.map((mod) => {
            const done = isModuleDone(mod.id);
            const unlocked = isModuleUnlocked(mod.id);
            const name = getTutStr(lang, mod.nameKey);
            const sub = getTutStr(lang, mod.subKey);
            const stepCount = mod.stepIds.length;

            return (
              <ModuleCard
                key={mod.id}
                id={mod.id}
                name={name}
                sub={sub}
                stepCount={stepCount}
                done={done}
                unlocked={unlocked}
                onStart={() => {
                  startModule(mod.id, lang);
                }}
                lang={lang}
              />
            );
          })}
        </div>

        {/* Footer disclaimer */}
        <div style={FOOTER_DISCLAIMER}>
          {t("disclaimer")}
        </div>
      </div>
    </div>
  );
}

// ─── ModuleCard ───────────────────────────────────────────────────────────────

interface ModuleCardProps {
  id: number;
  name: string;
  sub: string;
  stepCount: number;
  done: boolean;
  unlocked: boolean;
  onStart: () => void;
  lang: "en" | "zh";
}

function ModuleCard({ id, name, sub, stepCount, done, unlocked, onStart, lang }: ModuleCardProps) {
  const t = makeTutT(lang);

  const stateLabel = done
    ? t("done")
    : !unlocked
    ? t("locked")
    : t("active");

  const btnLabel = done
    ? t("replayModule")
    : t("startModule");

  return (
    <div style={{ ...MODULE_CARD, opacity: unlocked ? 1 : 0.45 }}>
      {/* Module number + state badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={MODULE_NUM}>0{id}</span>
        <span
          style={{
            ...STATE_BADGE,
            background: done
              ? "var(--brand-2, #00ffa3)"
              : !unlocked
              ? "var(--panel-3, #2a2a2a)"
              : "var(--warn, #ffb300)",
            color: done ? "#000" : "var(--text-2, #aaa)",
          }}
        >
          {done ? "✓" : !unlocked ? "🔒" : "▶"} {stateLabel}
        </span>
      </div>

      {/* Name + sub */}
      <div style={MODULE_NAME}>{name}</div>
      <div style={MODULE_SUB}>{sub}</div>

      {/* Step count */}
      <div style={STEP_COUNT}>
        {stepCount} {lang === "zh" ? "步" : "steps"}
      </div>

      {/* Action button */}
      <button
        onClick={unlocked ? onStart : undefined}
        disabled={!unlocked}
        style={{
          ...MODULE_BTN,
          background: done
            ? "var(--panel-3, #2a2a2a)"
            : unlocked
            ? "var(--brand-2, #00ffa3)"
            : "var(--panel-3, #2a2a2a)",
          color: done
            ? "var(--text-2, #aaa)"
            : unlocked
            ? "#000"
            : "var(--muted, #666)",
          cursor: unlocked ? "pointer" : "not-allowed",
        }}
        aria-disabled={!unlocked}
        aria-label={unlocked ? undefined : t("locked")}
      >
        {btnLabel}
      </button>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BACKDROP: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 8900,
  background: "rgba(0,0,0,0.8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const MODAL_CARD: React.CSSProperties = {
  background: "var(--panel, #141414)",
  border: "1px solid var(--line, #333)",
  borderRadius: 12,
  width: "100%",
  maxWidth: 720,
  maxHeight: "90vh",
  overflowY: "auto",
  padding: "24px 24px 20px",
  boxShadow: "0 16px 64px rgba(0,0,0,0.8)",
};

const MODAL_HEADER: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: 16,
  gap: 12,
};

const MODAL_TITLE: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: "var(--text, #f0f0f0)",
  marginBottom: 4,
};

const MODAL_SUBTITLE: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted, #666)",
  lineHeight: 1.5,
};

const PROGRESS_BADGE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--brand-2, #00ffa3)",
  background: "var(--panel-3, #2a2a2a)",
  borderRadius: 999,
  padding: "3px 10px",
  whiteSpace: "nowrap",
};

const CLOSE_BTN: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--muted, #666)",
  fontSize: 16,
  cursor: "pointer",
  padding: "2px 6px",
  borderRadius: 4,
  lineHeight: 1,
  flexShrink: 0,
};

const PROG_TRACK: React.CSSProperties = {
  height: 3,
  background: "var(--panel-3, #2a2a2a)",
  borderRadius: 2,
  overflow: "hidden",
  marginBottom: 20,
};

const PROG_FILL: React.CSSProperties = {
  height: "100%",
  background: "var(--brand-2, #00ffa3)",
  borderRadius: 2,
};

const MODULE_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: 12,
  marginBottom: 20,
};

const MODULE_CARD: React.CSSProperties = {
  background: "var(--panel-2, #1c1c1c)",
  border: "1px solid var(--line, #333)",
  borderRadius: 8,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

const MODULE_NUM: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--muted, #666)",
  letterSpacing: "0.06em",
};

const STATE_BADGE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 999,
  padding: "2px 7px",
};

const MODULE_NAME: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "var(--text, #f0f0f0)",
  marginBottom: 3,
  marginTop: 8,
};

const MODULE_SUB: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-2, #aaa)",
  lineHeight: 1.4,
  marginBottom: 6,
};

const STEP_COUNT: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted, #666)",
  marginBottom: 12,
  flex: 1,
};

const MODULE_BTN: React.CSSProperties = {
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
  transition: "opacity 0.15s",
};

const FOOTER_DISCLAIMER: React.CSSProperties = {
  fontSize: 10,
  color: "var(--muted, #666)",
  fontStyle: "italic",
  lineHeight: 1.5,
  textAlign: "center",
  paddingTop: 8,
  borderTop: "1px solid var(--line-2, #222)",
};
