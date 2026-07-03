"use client";
import { useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";

/* ── value formatting ───────────────────────────────────────────────── */
const fnum = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fpct = (n: number | null | undefined, d = 1, sign = true) =>
  n == null || !isFinite(n) ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(d)}%`;
const money = (n: number | null | undefined) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
};
const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
/* buy zone / band: the engine emits either a [lo,hi] tuple or a {low,high} object — render both */
const bandStr = (bz: any): string => {
  if (Array.isArray(bz)) return bz.length >= 2 && bz[0] != null ? (bz[0] === bz[1] ? fnum(bz[0]) : `${fnum(bz[0])}–${fnum(bz[1])}`) : "—";
  if (bz && bz.low != null && bz.high != null) return bz.low === bz.high ? fnum(bz.low) : `${fnum(bz.low)}–${fnum(bz.high)}`;
  return "—";
};

/* decision tone → semantic color + label */
function toneOf(verb?: string | null, tone?: string | null): { cls: string; color: string } {
  const v = (verb || "").toUpperCase();
  const t = (tone || "").toLowerCase();
  if (["BUY", "REBUY", "ADD", "ACCUMULATE"].includes(v) || t === "go") return { cls: "go", color: "var(--buy)" };
  if (["SELL", "TRIM", "CUT", "AVOID", "REDUCE"].includes(v) || ["stop", "sell"].includes(t)) return { cls: "stop", color: "var(--sell)" };
  return { cls: "wait", color: "var(--signal)" };
}

/* ── tiny visual primitives ─────────────────────────────────────────── */
function Ring({ score, color, size = 56 }: { score: number; color: string; size?: number }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg className="sa-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-3)" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" className="sa-ring-n" fill="var(--text)">{Math.round(score)}</text>
    </svg>
  );
}
/* diverging bar centered at 0, value in [-clamp, +clamp] */
function Diverge({ v, clamp = 2 }: { v: number | null | undefined; clamp?: number }) {
  const x = v == null || !isFinite(v) ? 0 : Math.max(-clamp, Math.min(clamp, v));
  const w = (Math.abs(x) / clamp) * 50;
  const pos = x >= 0;
  return (
    <span className="sa-div">
      <i className="sa-div-mid" />
      <i className="sa-div-fill" style={{ width: `${w}%`, left: pos ? "50%" : `${50 - w}%`, background: pos ? "var(--up)" : "var(--down)" }} />
    </span>
  );
}
/* 0..100 fill bar */
function Meter({ pct, color = "var(--brand)" }: { pct: number | null | undefined; color?: string }) {
  const w = pct == null || !isFinite(pct) ? 0 : Math.max(0, Math.min(100, pct));
  return <span className="sa-meter"><i style={{ width: `${w}%`, background: color }} /></span>;
}
function Spark({ data, color = "var(--brand-2)" }: { data: (number | null)[]; color?: string }) {
  const pts = (data || []).filter((x): x is number => x != null && isFinite(x));
  if (pts.length < 2) return null;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const W = 100, H = 26;
  const d = pts.map((v, i) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`).join(" ");
  return (
    <svg className="sa-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Section({ title, sub, children, accent }: { title: string; sub?: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="sa-sec">
      <div className="sa-sec-h" style={accent ? { borderLeftColor: accent } : undefined}>
        <span>{title}</span>{sub && <small>{sub}</small>}
      </div>
      {children}
    </div>
  );
}
function Stat({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "up" | "down" | "" }) {
  return <div className="sa-stat"><span className="k">{k}</span><span className={`v num ${tone || ""}`}>{v}</span></div>;
}

/* ── main component ─────────────────────────────────────────────────── */
export default function StockAnalysis({
  intel, row, slice, deep = false, onExpand,
}: {
  intel: any; row?: any; slice?: any; deep?: boolean; onExpand?: () => void;
}) {
  const { lang } = useLang();
  const zh = lang === "zh";
  // trust-tier popup: anchored with position:fixed to the badge so it can't be clipped by the
  // scrolling detail rail / modal body (an absolute popup gets cut off by their overflow:auto)
  const [trustPop, setTrustPop] = useState<{ x: number; y: number } | null>(null);
  const showTrust = (el: HTMLElement) => { const r = el.getBoundingClientRect(); setTrustPop({ x: Math.round(r.left), y: Math.round(r.bottom + 6) }); };
  const a = intel?.analysis;
  const pick = (en?: string | null, cn?: string | null) => (zh && cn ? cn : en) || "";

  const dec = a?.decision, conv = a?.conviction, entry = a?.entry, fac = a?.factors,
    tech = a?.tech, val = a?.valuation, fin = a?.financials, prof = a?.profile,
    sm = a?.smart_money, ae = a?.analyst, gex = a?.gex, macro = a?.macro, fl = a?.flows;

  const tn = useMemo(() => toneOf(dec?.verb, dec?.tone), [dec?.verb, dec?.tone]);
  const verb = (zh && dec?.verb_zh) ? dec.verb_zh : (dec?.verb || "—");
  const score = conv?.score ?? dec?.score ?? null;

  if (!a) {
    return (
      <div className="sa">
        <div className="sa-empty">
          <svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 3-2 4-2 6H7c0-2-2-3-2-6a7 7 0 0 1 7-7zM9 21h6" /></svg>
          <b>{pick("Deep analysis coming online", "深度分析即将上线")}</b>
          <span>{pick("This name isn't in the research desk yet — the chart, levels and oracle verdict above are live.", "该标的尚未进入研究台——上方的图表、关键价位与神谕判定仍然有效。")}</span>
        </div>
      </div>
    );
  }

  const sigs: any[] = slice?.indicator?.signals || [];

  return (
    <div className="sa">
      {/* ── DECISION HERO ── */}
      <div className={`sa-hero ${tn.cls}`}>
        <div className="sa-hero-l">
          <div className="sa-verb" style={{ color: tn.color }}>{verb}</div>
          <div className="sa-band">{pick(dec?.band_label, dec?.band_label_zh) || pick(conv?.band, conv?.band_zh)}</div>
          <div className="sa-head">{pick(dec?.headline, dec?.headline_zh)}</div>
          {pick(dec?.gloss, dec?.gloss_zh) && <div className="sa-gloss">{pick(dec?.gloss, dec?.gloss_zh)}</div>}
        </div>
        {score != null && (
          <div className="sa-hero-r">
            <Ring score={score} color={tn.color} />
            <span className="sa-ring-lbl">{pick("Conviction", "信心")}</span>
            {conv?.rank_pctile != null && <span className="sa-rank">{pick("Board rank", "板内排名")} {Math.round(conv.rank_pctile)}%</span>}
          </div>
        )}
      </div>
      {pick(dec?.trust_en, dec?.trust_zh) && (
        /* the trust tier is now just a compact badge; the full rationale is tucked into a hover/focus popup */
        <div className="sa-trust" tabIndex={0}
          onMouseEnter={(e) => showTrust(e.currentTarget)} onMouseLeave={() => setTrustPop(null)}
          onFocus={(e) => showTrust(e.currentTarget)} onBlur={() => setTrustPop(null)}>
          <span className="sa-trust-tier">{cap(dec?.trust_tier)}</span>
          <svg className="sa-trust-i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6h.01" /></svg>
          {trustPop && <div className="sa-trust-pop" role="tooltip" style={{ left: trustPop.x, top: trustPop.y }}>{pick(dec?.trust_en, dec?.trust_zh)}</div>}
        </div>
      )}
      {(() => {
        const drivers: string[] = conv?.drivers || [];
        const cautions: string[] = (zh && conv?.cautions_zh?.length ? conv.cautions_zh : conv?.cautions) || [];
        if (!drivers.length && !cautions.length) return null;
        return (
          <div className="sa-dc">
            {drivers.length > 0 && (
              <div className="sa-dc-grp">
                <span className="sa-dc-lbl up">{pick("Drivers", "驱动因素")}</span>
                <div className="sa-dc-tags">{drivers.slice(0, 4).map((d: string, i: number) => <span key={"d" + i} className="sa-tag up" title={pick("Supporting factor behind the read", "支撑该判定的因素")}>{d}</span>)}</div>
              </div>
            )}
            {cautions.length > 0 && (
              <div className="sa-dc-grp">
                <span className="sa-dc-lbl warn">{pick("Cautions", "风险提示")}</span>
                <div className="sa-dc-tags">{cautions.slice(0, 3).map((c: string, i: number) => <span key={"c" + i} className="sa-tag warn" title={pick("Risk / watch-out", "需要注意的风险")}>{c}</span>)}</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── ENTRY TIMING ── */}
      {entry && (entry.status || entry.headline) && (
        <Section title={pick("Entry timing", "入场时机")} sub={entry.grade ? `${pick("grade", "评级")} ${cap(entry.grade)}` : undefined}
          accent={entry.status === "open" ? "var(--buy)" : entry.status === "blocked" ? "var(--down)" : "var(--signal)"}>
          <div className="sa-entry-head">
            <span className={`sa-status ${entry.status}`}>{cap(entry.urgency || entry.status)}</span>
            <b>{pick(entry.headline, entry.headline_zh)}</b>
          </div>
          {pick(entry.action, entry.action_zh) && <div className="sa-entry-act">{pick(entry.action, entry.action_zh)}</div>}
          {/* two-column stacked mini-stats: labels sit above values so nothing clips or overlaps at any rail width */}
          <div className="sa-levels">
            <Stat k={pick("Buy zone", "买入区")} v={bandStr(entry.buy_zone)} />
            <Stat k={pick("Chase >", "追入>")} v={fnum(entry.chase_above)} />
            <Stat k={pick("Spot", "现价")} v={fnum(entry.spot)} />
            <Stat k={pick("Stop", "止损")} v={fnum(entry.stop)} tone="down" />
            <Stat k="ATR" v={fpct(entry.atr_pct, 1, false)} />
            <Stat k={pick("Confidence", "置信度")} v={entry.confidence != null ? fnum(entry.confidence, 1) : "—"} />
          </div>
          {entry.horizon && (entry.horizon.d3 != null || entry.horizon.d21 != null || entry.horizon.d63 != null) && (
            <div className="sa-horizon">
              <span className="sa-horizon-lbl">{pick("Forward edge", "前瞻收益")}</span>
              <div className="sa-horizon-boxes">
                {([["3d", entry.horizon.d3], ["21d", entry.horizon.d21], ["63d", entry.horizon.d63]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="sa-hz"><span className="hk">{k}</span><span className={`hv num ${(v ?? 0) >= 0 ? "up" : "down"}`}>{fpct(v, 2)}</span></div>
                ))}
              </div>
            </div>
          )}
          {entry.cycle && entry.cycle.pct_through != null && (() => {
            const cyc = entry.cycle;
            const pct = Math.max(0, Math.min(100, cyc.pct_through));
            const band = Array.isArray(cyc.dc_band) && cyc.dc_band.length === 2 && cyc.dc_band[1]
              ? { left: Math.max(0, Math.min(100, (cyc.dc_band[0] / (cyc.dc_band[1] * 1.4)) * 100)), width: Math.max(0, Math.min(40, (Math.abs(cyc.dc_band[1] - cyc.dc_band[0]) / (cyc.dc_band[1] * 1.4)) * 100)) }
              : null;
            const phase = cap((cyc.phase || "").replace(/_/g, " "));
            return (
              <div className="sa-cycle">
                <div className="sa-cycle-h">
                  <span>{pick("Cycle position", "周期位置")}</span>
                  <span className="num">{phase}{cyc.dc_day != null ? ` · ${pick("day", "第")} ${fnum(cyc.dc_day, 0)}` : ""}</span>
                </div>
                <div className="sa-cycle-track" title={pick("How far through the current cycle price is. The gold band is the typical entry window; the marker is where price sits now.", "价格在当前周期中的进度。金色区间为典型入场窗口，标记为当前位置。")}>
                  {band && <span className="sa-cycle-band" style={{ left: `${band.left}%`, width: `${band.width}%` }} />}
                  <i className="sa-cycle-fill" style={{ width: `${pct}%` }} />
                  <span className="sa-cycle-now" style={{ left: `${pct}%` }} />
                </div>
                <div className="sa-cycle-legend">
                  <span className="lg band">{pick("Entry window", "入场窗口")}</span>
                  <span className="lg now">{pick("Now", "当前")}</span>
                </div>
              </div>
            );
          })()}
        </Section>
      )}

      {/* ── TECHNICALS ── */}
      {tech && (
        <Section title={pick("Technical read", "技术面")}>
          <div className="sa-chips">
            <span className={`sa-chip ${tech.above200 ? "up" : "down"}`}>{tech.above200 ? "▲" : "▼"} 200-MA</span>
            <span className={`sa-chip ${tech.above50 ? "up" : "down"}`}>{tech.above50 ? "▲" : "▼"} 50-MA</span>
            {tech.golden && <span className="sa-chip up">{pick("Golden cross", "金叉")}</span>}
            {tech.macd_pos != null && <span className={`sa-chip ${tech.macd_pos ? "up" : "down"}`}>MACD {tech.macd_pos ? "+" : "−"}</span>}
            {tech.squeeze_on && <span className="sa-chip warn">{pick("In squeeze", "挤压中")}</span>}
            {tech.adx_trend && <span className="sa-chip">ADX {cap(tech.adx_trend)}</span>}
          </div>
          <div className="sa-grid2">
            <Stat k="RSI(14)" v={fnum(tech.rsi14, 0)} tone={tech.rsi14 != null ? (tech.rsi14 > 70 ? "down" : tech.rsi14 < 30 ? "up" : "") : ""} />
            <Stat k={pick("vs 50-MA", "相对50日")} v={fpct(tech.pct_vs_50dma)} tone={(tech.pct_vs_50dma ?? 0) >= 0 ? "up" : "down"} />
            <Stat k={pick("vs 200-MA", "相对200日")} v={fpct(tech.pct_vs_200dma)} tone={(tech.pct_vs_200dma ?? 0) >= 0 ? "up" : "down"} />
            <Stat k={pick("Off 52w high", "距52周高")} v={fpct(tech.off_52w_high_pct)} tone="down" />
          </div>
          <div className="sa-rets">
            {([["1M", tech.ret_1m], ["3M", tech.ret_3m], ["6M", tech.ret_6m], ["12M", tech.ret_12m]] as [string, number][]).map(([k, v]) => (
              <div key={k} className="sa-ret"><span className="rk">{k}</span><span className={`rv num ${(v ?? 0) >= 0 ? "up" : "down"}`}>{fpct(v, 1)}</span></div>
            ))}
          </div>
        </Section>
      )}

      {/* ── FACTOR PROFILE ── */}
      {fac?.legs && (
        <Section title={pick("Factor profile", "因子画像")} sub={fac.z != null ? `z ${fnum(fac.z, 2)}` : undefined}>
          {Object.entries(fac.legs).map(([k, v]: any) => v != null && (
            <div key={k} className="sa-factor">
              <span className="fk">{pick(({ momentum: "Momentum", value: "Value", quality: "Quality", profitability: "Profitability", revisions: "Revisions" } as any)[k] || cap(k),
                ({ momentum: "动量", value: "价值", quality: "质量", profitability: "盈利", revisions: "修正" } as any)[k])}</span>
              <Diverge v={v} />
              <span className={`fv num ${v >= 0 ? "up" : "down"}`}>{v > 0 ? "+" : ""}{fnum(v, 2)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ── VALUATION ── */}
      {val?.ratios?.length && (
        <Section title={pick("Valuation", "估值")} sub={val.forward_pe != null ? `fwd P/E ${fnum(val.forward_pe, 1)}` : undefined}>
          {val.ratios.map((r: any, i: number) => (
            <div key={i} className="sa-val">
              <span className="vk">{r.label}</span>
              <span className="vv num">{fnum(r.v, 1)}<small>{pick("med", "中位")} {fnum(r.med, 1)}</small></span>
              <span className="vmeter" title={`${pick("cheapness pctile", "便宜度分位")} ${fnum(r.cheap, 0)}`}>
                <Meter pct={r.cheap} color={r.cheap != null && r.cheap >= 50 ? "var(--up)" : "var(--down)"} />
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* ── FINANCIALS ── */}
      {fin && (fin.net_margin != null || fin.multiyear) && (
        <Section title={pick("Financials", "财务")} sub={fin.multiyear?.rev_cagr != null ? `${pick("rev CAGR", "营收复合")} ${fpct(fin.multiyear.rev_cagr, 0)}` : undefined}>
          <div className="sa-grid3">
            <Stat k={pick("Gross", "毛利率")} v={fpct(fin.gross_margin, 0, false)} />
            <Stat k={pick("Net", "净利率")} v={fpct(fin.net_margin, 0, false)} />
            <Stat k={pick("FCF", "自由现金流")} v={fpct(fin.fcf_margin, 0, false)} />
            <Stat k="ROE" v={fpct(fin.roe, 0, false)} tone={(fin.roe ?? 0) >= 15 ? "up" : ""} />
            <Stat k={pick("Rev growth", "营收增长")} v={fpct(fin.rev_growth, 0)} tone={(fin.rev_growth ?? 0) >= 0 ? "up" : "down"} />
            <Stat k={pick("Debt/assets", "负债率")} v={fpct(fin.debt_to_assets, 0, false)} />
          </div>
          {fin.multiyear?.revenue?.length > 1 && (
            <div className="sa-fin-spark">
              <div><span className="sl">{pick("Revenue", "营收")}</span><Spark data={fin.multiyear.revenue} color="var(--brand-2)" /></div>
              {fin.multiyear.eps?.length > 1 && <div><span className="sl">EPS</span><Spark data={fin.multiyear.eps} color="var(--up)" /></div>}
            </div>
          )}
          {(fin.multiyear?.piotroski != null || fin.multiyear?.altman != null) && (
            <div className="sa-quality-row">
              {fin.multiyear?.piotroski != null && <span className="sa-qchip">Piotroski <b>{fnum(fin.multiyear.piotroski, 0)}/9</b></span>}
              {fin.multiyear?.altman != null && <span className="sa-qchip">Altman-Z <b>{fnum(fin.multiyear.altman, 1)}</b></span>}
            </div>
          )}
        </Section>
      )}

      {/* ── SMART MONEY ── */}
      {sm?.holders?.length && (
        <Section title={pick("Smart money", "聪明钱")} sub={sm.n_holders != null ? `${sm.n_holders} ${pick("funds", "基金")}${sm.is_vip ? " · VIP" : ""}` : undefined}>
          {sm.holders.slice(0, deep ? 6 : 4).map((h: any, i: number) => (
            <div key={i} className="sa-holder">
              <span className={`sa-act ${h.action}`}>{cap(h.action)}</span>
              <span className="hn">{h.fund}{h.grade && <small className="hg">{h.grade}</small>}</span>
              <span className="hv num">{fpct(h.pct_portfolio, 1, false)}</span>
              <span className="hval num">{money(h.value_usd)}</span>
            </div>
          ))}
          {(sm.n_buying != null || sm.n_selling != null) && (
            <div className="sa-bs"><span className="up">{sm.n_buying ?? 0} {pick("buying", "增持")}</span><span className="down">{sm.n_selling ?? 0} {pick("selling", "减持")}</span></div>
          )}
        </Section>
      )}

      {/* ── ANALYSTS + EARNINGS ── */}
      {ae && (ae.next_date || ae.surprises || ae.target != null || ae.rating || ae.buy != null) && (
        <Section title={pick("Analysts & earnings", "分析师与财报")}
          sub={ae.sue_z != null ? `SUE ${fnum(ae.sue_z, 1)}` : ae.n_analysts != null ? `${fnum(ae.n_analysts, 0)} ${pick("analysts", "分析师")}` : undefined}>
          {(ae.rating || ae.buy != null || ae.hold != null || ae.sell != null) && (
            <div className="sa-chips">
              {ae.rating && <span className={`sa-chip ${(["Buy", "买入"].includes(ae.rating) ? "up" : ["Sell", "卖出"].includes(ae.rating) ? "down" : "")}`}>{pick(ae.rating, ae.rating_zh) || ae.rating}</span>}
              {(ae.buy != null || ae.hold != null || ae.sell != null) && (
                <span className="sa-chip">{ae.buy ?? 0} <b className="up">{pick("buy", "买")}</b> · {ae.hold ?? 0} {pick("hold", "持")} · {ae.sell ?? 0} <b className="down">{pick("sell", "卖")}</b></span>
              )}
            </div>
          )}
          <div className="sa-grid3">
            {ae.next_date && <Stat k={pick("Next report", "下次财报")} v={ae.next_date} />}
            {ae.eps_forecast != null && <Stat k={pick("EPS est", "EPS预期")} v={fnum(ae.eps_forecast, 2)} />}
            {ae.forward_pe != null && <Stat k={pick("Fwd P/E", "预期市盈")} v={fnum(ae.forward_pe, 1)} />}
            {ae.target != null && <Stat k={pick("Target", "目标价")} v={fnum(ae.target)} />}
            {ae.upside_pct != null && <Stat k={pick("Upside", "上行空间")} v={fpct(ae.upside_pct, 1)} tone={(ae.upside_pct ?? 0) >= 0 ? "up" : "down"} />}
            {ae.target_low != null && ae.target_high != null && <Stat k={pick("Target range", "目标区间")} v={`${fnum(ae.target_low)}–${fnum(ae.target_high)}`} />}
            {ae.beats != null && ae.total != null && <Stat k={pick("Beats", "超预期")} v={`${ae.beats}/${ae.total}`} tone={ae.beats >= ae.total ? "up" : ""} />}
            {ae.avg_surprise != null && <Stat k={pick("Avg surprise", "平均超预期")} v={fpct(ae.avg_surprise)} tone={(ae.avg_surprise ?? 0) >= 0 ? "up" : "down"} />}
            {ae.div_yield != null && <Stat k={pick("Div yield", "股息率")} v={fpct(ae.div_yield, 2, false)} />}
          </div>
          {ae.surprises?.length && (
            <div className="sa-surprises">
              {ae.surprises.slice().reverse().map((s: any, i: number) => (
                <div key={i} className="sa-surp"><span className="sq">{s.qtr}</span><span className={`sp num ${(s.surprise_pct ?? 0) >= 0 ? "up" : "down"}`}>{fpct(s.surprise_pct)}</span></div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── FLOWS & POSITIONING (CN 融资 margin / HK 港股通 southbound) ── */}
      {fl && (fl.own_pct != null || fl.fin_balance_yi != null || fl.lhb_count != null || fl.block_count != null) && (
        <Section title={pick("Flows & positioning", "资金与持仓")}
          sub={fl.kind === "southbound" ? pick("Southbound", "南向资金") : pick("Margin · dragon-tiger", "融资 · 龙虎榜")}>
          <div className="sa-chips">
            {fl.kind === "southbound" ? (
              <>
                {fl.own_pct != null && <span className="sa-chip">{pick("Owns", "持股")} {fpct(fl.own_pct, 1, false)} {pick("of float", "流通")}</span>}
                {fl.chg5_pct != null && <span className={`sa-chip ${fl.chg5_pct >= 0 ? "up" : "down"}`}>{pick("5-day", "5日")} {fpct(fl.chg5_pct, 1)}</span>}
                {fl.hold_b != null && <span className="sa-chip">HK${fnum(fl.hold_b, 1)}B</span>}
                {fl.label && <span className="sa-chip">{cap(fl.label)}</span>}
              </>
            ) : (
              <>
                {fl.fin_balance_yi != null && <span className="sa-chip">{pick("Margin bal", "融资余额")} ¥{fnum(fl.fin_balance_yi, 1)}亿</span>}
                {fl.chg_pct != null && <span className={`sa-chip ${fl.chg_pct >= 0 ? "up" : "down"}`}>{fpct(fl.chg_pct, 1)}</span>}
                {fl.pct_mcap != null && <span className="sa-chip">{fpct(fl.pct_mcap, 1, false)} {pick("of mkt cap", "占市值")}</span>}
                {fl.lhb_count != null && <span className={`sa-chip ${(fl.lhb_net_yi ?? 0) >= 0 ? "up" : "down"}`}>{pick("龙虎榜", "龙虎榜")} ×{fl.lhb_count}{fl.lhb_net_yi != null ? ` · ${fl.lhb_net_yi >= 0 ? "+" : ""}¥${fnum(fl.lhb_net_yi, 1)}亿` : ""}</span>}
                {fl.block_count != null && <span className="sa-chip">{pick("Block", "大宗")} ×{fl.block_count}{fl.block_amount_yi != null ? ` · ¥${fnum(fl.block_amount_yi, 1)}亿` : ""}</span>}
              </>
            )}
          </div>
        </Section>
      )}

      {/* ── DEEP: OPTIONS / DEALER GAMMA ── */}
      {deep && gex && (
        <Section title={pick("Options · dealer gamma", "期权 · 做市商Gamma")} sub={gex.gamma_regime ? `${cap(gex.gamma_regime)} γ` : undefined} accent="var(--signal)">
          <div className="sa-grid2">
            <Stat k={pick("Gamma flip", "Gamma翻转")} v={fnum(gex.gamma_flip)} />
            <Stat k={pick("Dist to flip", "距翻转")} v={fpct(gex.dist_to_flip_pct)} />
            <Stat k={pick("Call wall", "看涨墙")} v={fnum(gex.call_wall)} tone="down" />
            <Stat k={pick("Put wall", "看跌墙")} v={fnum(gex.put_wall)} tone="up" />
            <Stat k="Net GEX" v={gex.net_gex_bn != null ? `${fnum(gex.net_gex_bn, 2)}B` : "—"} />
            <Stat k="IV30" v={gex.iv30 != null ? fpct(gex.iv30 * 100, 0, false) : "—"} />
          </div>
          {gex.vol_hole?.state && (
            <div className="sa-volhole">
              <span className="sa-chip warn">{pick("Vol hole", "波动洞")}: {gex.vol_hole.state.replace(/_/g, " ")}</span>
              {gex.vol_hole.band_width_pct != null && <span className="vh-meta">{pick("band", "区间")} {fpct(gex.vol_hole.band_width_pct, 1, false)}</span>}
            </div>
          )}
        </Section>
      )}

      {/* ── DEEP: MACRO SENSITIVITY ── */}
      {deep && macro && (macro.tier_en || macro.headline_en) && (
        <Section title={pick("Macro sensitivity", "宏观敏感度")}>
          <div className="sa-chips">
            {macro.tier_en && <span className="sa-chip">{pick("Rate: ", "利率：")}{pick(macro.tier_en, macro.tier_zh)}</span>}
            {macro.duration_en && <span className="sa-chip">{macro.duration_en}</span>}
            {macro.regime_en && <span className="sa-chip">{macro.regime_en}</span>}
            {macro.inflation_en && <span className="sa-chip">{macro.inflation_en}</span>}
          </div>
          {pick(macro.headline_en, macro.headline_zh) && <div className="sa-macro-head">{pick(macro.headline_en, macro.headline_zh)}</div>}
        </Section>
      )}

      {/* ── DEEP: SIGNAL HISTORY ── */}
      {deep && sigs.length > 0 && (
        <Section title={pick("Signal history", "信号历史")} sub={`${sigs.length} ${pick("events", "次")}`}>
          <div className="sa-siglog">
            {sigs.slice(-12).reverse().map((s: any, i: number) => {
              const b = s.type === "BUY" || s.type === "REBUY";
              return <div key={i} className="sa-sigrow"><span className={`sa-sigt ${b ? "buy" : "sell"}`}>{s.type}</span><span className="sd">{s.ts}</span><span className="spx num">{typeof s.price === "number" ? fnum(s.price) : "—"}</span></div>;
            })}
          </div>
        </Section>
      )}

      {/* ── BUSINESS PROFILE ── */}
      {prof && (prof.description || prof.sector) && (
        <Section title={pick("Business profile", "公司概况")}>
          <div className="sa-prof-meta">
            {prof.sector && <span className="sa-chip">{prof.sector}</span>}
            {prof.mktcap_tier && <span className="sa-chip">{pick(prof.mktcap_tier, prof.mktcap_tier_zh)}</span>}
            {prof.mktcap_bn != null && <span className="sa-chip">${fnum(prof.mktcap_bn, 0)}B</span>}
            {prof.archetype && <span className="sa-chip">{pick(prof.archetype, prof.archetype_zh)}</span>}
          </div>
          {pick(prof.description, prof.description_zh) && <p className="sa-desc">{pick(prof.description, prof.description_zh)}</p>}
        </Section>
      )}

      {!deep && onExpand && (
        <button className="sa-expand" onClick={onExpand}>
          <svg viewBox="0 0 24 24"><path d="M4 14v6h6M20 10V4h-6M14 10l6-6M10 14l-6 6" /></svg>
          {pick("Open full analysis", "打开完整分析")}
        </button>
      )}
    </div>
  );
}
