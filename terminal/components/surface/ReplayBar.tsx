"use client";
/**
 * ReplayBar — the global-to-the-pane-group replay scrubber.
 *
 * session picker · ⏮ ◀ ▶(Space) ⏭ · speeds 1x/2x/4x/8x · scrubber (with session-structure
 * bands) · frame counter · LIVE badge (pulsing obs-live-dot at the head of the live session)
 * or an archived-session badge. All state lives in replayContext (lib/replayEngine reducer);
 * keyboard Home/End/Space/←/→ are bound in the provider. This component is pure display +
 * dispatch — no timers of its own.
 *
 * The session picker is rendered only when the caller supplies archived sessions (i.e. the
 * sessions index resolved and lists a day behind today). With no index the bar is byte-for-byte
 * the today-only control it always was.
 */

import React from "react";
import { useReplay } from "./replayContext";
import { makeSurfaceT } from "./surfaceStrings";
import type { SurfaceKey } from "./surfaceStrings";
import { REPLAY_SPEEDS, fmtStamp, sessionBands, type ScrubberBandKey } from "@/lib/replayEngine";
import type { Lang } from "@/lib/i18n";

/** Label + aria key per session-structure band. */
const BAND_STR: Record<ScrubberBandKey, { label: SurfaceKey; aria: SurfaceKey }> = {
  open: { label: "bandOpen", aria: "bandOpenAria" },
  power: { label: "bandPower", aria: "bandPowerAria" },
  close: { label: "bandClose", aria: "bandCloseAria" },
};

export function ReplayBar({
  lang,
  sessions = [],
  onSessionDate,
}: {
  lang: Lang;
  /** Archived session dates, newest first. Empty → no picker (today-only, unchanged). */
  sessions?: string[];
  onSessionDate?: (date: string | null) => void;
}) {
  const t = makeSurfaceT(lang);
  // `sessionDate` comes from the context, not a prop, so the picker's value and the badge
  // can never disagree about which session is actually loaded.
  const { state, dispatch, asOfStamp, live, archived, sessionDate } = useReplay();
  const { stamps, frame, playing, speed } = state;
  const hasFrames = stamps.length > 0;
  const bands = sessionBands(stamps);
  const showPicker = sessions.length > 0 && !!onSessionDate;

  return (
    <div style={BAR} role="group" aria-label="replay">
      {/* Session picker — multi-day replay. A native select keeps the keyboard and the
          mobile pickers for free, and stays out of the replay keybinds (the provider
          ignores keys while a form control has focus). */}
      {showPicker && (
        <select
          style={SESSION_SELECT}
          className="num"
          aria-label={t("sessionPickerAria")}
          value={sessionDate ?? ""}
          onChange={(e) => onSessionDate!(e.target.value || null)}
        >
          <option value="">{t("sessionToday")}</option>
          {sessions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      )}

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

      {/* Scrubber + its session-structure rail. The rail is an annotation strip above the
          track, not an overlay on it: a native range input insets its own track by half a
          thumb, and a strip that pretended to align pixel-exactly with the handle would be
          claiming a precision it doesn't have. The exact time always reads out to the right. */}
      <div style={SCRUB_WRAP}>
        {hasFrames && bands.length > 0 && (
          <div style={BAND_RAIL} role="group" aria-label={t("bandsAria")}>
            {bands.map((b) => {
              const isSpan = b.to > b.from;
              const s = BAND_STR[b.key];
              // Label placement, by what the landmark is and where it sits. A full session
              // crowds power hour and the bell into the last ~15% of the track, so the three
              // labels each claim a different side and never stack:
              //   span   → OUTSIDE its left edge, in the empty pre-15:00 stretch;
              //   marker past the midpoint (the bell) → left of its tick, inside the rail;
              //   marker before it (the open) → right of its tick.
              const labelPos: React.CSSProperties = isSpan
                ? { right: "100%", marginRight: 3 }
                : b.from > 0.5
                ? { right: 0 }
                : { left: 0 };
              return (
                <span
                  key={b.key}
                  style={{
                    ...(isSpan ? BAND_SPAN : BAND_MARK),
                    left: `${b.from * 100}%`,
                    ...(isSpan ? { width: `${(b.to - b.from) * 100}%` } : null),
                  }}
                  aria-label={t(s.aria)}
                >
                  <span style={{ ...BAND_LABEL, ...labelPos }}>{t(s.label)}</span>
                </span>
              );
            })}
          </div>
        )}
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
      </div>

      {/* Time + frame counter + LIVE / archived-session badge */}
      <div style={READOUT}>
        {hasFrames ? (
          <>
            <span style={STAMP_TXT} className="num">{fmtStamp(asOfStamp)}</span>
            <span style={FRAME_TXT} className="num">
              {frame + 1}/{stamps.length} {t("replayFrameOf")}
            </span>
            {/* An archived session is never LIVE, at its head or anywhere else — the badge
                names the day being replayed instead of claiming the present. */}
            {archived ? (
              <span style={ARCHIVED_BADGE}>
                <span className="num" style={{ fontWeight: 800 }}>{sessionDate}</span>
                <span style={ARCHIVED_WORD}>{t("sessionArchived")}</span>
              </span>
            ) : live ? (
              <span style={LIVE_BADGE}>
                <span className="obs-live-dot" style={{ marginRight: 5 }} />
                {t("replayLive")}
              </span>
            ) : null}
          </>
        ) : (
          <span style={{ ...FRAME_TXT, color: "var(--muted)" }}>
            {archived ? t("sessionEmptyArchive") : t("replayNoFrames")}
          </span>
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

const SESSION_SELECT: React.CSSProperties = {
  height: 24,
  maxWidth: 148,
  padding: "0 6px",
  background: "var(--inset)",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm, 6px)",
  color: "var(--text)",
  fontSize: 11,
  fontWeight: 600,
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
};

const SCRUB_WRAP: React.CSSProperties = {
  flex: 1,
  minWidth: 140,
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

const SCRUB: React.CSSProperties = {
  width: "100%",
  margin: 0,
  height: 4,
  accentColor: "var(--brand)",
  cursor: "pointer",
};

const BAND_RAIL: React.CSSProperties = {
  position: "relative",
  height: 11,
  pointerEvents: "none",
};

/** A zero-width landmark (open / close): a hairline tick with its label beside it. */
const BAND_MARK: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 1,
  background: "color-mix(in srgb, var(--text-2) 55%, transparent)",
};

/** A spanned window (power hour): a tinted block across its share of the track. */
const BAND_SPAN: React.CSSProperties = {
  position: "absolute",
  top: 2,
  bottom: 0,
  background: "color-mix(in srgb, var(--signal) 16%, transparent)",
  borderLeft: "1px solid color-mix(in srgb, var(--signal) 55%, transparent)",
  borderRadius: 2,
};

const BAND_LABEL: React.CSSProperties = {
  position: "absolute",
  top: 0,
  fontSize: 7.5,
  lineHeight: "10px",
  fontWeight: 700,
  letterSpacing: "0.07em",
  color: "var(--muted)",
  whiteSpace: "nowrap",
  padding: "0 3px",
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

/** Replaces the LIVE badge while a past session is loaded. Deliberately NOT a direction
 *  colour — a replayed day is neither up nor down, and --up/--down flip by language. */
const ARCHIVED_BADGE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 10,
  color: "var(--text-2)",
  padding: "2px 7px",
  border: "1px solid var(--line)",
  borderRadius: "var(--r-sm, 6px)",
  background: "var(--inset)",
};

const ARCHIVED_WORD: React.CSSProperties = {
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--muted)",
};
