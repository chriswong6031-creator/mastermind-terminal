"use client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const M = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// Average monthly return from history → a TrendSpider-style seasonality read (display-only).
export default function SeasonalityCard({ symbol }: { symbol: string }) {
  const t = useT();
  // per-month average return, or null for calendar months with no collected samples
  const [bars, setBars] = useState<(number | null)[] | null>(null);

  useEffect(() => {
    let dead = false;
    fetch(`/data/${symbol}.json`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (dead || !d?.bars?.length) { setBars(null); return; }
      const byMonthRet: number[][] = Array.from({ length: 12 }, () => []);
      // monthly close series → monthly returns bucketed by calendar month
      const monthly: { ym: string; c: number }[] = [];
      d.bars.forEach((b: any[]) => { const ym = b[0].slice(0, 7); const last = monthly[monthly.length - 1]; if (!last || last.ym !== ym) monthly.push({ ym, c: b[4] }); else last.c = b[4]; });
      for (let i = 1; i < monthly.length; i++) { const m = parseInt(monthly[i].ym.slice(5, 7)) - 1; byMonthRet[m].push((monthly[i].c - monthly[i - 1].c) / monthly[i - 1].c); }
      setBars(byMonthRet.map((a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length) * 100 : null)));
    }).catch(() => setBars(null));
    return () => { dead = true; };
  }, [symbol]);

  if (!bars) return null;
  const max = Math.max(...bars.map((b) => (b == null ? 0 : Math.abs(b))), 1);
  const now = new Date().getUTCMonth();
  return (
    <div className="card" style={{ borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, font: "600 10px/1 var(--font-ui)", letterSpacing: ".09em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 12 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" style={{ stroke: "var(--brand-2)", fill: "none", strokeWidth: 2 }}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        {t("seasonalityTitle")}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }}>
        {bars.map((b, i) => {
          const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i];
          const up = (b ?? 0) >= 0;
          return (
            <div key={i} title={b == null ? `${mn}: ${t("noSamples")}` : `${mn}: ${up ? "+" : ""}${b.toFixed(1)}%`}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: up ? "flex-end" : "flex-start", height: "100%" }}>
                {b == null
                  ? <div style={{ height: 2, background: "var(--line-3)", borderRadius: 2, opacity: 0.7 }} />
                  : <div style={{ height: `${(Math.abs(b) / max) * 46}%`, minHeight: 2, background: up ? "var(--up)" : "var(--down)", borderRadius: 2, opacity: i === now ? 1 : 0.55, outline: i === now ? "1px solid var(--brand-2)" : "none" }} />}
              </div>
              <span style={{ fontSize: 9, color: i === now ? "var(--brand-2)" : "var(--text-dim)", marginTop: 4 }}>{M[i]}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>{t("seasonalityFoot").replace("{sym}", symbol)}</div>
    </div>
  );
}
