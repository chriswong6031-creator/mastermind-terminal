"use client";
/**
 * InsiderPage — the "Insider" tab (Insider Power). Mirrors StockInvest.us's
 * Insider Trading view, on the Mastermind design system:
 *   1. Insider Power score gauge (0..100, 50 = neutral) — quality-weighted, not a
 *      raw buy/sell ratio.
 *   2. Insider buy- vs sell-volume bars overlaid on the price line (per month).
 *   3. Signal + confidence with a short analysis breakdown
 *      (e.g. "SELL SIGNAL — Low Confidence: contradicted by a positive Insider
 *      Power Score").
 *   4. Recent open-market Form-4 trades.
 *
 * The SCORING is NOT re-derived here — it is owned by the Macro pipeline
 * (engine/insider_power.py) and fetched per ticker as <SYM>.insider.json via
 * getInsider(). Display-only / informational; not investment advice.
 *
 * Props: {sym, bars?, zh}. Self-fetches its own insider payload (like
 * TechnicalsPage self-fetches intraday); `bars` (daily OHLC, already in the
 * shell) supplies the overlaid price line — absent bars just drop the line.
 */
import { memo, useEffect, useMemo, useState } from "react";
import type { Bar, Insider } from "../../lib/fund";
import { getInsider } from "../../lib/fund";
import { fmtCur, fmtNum, fmtDate, pick } from "../../lib/finFormat";
import { ComboChart, HalfGauge, type Series } from "./FinCharts";
import { Disclaimer } from "./ForecastPage";

interface InsiderPageProps {
  sym: string;
  bars?: Bar[];
  zh?: boolean;
}

/** Score → verdict word beneath the gauge (five bands around 50 = neutral). */
function powerWord(score: number, zh: boolean): string {
  if (score >= 80) return pick(zh, "Very bullish", "非常看多");
  if (score >= 60) return pick(zh, "Bullish", "看多");
  if (score > 40) return pick(zh, "Neutral", "中性");
  if (score > 20) return pick(zh, "Bearish", "看空");
  return pick(zh, "Very bearish", "非常看空");
}

/** CSS semantic class for a BUY/SELL/NEUTRAL signal. */
function sigClass(signal: string): string {
  if (signal === "BUY") return "up";
  if (signal === "SELL") return "down";
  return "mut";
}

function InsiderPage({ sym, bars = [], zh = false }: InsiderPageProps) {
  const [data, setData] = useState<Insider | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    setData(null);
    getInsider(sym)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState(d ? "ready" : "empty");
      })
      .catch(() => {
        if (alive) setState("empty");
      });
    return () => {
      alive = false;
    };
  }, [sym]);

  // month ("YYYY-MM") → last daily close in that month, for the overlaid price line.
  const monthClose = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bars) {
      const key = String(b.time).slice(0, 7);
      if (isFinite(b.c)) m.set(key, b.c); // bars are chronological → last wins = month close
    }
    return m;
  }, [bars]);

  if (state === "loading") {
    return (
      <div className="fin-body">
        <div className="fin-empty fin-empty-lg" role="status">
          <span className="fin-empty-title">{pick(zh, "Loading insider data…", "正在加载内部交易数据…")}</span>
        </div>
      </div>
    );
  }

  if (state === "empty" || !data) {
    return (
      <div className="fin-body">
        <div className="fin-empty fin-empty-lg" role="status">
          <span className="fin-empty-title">{pick(zh, "No insider data", "暂无内部交易数据")}</span>
          <span>{pick(zh, "No recent open-market Form-4 activity for this name.", "该标的近期无公开市场 Form-4 交易。")}</span>
        </div>
      </div>
    );
  }

  const d = data;
  const gaugeVal = Math.max(-1, Math.min(1, (d.score - 50) / 50));

  // ── buy/sell volume bars (buy up = green, sell down = red) + price line ──
  const labels = d.series.map((s) => s.month.slice(2).replace("-", "/")); // "24/04"
  const buyVals = d.series.map((s) => (s.buy_usd > 0 ? s.buy_usd : null));
  const sellVals = d.series.map((s) => (s.sell_usd > 0 ? -s.sell_usd : null)); // negative → draws below zero
  const priceVals = d.series.map((s) => monthClose.get(s.month) ?? null);
  const hasAnyVol = buyVals.some((v) => v != null) || sellVals.some((v) => v != null);
  const barSeries: Series[] = [
    { name: pick(zh, "Buy volume", "买入额"), values: buyVals, color: "var(--up)" },
    { name: pick(zh, "Sell volume", "卖出额"), values: sellVals, color: "var(--down)" },
  ];
  const priceSeries: Series = { name: pick(zh, "Price", "价格"), values: priceVals, color: "var(--brand-2)" };

  return (
    <div className="fin-body">
      {/* ── Hero: score gauge + signal / analysis ── */}
      <div className="fin-sec">
        <div className="fin-sec-h">{pick(zh, "Insider Power", "内部人操作力度")}</div>
        <div className="fin-insider-hero">
          <div className="fin-insider-gaugebox">
            <HalfGauge value={gaugeVal} verdict={powerWord(d.score, zh)} variant="analyst" zh={zh} />
            <div className="fin-insider-score">
              <span className="num" style={{ color: gaugeVal > 0.001 ? "var(--up)" : gaugeVal < -0.001 ? "var(--down)" : "var(--text)" }}>
                {d.score.toFixed(0)}
              </span>
              <span className="scale">/ 100</span>
            </div>
            <div className="fin-insider-scorelbl">{pick(zh, "50 = neutral", "50 = 中性")}</div>
          </div>

          <div className="fin-insider-signal">
            <div className="fin-insider-sigrow">
              <span className={`fin-insider-sigbadge ${sigClass(d.signal)}`}>
                {d.signal === "NEUTRAL"
                  ? pick(zh, "NO SIGNAL", "无信号")
                  : `${d.signal === "BUY" ? pick(zh, "BUY", "买入") : pick(zh, "SELL", "卖出")} ${pick(zh, "SIGNAL", "信号")}`}
              </span>
              {d.confidence !== "None" && (
                <span className="fin-insider-conf">
                  {pick(zh, d.confidence + " confidence", d.confidence + " 置信度")}
                </span>
              )}
            </div>
            <p className="fin-insider-analysis">{d.analysis}</p>

            <div className="fin-insider-stats">
              <div className="fin-insider-stat">
                <span className="lbl">{pick(zh, "Buyers", "买方")}</span>
                <span className="val up">{d.buyers}</span>
              </div>
              <div className="fin-insider-stat">
                <span className="lbl">{pick(zh, "Sellers", "卖方")}</span>
                <span className="val down">{d.sellers}</span>
              </div>
              <div className="fin-insider-stat">
                <span className="lbl">{pick(zh, "Net", "净额")}</span>
                <span className="val" style={{ color: d.net_usd > 0 ? "var(--up)" : d.net_usd < 0 ? "var(--down)" : "var(--text)" }}>
                  {(d.net_usd < 0 ? "−" : d.net_usd > 0 ? "+" : "") + fmtCur(Math.abs(d.net_usd), "USD")}
                </span>
              </div>
              <div className="fin-insider-stat">
                <span className="lbl">{pick(zh, "Window", "窗口")}</span>
                <span className="val">{Math.round(d.window_days / 30)}{pick(zh, "mo", "个月")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Buy/Sell volume overlaid on price ── */}
      <div className="fin-sec">
        <div className="fin-sec-h">{pick(zh, "Insider buy / sell volume vs price", "内部买卖量 vs 价格")}</div>
        {hasAnyVol ? (
          <ComboChart
            labels={labels}
            bars={barSeries}
            line={priceSeries}
            fmtBar={(v) => fmtCur(v, "USD", { decimals: 0 })}
            fmtLine={(v) => fmtCur(v, "USD", { decimals: 0 })}
            height={200}
            zh={zh}
          />
        ) : (
          <div className="fin-empty" role="status">
            {pick(zh, "No open-market volume in the trailing window.", "回溯窗口内无公开市场交易量。")}
          </div>
        )}
      </div>

      {/* ── Recent open-market trades ── */}
      <div className="fin-sec">
        <div className="fin-sec-h">{pick(zh, "Recent insider trades", "近期内部交易")}</div>
        <div className="fin-table-scroll">
          <table className="fin-table fin-stats-tbl fin-insider-tbl">
            <thead>
              <tr>
                <th className="fin-cell fin-cell-sticky fin-cell-corner" scope="col">{pick(zh, "Date", "日期")}</th>
                <th className="fin-cell fin-cell-head" scope="col">{pick(zh, "Insider", "内部人")}</th>
                <th className="fin-cell fin-cell-num fin-cell-head" scope="col">{pick(zh, "Type", "类型")}</th>
                <th className="fin-cell fin-cell-num fin-cell-head" scope="col">{pick(zh, "Shares", "股数")}</th>
                <th className="fin-cell fin-cell-num fin-cell-head" scope="col">{pick(zh, "Price", "价格")}</th>
                <th className="fin-cell fin-cell-num fin-cell-head" scope="col">{pick(zh, "Value", "金额")}</th>
              </tr>
            </thead>
            <tbody>
              {d.trades.map((t, i) => (
                <tr key={i} className="fin-row">
                  <th className="fin-cell fin-cell-sticky" scope="row">{fmtDate(t.date, { short: false })}</th>
                  <td className="fin-cell">
                    <span className="fin-insider-role">{t.title}</span>
                  </td>
                  <td className="fin-cell fin-cell-num">
                    <span className={`fin-insider-side ${t.side === "buy" ? "up" : "down"}`}>
                      {t.side === "buy" ? pick(zh, "Buy", "买入") : pick(zh, "Sell", "卖出")}
                    </span>
                  </td>
                  <td className="fin-cell fin-cell-num">{fmtNum(t.shares, { decimals: 0 })}</td>
                  <td className="fin-cell fin-cell-num">{t.price != null ? fmtCur(t.price, "USD") : "—"}</td>
                  <td className="fin-cell fin-cell-num">{t.usd != null ? fmtCur(t.usd, "USD") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fin-insider-asof">
          {pick(zh, `As of ${d.asof} · filing dates (public). Open-market P/S only.`, `截至 ${d.asof} · 申报公开日期。仅公开市场买卖 (P/S)。`)}
        </div>
      </div>

      <Disclaimer zh={zh} />
    </div>
  );
}

export default memo(InsiderPage);
