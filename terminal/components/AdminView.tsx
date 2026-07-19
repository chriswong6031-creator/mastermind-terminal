"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";
import { useT } from "@/lib/i18n";

type Ev = { id: number; created_at: string; symbol: string; query: string | null; source: string; user_id: string | null; anon_id: string | null; ip: string | null; ua: string | null };
type Stats = { total: number; today: number; visitors7d: number; topSymbols7d: { symbol: string; count: number }[]; perDay14d: { day: string; count: number }[] };

// visitor identity precedence mirrors the storage plane: user_id > anon_id > ip
const visitorId = (e: Ev) => e.user_id || e.anon_id || e.ip || "";

export default function AdminView({ email }: { email: string }) {
  const t = useT();
  const [events, setEvents] = useState<Ev[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [symInput, setSymInput] = useState("");
  const [symbol, setSymbol] = useState(""); // committed (uppercased) symbol filter
  const [source, setSource] = useState("");
  const [visitor, setVisitor] = useState("");
  const [tick, setTick] = useState(0); // manual Refresh

  const query = useCallback((before?: number | null) => {
    const p = new URLSearchParams({ limit: "100" });
    if (before != null) p.set("before", String(before));
    else p.set("stats", "1"); // stats only on first page — cursor pages skip the aggregate
    if (symbol) p.set("symbol", symbol);
    if (source) p.set("source", source);
    if (visitor) p.set("visitor", visitor);
    return fetch("/api/admin/searches?" + p.toString(), { cache: "no-store" });
  }, [symbol, source, visitor]);

  // commit symbol filter 400ms after typing stops (Enter commits immediately)
  useEffect(() => {
    const id = setTimeout(() => setSymbol(symInput.trim().toUpperCase()), 400);
    return () => clearTimeout(id);
  }, [symInput]);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    // Drop the previous filter's rows + cursor so stale rows never sit under the Loading row and
    // Load More can't fire a stale-cursor page mid-refetch (the button hides until page 1 lands).
    setEvents([]);
    setNextBefore(null);
    query().then(async (r) => {
      if (!alive) return;
      if (!r.ok) { setDenied(true); return; }
      const d = await r.json();
      if (!alive) return;
      setEvents(d.events || []);
      setNextBefore(d.nextBefore ?? null);
      setUserMap((m) => ({ ...m, ...(d.userMap || {}) }));
      if (d.stats) setStats(d.stats);
    }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [query, tick]);

  async function loadMore() {
    if (nextBefore == null || busy || !loaded) return;
    setBusy(true);
    try {
      const r = await query(nextBefore);
      if (!r.ok) { setDenied(true); return; }
      const d = await r.json();
      setEvents((ev) => [...ev, ...(d.events || [])]);
      setNextBefore(d.nextBefore ?? null);
      setUserMap((m) => ({ ...m, ...(d.userMap || {}) }));
    } catch {} finally {
      setBusy(false);
    }
  }

  const sources = useMemo(() => {
    const s = new Set(events.map((e) => e.source));
    if (source) s.add(source); // keep the active filter selectable when its page is empty
    return Array.from(s).sort();
  }, [events, source]);

  const top = (stats?.topSymbols7d || []).slice(0, 10);
  const topMax = Math.max(1, ...top.map((x) => x.count));
  const vLabel = visitor ? userMap[visitor] ?? (visitor.length > 14 ? visitor.slice(0, 12) + "…" : visitor) : "";

  return (
    <div className="app2">
      <MobileNav email={email} />
      <header className="topbar">
        <BrandLockup /><div className="tdiv" /><span className="page-title">{t("pageAdmin", "Admin")}</span>
        <div className="spacer" />
        <form action="/auth/signout" method="post"><button className="avatar" title={`${email} · sign out`}>{(email || "U")[0].toUpperCase()}</button></form>
      </header>
      <AppNav />
      <main className="main2">
        {denied ? (
          <div className="pg">
            <div className="panel"><div style={{ padding: "26px 15px", color: "var(--muted)", fontSize: 13 }}>{t("admDenied", "Admin access required.")}</div></div>
          </div>
        ) : (
          <div className="adm-body">
            <div className="adm-side">
              <div className="grp">{t("admAnalytics", "Analytics")}</div>
              <button className="adm-tab on">{t("admSearchLog", "Search Log")}</button>
            </div>
            <div className="pg">
              <div className="pg-head"><h2>{t("admSearchLog", "Search Log")}</h2><span className="sub">{t("admSearchLogSub", "every committed ticker search, by visitor")}</span></div>

              <div className="kpis">
                <div className="kpi"><small>{t("admTotalSearches", "Total searches")}</small><b>{stats ? stats.total : "—"}</b></div>
                <div className="kpi"><small>{t("admToday", "Today")}</small><b style={{ color: "var(--brand-2)" }}>{stats ? stats.today : "—"}</b></div>
                <div className="kpi"><small>{t("admVisitors7d", "Visitors · 7d")}</small><b>{stats ? stats.visitors7d : "—"}</b></div>
                <div className="kpi"><small>{t("admTopSymbol7d", "Top symbol · 7d")}</small><b style={{ color: "var(--signal)" }}>{stats?.topSymbols7d?.[0]?.symbol ?? "—"}</b></div>
              </div>

              <div className="panel">
                <div className="ph">{t("admTopSymbols", "Top symbols — 7d")}</div>
                {top.length === 0 && <div style={{ padding: "22px 15px", color: "var(--muted)", fontSize: 13 }}>{t("admNoData", "No data yet.")}</div>}
                {top.map((x, i) => (
                  <div key={x.symbol} className="adm-top-row">
                    <span style={{ color: "var(--muted)" }}>{i + 1}</span>
                    <span style={{ fontWeight: 600 }}>{x.symbol}</span>
                    <span className="num" style={{ color: "var(--text-2)" }}>{x.count}</span>
                    <span className="bar"><i style={{ width: `${(x.count / topMax) * 100}%` }} /></span>
                  </div>
                ))}
              </div>

              <div className="panel">
                <div className="ph">{t("admLog", "Log")}<span className="sub">{events.length} {t("admLoaded", "loaded")} · {stats?.total ?? "?"} {t("admTotal", "total")}</span></div>
                <div className="scr-filters adm-filters">
                  <input
                    aria-label={t("admSymbol", "Symbol")}
                    placeholder={t("admFilterSymbol", "Symbol…")}
                    value={symInput}
                    onChange={(e) => setSymInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSymbol(symInput.trim().toUpperCase()); }}
                    style={{ width: 120 }}
                  />
                  <select aria-label={t("admSource", "Source")} value={source} onChange={(e) => setSource(e.target.value)}>
                    <option value="">{t("admAllSources", "all sources")}</option>
                    {sources.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {visitor && (
                    <button className="chip on" title={visitor} onClick={() => setVisitor("")}>
                      {t("admVisitor", "visitor")} <span className="v">{vLabel}</span> ✕
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ height: 34, marginLeft: "auto" }} onClick={() => setTick((x) => x + 1)}>{t("admRefresh", "Refresh")}</button>
                </div>
                <table className="ptable adm-log">
                  <colgroup>
                    <col className="c-time" /><col className="c-sym" /><col /><col className="c-src" /><col className="c-vis" /><col className="c-ip" />
                  </colgroup>
                  <thead><tr>
                    <th>{t("admColTime", "Time")}</th><th>{t("admColSymbol", "Symbol")}</th><th>{t("admColQuery", "Query")}</th>
                    <th>{t("admColSource", "Source")}</th><th>{t("admColVisitor", "Visitor")}</th><th>{t("admColIp", "IP")}</th>
                  </tr></thead>
                  <tbody>
                    {!loaded && (
                      <tr className="empty-row"><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "44px 16px", fontSize: 13 }}>{t("admLoading", "Loading…")}</td></tr>
                    )}
                    {loaded && events.length === 0 && (
                      <tr className="empty-row"><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: "44px 16px", fontSize: 13 }}>{t("admNoSearches", "No searches logged yet.")}</td></tr>
                    )}
                    {events.map((e) => {
                      const vid = visitorId(e);
                      const label = e.user_id ? userMap[e.user_id] ?? "user:" + e.user_id.slice(0, 8) : e.anon_id ? "anon:" + e.anon_id.slice(0, 8) : e.ip ?? "—";
                      return (
                        <tr key={e.id}>
                          <td><span className="num" style={{ fontFamily: "var(--font-num)", fontSize: 12, color: "var(--text-2)" }}>{new Date(e.created_at).toLocaleString()}</span></td>
                          <td style={{ fontWeight: 600 }}>{e.symbol}</td>
                          <td style={{ color: "var(--text-2)", fontStyle: "italic" }}>{e.query ?? "—"}</td>
                          <td><span className="pill" style={{ color: "var(--text-2)", background: "var(--panel-2)" }}>{e.source}</span></td>
                          <td>
                            {vid
                              ? <span title={vid} style={{ color: "var(--brand-2)", cursor: "pointer" }} onClick={() => setVisitor(vid)}>{label}</span>
                              : <span style={{ color: "var(--muted)" }}>—</span>}
                          </td>
                          <td><span className="num" style={{ fontFamily: "var(--font-num)", fontSize: 12, color: "var(--muted)" }}>{e.ip ?? "—"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {nextBefore != null && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <button className="btn btn-ghost" style={{ height: 34 }} onClick={loadMore} disabled={busy}>{busy ? t("admLoading", "Loading…") : t("admLoadMore", "Load more")}</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <div className="ticker"><span className="lbl">{t("pageAdmin", "Admin")}</span><span style={{ color: "var(--text-2)" }}>{t("admSearchLogSub", "every committed ticker search, by visitor")}</span></div>
    </div>
  );
}
