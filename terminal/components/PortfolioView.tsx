"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { getJSON } from "@/lib/dataCache";
import { verdictIsStale } from "@/lib/signalVerdict";

type Row = { name: string; zh?: string; col: string; last: number; chg: number; verdict: string | null; wr: number | null; pf: number | null; cagr: number | null; regimeBull: boolean | null };
const fmt = (n: number | null | undefined, d = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const isBuy = (v: string | null) => v === "BUY" || v === "REBUY" || v === "RECLAIM";

const GUEST_SEED = ["BTC-USD", "ETH-USD", "NVDA", "AAPL", "MSFT", "QQQ"];

type WList = { id: string; name: string; symbols: string[] };

export default function PortfolioView({ lists, email }: { lists: WList[]; email: string }) {
  const router = useRouter();
  const t = useT();
  const [man, setMan] = useState<Record<string, Row>>({});
  const [loaded, setLoaded] = useState(false);
  // Watchlists the user can switch between. Signed-in users get their server lists
  // (passed in). The whole prod base is guest right now (login disabled), so when the
  // server list is empty we fall back to the client-side watchlists (mm.wls, written by
  // TerminalShell — an object keyed by list name) and finally a single seed list, so
  // Portfolio is never blank and the switcher still works for guests.
  const [allLists, setAllLists] = useState<WList[]>(lists.length ? lists : []);
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    if (lists.length) { setAllLists(lists); setActiveIdx(0); return; }
    try {
      const raw = localStorage.getItem("mm.wls");
      if (raw) {
        const w = JSON.parse(raw);
        const entries: [string, unknown][] = w?.lists && typeof w.lists === "object" ? Object.entries(w.lists) : [];
        const built: WList[] = entries.map(([name, arr]) => ({
          id: name,
          name,
          symbols: Array.isArray(arr) ? arr.map((x: { symbol: string }) => x.symbol).filter(Boolean) : [],
        })).filter((l) => l.symbols.length);
        if (built.length) {
          setAllLists(built);
          const ai = built.findIndex((l) => l.id === w?.active);
          setActiveIdx(ai >= 0 ? ai : 0);
          return;
        }
      }
    } catch {}
    setAllLists([{ id: "seed", name: "Watchlist", symbols: GUEST_SEED }]);
    setActiveIdx(0);
  }, [lists]);

  // Clamp against a shrunk list, then resolve the active list's symbols.
  const safeIdx = Math.min(activeIdx, Math.max(0, allLists.length - 1));
  const effSymbols = allLists[safeIdx]?.symbols ?? [];
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
        <style>{`
          .wl-switch{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:2px 0 10px}
          .wl-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--muted);font-size:12.5px;font-weight:600;cursor:pointer;transition:color .15s ease,border-color .15s ease,background .15s ease}
          .wl-pill:hover{color:var(--text);border-color:var(--brand)}
          .wl-pill.on{color:var(--brand-2);border-color:var(--brand);background:color-mix(in srgb, var(--brand) 12%, var(--card))}
          .wl-ct{font-size:11px;font-weight:700;opacity:.8;padding:1px 6px;border-radius:999px;background:color-mix(in srgb, var(--muted) 20%, transparent)}
          .wl-pill.on .wl-ct{background:color-mix(in srgb, var(--brand) 24%, transparent)}
        `}</style>
        <div className="pg-head"><h2>{t("convictionBook")}</h2><span className="sub">{t("convictionSub")}</span></div>
        {allLists.length > 1 && (
          <div className="wl-switch" role="tablist" aria-label={t("watchlists", "Watchlists")}>
            {allLists.map((l, i) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={i === safeIdx}
                className={`wl-pill${i === safeIdx ? " on" : ""}`}
                onClick={() => setActiveIdx(i)}
                title={l.name}
              >
                <span className="wl-nm">{l.name}</span>
                <span className="wl-ct">{l.symbols.length}</span>
              </button>
            ))}
          </div>
        )}
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
                    <td><div className="sym-cell"><span className="ic" style={{ background: r.col }}>{r.sym[0]}</span><div><div className="tk">{r.sym}</div><div className="nm">{r.zh || r.name}</div></div></div></td>
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
