"use client";
import { useEffect, useMemo, useRef, useState, startTransition, useDeferredValue, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useT, useLang } from "@/lib/i18n";
import { displayName } from "@/lib/markets";
import { getJSON } from "@/lib/dataCache";
import { trackSearch } from "@/lib/searchTrack";
import { verdictIsStale } from "@/lib/signalVerdict";

// ── types ──────────────────────────────────────────────────────────────────
type Row = {
  sym: string; name: string; zh?: string; sec: string; col: string; mkt?: string;
  last: number | null; chg: number | null; vol: number | null;
  verdict: string | null; vts?: string | null; wr: number | null; pf: number | null;
  cagr: number | null; regimeBull: boolean | null;
};

// ── formatters ─────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, d = 2) =>
  (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));

// vol() renders share/coin volume for display; returns '—' for missing/non-finite values
const vol = (v: number | null | undefined): string => {
  if (v == null || !isFinite(v)) return "—";
  return v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : String(v);
};

const isBuy = (v: string | null) => v === "BUY" || v === "REBUY" || v === "RECLAIM";

// ── virtualization constants ───────────────────────────────────────────────
// CSS: table.scr tbody td { padding: 11px 16px } + 13px font + 1px border ≈ 44px/row
const ROW_H = 44;
const OVERSCAN = 6; // extra rows above/below viewport

// ── shimmer placeholder ────────────────────────────────────────────────────
const SHIMMER_ROWS = 12;
const shimmerColWidths = ["160px", "80px", "70px", "80px", "80px", "60px", "60px", "80px", "70px"];

export default function ScreenerView({ email }: { email: string }) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();

  // ── data state ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<Row[]>([]);
  const [asOf, setAsOf] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);

  // ── filter state ───────────────────────────────────────────────────────
  const [verdict, setVerdict] = useState<"all" | "buy" | "sell">("all");
  const [sec, setSec] = useState<"all" | string>("all");
  const [mktFilter, setMktFilter] = useState<"all" | string>("all");
  const [uptrend, setUptrend] = useState(false);
  const [showAll, setShowAll] = useState(false);   // true = show thin rows too

  // ── search state (wrapped in deferred for perf) ────────────────────────
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDeferredValue(searchRaw);

  // ── sort state ─────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ k: keyof Row; dir: 1 | -1 }>({ k: "cagr", dir: -1 });

  // ── scroll tracking for virtualization ────────────────────────────────
  const tableRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600); // fallback until measured

  const onScroll = useCallback(() => {
    if (tableRef.current) {
      setScrollTop(tableRef.current.scrollTop);
    }
  }, []);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, [onScroll]);

  // ── fetch manifest via dataCache (dedup + SWR) + mounted guard ─────────
  useEffect(() => {
    let alive = true;
    getJSON("/data/manifest.json")
      .then((m: any) => {
        if (!alive) return;
        setAsOf(m.as_of || "");
        setRows(
          Object.entries(m.symbols || {}).map(([sym, r]: any) => ({
            sym,
            // normalise nulls so thin rows are distinguishable
            last: r.last ?? null,
            chg: r.chg ?? null,
            vol: r.vol ?? null,
            verdict: r.verdict ?? null,
            vts: r.vts ?? null,
            wr: r.wr ?? null,
            pf: r.pf ?? null,
            cagr: r.cagr ?? null,
            regimeBull: r.regimeBull ?? null,
            name: r.name || sym,
            zh: r.zh,
            sec: r.sec || "",
            col: r.col || "#888",
            mkt: r.mkt,
          }))
        );
        setLoaded(true);
      })
      .catch(() => { if (alive) { setErr(true); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  // ── derive distinct mkt values from data ───────────────────────────────
  const mktOptions = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => { if (r.mkt) s.add(r.mkt); });
    return Array.from(s).sort();
  }, [rows]);

  // ── aggregate stats + filtered view — single pass ─────────────────────
  const { view, nBuy, nSell, avgWr } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let nBuyAcc = 0, nSellAcc = 0, wrSum = 0, wrCnt = 0;

    const base = rows.filter((r) => {
      // aggregate pass (always over full rows, not filtered set)
      if (isBuy(r.verdict)) nBuyAcc++; else if (r.verdict) nSellAcc++;
      if (r.wr != null) { wrSum += r.wr; wrCnt++; }

      // show-all gate: default to rows that carry metrics
      if (!showAll && r.last == null) return false;

      // verdict filter
      if (verdict === "buy" && !isBuy(r.verdict)) return false;
      if (verdict === "sell" && (isBuy(r.verdict) || !r.verdict)) return false;

      // sec filter
      if (sec !== "all" && r.sec !== sec) return false;

      // mkt filter
      if (mktFilter !== "all" && r.mkt !== mktFilter) return false;

      // uptrend filter
      if (uptrend && !r.regimeBull) return false;

      // text search
      if (q && !r.sym.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;

      return true;
    });

    const avgWrCalc = wrCnt ? (wrSum / wrCnt) * 100 : 0;

    // sort — nulls always last regardless of direction
    // Volume column sorts by dollar volume (last * vol) for cross-market comparability
    const sorted = [...base].sort((a, b) => {
      let x: any, y: any;
      if (sort.k === "vol") {
        x = a.last != null && a.vol != null ? a.last * a.vol : null;
        y = b.last != null && b.vol != null ? b.last * b.vol : null;
      } else {
        x = a[sort.k]; y = b[sort.k];
      }
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });

    return { view: sorted, nBuy: nBuyAcc, nSell: nSellAcc, avgWr: avgWrCalc };
  }, [rows, verdict, sec, mktFilter, uptrend, showAll, search, sort]);

  // ── virtualization window ──────────────────────────────────────────────
  const totalH = view.length * ROW_H;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / ROW_H) + OVERSCAN * 2;
  const endIdx = Math.min(view.length, startIdx + visibleCount);
  const paddingTop = startIdx * ROW_H;
  const paddingBottom = Math.max(0, totalH - endIdx * ROW_H);
  const windowedRows = view.slice(startIdx, endIdx);

  // ── sort header helper ─────────────────────────────────────────────────
  function th(k: keyof Row, label: string) {
    const on = sort.k === k;
    return (
      <th
        className={on ? "sorted" : ""}
        onClick={() => setSort((s) => ({ k, dir: s.k === k && s.dir === -1 ? 1 : -1 }))}
      >
        {label}{on ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  return (
    <main className="main2 screener-main">
        <div className="scr-filters">
          {/* branding chip */}
          <span className="chip on" style={{ cursor: "default" }} title={t("scanByOracle")}>
            <svg width="13" height="13" viewBox="0 0 24 24" style={{ fill: "var(--brand-2)" }}>
              <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
            </svg>
            Golden Oracle
          </span>

          {/* search input */}
          <input
            className="scr-search"
            type="search"
            placeholder={t("scrSearchPlaceholder")}
            value={searchRaw}
            onChange={(e) => { const v = e.target.value; startTransition(() => setSearchRaw(v)); }}
          />

          {/* verdict chips */}
          <button className={`chip${verdict === "all" ? " on" : ""}`} onClick={() => startTransition(() => setVerdict("all"))}>{t("anySignal")}</button>
          <button className={`chip${verdict === "buy" ? " on" : ""}`} onClick={() => startTransition(() => setVerdict("buy"))}>BUY</button>
          <button className={`chip${verdict === "sell" ? " on" : ""}`} onClick={() => startTransition(() => setVerdict("sell"))}>SELL</button>
          <button className={`chip${uptrend ? " on" : ""}`} onClick={() => startTransition(() => setUptrend((u) => !u))}>{t("uptrendRegime")}</button>

          {/* sec chips */}
          <button className={`chip${sec === "Equities" ? " on" : ""}`} onClick={() => startTransition(() => setSec((s) => s === "Equities" ? "all" : "Equities"))}>{t("equities")}</button>
          <button className={`chip${sec === "Crypto" ? " on" : ""}`} onClick={() => startTransition(() => setSec((s) => s === "Crypto" ? "all" : "Crypto"))}>{t("crypto")}</button>

          {/* mkt chips — derived from data, only rendered when >0 distinct values present */}
          {mktOptions.map((m) => (
            <button
              key={m}
              className={`chip${mktFilter === m ? " on" : ""}`}
              onClick={() => startTransition(() => setMktFilter((cur) => cur === m ? "all" : m))}
            >{m}</button>
          ))}

          {/* show-all affordance: reveal thin rows (symbol directory) */}
          <button
            className={`chip${showAll ? " on" : ""}`}
            onClick={() => startTransition(() => setShowAll((a) => !a))}
            title={t("scrShowAllTitle")}
          >{t("scrShowAll")}</button>

          <span className="scr-stat" style={{ marginLeft: "auto" }}>
            <span><b>{view.length}</b> {t("matches")}</span>
            <span><b className="up">{nBuy}</b> {t("buyLc")}</span>
            <span><b className="down">{nSell}</b> {t("sellLc")}</span>
            <span>{t("avgWR")} <b>{avgWr.toFixed(0)}%</b></span>
          </span>
          <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
            {t("scanAsOf").replace("{d}", asOf)}
          </span>
        </div>

        <div className="scr-table" ref={tableRef}>
          <table className="scr">
            <thead>
              <tr>
                {th("sym", t("symbol"))}
                {th("last", t("colLast"))}
                {th("chg", t("colChgPctShort"))}
                {th("verdict", t("signalCol"))}
                <th
                  onClick={() => setSort((s) => ({ k: "regimeBull", dir: s.k === "regimeBull" && s.dir === -1 ? 1 : -1 }))}
                  className={sort.k === "regimeBull" ? "sorted" : ""}
                >{t("regime")}</th>
                {th("wr", t("winRate"))}
                {th("pf", t("profitFactor"))}
                {th("cagr", t("cagr"))}
                {th("vol", t("colVolume"))}
              </tr>
            </thead>
            <tbody>
              {/* loading shimmer */}
              {!loaded && (
                <>
                  {Array.from({ length: SHIMMER_ROWS }).map((_, i) => (
                    <tr key={i} style={{ height: ROW_H }}>
                      {shimmerColWidths.map((w, j) => (
                        <td key={j} style={{ padding: "6px 16px" }}>
                          <div className="sk" style={{ height: 20, width: w, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {/* empty state */}
              {loaded && view.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--muted)", padding: "44px 16px", fontSize: 13 }}>
                    {err ? t("scanLoadErr") : t("noFilterMatch")}
                  </td>
                </tr>
              )}

              {/* top spacer preserving scroll height */}
              {loaded && paddingTop > 0 && (
                <tr style={{ height: paddingTop }}><td colSpan={9} /></tr>
              )}

              {/* windowed rows */}
              {loaded && windowedRows.map((r) => {
                const thin = r.last == null;
                // chg coloring: neutral when chg is null (thin row or missing)
                const chgCls = r.chg == null ? "" : r.chg >= 0 ? "up" : "down";
                const buy = isBuy(r.verdict);
                return (
                  <tr key={r.sym} onClick={() => { if (searchRaw.trim()) trackSearch(r.sym, "screener", searchRaw.trim()); router.push(`/terminal?sym=${r.sym}`); }}>
                    <td>
                      <div className="sym-cell">
                        <span className="ic" style={{ background: r.col }}>{r.sym[0]}</span>
                        <div>
                          <div className="tk">{r.sym}</div>
                          <div className="nm">{displayName(r, lang)}</div>
                        </div>
                      </div>
                    </td>
                    <td>{thin ? "—" : fmt(r.last, r.last != null && r.last < 10 ? 4 : 2)}</td>
                    <td className={chgCls}>{r.chg == null ? "—" : `${r.chg >= 0 ? "+" : ""}${fmt(r.chg)}%`}</td>
                    <td>{r.verdict ? <span className={`pill ${buy ? "buy" : "sell"}${verdictIsStale(r.vts) ? " stale" : ""}`} title={r.vts ? `${r.verdict} · ${r.vts}` : undefined}>{r.verdict}</span> : "—"}</td>
                    <td>
                      {r.regimeBull == null
                        ? "—"
                        : <span className={`regchip ${r.regimeBull ? "up" : "warn"}`}>{r.regimeBull ? t("uptrend") : t("mixed")}</span>}
                    </td>
                    <td>{r.wr != null ? (r.wr * 100).toFixed(0) + "%" : "—"}</td>
                    <td>{r.pf != null ? r.pf.toFixed(2) : "—"}</td>
                    <td>{r.cagr != null ? <>{(r.cagr * 100).toFixed(1)}%<span className="bar"><i style={{ width: `${Math.max(2, Math.min(100, r.cagr * 250))}%` }} /></span></> : "—"}</td>
                    <td className="num" style={{ color: "var(--text-2)" }}>{vol(r.vol)}</td>
                  </tr>
                );
              })}

              {/* bottom spacer preserving scroll height */}
              {loaded && paddingBottom > 0 && (
                <tr style={{ height: paddingBottom }}><td colSpan={9} /></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
  );
}
