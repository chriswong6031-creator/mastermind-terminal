"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, AreaSeries, type IChartApi } from "lightweight-charts";
import { useT } from "@/lib/i18n";

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const pct = (x: number | null | undefined, d = 1) => (x == null ? "—" : (x * 100).toFixed(d) + "%");

export default function StrategyTester({ symbol }: { symbol: string }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [bt, setBt] = useState<any | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setBt(null); setErr("");
    fetch(`/data/${symbol}.backtest.json`).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!d) setErr(t("noStratData").replace("{sym}", symbol)); else setBt(d); })
      .catch(() => setErr(t("stratLoadErr")));
  }, [symbol, t]);

  useEffect(() => {
    const el = ref.current; if (!el || !bt?.equity?.v?.length) return;
    if (chartRef.current) { try { chartRef.current.remove(); } catch {} }
    const c = { line: css("--line"), mut: css("--muted"), grid: css("--grid"), brand: css("--brand-2") };
    const chart = createChart(el, { width: el.clientWidth || 600, height: el.clientHeight || 220, layout: { background: { color: "transparent" }, textColor: c.mut, fontSize: 11, attributionLogo: false }, grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } }, rightPriceScale: { borderColor: c.line }, timeScale: { borderColor: c.line } });
    chartRef.current = chart;
    const s = chart.addSeries(AreaSeries, { lineColor: c.brand, topColor: "rgba(41,98,255,.22)", bottomColor: "rgba(41,98,255,.02)", lineWidth: 2, priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
    s.setData(bt.equity.t.map((d: string, i: number) => ({ time: d, value: +bt.equity.v[i].toFixed(4) })));
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(() => { try { chart.resize(el.clientWidth, el.clientHeight); } catch {} }); ro.observe(el);
    return () => { ro.disconnect(); try { chart.remove(); } catch {} chartRef.current = null; };
  }, [bt]);

  const m = bt?.metrics || {}; const trades = bt?.trades || [];
  return (
    <div className="strat">
      {err && <div className="strat-empty">{err}</div>}
      {bt && <>
        <div className="strat-kpis">
          <div className="kpi"><small>{t("netReturn")}</small><b className={(m.strat_total_return ?? 0) >= 0 ? "up" : "down"}>{pct(m.strat_total_return)}</b></div>
          <div className="kpi"><small>{t("winRate")}</small><b>{pct(m.win_rate)}</b></div>
          <div className="kpi"><small>{t("profitFactor")}</small><b>{m.profit_factor ?? "—"}</b></div>
          <div className="kpi"><small>{t("cagr")}</small><b>{pct(m.cagr)}</b></div>
          <div className="kpi"><small>{t("sharpe")}</small><b>{m.sharpe ?? "—"}</b></div>
          <div className="kpi"><small>{t("maxDD")}</small><b className="down">{pct(m.max_dd)}</b></div>
          <div className="kpi"><small>{t("trades")}</small><b>{m.n_trades ?? trades.length}</b></div>
          <div className="kpi"><small>{t("vsBuyHold")}</small><b className={m.vs_buy_hold?.beats_return ? "up" : "down"}>{m.vs_buy_hold?.beats_return ? t("beats") : t("trails")}</b></div>
        </div>
        <div className="strat-chart-h">{t("equityCurve")}<span>strategy ×{bt.equity?.v?.slice(-1)[0]?.toFixed(2)} · buy-hold ×{(1 + (bt.equity?.bh_total_return ?? 0)).toFixed(2)}</span></div>
        <div className="strat-chart" ref={ref} />
        <div className="strat-trades">
          <table className="ptable">
            <thead><tr><th>#</th><th>{t("thEntry")}</th><th>{t("thExit")}</th><th>{t("thEntryPx")}</th><th>{t("thExitPx")}</th><th>{t("thReturn")}</th><th>{t("thBars")}</th><th>{t("thReason")}</th></tr></thead>
            <tbody>{trades.slice().reverse().map((t: any) => (
              <tr key={t.id}><td>{t.id}</td><td>{t.entry_date}</td><td>{t.exit_date}</td><td>{t.entry_px}</td><td>{t.exit_px}</td><td className={t.ret >= 0 ? "up" : "down"}>{(t.ret * 100).toFixed(2)}%</td><td>{t.bars_held}</td><td>{t.exit_reason}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </>}
    </div>
  );
}
