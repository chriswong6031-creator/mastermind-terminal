"use client";
/**
 * ReplayBar — the global-to-the-pane-group replay scrubber.
 *
 * ⏮ ◀ ▶(Space) ⏭ · speeds 1x/2x/4x/8x · scrubber · frame counter · LIVE badge (pulsing
 * obs-live-dot when at head). All state lives in replayContext (lib/replayEngine reducer);
 * keyboard Home/End/Space/←/→ are bound in the provider. This component is pure display +
 * dispatch — no timers of its own.
 */

import React from "react";
import { useReplay } from "./replayContext";
import { makeSurfaceT } from "./surfaceStrings";
import { REPLAY_SPEEDS, fmtStamp } from "@/lib/replayEngine";
import type { Lang } from "@/lib/i18n";

export function ReplayBar({ lang }: { lang: Lang }) {
  const t = makeSurfaceT(lang);
  const { state, dispatch, asOfStamp, live } = useReplay();
  const { stamps, frame, playing, speed } = state;
  const hasFrames = stamps.length > 0;

  return (
    <div style={BAR} role="group" aria-label="replay">
      {/* Transport buttons */}
      <div style={BTN_GROUP}>
        <button style={ICON_BTN} aria-label={t("replayFirst")} disabled={!hasFrames}
          onClick={() => dispatch({ type: "toFirst" })}>
          <Icon d="M18 6l-6 6 6 6M8 6v12" />
        </button>
        <button style={ICON_BTN} aria-label={t("replayPrev")} disabled={!hasFrames}
          onClick={() => dispatch({ type: "stepBack" })}>
          <Icon d="M15 6l-6 6 6 6" />
        </button>
        <button style={{ ...ICON_BTN, ...PLAY_BTN }} aria-label={playing ? t("replayPause") : t("replayPlay")}
          disabled={!hasFrames} onClick={() => dispatch({ type: "togglePlay" })}>
          {playing ? <Icon d="M7 5h3v14H7zM14 5h3v14h-3z" fill /> : <Icon d="M7 5l12 7-12 7z" fill />}
        </button>
        <button style={ICON_BTN} aria-label={t("replayNext")} disabled={!hasFrames}
          onClick={() => dispatch({ type: "stepFwd" })}>
          <Icon d="M9 6l6 6-6 6" />
        </button>
        <button style={ICON_BTN} aria-label={t("replayLast")} disabled={!hasFrames}
          onClick={() => dispatch({ type: "toLast" })}>
          <Icon d="M6 6l6 6-6 6M16 6v12" />
        </button>
      </div>

      {/* Speeds */}
      <div style={SPEED_GROUP} role="group" aria-label={t("replaySpeedAria")}>
        {REPLAY_SPEEDS.map((s) => (
          <button key={s} className={`obs-chip${speed === s ? " on" : ""}`} style={SPEED_CHIP}
            aria-pressed={speed === s} onClick={() => dispatch({ type: "setSpeed", speed: s })}>
            {s}x
          </button>
        ))}
      </div>

      {/* Scrubber */}
      <input
        type="range"
        style={SCRUB}
        min={0}
        max={Math.max(0, stamps.length - 1)}
        step={1}
        value={frame}
        disabled={!hasFrames}
        aria-label={t("replayScrubAria")}
        onChange={(e) => dispatch({ type: "setFrame", frame: Number(e.target.value) })}
      />

      {/* Time + frame counter + LIVE */}
      <div style={READOUT}>
        {hasFrames ? (
          <>
            <span style={STAMP_TXT} className="num">{fmtStamp(asOfStamp)}</span>
            <span style={FRAME_TXT} className="num">
              {frame + 1}/{stamps.length} {t("replayFrameOf")}
            </span>
            {live ? (
              <span style={LIVE_BADGE}>
                <span className="obs-live-dot" style={{ marginRight: 5 }} />
                {t("replayLive")}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ ...FRAME_TXT, color: "var(--muted)" }}>{t("replayNoFrames")}</span>
        )}
      </div>
    </div>
  );
}

function Icon({ d, fill }: { d: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14"
      fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BAR: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "6px 12px",
  borderTop: "1px solid var(--line)",
  background: "var(--panel)",
  flexShrink: 0,
  flexWrap: "wrap",
};

const BTN_GROUP: React.CSSProperties = { display: "flex", alignItems: "center", gap: 2 };

const ICON_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 26,
  borderRadius: "var(--r-sm, 6px)",
  border: "1px solid var(--line)",
  background: "var(--inset)",
  color: "var(--text-2)",
  cursor: "pointer",
};

const PLAY_BTN: React.CSSProperties = {
  color: "var(--text)",
  background: "color-mix(in srgb, var(--brand) 18%, transparent)",
  borderColor: "color-mix(in srgb, var(--brand) 40%, transparent)",
  width: 32,
};

const SPEED_GROUP: React.CSSProperties = { display: "flex", gap: 3 };

const SPEED_CHIP: React.CSSProperties = { height: 22, minWidth: 26, fontSize: 10, padding: "0 6px" };

const SCRUB: React.CSSProperties = {
  flex: 1,
  minWidth: 140,
  height: 4,
  accentColor: "var(--brand)",
  cursor: "pointer",
};

const READOUT: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 11,
  whiteSpace: "nowrap",
};

const STAMP_TXT: React.CSSProperties = {
  color: "var(--text)",
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  fontFamily: "var(--font-num)",
};

const FRAME_TXT: React.CSSProperties = {
  color: "var(--text-2)",
  fontVariantNumeric: "tabular-nums",
};

const LIVE_BADGE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "var(--up)",
};
