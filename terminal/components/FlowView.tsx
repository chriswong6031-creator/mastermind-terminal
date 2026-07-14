"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";
import { useLang, useT } from "@/lib/i18n";

// ─── Types from feed contract ────────────────────────────────────────────────

type DteBucket = "0d" | "1_7d" | "8_30d" | "31_90d" | "90p";
type MnyBucket = "itm" | "atm" | "near_otm" | "far_otm";
type Side = "~buy" | "~sell" | "mixed";

interface FlowEvent {
  id: string;
  ts: string;
  root: string;
  group: string;
  group_zh: string;
  right: "C" | "P";
  exp: string;
  strike: number;
  dte: number;
  dte_bucket: DteBucket;
  mny_bucket: MnyBucket;
  side: Side;
  n_prints: number;
  size: number;
  avg_price: number;
  premium: number;
  premium_z: number | null;
  baseline_source: string;
  vol_gt_oi: boolean | null;
  repeated: boolean;
  zerodte: boolean;
  signing_source: string;
}

interface UnusualName {
  root: string;
  group: string;
  group_zh: string;
  gross_premium_today: number;
  prem_z: number | null;
  baseline_source: string;
  n_obs: number;
  call_prem_share: number;
  top_contracts: { right: "C" | "P"; exp: string; strike: number; premium: number }[];
}

interface HeatGroup {
  group: string;
  group_zh: string;
  gross_premium: number;
  net_signed_premium_soft: number;
  call_prem_share: number;
  n_events: number;
  top: { root: string; premium: number }[];
}

interface FeedPayload {
  schema?: string;
  asof: string;
  session_date?: string;
  session_pct?: number;
  baseline_note?: { en: string; zh: string };
  events: FlowEvent[];
  unusual_names: UnusualName[];
  stale?: boolean;
}

interface HeatPayload {
  schema?: string;
  asof: string;
  groups: HeatGroup[];
  stale?: boolean;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtPremium(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  } catch {
    return iso.slice(11, 16);
  }
}

function fmtAsof(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" });
  } catch {
    return iso;
  }
}

function isStale(iso: string): boolean {
  try {
    return Date.now() - new Date(iso).getTime() > 10 * 60 * 1000;
  } catch {
    return false;
  }
}

function fmtContract(right: "C" | "P", exp: string, strike: number): string {
  const month = exp.slice(5, 7);
  const day = exp.slice(8, 10);
  return `${strike}${right} ${month}/${day}`;
}

function netToneGlyph(net: number): string {
  if (net > 0) return "~▲";
  if (net < 0) return "~▼";
  return "·";
}

// Premium filter buckets
const PREM_FILTERS: { label: string; value: number }[] = [
  { label: "$100K", value: 100_000 },
  { label: "$250K", value: 250_000 },
  { label: "$500K", value: 500_000 },
  { label: "$1M", value: 1_000_000 },
  { label: "$5M", value: 5_000_000 },
];

const DTE_BUCKETS: { key: DteBucket; en: string; zh: string }[] = [
  { key: "0d", en: "0DTE", zh: "当日" },
  { key: "1_7d", en: "1–7d", zh: "1–7天" },
  { key: "8_30d", en: "8–30d", zh: "8–30天" },
  { key: "31_90d", en: "31–90d", zh: "31–90天" },
  { key: "90p", en: "90d+", zh: "90天+" },
];

const MNY_BUCKETS: { key: MnyBucket; en: string; zh: string }[] = [
  { key: "itm", en: "ITM", zh: "实值" },
  { key: "atm", en: "ATM", zh: "平值" },
  { key: "near_otm", en: "Near OTM", zh: "近虚值" },
  { key: "far_otm", en: "Far OTM", zh: "深虚值" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function FlowView() {
  const { lang, setLang } = useLang();
  const t = useT();

  // Data state
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [heat, setHeat] = useState<HeatPayload | null>(null);
  const [lastFeedTs, setLastFeedTs] = useState<string>("");
  const [fetchError, setFetchError] = useState(false);

  // Filter state
  const [minPrem, setMinPrem] = useState<number>(0);
  const [dteBuckets, setDteBuckets] = useState<Set<DteBucket>>(new Set());
  const [mnyBuckets, setMnyBuckets] = useState<Set<MnyBucket>>(new Set());
  const [groupFilter, setGroupFilter] = useState<string>(""); // heat-chip click or group select
  const [tickerSearch, setTickerSearch] = useState<string>("");
  const [drillTicker, setDrillTicker] = useState<string | null>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<"ts" | "premium">("ts");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const doFetch = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const [fr, hr] = await Promise.all([
        fetch("/api/flow?f=feed", { cache: "no-store" }),
        fetch("/api/flow?f=heat", { cache: "no-store" }),
      ]);
      if (fr.ok) {
        const fj = await fr.json() as FeedPayload;
        setFeed(fj);
        setLastFeedTs(fj.asof);
        setFetchError(false);
      }
      if (hr.ok) {
        const hj = await hr.json() as HeatPayload;
        setHeat(hj);
      }
    } catch {
      setFetchError(true);
    }
  }, []);

  useEffect(() => {
    doFetch();
    pollRef.current = setInterval(doFetch, 45_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [doFetch]);

  // ── Filtered events ────────────────────────────────────────────────────────

  const events = useMemo<FlowEvent[]>(() => {
    const all = feed?.events ?? [];
    return all.filter((e) => {
      if (minPrem > 0 && e.premium < minPrem) return false;
      if (dteBuckets.size > 0 && !dteBuckets.has(e.dte_bucket)) return false;
      if (mnyBuckets.size > 0 && !mnyBuckets.has(e.mny_bucket)) return false;
      const activeGroup = drillTicker ? "" : groupFilter;
      if (activeGroup && e.group !== activeGroup) return false;
      if (drillTicker && e.root !== drillTicker) return false;
      const q = tickerSearch.trim().toUpperCase();
      if (q && !e.root.includes(q)) return false;
      return true;
    }).sort((a, b) => {
      const va = sortKey === "ts" ? new Date(a.ts).getTime() : a.premium;
      const vb = sortKey === "ts" ? new Date(b.ts).getTime() : b.premium;
      return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
    });
  }, [feed, minPrem, dteBuckets, mnyBuckets, groupFilter, drillTicker, tickerSearch, sortKey, sortDir]);

  // ── Drill card data ────────────────────────────────────────────────────────

  const drillUnusual = useMemo<UnusualName | null>(() => {
    if (!drillTicker) return null;
    return feed?.unusual_names.find((u) => u.root === drillTicker) ?? null;
  }, [feed, drillTicker]);

  // ── Sort helper ────────────────────────────────────────────────────────────

  function handleSort(k: "ts" | "premium") {
    if (sortKey === k) setSortDir((d) => (d === -1 ? 1 : -1));
    else { setSortKey(k); setSortDir(-1); }
  }

  // ── DTE preset: 8–90d ─────────────────────────────────────────────────────

  function toggleDteMid() {
    const mid: DteBucket[] = ["8_30d", "31_90d"];
    const allOn = mid.every((b) => dteBuckets.has(b));
    setDteBuckets((prev) => {
      const next = new Set(prev);
      if (allOn) { mid.forEach((b) => next.delete(b)); }
      else { mid.forEach((b) => next.add(b)); }
      return next;
    });
  }

  const dteMidOn = ["8_30d", "31_90d"].every((b) => dteBuckets.has(b as DteBucket));

  // ── Stale check ───────────────────────────────────────────────────────────

  const dataStale = (feed?.stale) || (lastFeedTs ? isStale(lastFeedTs) : false);

  // ─── Render ───────────────────────────────────────────────────────────────

  const heatGroups = heat?.groups ?? [];
  const unusualNames = feed?.unusual_names ?? [];

  return (
    <div className="app2">
      <MobileNav email="" />
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <span className="page-title">{t("flow", "Flow")}</span>
        <div className="spacer" />
        {lastFeedTs && (
          <span style={{ color: "var(--text-dim)", fontSize: 11, marginRight: 12 }}>
            {t("asOf", "as of")} {fmtAsof(lastFeedTs)}
            {dataStale && (
              <span style={{ marginLeft: 6, color: "var(--warn)", fontWeight: 600 }}>
                {lang === "zh" ? "延迟" : "delayed"}
              </span>
            )}
          </span>
        )}
        <button
          className="chip"
          style={{ marginLeft: 8 }}
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          title={lang === "zh" ? "Switch to English" : "切换中文"}
        >
          {lang === "zh" ? "EN" : "中文"}
        </button>
      </header>

      <AppNav />

      <main className="main2 flow-view" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ── Heat strip ── */}
        <div className="flow-heat-strip">
          {heatGroups.length === 0 && !fetchError && (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {t("loadingHeat", "Loading group data…")}
            </span>
          )}
          {heatGroups.map((g) => {
            const glyph = netToneGlyph(g.net_signed_premium_soft);
            const toneUp = g.net_signed_premium_soft > 0;
            const toneDown = g.net_signed_premium_soft < 0;
            const on = groupFilter === g.group && !drillTicker;
            const gName = lang === "zh" ? g.group_zh : g.group;
            return (
              <button
                key={g.group}
                className={`chip${on ? " on" : ""}`}
                onClick={() => {
                  setDrillTicker(null);
                  setGroupFilter((f) => (f === g.group ? "" : g.group));
                }}
                style={{ gap: 5 }}
              >
                <span>{gName}</span>
                <span style={{ color: "var(--text-2)", fontWeight: 700 }}>
                  {fmtPremium(g.gross_premium)}
                </span>
                <span
                  style={{
                    color: toneUp
                      ? "var(--up)"
                      : toneDown
                      ? "var(--down)"
                      : "var(--muted)",
                    fontWeight: 700,
                    fontSize: 10,
                  }}
                >
                  {glyph}
                </span>
              </button>
            );
          })}
          {groupFilter && !drillTicker && (
            <button
              className="chip"
              onClick={() => setGroupFilter("")}
              style={{ marginLeft: 4, color: "var(--muted)" }}
              title={lang === "zh" ? "清除筛选" : "Clear filter"}
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Filter bar ── */}
        <div className="flow-filter-bar">
          {/* Min premium */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
              {t("minPrem", "Min prem")}
            </span>
            <select
              value={minPrem}
              onChange={(e) => setMinPrem(Number(e.target.value))}
              style={{
                height: 28,
                padding: "0 8px",
                borderRadius: "var(--r-md)",
                background: "var(--inset)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                font: "600 12px var(--font-ui)",
                cursor: "pointer",
              }}
            >
              <option value={0}>{t("anyPrem", "Any")}</option>
              {PREM_FILTERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* DTE buckets */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
              {t("dte", "DTE")}
            </span>
            <button
              className={`chip${dteMidOn ? " on" : ""}`}
              style={{ height: 26, fontSize: 11 }}
              onClick={toggleDteMid}
              title={lang === "zh" ? "8–90天快选" : "8–90d preset"}
            >
              8–90d
            </button>
            {DTE_BUCKETS.map((b) => (
              <button
                key={b.key}
                className={`chip${dteBuckets.has(b.key) ? " on" : ""}`}
                style={{ height: 26, fontSize: 11 }}
                onClick={() =>
                  setDteBuckets((prev) => {
                    const next = new Set(prev);
                    if (next.has(b.key)) next.delete(b.key);
                    else next.add(b.key);
                    return next;
                  })
                }
              >
                {lang === "zh" ? b.zh : b.en}
              </button>
            ))}
          </div>

          {/* Moneyness */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>
              {t("mny", "Mny")}
            </span>
            {MNY_BUCKETS.map((b) => (
              <button
                key={b.key}
                className={`chip${mnyBuckets.has(b.key) ? " on" : ""}`}
                style={{ height: 26, fontSize: 11 }}
                onClick={() =>
                  setMnyBuckets((prev) => {
                    const next = new Set(prev);
                    if (next.has(b.key)) next.delete(b.key);
                    else next.add(b.key);
                    return next;
                  })
                }
              >
                {lang === "zh" ? b.zh : b.en}
              </button>
            ))}
          </div>

          {/* Ticker search */}
          <input
            type="text"
            placeholder={lang === "zh" ? "代码筛选…" : "Ticker…"}
            value={tickerSearch}
            onChange={(e) => { setTickerSearch(e.target.value); setDrillTicker(null); }}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: "var(--r-md)",
              background: "var(--inset)",
              border: "1px solid var(--line)",
              color: "var(--text)",
              font: "13px var(--font-ui)",
              outline: "none",
              width: 110,
            }}
          />

          {/* Clear all filters */}
          {(minPrem > 0 || dteBuckets.size > 0 || mnyBuckets.size > 0 || groupFilter || tickerSearch || drillTicker) && (
            <button
              className="chip"
              style={{ marginLeft: 4, color: "var(--muted)", height: 26, fontSize: 11 }}
              onClick={() => {
                setMinPrem(0);
                setDteBuckets(new Set());
                setMnyBuckets(new Set());
                setGroupFilter("");
                setTickerSearch("");
                setDrillTicker(null);
              }}
            >
              {lang === "zh" ? "重置" : "Reset"}
            </button>
          )}
        </div>

        {/* ── Drill card ── */}
        {drillTicker && (
          <div className="flow-drill-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{drillTicker}</span>
              {drillUnusual && (
                <>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>
                    {lang === "zh" ? drillUnusual.group_zh : drillUnusual.group}
                  </span>
                  <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                    {lang === "zh" ? "运行保费" : "Running prem"}{" "}
                    <strong>{fmtPremium(drillUnusual.gross_premium_today)}</strong>
                  </span>
                  <span style={{ color: "var(--text-2)", fontSize: 12 }}>
                    {drillUnusual.prem_z != null
                      ? `z=${drillUnusual.prem_z.toFixed(1)}`
                      : lang === "zh"
                      ? "基线积累中"
                      : "baseline warming"}
                  </span>
                  {drillUnusual.top_contracts.length > 0 && (
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>
                      {lang === "zh" ? "主力合约：" : "Top: "}
                      {drillUnusual.top_contracts.slice(0, 3).map((c, i) => (
                        <span key={i} style={{ marginRight: 8 }}>
                          {fmtContract(c.right, c.exp, c.strike)} {fmtPremium(c.premium)}
                        </span>
                      ))}
                    </span>
                  )}
                </>
              )}
              <button
                className="chip"
                style={{ marginLeft: "auto", height: 24, fontSize: 11, color: "var(--muted)" }}
                onClick={() => setDrillTicker(null)}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Main body: table + unusual rail ── */}
        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

          {/* Feed table */}
          <div className="scr-table" style={{ flex: 1 }}>
            {fetchError && !feed && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                {lang === "zh" ? "数据暂时不可用，请稍后重试。" : "Feed unavailable — retrying…"}
              </div>
            )}
            {!fetchError && !feed && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                {lang === "zh" ? "加载中…" : "Loading…"}
              </div>
            )}
            {feed && (
              <table className="scr" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th
                      style={{ textAlign: "left", cursor: "pointer" }}
                      className={sortKey === "ts" ? "sorted" : ""}
                      onClick={() => handleSort("ts")}
                    >
                      {t("colTime", "Time")} ET{sortKey === "ts" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                    </th>
                    <th style={{ textAlign: "left" }}>{t("colTicker", "Ticker")}</th>
                    <th>{t("colSide", "Side")}</th>
                    <th>{t("colCP", "C/P")}</th>
                    <th>{t("colContract", "Contract")}</th>
                    <th>{t("colDte", "DTE")}</th>
                    <th>{t("colMny", "Mny")}</th>
                    <th>{t("colSize", "Size")}</th>
                    <th
                      style={{ cursor: "pointer" }}
                      className={sortKey === "premium" ? "sorted" : ""}
                      onClick={() => handleSort("premium")}
                    >
                      {t("colPrem", "Prem")}{sortKey === "premium" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
                    </th>
                    <th>{t("colFlags", "Flags")}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && (
                    <tr className="empty-row">
                      <td colSpan={10} style={{ textAlign: "center", color: "var(--muted)", padding: "40px 16px", fontSize: 13 }}>
                        {lang === "zh" ? "暂无符合条件的记录。" : "No events match these filters."}
                      </td>
                    </tr>
                  )}
                  {events.map((e) => {
                    const isBuy = e.side === "~buy";
                    const isSell = e.side === "~sell";
                    return (
                      <tr
                        key={e.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => setDrillTicker((d) => (d === e.root ? null : e.root))}
                      >
                        <td style={{ textAlign: "left", fontVariantNumeric: "tabular-nums", color: "var(--text-dim)" }}>
                          {fmtTime(e.ts)}
                        </td>
                        <td style={{ textAlign: "left", fontWeight: 600 }}>{e.root}</td>
                        <td>
                          <span
                            className={isBuy ? "pill buy" : isSell ? "pill sell" : ""}
                            style={!isBuy && !isSell ? { color: "var(--muted)", fontSize: 11 } : {}}
                          >
                            {e.side}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: e.right === "C" ? "var(--up)" : "var(--down)", fontWeight: 700 }}>
                            {e.right}
                          </span>
                        </td>
                        <td style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-2)" }}>
                          {fmtContract(e.right, e.exp, e.strike)}
                        </td>
                        <td>
                          <span className="flow-dte-chip">
                            {lang === "zh"
                              ? DTE_BUCKETS.find((b) => b.key === e.dte_bucket)?.zh ?? e.dte_bucket
                              : DTE_BUCKETS.find((b) => b.key === e.dte_bucket)?.en ?? e.dte_bucket}
                          </span>
                        </td>
                        <td>
                          <span className="flow-mny-chip">
                            {lang === "zh"
                              ? MNY_BUCKETS.find((b) => b.key === e.mny_bucket)?.zh ?? e.mny_bucket
                              : MNY_BUCKETS.find((b) => b.key === e.mny_bucket)?.en ?? e.mny_bucket}
                          </span>
                        </td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {e.size.toLocaleString("en-US")}
                        </td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtPremium(e.premium)}
                        </td>
                        <td>
                          <span style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            {e.zerodte && (
                              <span className="flow-flag-chip">
                                {lang === "zh" ? "当日" : "0DTE"}
                              </span>
                            )}
                            {e.vol_gt_oi && (
                              <span className="flow-flag-chip">
                                {lang === "zh" ? "量超持仓" : "vol>OI"}
                              </span>
                            )}
                            {e.repeated && (
                              <span className="flow-flag-chip">
                                {lang === "zh" ? "重复" : "repeat"}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Unusual names rail */}
          {unusualNames.length > 0 && (
            <div className="flow-unusual-rail">
              <div style={{ fontWeight: 700, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>
                {lang === "zh" ? "异常活跃（启发式）" : "Notable Activity (Heuristic)"}
              </div>
              {unusualNames.map((u) => (
                <button
                  key={u.root}
                  className={`flow-unusual-row${drillTicker === u.root ? " on" : ""}`}
                  onClick={() => setDrillTicker((d) => (d === u.root ? null : u.root))}
                >
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{u.root}</span>
                  <span style={{ color: "var(--text-2)", fontSize: 11, marginLeft: 4 }}>
                    {lang === "zh" ? u.group_zh : u.group}
                  </span>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                    {fmtPremium(u.gross_premium_today)}{" "}
                    {u.prem_z != null
                      ? `· z=${u.prem_z.toFixed(1)} (${u.baseline_source})`
                      : lang === "zh"
                      ? "· 基线积累中"
                      : "· baseline warming"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Disclaimer ── */}
        <div className="flow-disclaimer">
          {lang === "zh"
            ? "标注与方向标签为启发式近似（~），仅供展示，不构成投资建议。"
            : "Notability and direction labels are heuristic and approximate (~). Display only — not investment advice."}
        </div>
      </main>
    </div>
  );
}
