"use client";
/**
 * SurfaceView — the Surface tab: the paint field as the hub's flagship workspace.
 *
 * Layout (single view):
 *   root picker + view toggle + Style popover      ← toolbar
 *   pinned-strike chips                            ← only once something is pinned
 *   SurfacePane (the paint field, large)
 *   ReplayBar                                      ← drives everything below it in time
 *   SessionFlowPane                                ← the session's premium tide, same width
 *
 * Quad view swaps the single field for a 2×2 of Net Prem / Gamma / Vanna / Charm. All four
 * sit inside ONE ReplayProvider, so the single scrubber time-travels the whole grid, and
 * inside a SurfaceSyncProvider, so a crosshair in any cell lights the same strike-minute in
 * the other three. A greek the snapshot doesn't carry holds its slot and says "accruing"
 * rather than quietly rendering a second copy of Net Premium.
 *
 * Root honesty: only SURFACE_ROOTS are materialised, so the picker offers exactly those and
 * anything else lands on a plain "no surface for X yet" state instead of an empty chart.
 */

import React, { useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { trackSearch } from "@/lib/searchTrack";
import { useFlowStream } from "@/lib/flowStream";
import { ReplayProvider, useReplay } from "./replayContext";
import { SurfacePane } from "./SurfacePane";
import { ReplayBar } from "./ReplayBar";
import { SessionFlowPane } from "./SessionFlowPane";
import { SurfaceSyncProvider } from "./surfaceSync";
import { SurfaceStylePopover } from "./SurfaceStylePopover";
import { makeSurfaceT } from "./surfaceStrings";
import {
  surfaceThemeVars,
  loadTheme,
  saveTheme,
  themeSignature,
  type SurfaceTheme,
} from "./surfaceTheme";
import { addPin, removePin, pinId, type SurfacePin } from "./surfacePins";

// Only roots the materializer builds a surface for (Wave 1: the liquid indices).
const SURFACE_ROOTS = ["SPY", "QQQ", "IWM"];

/** The quad's four cells, in reading order. `gex` is the gamma grid's snapshot key. */
const QUAD_METRICS = ["netprem", "gex", "vanna", "charm"] as const;

type ViewMode = "single" | "quad";

interface TideLite { t: string; ncp: number; npp: number }
interface TidePayload { minutes?: TideLite[]; session_date?: string }

/**
 * The pane group under one ReplayProvider. Bound to the group ref so the replay keybinds
 * (Space / arrows / Home / End) only fire while this group is engaged.
 */
function GroupRoot({
  root, view, aggMin, themeSig, pins, onTogglePin, tideMinutes, tideDate,
}: {
  root: string;
  view: ViewMode;
  aggMin: number;
  themeSig: string;
  pins: SurfacePin[];
  onTogglePin: (strike: number, metric: string, value: number | null) => void;
  tideMinutes: TideLite[];
  tideDate?: string;
}) {
  const { lang } = useLang();
  const { bindGroupRef } = useReplay();
  const [sessionOpen, setSessionOpen] = useState(true);

  return (
    <div ref={bindGroupRef} tabIndex={-1} style={GROUP_ROOT}>
      {view === "single" ? (
        <SurfacePane
          root={root}
          themeSig={themeSig}
          pins={pins}
          onTogglePin={onTogglePin}
        />
      ) : (
        <SurfaceSyncProvider>
          <div className="obs-surf-quad" role="group" aria-label={makeSurfaceT(lang)("quadAria")}>
            {QUAD_METRICS.map((m) => (
              <div className="obs-surf-quad-cell" key={m}>
                <SurfacePane
                  root={root}
                  fixedMetric={m}
                  chrome="cell"
                  syncId={m}
                  aggMinOverride={aggMin}
                  themeSig={themeSig}
                  pins={pins}
                  onTogglePin={onTogglePin}
                />
              </div>
            ))}
          </div>
        </SurfaceSyncProvider>
      )}

      <ReplayBar lang={lang} />

      {/* The session's premium tide, under the same scrubber. Collapsible and capped so the
          paint field — the reason this tab exists — always keeps the bulk of the height. */}
      {tideMinutes.length > 0 && (
        <div style={SESSION_WRAP}>
          <button
            style={SESSION_TOGGLE}
            aria-expanded={sessionOpen}
            onClick={() => setSessionOpen((v) => !v)}
          >
            <span style={{ transform: sessionOpen ? "rotate(90deg)" : "none", transition: "transform 120ms" }} aria-hidden>›</span>
            {makeSurfaceT(lang)("sessionTitle")}
          </button>
          {sessionOpen && (
            <SessionFlowPane minutes={tideMinutes} sessionDate={tideDate} height={150} />
          )}
        </div>
      )}
    </div>
  );
}

export function SurfaceView() {
  const { lang } = useLang();
  const t = makeSurfaceT(lang);
  const [root, setRoot] = useState("SPY");
  const [inputVal, setInputVal] = useState("SPY");
  /** A root the user asked for that has no materialised surface (honest dead-end state). */
  const [missingRoot, setMissingRoot] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("single");
  const [aggMin, setAggMin] = useState(5);
  const [pins, setPins] = useState<SurfacePin[]>([]);
  // Restored from localStorage in the initializer. Safe because OptionsHubView loads this
  // view with `ssr: false`, so there is no server render to mismatch against — and
  // loadTheme is SSR-safe anyway (no window → DEFAULT_THEME).
  const [theme, setTheme] = useState<SurfaceTheme>(loadTheme);
  const [styleOpen, setStyleOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // The session tide feeds the pane under the field. Same stream the Tide tab uses.
  const { data: tide } = useFlowStream<TidePayload>("tide");
  const tideMinutes = Array.isArray(tide?.minutes) ? tide!.minutes! : [];

  // ── Theme → CSS custom properties on the surface root ────────────────────────
  // Applied as INLINE STYLE during render, not from an effect. React commits style before
  // running effects, and child effects run before the parent's — so an effect here would set
  // the variables AFTER the panes had already re-resolved them, and the field would keep its
  // old palette while the legend switched (which is exactly what it did). Rendering the
  // properties means the new values are on the DOM before any pane reads them.
  const themeSig = themeSignature(theme);
  const themeVars = surfaceThemeVars(theme) as React.CSSProperties;

  function commitTheme(next: SurfaceTheme) {
    setTheme(next);
    saveTheme(next);
  }

  // Plain handlers — the React Compiler memoizes; a manual useCallback trips
  // preserve-manual-memoization here.
  const commit = () => {
    const r = inputVal.trim().toUpperCase();
    if (!r || r === root) return;
    // Root honesty: only the materialised roots have a field. Anything else gets told so
    // by name, rather than being switched to and left staring at an empty chart.
    if (!SURFACE_ROOTS.includes(r)) { setMissingRoot(r); return; }
    trackSearch(r, "surface");
    setMissingRoot(null);
    setRoot(r);
  };

  const selectRoot = (r: string) => {
    if (r !== root) trackSearch(r, "surface");
    setMissingRoot(null);
    setInputVal(r);
    setRoot(r);
  };

  const togglePin = (strike: number, metric: string, value: number | null) => {
    setPins((prev) =>
      prev.some((p) => p.id === pinId(strike))
        ? removePin(prev, pinId(strike))
        : addPin(prev, { id: pinId(strike), strike, metric, value }),
    );
  };

  return (
    <div ref={rootRef} style={{ ...OUTER, ...themeVars }} className="obs obs-ambient">
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div style={HEAD}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={TITLE}>{t("surfaceTitle")}</span>
          <span style={SUBTITLE}>{t("surfaceSubtitle")}</span>
        </div>

        <div style={TOOLS}>
          {/* View: single field vs the 2×2 metric grid */}
          <div style={GROUP} role="group" aria-label={t("viewAria")}>
            <button className={`obs-chip${view === "single" ? " on" : ""}`} style={CHIP}
              aria-pressed={view === "single"} onClick={() => setView("single")}>
              {t("viewSingle")}
            </button>
            <button className={`obs-chip${view === "quad" ? " on" : ""}`} style={CHIP}
              aria-pressed={view === "quad"} onClick={() => setView("quad")}>
              {t("viewQuad")}
            </button>
          </div>

          {/* Quad's shared aggregation (the single view keeps its own in-pane control). */}
          {view === "quad" && (
            <div style={GROUP} role="group" aria-label={t("aggAria")}>
              {[1, 5, 15, 30].map((m) => (
                <button key={m} className={`obs-chip${aggMin === m ? " on" : ""}`} style={CHIP}
                  aria-pressed={aggMin === m} onClick={() => setAggMin(m)}>
                  {t(m === 1 ? "agg1m" : m === 5 ? "agg5m" : m === 15 ? "agg15m" : "agg30m")}
                </button>
              ))}
            </div>
          )}

          <SurfaceStylePopover
            lang={lang}
            theme={theme}
            open={styleOpen}
            onOpenChange={setStyleOpen}
            onChange={commitTheme}
          />

          {/* Root picker — the materialised roots, plus a free-text box that tells the
              truth about anything else. */}
          <div style={TICKER_GROUP}>
            <input
              style={TICKER_INPUT}
              list="surface-roots"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value.toUpperCase())}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
              aria-label={t("rootPickerAria")}
              spellCheck={false}
              maxLength={12}
            />
            <datalist id="surface-roots">
              {SURFACE_ROOTS.map((r) => <option key={r} value={r} />)}
            </datalist>
            <div style={{ display: "flex", gap: 4 }}>
              {SURFACE_ROOTS.map((r) => (
                <button key={r} className={`chip${root === r && !missingRoot ? " on" : ""}`}
                  style={{ height: 24, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}
                  onClick={() => selectRoot(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Pinned strike chips ──────────────────────────────────────────────── */}
      {pins.length > 0 && (
        <div className="obs-surf-pins" role="group" aria-label={t("pinnedAria")}>
          <span className="obs-surf-pins-lbl">{t("pinnedLabel")}</span>
          {pins.map((p) => (
            <span className="obs-surf-pin-chip" key={p.id}>
              {p.strike}
              <button
                className="obs-surf-pin-x"
                onClick={() => setPins((prev) => removePin(prev, p.id))}
                aria-label={`${t("pinnedRemoveAria")} ${p.strike}`}
              >
                ×
              </button>
            </span>
          ))}
          <span className="obs-surf-pins-note">{t("pinnedSessionNote")}</span>
          <button className="obs-surf-pins-clear" onClick={() => setPins([])}>
            {t("pinnedClearAll")}
          </button>
        </div>
      )}

      {/* ── Field ────────────────────────────────────────────────────────────── */}
      {missingRoot ? (
        <div className="obs-surf-noroot">
          <div className="obs-surf-noroot-hd">
            {t("rootNoSurface").replace("{sym}", missingRoot)}
          </div>
          <div className="obs-surf-noroot-sub">{t("rootNoSurfaceHint")}</div>
          <div className="obs-surf-noroot-roots">
            {SURFACE_ROOTS.map((r) => (
              <button key={r} className="chip"
                style={{ height: 26, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em" }}
                onClick={() => selectRoot(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Keyed by root AND view so a ticker change re-seeds the replay stamps cleanly and
           a layout switch gives the new charts a fresh mount. */
        <ReplayProvider key={`${root}:${view}`}>
          <GroupRoot
            root={root}
            view={view}
            aggMin={aggMin}
            themeSig={themeSig}
            pins={pins}
            onTogglePin={togglePin}
            tideMinutes={tideMinutes}
            tideDate={tide?.session_date}
          />
        </ReplayProvider>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const OUTER: React.CSSProperties = {
  display: "flex", flexDirection: "column", flex: 1, height: "100%", overflow: "hidden", background: "var(--bg)",
};

const HEAD: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  padding: "8px 14px", borderBottom: "1px solid var(--line)", background: "var(--panel)", flexShrink: 0, flexWrap: "wrap",
};

const TOOLS: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" };

const GROUP: React.CSSProperties = { display: "flex", gap: 3, alignItems: "center" };

const CHIP: React.CSSProperties = { height: 24, minWidth: 30, fontSize: 11, fontWeight: 600, padding: "0 9px" };

const TITLE: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: "0.01em" };

const SUBTITLE: React.CSSProperties = { fontSize: 10.5, color: "var(--muted)" };

const TICKER_GROUP: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8 };

const TICKER_INPUT: React.CSSProperties = {
  width: 110, height: 30, padding: "0 10px",
  background: "var(--inset)", border: "1px solid var(--line)", borderRadius: "var(--r-md)",
  color: "var(--text)", fontSize: 13, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", outline: "none", fontVariantNumeric: "tabular-nums",
};

const GROUP_ROOT: React.CSSProperties = { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, outline: "none" };

const SESSION_WRAP: React.CSSProperties = {
  flexShrink: 0, borderTop: "1px solid var(--line)", background: "var(--panel)",
};

const SESSION_TOGGLE: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, width: "100%",
  padding: "6px 14px", border: 0, background: "none", cursor: "pointer",
  font: "700 9.5px/1 var(--font-ui)", letterSpacing: "0.09em", textTransform: "uppercase",
  color: "var(--muted)", textAlign: "left",
};
