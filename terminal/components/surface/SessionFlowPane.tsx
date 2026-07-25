"use client";
/**
 * SessionFlowPane — session premium-flow chart from the Tide payload's per-minute series.
 *
 * The Tide feed already carries per-minute CUMULATIVE net call / net put premium
 * (`minutes[].ncp` / `.npp`) that the Tide tab plots as two areas. This pane adds the
 * quanted "Premium Flow / Net Delta — Session" controls the tab lacks:
 *   - side:  C+P | Calls | Puts
 *   - mode:  cumulative | per-min
 *   - off open: rebase to the 9:30 open (Δ since open)
 *   - fill:  filled areas vs lines
 *   - absolute: magnitude comparison
 *
 * All series math is the pure composeSessionSeries (lib/surfaceContract), unit-tested.
 * Sign colors are var(--up)/var(--down) resolved at runtime (East-Asian flip aware) —
 * never a hardcoded hex. Registered as a sub-toggle of the Tide tab (smaller diff than a
 * new top-level tab; see PR body).
 */

import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, LineSeries, AreaSeries,
  type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";
import { useLang } from "@/lib/i18n";
import {
  composeSessionSeries,
  type SessionPoint,
  type SessionMode,
  type SessionSide,
} from "@/lib/surfaceContract";
import { sessionEpoch } from "@/lib/intradayShared";
import { makeSurfaceT } from "./surfaceStrings";

interface TideMinuteLite { t: string; ncp: number; npp: number }

function css(n: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}


function fmtPrem(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
  return `$${a.toFixed(0)}`;
}

export const SessionFlowPane = memo(function SessionFlowPane({
  minutes, sessionDate, height = 260,
}: {
  minutes: TideMinuteLite[];
  sessionDate?: string;
  height?: number;
}) {
  const { lang } = useLang();
  const t = makeSurfaceT(lang);

  const [side, setSide] = useState<SessionSide>("cp");
  const [mode, setMode] = useState<SessionMode>("cumulative");
  const [offOpen, setOffOpen] = useState(false);
  const [fill, setFill] = useState(true);
  const [absolute, setAbsolute] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const callRef = useRef<ISeriesApi<"Line" | "Area"> | null>(null);
  const putRef = useRef<ISeriesApi<"Line" | "Area"> | null>(null);

  // Raw cumulative series from the tide minutes.
  const cumulative: SessionPoint[] = useMemo(
    () => minutes.map((m) => ({ t: m.t, call: m.ncp, put: m.npp })),
    [minutes],
  );

  const series = useMemo(
    () => composeSessionSeries(cumulative, { mode, offOpen, absolute }),
    [cumulative, mode, offOpen, absolute],
  );

  // Chip totals: last cumulative point (raw, not rebased) for an honest running total.
  const totals = useMemo(() => {
    const last = cumulative[cumulative.length - 1];
    return { call: last?.call ?? 0, put: last?.put ?? 0 };
  }, [cumulative]);

  // Rebuild the chart on any data/toggle change (matches TideChart's teardown idiom).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const valid = series.filter((p, i, a) => i === 0 || p.t !== a[i - 1].t);
    if (valid.length < 2) {
      if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; }
      return;
    }

    const date = sessionDate || new Date().toISOString().slice(0, 10);
    // Display-epoch convention, shared with the surface field and the candle feed (B11) —
    // see lib/intradayShared sessionEpoch. Anchoring to the true UTC instant instead made
    // this pane's axis read 14:00–19:45 for a 09:30–15:45 ET session.
    const toTs = (hhmm: string): Time => sessionEpoch(date, hhmm) as unknown as Time;

    // Directional tokens (East-Asian flip aware) — never a hardcoded direction hex.
    const up = css("--up");
    const down = css("--down");

    if (chartRef.current) { try { chartRef.current.remove(); } catch {} }
    const chart = createChart(el, {
      width: el.clientWidth || 700,
      height,
      layout: { background: { color: "transparent" }, textColor: css("--muted") || "#868d9c", fontSize: 10, attributionLogo: false },
      grid: {
        vertLines: { color: css("--grid") || "rgba(255,255,255,0.04)" },
        horzLines: { color: css("--grid") || "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(214,218,227,.3)", labelBackgroundColor: css("--panel-3") || "#1a1d24" },
        horzLine: { color: "rgba(214,218,227,.3)", labelBackgroundColor: css("--panel-3") || "#1a1d24" },
      },
      rightPriceScale: {
        borderColor: css("--line") || "#242832",
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: { borderColor: css("--line") || "#242832", timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: (v: number) => fmtPrem(v) },
    });
    chartRef.current = chart;

    const showCall = side === "cp" || side === "calls";
    const showPut = side === "cp" || side === "puts";

    if (showCall) {
      if (fill) {
        const s = chart.addSeries(AreaSeries, {
          lineColor: up, topColor: `${up}44`, bottomColor: `${up}05`,
          lineWidth: 2 as never, priceLineVisible: false, lastValueVisible: true, title: t("sessionCalls"),
        });
        s.setData(valid.map((p) => ({ time: toTs(p.t), value: p.call })));
        callRef.current = s;
      } else {
        const s = chart.addSeries(LineSeries, {
          color: up, lineWidth: 2 as never, priceLineVisible: false, lastValueVisible: true, title: t("sessionCalls"),
        });
        s.setData(valid.map((p) => ({ time: toTs(p.t), value: p.call })));
        callRef.current = s;
      }
    }
    if (showPut) {
      if (fill) {
        const s = chart.addSeries(AreaSeries, {
          lineColor: down, topColor: `${down}05`, bottomColor: `${down}44`,
          lineWidth: 2 as never, priceLineVisible: false, lastValueVisible: true, title: t("sessionPuts"),
          invertFilledArea: !absolute, // puts are ≤0 (fill downward) unless in absolute mode
        });
        s.setData(valid.map((p) => ({ time: toTs(p.t), value: p.put })));
        putRef.current = s;
      } else {
        const s = chart.addSeries(LineSeries, {
          color: down, lineWidth: 2 as never, priceLineVisible: false, lastValueVisible: true, title: t("sessionPuts"),
        });
        s.setData(valid.map((p) => ({ time: toTs(p.t), value: p.put })));
        putRef.current = s;
      }
    }

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      if (el && chartRef.current) chartRef.current.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch {}
      chartRef.current = null;
      callRef.current = null;
      putRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, side, fill, absolute, sessionDate, height, lang]);

  const pts = series.length;
  const hasData = pts >= 2;

  return (
    <div style={PANE}>
      {/* Controls */}
      <div style={CONTROLS}>
        <div style={GROUP} role="group" aria-label={t("sessionSideAria")}>
          {(["cp", "calls", "puts"] as SessionSide[]).map((s) => (
            <button key={s} className={`obs-chip${side === s ? " on" : ""}`} style={CHIP}
              aria-pressed={side === s} onClick={() => setSide(s)}>
              {s === "cp" ? t("sessionCP") : s === "calls" ? t("sessionCalls") : t("sessionPuts")}
            </button>
          ))}
        </div>
        <div style={GROUP} role="group" aria-label={t("sessionModeAria")}>
          {(["cumulative", "permin"] as SessionMode[]).map((m) => (
            <button key={m} className={`obs-chip${mode === m ? " on" : ""}`} style={CHIP}
              aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "cumulative" ? t("sessionCumulative") : t("sessionPerMin")}
            </button>
          ))}
        </div>
        <button className={`obs-chip${offOpen ? " on" : ""}`} style={CHIP}
          aria-pressed={offOpen} onClick={() => setOffOpen((v) => !v)}>
          {t("sessionOffOpen")}
        </button>
        <button className={`obs-chip${fill ? " on" : ""}`} style={CHIP}
          aria-pressed={fill} onClick={() => setFill((v) => !v)}>
          {t("sessionFill")}
        </button>
        <button className={`obs-chip${absolute ? " on" : ""}`} style={CHIP}
          aria-pressed={absolute} onClick={() => setAbsolute((v) => !v)}>
          {t("sessionAbsolute")}
        </button>

        {/* Totals chips */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, fontSize: 11 }}>
          <span style={{ color: "var(--up)", fontVariantNumeric: "tabular-nums" }}>
            {t("sessionCallsChip")} {fmtPrem(totals.call)}
          </span>
          <span style={{ color: "var(--down)", fontVariantNumeric: "tabular-nums" }}>
            {t("sessionPutsChip")} {fmtPrem(totals.put)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: "relative", flex: 1, minHeight: height }}>
        <div ref={wrapRef} style={{ width: "100%", height }} />
        {!hasData && <div style={EMPTY}>{t("sessionEmpty")}</div>}
      </div>

      {/* Footnote */}
      <div style={FOOTNOTE}>
        {t("sessionFootnote")}
        {offOpen && <span style={{ color: "var(--muted)" }}> · {t("sessionOffOpenNote")}</span>}
        <span style={{ color: "var(--muted)" }}> · {pts} {t("sessionPts")}</span>
      </div>
    </div>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const PANE: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };

const CONTROLS: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" };

const GROUP: React.CSSProperties = { display: "flex", gap: 3 };

const CHIP: React.CSSProperties = { height: 24, fontSize: 11, fontWeight: 600, padding: "0 9px" };

const EMPTY: React.CSSProperties = {
  position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--muted)", fontSize: 12, pointerEvents: "none",
};

const FOOTNOTE: React.CSSProperties = { fontSize: 10, color: "var(--text-2)", fontVariantNumeric: "tabular-nums" };
