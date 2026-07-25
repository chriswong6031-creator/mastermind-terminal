"use client";
/**
 * StrikeEvolutionModal — the "Intraday Evolution" drill for a single strike (RECON §4.2),
 * in our design language. Opened by clicking a strike row in the SurfacePane.
 *
 * Shows:
 *   - a Lightweight-Charts line of that strike's active-metric value across the session's
 *     realized stamps, with a NOW marker at the last realized column. The frame passed in is
 *     already server-truncated to the replay-scrubbed stamp, so the line is replay-aware by
 *     construction (left of NOW = realized) — no forward projection is fabricated.
 *   - a horizontal "Expiry breakdown at NOW" bar list, when the matrix payload carries
 *     per-expiry cells for this strike (else the section is omitted, never faked).
 *   - a footer: spot · stamp count · Esc-to-close.
 *
 * Keyboard: Esc closes; focus is trapped inside the dialog. The layer is a fixed scrim
 * (portal-free, but position:fixed) so it never clips inside the pane's overflow.
 */

import React, { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { Lang } from "@/lib/i18n";
import {
  buildStrikeSeries,
  topExpiriesForStrike,
  type SurfaceFrame,
  type MatrixCell,
} from "@/lib/surfaceContract";
import { makeSurfaceT } from "./surfaceStrings";

interface Props {
  frame: SurfaceFrame;
  strikeIdx: number;
  metric: string;
  metricLabel: string;
  /** Column index the replay is scrubbed to; null = use the (already-truncated) frame as-is. */
  scrubbedTimeIdx: number | null;
  matrixCells: MatrixCell[] | null;
  asofLabel: string;
  lang: Lang;
  onClose: () => void;
}

function css(n: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

/** DST-aware US-Eastern offset suffix for a session date (mirrors SurfacePane). */
function etOffsetSuffix(sessionDate: string): string {
  try {
    const noonUtc = new Date(`${sessionDate}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false, timeZoneName: "shortOffset",
    }).formatToParts(noonUtc);
    const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = tz.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (m) return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
  } catch {}
  return "-04:00";
}

function fmtDollarSigned(v: number): string {
  const s = v < 0 ? "-" : "+";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function StrikeEvolutionModal({
  frame, strikeIdx, metric, metricLabel, scrubbedTimeIdx, matrixCells, asofLabel, lang, onClose,
}: Props) {
  const t = makeSurfaceT(lang);
  const chartWrap = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const series = useMemo(
    () => buildStrikeSeries(frame, strikeIdx, metric, scrubbedTimeIdx),
    [frame, strikeIdx, metric, scrubbedTimeIdx],
  );

  // Expiry breakdown at NOW — top expiries for this strike from the matrix cells (optional).
  const topExpiries = useMemo(
    () => topExpiriesForStrike(matrixCells, series.strike),
    [matrixCells, series.strike],
  );
  const expMaxAbs = useMemo(
    () => topExpiries.reduce((m, e) => Math.max(m, Math.abs(e.gex)), 0.0001),
    [topExpiries],
  );

  // ── Esc + focus trap ─────────────────────────────────────────────────────────
  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => !n.hasAttribute("disabled"),
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── LWC line: strike's metric value across realized stamps + NOW marker ──────
  useEffect(() => {
    const el = chartWrap.current;
    if (!el || series.points.length === 0) return;

    const date = frame.session_date ?? new Date().toISOString().slice(0, 10);
    const off = etOffsetSuffix(date);
    const toTs = (hhmm: string): Time => {
      const [hh, mm] = hhmm.split(":").map(Number);
      return Math.floor(
        new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00${off}`).getTime() / 1000,
      ) as unknown as Time;
    };

    const chart: IChartApi = createChart(el, {
      width: el.clientWidth || 700,
      height: el.clientHeight || 260,
      layout: { background: { color: "transparent" }, textColor: css("--muted") || "#868d9c", fontSize: 10, attributionLogo: false },
      grid: {
        vertLines: { color: css("--grid") || "rgba(255,255,255,0.04)" },
        horzLines: { color: css("--grid") || "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: "rgba(214,218,227,.3)", labelBackgroundColor: css("--panel-3") || "#1a1d24" },
        horzLine: { color: "rgba(214,218,227,.3)", labelBackgroundColor: css("--panel-3") || "#1a1d24" },
      },
      rightPriceScale: { borderColor: css("--line") || "#242832", scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: css("--line") || "#242832", timeVisible: true, secondsVisible: false },
      localization: { priceFormatter: (v: number) => fmtDollarSigned(v) },
    });

    // The line color follows sign at NOW (up when the current value is ≥0, else down) — a
    // directional read of the strike's exposure, so it honors the East-Asian flip via tokens.
    const nowVal = series.nowValue ?? 0;
    const lineColor = nowVal >= 0 ? (css("--up") || "#26c281") : (css("--down") || "#f0566b");
    const line: ISeriesApi<"Line"> = chart.addSeries(LineSeries, {
      color: lineColor, lineWidth: 2 as never, priceLineVisible: false, lastValueVisible: true, title: metricLabel,
    });
    line.setData(series.points.map((p) => ({ time: toTs(p.t), value: p.v })));

    // Zero baseline (sign flips are the read) + NOW marker at the last realized column.
    try {
      line.createPriceLine({ price: 0, color: "rgba(214,218,227,.22)", lineWidth: 1, lineStyle: 2, axisLabelVisible: false } as never);
    } catch {}
    if (series.nowT) {
      try {
        createSeriesMarkers(line, [{
          time: toTs(series.nowT),
          position: "inBar",
          color: css("--signal") || "#e8b339",
          shape: "circle",
          text: t("evoNow"),
        }] as never);
      } catch {}
    }

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      try { chart.remove(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, metricLabel, lang]);

  const strikeDisp = Number.isFinite(series.strike) ? series.strike : "—";
  const spotDisp = frame.spot != null ? frame.spot : null;

  return (
    <div
      className="obs-modal-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="obs-modal obs"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${t("evoTitle")} — ${t("evoStrike")} ${strikeDisp}`}
      >
        {/* Header */}
        <div className="obs-modal-hd">
          <div className="obs-modal-title">
            <span className="obs-lbl">{t("evoTitle")}</span>
            <b>{strikeDisp}</b>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{metricLabel} {t("evoMetricAt")}</span>
          </div>
          <button ref={closeRef} className="obs-modal-close" onClick={onClose} aria-label={t("evoCloseAria")}>
            {t("evoClose")}
          </button>
        </div>

        {/* Body */}
        <div className="obs-modal-body">
          {series.points.length > 0 ? (
            <div className="obs-modal-chart" ref={chartWrap} />
          ) : (
            <div className="obs-xdrawer-empty">{t("evoNoSeries")}</div>
          )}

          {/* Expiry breakdown at NOW — only when the matrix carries per-expiry cells. */}
          {topExpiries.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="obs-lbl" style={{ marginBottom: 7 }}>{t("evoExpiryBreakdown")}</div>
              {topExpiries.map((e) => {
                const frac = Math.abs(e.gex) / expMaxAbs;
                const isPos = e.gex >= 0;
                return (
                  <div className="obs-modal-exp-row" key={e.exp}>
                    <span className="obs-modal-exp-lbl">{e.exp.length >= 10 ? e.exp.slice(5, 10) : e.exp}</span>
                    <span className="obs-modal-exp-track">
                      <span
                        className="obs-modal-exp-bar"
                        style={{
                          left: isPos ? "50%" : undefined,
                          right: isPos ? undefined : "50%",
                          width: `${Math.max(frac * 50, frac > 0 ? 1.5 : 0)}%`,
                          background: isPos ? "var(--up)" : "var(--down)",
                        }}
                      />
                    </span>
                    <span className="obs-modal-exp-val" style={{ color: isPos ? "var(--up)" : "var(--down)" }}>
                      {fmtDollarSigned(e.gex)} <span style={{ color: "var(--muted)", fontWeight: 400 }}>{(e.share * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: spot · stamp count · Esc */}
        <div className="obs-modal-foot">
          {spotDisp != null && (
            <span>{t("evoSpot")} <b className="num" style={{ color: "var(--text)" }}>{spotDisp}</b></span>
          )}
          <span>· <b className="num" style={{ color: "var(--text)" }}>{series.total}</b> {t("evoSnapshots")}</span>
          {asofLabel && <span style={{ color: "var(--muted)" }}>· {t("asOf")} {asofLabel}</span>}
          <span style={{ marginLeft: "auto", color: "var(--muted)" }}>{t("evoEscHint")}</span>
        </div>
      </div>
    </div>
  );
}
