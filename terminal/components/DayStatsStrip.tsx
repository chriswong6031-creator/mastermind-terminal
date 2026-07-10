"use client";
// DayStatsStrip — Day Trade Mode slim stats row rendered above the chart.
// Observatory micro-label style: label · value pairs in a horizontal strip.
// Pinned above the chart when dayMode && isIntraday.
// Per spec §3: pure helpers are exported for unit testing.

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  minOfDay, dayKey, sessionOpenMin, sessionVwap, rvolSeries,
  type Bar as IMBar,
} from "@/lib/intradayMath";
import type { Market } from "@/lib/intradaySources";
import styles from "./DayStatsStrip.module.css";

// ─── Exported pure helpers (unit-testable) ────────────────────────────────────

/** Gap% = (today open vs prior-day close) / prior-day close × 100, signed. */
export function calcGapPct(todayBars: IMBar[], market: Market, dailyBars: { time: string; h: number; l: number; c: number }[]): number | null {
  const openMin = sessionOpenMin(market);
  // Find today's first RTH bar
  const openBar = todayBars.find((b) => minOfDay(b.time) >= openMin);
  if (!openBar) return null;
  if (!dailyBars.length) return null;
  // Today's session date from first intraday bar's dayKey
  const todayMs = dayKey(todayBars[0].time) * 86400 * 1000;
  const todayStr = new Date(todayMs).toISOString().slice(0, 10);
  const priorDaily = dailyBars.filter((d) => d.time < todayStr);
  if (!priorDaily.length) return null;
  const pdc = priorDaily[priorDaily.length - 1].c;
  if (!pdc || !isFinite(pdc)) return null;
  return ((openBar.o - pdc) / pdc) * 100;
}

/** Range used % = today's (H−L) / 14-day ATR from dailyBars. */
export function calcRangeUsedPct(todayBars: IMBar[], dailyBars: { time: string; h: number; l: number; c: number }[]): number | null {
  if (!todayBars.length || !dailyBars.length) return null;
  // Today's H and L across all today bars
  let hi = -Infinity, lo = Infinity;
  for (const b of todayBars) { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); }
  if (!isFinite(hi) || !isFinite(lo)) return null;
  const range = hi - lo;
  // 14-day ATR from daily bars (prior bars only to avoid forward-looking)
  const todayMs = dayKey(todayBars[0].time) * 86400 * 1000;
  const todayStr = new Date(todayMs).toISOString().slice(0, 10);
  const prior = dailyBars.filter((d) => d.time < todayStr);
  const atrWindow = prior.slice(-14);
  if (atrWindow.length < 2) return null;
  let atrSum = 0;
  for (let i = 1; i < atrWindow.length; i++) {
    const cur = atrWindow[i], prev = atrWindow[i - 1];
    const tr = Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
    atrSum += tr;
  }
  const atr = atrSum / (atrWindow.length - 1);
  if (!atr || !isFinite(atr)) return null;
  return (range / atr) * 100;
}

/** ΔVWAP% = (lastClose − sessionVwap) / sessionVwap × 100, signed. */
export function calcDeltaVwapPct(todayBars: IMBar[], market: Market): number | null {
  if (!todayBars.length) return null;
  const result = sessionVwap(todayBars, market);
  // find last non-null VWAP value
  let vwap: number | null = null;
  for (let i = result.vwap.length - 1; i >= 0; i--) {
    if (result.vwap[i] != null) { vwap = result.vwap[i]; break; }
  }
  if (vwap == null || !isFinite(vwap) || vwap === 0) return null;
  const lastClose = todayBars[todayBars.length - 1].c;
  return ((lastClose - vwap) / vwap) * 100;
}

/** Today's HOD and LOD across all intraday bars. */
export function calcHodLod(todayBars: IMBar[]): { hod: number | null; lod: number | null } {
  if (!todayBars.length) return { hod: null, lod: null };
  let hod = -Infinity, lod = Infinity;
  for (const b of todayBars) { hod = Math.max(hod, b.h); lod = Math.min(lod, b.l); }
  return { hod: isFinite(hod) ? hod : null, lod: isFinite(lod) ? lod : null };
}

/** Session badge for the market based on local minute of day. LUNCH = CN/HK midday halt. */
export function getSessionBadge(market: Market, minOfDayNow: number): "PRE" | "RTH" | "AH" | "CLOSED" | "LUNCH" {
  if (market === "crypto") return "RTH"; // 24/7
  const openMin = sessionOpenMin(market);
  const closeMin = market === "cn" ? 900 : 960; // CN closes 15:00 (900 min), others 16:00 (960 min)
  if (minOfDayNow < openMin) {
    // Premarket exists for US/CA (4:00–9:30 = 240–570 min)
    if ((market === "us" || market === "ca") && minOfDayNow >= 240) return "PRE";
    return "CLOSED";
  }
  // Midday trading halt: CN 11:30–13:00 (690–780), HK 12:00–13:00 (720–780)
  if (market === "cn" && minOfDayNow >= 690 && minOfDayNow < 780) return "LUNCH";
  if (market === "hk" && minOfDayNow >= 720 && minOfDayNow < 780) return "LUNCH";
  if (minOfDayNow < closeMin) return "RTH";
  // After-hours for US/CA (16:00–20:00 = 960–1200 min)
  if ((market === "us" || market === "ca") && minOfDayNow < 1200) return "AH";
  return "CLOSED";
}

// ─── Clock helpers ────────────────────────────────────────────────────────────

function getMarketLocalMinOfDay(market: Market): number {
  const tz = market === "cn" || market === "hk" ? "Asia/Shanghai" : market === "us" || market === "ca" ? "America/New_York" : "UTC";
  const now = Date.now();
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now)) parts[p.type] = p.value;
  return parseInt(parts.hour || "0") * 60 + parseInt(parts.minute || "0");
}

function getMarketLocalTimeStr(market: Market): string {
  const tz = market === "cn" || market === "hk" ? "Asia/Shanghai" : market === "us" || market === "ca" ? "America/New_York" : "UTC";
  const now = Date.now();
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now)) parts[p.type] = p.value;
  const tzLabel = market === "cn" || market === "hk" ? "CST" : market === "us" || market === "ca" ? "ET" : "UTC";
  return `${parts.hour || "00"}:${parts.minute || "00"}:${parts.second || "00"} ${tzLabel}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DayStatsStripProps {
  bars: { time: string | number; o: number; h: number; l: number; c: number; v: number }[];
  market: Market;
  quote?: { last?: number } | null;
  dailyBars?: { time: string; h: number; l: number; c: number }[];
}

export default function DayStatsStrip({ bars, market, dailyBars = [] }: DayStatsStripProps) {
  const t = useT();
  const [clockStr, setClockStr] = useState<string>("");
  const [badge, setBadge] = useState<"PRE" | "RTH" | "AH" | "CLOSED" | "LUNCH">("CLOSED");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1-second clock tick
  useEffect(() => {
    const tick = () => {
      const mod = getMarketLocalMinOfDay(market);
      setBadge(getSessionBadge(market, mod));
      setClockStr(getMarketLocalTimeStr(market));
    };
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [market]);

  // Compute stats from bars + dailyBars
  // Today's bars = bars with the highest dayKey (last session)
  const imBars = bars as unknown as IMBar[];
  const todayKey = imBars.length ? dayKey(imBars[imBars.length - 1].time) : -1;
  const todayBars = imBars.filter((b) => dayKey(b.time) === todayKey);

  const gapPct = calcGapPct(todayBars, market, dailyBars);
  const rangeUsed = calcRangeUsedPct(todayBars, dailyBars);
  const deltaVwap = calcDeltaVwapPct(todayBars, market);
  const { hod, lod } = calcHodLod(todayBars);

  // RVOL: cumulative last value from rvolSeries
  const rvolResult = imBars.length >= 4 ? rvolSeries(imBars, market) : null;
  const rvolLast = rvolResult && rvolResult.sessionsUsed >= 3
    ? (() => { const cv = rvolResult.cum; for (let i = cv.length - 1; i >= 0; i--) { if (cv[i] != null) return cv[i]; } return null; })()
    : null;

  const fmt2 = (v: number | null, sign = false) => {
    if (v == null || !isFinite(v)) return "—";
    const s = v.toFixed(2);
    return sign && v > 0 ? `+${s}` : s;
  };
  const fmtX = (v: number | null) => v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}×`;
  const fmtPct = (v: number | null, sign = false) => {
    if (v == null || !isFinite(v)) return "—";
    const s = `${v.toFixed(1)}%`;
    return sign && v > 0 ? `+${s}` : s;
  };
  const fmtPrice = (v: number | null) => v == null || !isFinite(v) ? "—" : v.toFixed(2);

  const gapUp = (gapPct ?? 0) >= 0;
  const vwapUp = (deltaVwap ?? 0) >= 0;

  const badgeKey: Record<string, string> = {
    PRE: "dsPre", RTH: "dsRth", AH: "dsAh", CLOSED: "dsClosed", LUNCH: "dsLunch",
  };
  const badgeClass: Record<string, string> = {
    PRE: styles.badgePre, RTH: styles.badgeRth, AH: styles.badgeAh, CLOSED: styles.badgeClosed, LUNCH: styles.badgeClosed,
  };

  return (
    <div className={styles.strip} role="region" aria-label="Day Stats">
      {/* Gap */}
      <div className={styles.cell}>
        <span className={styles.lbl}>{t("dsGap")}</span>
        <span className={`${styles.val} ${gapPct == null ? "" : gapUp ? styles.up : styles.down}`}>
          {fmtPct(gapPct, true)}
        </span>
      </div>
      {/* RVOL */}
      <div className={styles.cell}>
        <span className={styles.lbl}>{t("dsRvol")}</span>
        <span className={styles.val}>{fmtX(rvolLast)}</span>
      </div>
      {/* Range used */}
      <div className={styles.cell}>
        <span className={styles.lbl}>{t("dsRange")}</span>
        <span className={styles.val}>{fmtPct(rangeUsed)}</span>
      </div>
      {/* Δ VWAP */}
      <div className={styles.cell}>
        <span className={styles.lbl}>{t("dsVwapD")}</span>
        <span className={`${styles.val} ${deltaVwap == null ? "" : vwapUp ? styles.up : styles.down}`}>
          {fmtPct(deltaVwap, true)}
        </span>
      </div>
      {/* HOD */}
      <div className={styles.cell}>
        <span className={styles.lbl}>{t("dsHod")}</span>
        <span className={`${styles.val} ${styles.num}`}>{fmtPrice(hod)}</span>
      </div>
      {/* LOD */}
      <div className={styles.cell}>
        <span className={styles.lbl}>{t("dsLod")}</span>
        <span className={`${styles.val} ${styles.num}`}>{fmtPrice(lod)}</span>
      </div>
      {/* Session badge + clock — always last, right-flush */}
      <div className={`${styles.cell} ${styles.cellBadge}`}>
        <span className={`${styles.badge} ${badgeClass[badge] ?? ""}`}>
          {t(badgeKey[badge] ?? "dsClosed")}
        </span>
        <span className={`${styles.clock} ${styles.num}`}>{clockStr}</span>
      </div>
    </div>
  );
}
