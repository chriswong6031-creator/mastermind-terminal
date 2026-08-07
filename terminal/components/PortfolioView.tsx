"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLang } from "@/lib/i18n";
import { displayName } from "@/lib/markets";
import { getJSON } from "@/lib/dataCache";
import { verdictIsStale } from "@/lib/signalVerdict";
import PortfolioBriefPanel from "@/components/PortfolioBriefPanel";

type Row = { name: string; zh?: string; col: string; last: number; chg: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY" || v === "RECLAIM";

const GUEST_SEED = ["BTC-USD", "ETH-USD", "NVDA", "AAPL", "MSFT", "QQQ"];

export default function PortfolioView({ symbols, email }: { symbols: string[]; email: string }) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  const [man, setMan] = useState<Record<string, Row>>({});
  const [loaded, setLoaded] = useState(false);
  // The whole prod base is guest right now (login disabled), so the server watchlist
  // is empty. Fall back to the client-side watchlist (mm.wls, written by TerminalShell)
  // and then the same seed the Terminal opens with — so Portfolio isn't blank for guests.
  const [effSymbols, setEffSymbols] = useState<string[]>(symbols);
  useEffect(() => {
    if (symbols.length) { setEffSymbols(symbols); return; }
    try {
      const raw = localStorage.getItem("mm.wls");
      if (raw) {
        const w = JSON.parse(raw);
        const list = w?.lists?.[w?.active] ?? w?.lists?.Default;
        const syms = Array.isArray(list) ? list.map((x: { symbol: string }) => x.symbol).filter(Boolean) : [];
        setEffSymbols(syms.length ? syms : GUEST_SEED);
        return;
      }
    } catch {}
    setEffSymbols(GUEST_SEED);
  }, [symbols]);
  // manifest via dataCache (dedup + SWR) + mounted guard — mirrors ScreenerView (batch 1).
  useEffect(() => { let alive = true; getJSON("/data/manifest.json").then((m) => { if (alive) setMan(m?.symbols || {}); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); }); return () => { alive = false; }; }, []);

  const rows = effSymbols.map((s) => ({ sym: s, ...(man[s] || {} as Row) })).filter((r) => r.name);
  const buys = rows.filter((r) => isBuy(r.verdict));
  // a display-only "conviction tilt": weight bullish names by win-rate, normalize
  const tiltBase = buys.map((r) => ({ sym: r.sym, w: (r.wr || 0.5) }));
  const tiltSum = tiltBase.reduce((a, b) => a + b.w, 0) || 1;
  const tilt: Record<string, number> = {};
  tiltBase.forEach((t) => (tilt[t.sym] = t.w / tiltSum));

  const wrs = rows.filter((r) => r.wr != null).map((r) => r.wr!);
  const avgWr = wrs.length ? (wrs.reduce((a, b) => a + b, 0) / wrs.length) * 100 : 0;
  const dayPnl = rows.reduce((a, r) => a + (r.chg || 0), 0) / (rows.length || 1);

  return (
    <main className="main2"><div className="pg">
        <PortfolioBriefPanel />
        <div className="pg-head"><h2>{t("convictionBook")}</h2><span className="sub">{t("convictionSub")}</span></div>
        <div className="kpis">
          <div className="kpi"><small>{t("names")}</small><b>{rows.length}</b></div>
          <div className="kpi"><small>{t("bullishSignals")}</small><b className="up">{buys.length}</b></div>
          <div className="kpi"><small>{t("avgWinRate")}</small><b>{avgWr.toFixed(0)}%</b></div>
          <div className="kpi"><small>{t("avgDayMove")}</small><b className={dayPnl >= 0 ? "up" : "down"}>{dayPnl >= 0 ? "+" : ""}{dayPnl.toFixed(2)}%</b></div>
        </div>
        <div className="panel">
          <div className="ph">{t("positions")}<span className="sub">{t("clickRowOpen")}</span></div>
          <div className="tbl-scroll">
          <table className="ptable">
            <thead><tr><th>{t("symbol")}</th><th>{t("colLast")}</th><th>{t("day")}</th><th>{t("signalCol")}</th><th>{t("regime")}</th><th>{t("winRate")}</th><th>{t("profitFactor")}</th><th>{t("cagr")}</th><th>{t("suggestedTilt")}</th></tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr className="empty-row"><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "44px 16px", fontSize: 13 }}>
                  {!loaded ? t("loadingBook") : t("noNamesYet")}
                </td></tr>
              )}
              {rows.map((r) => { const u = (r.chg || 0) >= 0; const buy = isBuy(r.verdict);
                return (
                  <tr key={r.sym} onClick={() => router.push(`/terminal?sym=${r.sym}`)}>
                    <td><div className="sym-cell"><span className="ic" style={{ background: r.col }}>{r.sym[0]}</span><div><div className="tk">{r.sym}</div><div className="nm">{displayName(r, lang)}</div></div></div></td>
                    <td>{fmt(r.last, r.last < 10 ? 4 : 2)}</td>
                    <td className={u ? "up" : "down"}>{u ? "+" : ""}{fmt(r.chg)}%</td>
                    <td>{r.verdict ? <span className={`pill ${buy ? "buy" : "sell"}${verdictIsStale((r as any).vts) ? " stale" : ""}`} title={(r as any).vts ? `${r.verdict} · ${(r as any).vts}` : undefined}>{r.verdict}</span> : "—"}</td>
                    <td><span className={`regchip ${r.regimeBull ? "up" : "warn"}`}>{r.regimeBull ? t("uptrend") : t("mixed")}</span></td>
                    <td>{r.wr != null ? (r.wr * 100).toFixed(0) + "%" : "—"}</td>
                    <td>{r.pf != null ? r.pf.toFixed(2) : "—"}</td>
                    <td>{r.cagr != null ? (r.cagr * 100).toFixed(1) + "%" : "—"}</td>
                    <td>{tilt[r.sym] ? <><b style={{ color: "var(--brand-2)" }}>{(tilt[r.sym] * 100).toFixed(0)}%</b><span className="bar"><i style={{ width: `${tilt[r.sym] * 100}%` }} /></span></> : <span style={{ color: "var(--text-dim)" }}>—</span>}</td>
                  </tr>
                ); })}
            </tbody>
          </table>
          </div>
        </div>
      </div></main>
  );
}
