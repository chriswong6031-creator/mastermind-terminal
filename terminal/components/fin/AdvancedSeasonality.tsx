"use client";
/**
 * AdvancedSeasonality — the analytics deck beneath the interactive overlay.
 * Every panel recomputes over the caller-supplied ACTIVE year set:
 *   • headline insight cards (this-month edge, best hold window + overfit
 *     verdict, running hot/cold, seasonal fuel-left, coherence),
 *   • Path Fan-Cone (typical trajectory + where this year sits),
 *   • Month Edge table (avg / median / win-rate w/ Wilson CI / best-worst / n),
 *   • Optimal Holding-Window matrix (best contiguous month span to hold),
 *   • Quarter contribution + Share-of-Return donut (the pie),
 *   • Year-Agreement sign matrix (outlier-immune, visibly respects the toggle).
 *
 * All math lives in lib/seasonal.ts; small N is surfaced honestly (N shown,
 * Wilson intervals, hatched thin-sample cells, permutation-tested best window).
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type CSSProperties, type ReactNode } from "react";
import { fmtNum, fmtPct, pick } from "../../lib/finFormat";
import { Donut, FinTip, useFinTip } from "./FinCharts";
import {
  HORIZON,
  MONTHS_EN,
  MONTHS_ZH,
  QUARTERS,
  monthBoundIdx,
  idxToDateLabel,
  monthlyStats,
  quarterStats,
  holdingWindows,
  bestWindow,
  fullYearStats,
  fanCone,
  runway,
  shareOfReturn,
  signAgreement,
  overfitGuard,
  currentMonthIdx,
  wilson,
  yearColor,
  type YearData,
  type WindowStat,
} from "../../lib/seasonal";

interface Props {
  years: YearData[];
  active: Set<string>;
  zh?: boolean;
}

const num = (v: number | null | undefined): v is number => v != null && isFinite(v);
const P = (v: number) => fmtPct(v, { alreadyPct: true, sign: true, decimals: 1 });
const WRp = (w: number) => `${Math.round(w * 100)}%`;
/** English ordinal suffix (1st, 2nd, 3rd, 21st, 42nd …). */
const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const pctileTxt = (frac: number, zh: boolean) => (zh ? `${Math.round(frac * 100)} 分位` : `${ord(Math.round(frac * 100))} pctile`);

function useBoxW(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = Math.round(el.clientWidth);
      if (cw > 0) setW(cw);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export function AdvancedSeasonality({ years, active, zh = false }: Props) {
  const isActive = useMemo(() => (yr: string) => active.has(yr), [active]);
  const nActive = years.filter((y) => active.has(y.year)).length;
  if (nActive === 0) {
    return (
      <div className="fin-adv">
        <div className="fin-adv-empty">{pick(zh, "Select at least one year to see seasonality stats.", "请至少选择一个年份以查看季节性统计。")}</div>
      </div>
    );
  }
  return (
    <div className="fin-adv">
      <div className="fin-adv-title">{pick(zh, "Advanced seasonality", "高级季节性")}<span className="fin-adv-n">N = {nActive}{pick(zh, " yrs", "年")}</span></div>
      <HeadlineCards years={years} isActive={isActive} zh={zh} />
      <FanConePanel years={years} isActive={isActive} zh={zh} />
      <div className="fin-adv-row2">
        <MonthEdgePanel years={years} isActive={isActive} zh={zh} />
        <HoldingMatrixPanel years={years} isActive={isActive} zh={zh} />
      </div>
      <div className="fin-adv-row3">
        <QuarterPanel years={years} isActive={isActive} zh={zh} />
        <ShareDonutPanel years={years} isActive={isActive} zh={zh} />
        <YearAgreementPanel years={years} isActive={isActive} zh={zh} />
      </div>
    </div>
  );
}

/* ── headline insight cards ──────────────────────────────────────────────── */
function HeadlineCards({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const monthsL = zh ? MONTHS_ZH : MONTHS_EN;
  const curM = currentMonthIdx(years);
  const ms = useMemo(() => monthlyStats(years, isActive), [years, isActive]);
  const edge = ms[curM];
  const grid = useMemo(() => holdingWindows(years, isActive), [years, isActive]);
  const best = useMemo(() => bestWindow(grid, "hold", 2), [grid]);
  const rw = useMemo(() => runway(years, isActive), [years, isActive]);

  // overfit guard is heavier — compute in an effect so it never blocks paint
  const key = years.map((y) => y.year).join(",") + "|" + years.filter((y) => isActive(y.year)).map((y) => y.year).join(",");
  const [guard, setGuard] = useState<ReturnType<typeof overfitGuard> | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setGuard(overfitGuard(years, isActive, 200)), 0);
    return () => clearTimeout(id);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const verdictTone = guard?.verdict === "NOTABLE" ? "up" : guard?.verdict === "WEAK" ? "warn" : guard?.verdict === "NOISE" ? "down" : "";
  const verdictTxt =
    guard?.verdict === "NOTABLE" ? pick(zh, "notable", "显著") : guard?.verdict === "WEAK" ? pick(zh, "weak", "偏弱") : guard?.verdict === "NOISE" ? pick(zh, "likely noise", "疑似噪声") : "";

  return (
    <div className="fin-adv-cards">
      {/* this month's edge */}
      <div className="fin-adv-card">
        <div className="fin-adv-card-t">{pick(zh, "This month · ", "本月 · ")}{monthsL[curM]}</div>
        {edge && edge.n > 0 ? (
          <>
            <div className={"fin-adv-card-v " + ((edge.mean ?? 0) >= 0 ? "up" : "down")}>{edge.mean != null ? P(edge.mean) : "—"}</div>
            <div className="fin-adv-card-s">{pick(zh, "avg · ", "平均 · ")}{edge.wr != null ? `${edge.pos}/${edge.n} ${pick(zh, "up", "上涨")}` : "—"}{edge.n < 4 && <span className="fin-adv-flag">{pick(zh, "low N", "样本少")}</span>}</div>
          </>
        ) : (
          <div className="fin-adv-card-v muted">—</div>
        )}
      </div>

      {/* best window to hold */}
      <div className="fin-adv-card">
        <div className="fin-adv-card-t">{pick(zh, "Best window to hold", "最佳持有区间")}</div>
        {best && best.mean != null ? (
          <>
            <div className="fin-adv-card-v up">{monthsL[best.start]}→{monthsL[best.end]}<span className="fin-adv-holdlen"> · {best.end - best.start + 1}{pick(zh, "mo", "月")}</span></div>
            <div className="fin-adv-card-s">{P(best.mean)} {pick(zh, "avg", "平均")} · {best.wr != null ? WRp(best.wr) : "—"} {pick(zh, "WR", "胜率")}
              {verdictTxt && <span className={"fin-adv-flag " + verdictTone}>{verdictTxt}</span>}
            </div>
          </>
        ) : (
          <div className="fin-adv-card-v muted">—</div>
        )}
      </div>

      {/* running hot / cold */}
      {rw.frontier != null && rw.gap != null ? (
        <div className="fin-adv-card">
          <div className="fin-adv-card-t">{pick(zh, "Running hot / cold", "当前强弱")}</div>
          <div className={"fin-adv-card-v " + (rw.gap >= 0 ? "up" : "down")}>{rw.gap >= 0 ? "+" : ""}{fmtNum(rw.gap, { decimals: 1 })}%</div>
          <div className="fin-adv-card-s">{rw.gap >= 0 ? pick(zh, "ahead of a typical year", "领先常年") : pick(zh, "behind a typical year", "落后常年")}{rw.pct != null && ` · ${pctileTxt(rw.pct, zh)}`}</div>
        </div>
      ) : null}

      {/* seasonal fuel left */}
      {rw.frontier != null && rw.fuelMean != null ? (
        <div className="fin-adv-card">
          <div className="fin-adv-card-t">{pick(zh, "Seasonal fuel left", "季节性剩余空间")}</div>
          <div className={"fin-adv-card-v " + (rw.fuelMean >= 0 ? "up" : "down")}>{rw.fuelMean >= 0 ? "+" : ""}{fmtNum(rw.fuelMean, { decimals: 1 })}%</div>
          <div className="fin-adv-card-s">{pick(zh, "avg to year-end", "至年末平均")}{rw.fuelP25 != null && rw.fuelP75 != null && ` · ${fmtNum(rw.fuelP25, { decimals: 0 })}…${fmtNum(rw.fuelP75, { decimals: 0 })}%`}</div>
        </div>
      ) : null}

      {/* coherence */}
      <CoherenceCard years={years} isActive={isActive} zh={zh} />
    </div>
  );
}

function CoherenceCard({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const sa = useMemo(() => signAgreement(years, isActive), [years, isActive]);
  const tone = sa.label === "CONSISTENT" ? "up" : sa.label === "MIXED" ? "warn" : "down";
  const txt = sa.label === "CONSISTENT" ? pick(zh, "Consistent", "一致") : sa.label === "MIXED" ? pick(zh, "Mixed", "混合") : sa.label === "WEAK" ? pick(zh, "Weak", "弱") : "—";
  return (
    <div className="fin-adv-card">
      <div className="fin-adv-card-t">{pick(zh, "How much to trust it", "可信度")}</div>
      <div className={"fin-adv-card-v " + (sa.score == null ? "muted" : tone)}>{txt}</div>
      <div className="fin-adv-card-s">{sa.score != null ? `${pick(zh, "sign agreement ", "同向占比 ")}${Math.round(sa.score * 100)}%` : "—"}</div>
    </div>
  );
}

/* ── Path Fan-Cone ───────────────────────────────────────────────────────── */
function FanConePanel({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const { tip, show, hide } = useFinTip();
  const box = useBoxW(840);
  const cone = useMemo(() => fanCone(years, isActive), [years, isActive]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const vw = box.w;
  const vh = 240;
  const PAD = { t: 10, r: 46, b: 26, l: 8 };
  const iw = vw - PAD.l - PAD.r;
  const ih = vh - PAD.t - PAD.b;
  const months = zh ? MONTHS_ZH : MONTHS_EN;
  const bounds = monthBoundIdx();

  if (cone.points.length === 0 && !cone.current) {
    return <Panel title={pick(zh, "Typical path", "常年轨迹")} subtitle={pick(zh, "median trajectory + this year", "中位轨迹 + 今年")}><div className="fin-adv-panel-empty">{pick(zh, "No data", "暂无数据")}</div></Panel>;
  }

  let lo = Infinity, hi = -Infinity;
  for (const p of cone.points) { lo = Math.min(lo, p.min); hi = Math.max(hi, p.max); }
  if (cone.current) for (const v of cone.current) if (num(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!isFinite(lo)) { lo = -1; hi = 1; }
  lo = Math.min(lo, 0); hi = Math.max(hi, 0);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;

  const x = (i: number) => PAD.l + (i / (HORIZON - 1)) * iw;
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;

  const bandPath = (top: (p: (typeof cone.points)[number]) => number, bot: (p: (typeof cone.points)[number]) => number) => {
    const up = cone.points.map((p) => `${x(p.i).toFixed(1)},${y(top(p)).toFixed(1)}`);
    const dn = cone.points.slice().reverse().map((p) => `${x(p.i).toFixed(1)},${y(bot(p)).toFixed(1)}`);
    return "M" + up.join(" L") + " L" + dn.join(" L") + " Z";
  };
  const medLine = cone.points.map((p) => `${x(p.i).toFixed(1)},${y(p.med).toFixed(1)}`).join(" ");
  const curLine = cone.current ? cone.current.map((v, i) => (num(v) ? `${x(i).toFixed(1)},${y(v as number).toFixed(1)}` : null)).filter(Boolean).join(" ") : "";

  const idxAt = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const localX = (clientX - rect.left) * (vw / rect.width);
    return Math.max(0, Math.min(HORIZON - 1, Math.round(((localX - PAD.l) / Math.max(1, iw)) * (HORIZON - 1))));
  };
  const onMove = (e: RPointerEvent) => {
    const i = idxAt(e.clientX);
    setHoverIdx(i);
    const cp = cone.points.find((p) => p.i === i) ?? cone.points.reduce<null | (typeof cone.points)[number]>((best, p) => (best == null || Math.abs(p.i - i) < Math.abs(best.i - i) ? p : best), null);
    const rows = cp
      ? [
          { label: pick(zh, "Median", "中位"), value: P(cp.med), color: "var(--text)" },
          { label: "P25–P75", value: `${P(cp.p25)} … ${P(cp.p75)}`, color: "var(--muted)" },
        ]
      : [];
    if (cone.current && num(cone.current[i])) rows.push({ label: cone.curYear ?? pick(zh, "This year", "今年"), value: P(cone.current[i] as number), color: "var(--brand-2)" });
    show(e, idxToDateLabel(i, zh) + ` · N=${cp?.n ?? 0}`, rows);
  };

  return (
    <Panel title={pick(zh, "Typical seasonal path", "常年季节轨迹")} subtitle={pick(zh, "median + P25–P75 band, this year overlaid", "中位 + P25–P75 区间，叠加今年")} n={cone.nBand}>
      <div className="fin-adv-chartbox" ref={box.ref} style={{ height: vh }}>
        <svg ref={svgRef} viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" className="fin-svg">
          {bounds.map((bi, m) => (m > 0 ? <line key={m} className="fin-seas-sep" x1={x(bi)} x2={x(bi)} y1={PAD.t} y2={PAD.t + ih} /> : null))}
          <line className="fin-grid fin-grid-0" x1={PAD.l} x2={vw - PAD.r} y1={y(0)} y2={y(0)} />
          <text className="fin-axis-y" x={vw - PAD.r + 4} y={y(0) + 3}>0%</text>
          {cone.points.length > 0 && <path className="fin-cone-outer" d={bandPath((p) => p.max, (p) => p.min)} />}
          {cone.points.length > 0 && <path className="fin-cone-inner" d={bandPath((p) => p.p75, (p) => p.p25)} />}
          {medLine && <polyline className="fin-cone-med" points={medLine} fill="none" />}
          {curLine && <polyline className="fin-cone-cur" points={curLine} fill="none" />}
          {cone.frontier != null && <line className="fin-cone-now" x1={x(cone.frontier)} x2={x(cone.frontier)} y1={PAD.t} y2={PAD.t + ih} />}
          {bounds.map((bi, m) => {
            const x1 = m < 11 ? x(bounds[m + 1]) : x(HORIZON - 1);
            return <text key={m} className="fin-seas-mlbl" x={(x(bi) + x1) / 2} y={vh - 8} textAnchor="middle">{months[m]}</text>;
          })}
          {hoverIdx != null && <line className="fin-seas-crossline" x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD.t} y2={PAD.t + ih} />}
          <rect x={PAD.l} y={PAD.t} width={iw} height={ih} fill="transparent" className="fin-seas-overlay" onPointerMove={onMove} onPointerLeave={() => { setHoverIdx(null); hide(); }} />
        </svg>
      </div>
      <div className="fin-adv-conelegend">
        <span className="fin-adv-cl"><i className="fin-adv-cl-med" />{pick(zh, "Median", "中位")}</span>
        <span className="fin-adv-cl"><i className="fin-adv-cl-band" />P25–P75</span>
        <span className="fin-adv-cl"><i className="fin-adv-cl-outer" />{pick(zh, "Min–Max", "极值")}</span>
        {cone.curYear && <span className="fin-adv-cl"><i className="fin-adv-cl-cur" />{cone.curYear}</span>}
      </div>
    </Panel>
  );
}

/* ── Month Edge table ────────────────────────────────────────────────────── */
type SortKey = "month" | "mean" | "wr";
function MonthEdgePanel({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const monthsL = zh ? MONTHS_ZH : MONTHS_EN;
  const curM = currentMonthIdx(years);
  const ms = useMemo(() => monthlyStats(years, isActive), [years, isActive]);
  const [sort, setSort] = useState<SortKey>("month");
  const rows = useMemo(() => {
    const r = ms.slice();
    if (sort === "mean") r.sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity));
    else if (sort === "wr") r.sort((a, b) => (b.wr ?? -Infinity) - (a.wr ?? -Infinity));
    return r;
  }, [ms, sort]);

  return (
    <Panel title={pick(zh, "Month edge", "月度优势")} subtitle={pick(zh, "avg · win-rate (Wilson 95%) · best/worst", "平均 · 胜率(Wilson 95%) · 最佳/最差")}>
      <div className="fin-adv-table-scroll">
        <table className="fin-adv-table">
          <thead>
            <tr>
              <th className="l" onClick={() => setSort("month")}>{pick(zh, "Mo", "月")}</th>
              <th className={"r sortable" + (sort === "mean" ? " on" : "")} onClick={() => setSort("mean")}>{pick(zh, "Avg", "平均")}</th>
              <th className="r">{pick(zh, "Med", "中位")}</th>
              <th className={"wr sortable" + (sort === "wr" ? " on" : "")} onClick={() => setSort("wr")}>{pick(zh, "Win rate", "胜率")}</th>
              <th className="r">{pick(zh, "Best", "最佳")}</th>
              <th className="r">{pick(zh, "Worst", "最差")}</th>
              <th className="r dim">N</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const isNow = s.month === curM;
              const [lo, hi] = s.n > 0 ? wilson(s.pos, s.n) : [0, 1];
              const point = s.wr ?? 0;
              const straddle = lo < 0.5 && hi > 0.5;
              return (
                <tr key={s.month} className={"fin-adv-trow" + (isNow ? " now" : "") + (s.n < 4 ? " lowN" : "")}>
                  <td className="l">
                    {monthsL[s.month]}
                    {isNow && <span className="fin-adv-nowchip">NOW</span>}
                  </td>
                  <td className={"r " + (num(s.mean) ? (s.mean! >= 0 ? "up" : "down") : "")}>{num(s.mean) ? P(s.mean!) : "—"}</td>
                  <td className={"r " + (num(s.median) ? (s.median! >= 0 ? "up" : "down") : "")}>{num(s.median) ? P(s.median!) : "—"}</td>
                  <td className="wr">
                    {s.n > 0 ? (
                      <span className="fin-adv-wrbar" title={`${Math.round(lo * 100)}–${Math.round(hi * 100)}% CI`}>
                        <span className={"fin-adv-wrci" + (straddle ? " straddle" : "")} style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
                        <span className={"fin-adv-wrfill" + (point >= 0.5 ? " up" : " down")} style={{ width: `${point * 100}%` }} />
                        <span className="fin-adv-wrtxt">{WRp(point)}</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="r up sm">{s.best ? `${P(s.best.ret)}` : "—"}<span className="fin-adv-yr">{s.best?.year.slice(2)}</span></td>
                  <td className="r down sm">{s.worst ? `${P(s.worst.ret)}` : "—"}<span className="fin-adv-yr">{s.worst?.year.slice(2)}</span></td>
                  <td className="r dim">{s.n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ── Optimal Holding-Window matrix ───────────────────────────────────────── */
function HoldingMatrixPanel({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const { tip, show, hide } = useFinTip();
  const monthsL = zh ? MONTHS_ZH : MONTHS_EN;
  const grid = useMemo(() => holdingWindows(years, isActive), [years, isActive]);
  const best = useMemo(() => bestWindow(grid, "hold", 2), [grid]);
  const bestSharpe = useMemo(() => bestWindow(grid, "sharpe", 2), [grid]);
  const nActive = years.filter((y) => isActive(y.year)).length;

  let maxAbs = 0;
  for (let s = 0; s < 12; s++) for (let e = s; e < 12; e++) { const w = grid[s][e]; if (w && num(w.mean)) maxAbs = Math.max(maxAbs, Math.abs(w.mean!)); }
  if (maxAbs === 0) maxAbs = 1;

  const size = 300;
  const lab = 16;
  const cell = (size - lab) / 12;

  const cellTip = (e: RPointerEvent, w: WindowStat) => {
    show(e, `${monthsL[w.start]} → ${monthsL[w.end]}`, [
      { label: pick(zh, "Avg", "平均"), value: num(w.mean) ? P(w.mean!) : "—", color: num(w.mean) && w.mean! >= 0 ? "var(--up)" : "var(--down)" },
      { label: pick(zh, "Median", "中位"), value: num(w.median) ? P(w.median!) : "—", color: "var(--text-2)" },
      { label: pick(zh, "Win rate", "胜率"), value: w.wr != null ? `${WRp(w.wr)} (${w.n})` : "—", color: "var(--text-2)" },
      { label: pick(zh, "Risk-adj", "风险调整"), value: num(w.sharpe) ? fmtNum(w.sharpe, { decimals: 2 }) : "—", color: "var(--muted)" },
    ]);
  };

  return (
    <Panel title={pick(zh, "Optimal holding window", "最佳持有窗口")} subtitle={pick(zh, "buy after row → sell after col · avg span return", "行=买入后 → 列=卖出后 · 区间平均收益")}>
      {best && best.mean != null ? (
        <div className="fin-adv-bestcall">
          <span className="fin-adv-bestcall-w">{monthsL[best.start]} → {monthsL[best.end]} <span className="fin-adv-holdlen">· {best.end - best.start + 1}{pick(zh, "mo", "月")}</span></span>
          <span className="fin-adv-bestcall-v up">{P(best.mean)}</span>
          <span className="fin-adv-bestcall-s">{best.wr != null ? `${WRp(best.wr)} ${pick(zh, "WR", "胜率")}` : ""} · N={best.n}</span>
        </div>
      ) : null}
      <div className="fin-adv-matrixbox">
        <svg viewBox={`0 0 ${size} ${size}`} className="fin-adv-matrix" width="100%">
          {/* col labels (sell) */}
          {monthsL.map((m, e) => (
            <text key={"c" + e} className="fin-adv-mx-lbl" x={lab + cell * e + cell / 2} y={lab - 5} textAnchor="middle">{m.slice(0, zh ? 2 : 1)}</text>
          ))}
          {/* row labels (buy) */}
          {monthsL.map((m, s) => (
            <text key={"r" + s} className="fin-adv-mx-lbl" x={lab - 4} y={lab + cell * s + cell / 2 + 3} textAnchor="end">{m.slice(0, zh ? 2 : 1)}</text>
          ))}
          {grid.map((rowArr, s) =>
            rowArr.map((w, e) => {
              if (!w || e < s) return null;
              const gx = lab + cell * e;
              const gy = lab + cell * s;
              const hasN = w.n >= Math.min(3, nActive);
              const mag = num(w.mean) ? Math.abs(w.mean!) / maxAbs : 0;
              const fill = !num(w.mean) || w.n === 0 ? "var(--line-2)" : w.mean! >= 0 ? "var(--up)" : "var(--down)";
              const op = w.n === 0 ? 0.15 : Math.max(0.12, 0.15 + mag * 0.78) * Math.min(1, w.n / Math.max(1, nActive));
              const isBest = best && w.start === best.start && w.end === best.end;
              const isBestS = bestSharpe && w.start === bestSharpe.start && w.end === bestSharpe.end;
              return (
                <g key={`${s}-${e}`}>
                  <rect x={gx + 0.5} y={gy + 0.5} width={cell - 1} height={cell - 1} rx={1.5} fill={fill} fillOpacity={op}
                    className={"fin-adv-mx-cell" + (hasN ? "" : " thin")}
                    onPointerMove={(ev) => cellTip(ev, w)} onPointerLeave={hide} />
                  {isBest && <rect x={gx + 0.5} y={gy + 0.5} width={cell - 1} height={cell - 1} rx={1.5} fill="none" stroke="var(--warn)" strokeWidth={1.6} className="fin-adv-mx-crown" />}
                  {isBestS && !isBest && <rect x={gx + 1.5} y={gy + 1.5} width={cell - 3} height={cell - 3} rx={1} fill="none" stroke="var(--brand-2)" strokeWidth={1} strokeDasharray="2 1.5" />}
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <div className="fin-adv-mx-key">
        <span><i className="fin-adv-mx-crownkey" />{pick(zh, "Best avg", "最高平均")}</span>
        <span><i className="fin-adv-mx-sharpekey" />{pick(zh, "Best risk-adj", "最佳风险调整")}</span>
        <span className="dim">{pick(zh, "faint = thin sample", "浅色=样本少")}</span>
      </div>
      <FinTip tip={tip} />
    </Panel>
  );
}

/* ── Quarter contribution ────────────────────────────────────────────────── */
function QuarterPanel({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const qs = useMemo(() => quarterStats(years, isActive), [years, isActive]);
  const fy = useMemo(() => fullYearStats(years, isActive), [years, isActive]);
  let mx = 0.01;
  for (const q of qs) if (num(q.mean)) mx = Math.max(mx, Math.abs(q.mean!));
  return (
    <Panel title={pick(zh, "Quarter contribution", "季度贡献")} subtitle={pick(zh, "avg compounded return per quarter", "各季度平均复合收益")}>
      <div className="fin-adv-qrows">
        {qs.map((q) => (
          <div className="fin-adv-qrow" key={q.quarter}>
            <span className="fin-adv-qlbl">{QUARTERS[q.quarter]}</span>
            <span className="fin-adv-qbar">
              <span className="fin-adv-qbar-mid" />
              {num(q.mean) && (
                <span
                  className={"fin-adv-qbar-fill " + (q.mean! >= 0 ? "up" : "down")}
                  style={{ width: `${(Math.abs(q.mean!) / mx) * 50}%`, [q.mean! >= 0 ? "left" : "right"]: "50%" } as CSSProperties}
                />
              )}
            </span>
            <span className={"fin-adv-qval " + (num(q.mean) ? (q.mean! >= 0 ? "up" : "down") : "")}>{num(q.mean) ? P(q.mean!) : "—"}</span>
            <span className="fin-adv-qwr">{q.wr != null ? WRp(q.wr) : "—"}</span>
          </div>
        ))}
        <div className="fin-adv-qrow total">
          <span className="fin-adv-qlbl">{pick(zh, "Year", "全年")}</span>
          <span className="fin-adv-qbar" />
          <span className={"fin-adv-qval " + (num(fy.mean) ? (fy.mean! >= 0 ? "up" : "down") : "")}>{num(fy.mean) ? P(fy.mean!) : "—"}</span>
          <span className="fin-adv-qwr">{fy.wr != null ? WRp(fy.wr) : "—"}</span>
        </div>
      </div>
    </Panel>
  );
}

/* ── Share-of-Return donut (the pie) ─────────────────────────────────────── */
function ShareDonutPanel({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const monthsL = zh ? MONTHS_ZH : MONTHS_EN;
  const sr = useMemo(() => shareOfReturn(years, isActive), [years, isActive]);
  const slices = sr.slices
    .filter((s) => s.weight > 0)
    .map((s) => ({ label: monthsL[s.month], value: s.weight, color: (s.netMean ?? 0) >= 0 ? "var(--up)" : "var(--down)", month: s.month }));
  const top = sr.slices.slice().sort((a, b) => b.weight - a.weight).slice(0, 6);
  return (
    <Panel title={pick(zh, "Share of movement", "波动占比")} subtitle={pick(zh, "where the year's move concentrates", "全年波动集中于哪些月")}>
      {sr.total > 0 ? (
        <div className="fin-adv-donutwrap">
          <Donut slices={slices} centerValue={`${Math.round(sr.top3 * 100)}%`} centerLabel={pick(zh, "top 3 mo", "前3月")} legend={false} size={132} zh={zh} />
          <div className="fin-adv-donutleg">
            {top.map((s) => (
              <div className="fin-adv-donutleg-row" key={s.month}>
                <i className="fin-seas-chip-dot" style={{ background: (s.netMean ?? 0) >= 0 ? "var(--up)" : "var(--down)" }} />
                <span className="fin-adv-donutleg-m">{monthsL[s.month]}</span>
                <span className="fin-adv-donutleg-p">{Math.round((s.weight / sr.total) * 100)}%</span>
                <span className={"fin-adv-donutleg-n " + ((s.netMean ?? 0) >= 0 ? "up" : "down")}>{num(s.netMean) ? P(s.netMean!) : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="fin-adv-panel-empty">{pick(zh, "No data", "暂无数据")}</div>
      )}
    </Panel>
  );
}

/* ── Year-Agreement sign matrix ──────────────────────────────────────────── */
function YearAgreementPanel({ years, isActive, zh }: { years: YearData[]; isActive: (y: string) => boolean; zh: boolean }) {
  const { tip, show, hide } = useFinTip();
  const monthsL = zh ? MONTHS_ZH : MONTHS_EN;
  const rows = years.filter((y) => isActive(y.year));
  return (
    <Panel title={pick(zh, "Year agreement", "年度一致性")} subtitle={pick(zh, "sign of each month, per year (outlier-immune)", "每月涨跌方向（抗离群）")}>
      <div className="fin-adv-yamx">
        <div className="fin-adv-yamx-head">
          <span className="fin-adv-yamx-corner" />
          {monthsL.map((m, i) => <span key={i} className="fin-adv-yamx-mh">{m.slice(0, zh ? 2 : 1)}</span>)}
        </div>
        {rows.map((y) => (
          <div className="fin-adv-yamx-row" key={y.year}>
            <span className={"fin-adv-yamx-yr" + (y.isCurrent ? " cur" : "")}>{y.year.slice(2)}</span>
            {y.monthlyRet.map((r, m) => {
              const cls = r == null || !isFinite(r) ? "na" : r > 0 ? "up" : r < 0 ? "down" : "flat";
              return (
                <span
                  key={m}
                  className={"fin-adv-yamx-cell " + cls}
                  onPointerMove={(e) => show(e, `${y.year} · ${monthsL[m]}`, [{ label: pick(zh, "Return", "收益"), value: r == null ? "—" : P(r), color: r != null && r >= 0 ? "var(--up)" : "var(--down)" }])}
                  onPointerLeave={hide}
                />
              );
            })}
          </div>
        ))}
        <div className="fin-adv-yamx-row agg">
          <span className="fin-adv-yamx-yr dim">{pick(zh, "↑%", "↑%")}</span>
          {Array.from({ length: 12 }).map((_, m) => {
            const vals = rows.map((y) => y.monthlyRet[m]).filter((v): v is number => v != null && isFinite(v));
            const up = vals.filter((v) => v > 0).length;
            const frac = vals.length ? up / vals.length : 0;
            const unanimous = vals.length >= 3 && (up === vals.length || up === 0);
            return (
              <span key={m} className={"fin-adv-yamx-agg" + (unanimous ? " star" : "")} title={`${up}/${vals.length}`}>
                {vals.length ? Math.round(frac * 100) : "—"}
              </span>
            );
          })}
        </div>
      </div>
      <FinTip tip={tip} />
    </Panel>
  );
}

/* ── shared panel frame ──────────────────────────────────────────────────── */
function Panel({ title, subtitle, n, children }: { title: string; subtitle?: string; n?: number; children: ReactNode }) {
  return (
    <div className="fin-adv-panel">
      <div className="fin-adv-panel-h">
        <span className="fin-adv-panel-t">{title}</span>
        {subtitle && <span className="fin-adv-panel-s">{subtitle}</span>}
        {n != null && <span className="fin-adv-panel-n">N={n}</span>}
      </div>
      {children}
    </div>
  );
}
