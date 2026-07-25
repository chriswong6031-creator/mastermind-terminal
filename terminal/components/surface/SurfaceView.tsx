"use client";
/**
 * SurfaceView — the "Surface" tab shell: a ticker picker + the replay-driven SurfacePane
 * with the ReplayBar docked at the bottom, all under one ReplayProvider so the scrubber
 * time-travels the pane group (and, in Wave 2, the session pane + ladder via the same
 * asOfStamp).
 *
 * Registered in OptionsHubView under the "surface" tab (dynamic import, ssr:false).
 */

import React, { useState } from "react";
import { useLang } from "@/lib/i18n";
import { trackSearch } from "@/lib/searchTrack";
import { ReplayProvider, useReplay } from "./replayContext";
import { SurfacePane } from "./SurfacePane";
import { ReplayBar } from "./ReplayBar";
import { makeSurfaceT } from "./surfaceStrings";

// Only roots the materializer builds a surface for (Wave 1: the liquid indices).
const SURFACE_ROOTS = ["SPY", "QQQ", "IWM"];

function GroupRoot({ root }: { root: string }) {
  const { lang } = useLang();
  const { bindGroupRef } = useReplay();
  return (
    <div ref={bindGroupRef} tabIndex={-1} style={GROUP_ROOT}>
      <SurfacePane root={root} />
      <ReplayBar lang={lang} />
    </div>
  );
}

export function SurfaceView() {
  const { lang } = useLang();
  const t = makeSurfaceT(lang);
  const [root, setRoot] = useState("SPY");
  const [inputVal, setInputVal] = useState("SPY");

  // Plain handler — the React Compiler memoizes; a manual useCallback trips
  // preserve-manual-memoization here.
  const commit = () => {
    const r = inputVal.trim().toUpperCase();
    if (r && r !== root) { trackSearch(r, "surface"); setRoot(r); }
  };

  return (
    <div style={OUTER} className="obs obs-ambient">
      {/* Header: title + ticker picker */}
      <div style={HEAD}>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span style={TITLE}>{t("surfaceTitle")}</span>
          <span style={SUBTITLE}>{t("surfaceSubtitle")}</span>
        </div>
        <div style={TICKER_GROUP}>
          <input
            style={TICKER_INPUT}
            list="surface-roots"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value.toUpperCase())}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
            aria-label={t("surfaceTitle")}
            spellCheck={false}
            maxLength={12}
          />
          <datalist id="surface-roots">
            {SURFACE_ROOTS.map((r) => <option key={r} value={r} />)}
          </datalist>
          <div style={{ display: "flex", gap: 4 }}>
            {SURFACE_ROOTS.map((r) => (
              <button key={r} className={`chip${root === r ? " on" : ""}`}
                style={{ height: 24, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}
                onClick={() => { if (r !== root) trackSearch(r, "surface"); setInputVal(r); setRoot(r); }}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pane group under one replay provider. Keyed by root so a ticker change remounts
          the pane group and re-seeds the replay stamps cleanly. */}
      <ReplayProvider key={root}>
        <GroupRoot root={root} />
      </ReplayProvider>
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
