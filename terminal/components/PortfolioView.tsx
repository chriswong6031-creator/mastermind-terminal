"use client";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useLang } from "@/lib/i18n";
import { displayName } from "@/lib/markets";
import { getJSON } from "@/lib/dataCache";
import { verdictIsStale } from "@/lib/signalVerdict";
import {
  resolveActivePortfolioWatchlist,
  resolvePortfolioWatchlists,
  type PortfolioWatchlist,
} from "@/lib/portfolioWatchlists";
import PortfolioBriefPanel from "@/components/PortfolioBriefPanel";

type Row = { name: string; zh?: string; col: string; last: number; chg: number; verdict: string | null; vts?: string; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY" || v === "RECLAIM";

export default function PortfolioView({ lists }: { lists: PortfolioWatchlist[]; email: string }) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  const [man, setMan] = useState<Record<string, Row>>({});
  const [loaded, setLoaded] = useState(false);
  const serverOnly = resolvePortfolioWatchlists(lists, null);
  const [allLists, setAllLists] = useState<PortfolioWatchlist[]>(serverOnly.lists);
  const [activeListId, setActiveListId] = useState(serverOnly.preferredActiveId);

  // TerminalShell owns the mm.wls write contract. Portfolio is a display-only
  // reader: it shows custom local lists, additively reconciles a same-name server
  // list, and never changes the Terminal's globally active list when a pill is used.
  useEffect(() => {
    const apply = (raw: string | null) => {
      const resolved = resolvePortfolioWatchlists(lists, raw);
      setAllLists(resolved.lists);
      // A storage event represents Terminal's current-list truth. Honor its
      // valid active name; otherwise fail closed to the first surviving list.
      setActiveListId(resolveActivePortfolioWatchlist(
        resolved.lists,
        null,
        resolved.preferredActiveId,
      ) ?? resolved.lists[0].id);
    };
    apply(localStorage.getItem("mm.wls"));
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "mm.wls" && event.key !== null) return;
      apply(event.key === "mm.wls" ? event.newValue : localStorage.getItem("mm.wls"));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [lists]);

  const activeIndex = Math.max(0, allLists.findIndex((list) => list.id === activeListId));
  const activeList = allLists[activeIndex] ?? allLists[0];
  const effSymbols = activeList?.symbols ?? [];

  function onListKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % allLists.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + allLists.length) % allLists.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = allLists.length - 1;
    else return;
    event.preventDefault();
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']");
    buttons?.[next]?.focus();
    setActiveListId(allLists[next].id);
  }

  // manifest via dataCache (dedup + SWR) + mounted guard — mirrors ScreenerView (batch 1).
  // onRevalidate: dataCache serves the persisted manifest stale on every load; without it
  // the book would be marked to whatever prices this browser last cached (see lib/dataCache.ts).
  useEffect(() => { let alive = true; getJSON("/data/manifest.json", { onRevalidate: (m) => { if (alive) setMan(m?.symbols || {}); } }).then((m) => { if (alive) setMan(m?.symbols || {}); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); }); return () => { alive = false; }; }, []);

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
    <main className="main2" data-portfolio-watchlists="r5-v1" data-selected-watchlist={activeList?.name ?? "Default"}><div className="pg">
        <PortfolioBriefPanel />
        <div className="pg-head"><h2>{t("convictionBook")}</h2><span className="sub">{t("convictionSub")}</span></div>
        {allLists.length > 1 && (
          <div className="portfolio-wl-switch">
            <span className="portfolio-wl-label">{t("watchlists")}</span>
            <div className="portfolio-wl-tabs" role="tablist" aria-label={t("portfolioWatchlistSelector")}>
              {allLists.map((list, index) => {
                const selected = list.id === activeList?.id;
                return (
                  <button
                    key={list.id}
                    id={`portfolio-wl-tab-${index}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls="portfolio-watchlist-panel"
                    tabIndex={selected ? 0 : -1}
                    className={`portfolio-wl-pill${selected ? " on" : ""}`}
                    title={list.name}
                    onClick={() => setActiveListId(list.id)}
                    onKeyDown={(event) => onListKeyDown(event, index)}
                  >
                    <span className="portfolio-wl-name">{list.name}</span>
                    <span className="portfolio-wl-count">{list.symbols.length}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="kpis">
          <div className="kpi"><small>{t("names")}</small><b>{rows.length}</b></div>
          <div className="kpi"><small>{t("bullishSignals")}</small><b className="up">{buys.length}</b></div>
          <div className="kpi"><small>{t("avgWinRate")}</small><b>{avgWr.toFixed(0)}%</b></div>
          <div className="kpi"><small>{t("avgDayMove")}</small><b className={dayPnl >= 0 ? "up" : "down"}>{dayPnl >= 0 ? "+" : ""}{dayPnl.toFixed(2)}%</b></div>
        </div>
        <div
          className="panel"
          id="portfolio-watchlist-panel"
          role={allLists.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={allLists.length > 1 ? `portfolio-wl-tab-${activeIndex}` : undefined}
        >
          <div className="ph">{t("positions")}<span className="sub">{t("clickRowOpen")}</span></div>
          <div className="tbl-scroll">
          <table className="ptable">
            <thead><tr><th>{t("symbol")}</th><th>{t("colLast")}</th><th>{t("day")}</th><th>{t("signalCol")}</th><th>{t("regime")}</th><th>{t("winRate")}</th><th>{t("profitFactor")}</th><th>{t("cagr")}</th><th>{t("suggestedTilt")}</th></tr></thead>
            <tbody>
              {rows.length === 0 && (
                <tr className="empty-row"><td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "44px 16px", fontSize: 13 }}>
                  {!loaded ? t("loadingBook") : t("emptySelectedWatchlist")}
                </td></tr>
              )}
              {rows.map((r) => { const u = (r.chg || 0) >= 0; const buy = isBuy(r.verdict);
                return (
                  <tr key={r.sym} onClick={() => router.push(`/terminal?sym=${r.sym}`)}>
                    <td><div className="sym-cell"><span className="ic" style={{ background: r.col }}>{r.sym[0]}</span><div><div className="tk">{r.sym}</div><div className="nm">{displayName(r, lang)}</div></div></div></td>
                    <td>{fmt(r.last, r.last < 10 ? 4 : 2)}</td>
                    <td className={u ? "up" : "down"}>{u ? "+" : ""}{fmt(r.chg)}%</td>
                    <td>{r.verdict ? <span className={`pill ${buy ? "buy" : "sell"}${verdictIsStale(r.vts) ? " stale" : ""}`} title={r.vts ? `${r.verdict} · ${r.vts}` : undefined}>{r.verdict}</span> : "—"}</td>
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
