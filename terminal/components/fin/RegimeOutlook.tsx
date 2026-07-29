"use client";
/**
 * RegimeOutlook — per-stock "regime-aware forward seasonal outlook"
 * rendered from the mastermind.seasonal_outlook/v1 JSON artifact.
 *
 * Fetches /data/<sym>.seasonal.json client-side. Returns null when the
 * artifact is absent (many symbols won't have it — no clutter).
 *
 * SPECULATIVE, DISPLAY-ONLY — validation verdict + disclaimer are kept
 * prominent, not buried.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
} from "react";
import { fmtPct, pick } from "../../lib/finFormat";
import { FinTip, useFinTip } from "./FinCharts";
import { getJSON } from "../../lib/dataCache";

/* ── types matching the JSON schema ─────────────────────────────────────── */
interface BucketView {
  dir: "bull" | "bear" | "neutral";
  mean: number | null;
  median: number | null;
  win_rate: number | null;
  n: number;
  lo: number | null;
  hi: number | null;
  confidence: "low" | "medium" | "high";
}
interface ForwardBucket {
  start: string;
  end: string;
  label: string;
  baseline: BucketView;
  regime: BucketView;
}
interface Interval {
  dir: "bull" | "bear";
  start: string;
  end: string;
  expected_move: number;
  win_rate: number | null;
  n: number;
  buckets: string[];
}
interface Analog {
  year: number;
  weight: number;
  cycle_pos: "midterm" | "post_election" | "pre_election" | "election";
  rate_dir: "hiking" | "cutting" | "holding" | "whipsaw";
  is_recession: boolean;
  whipsaw: boolean;
  flags: string[];
  provisional: boolean;
}
interface CurrentYear {
  year: number;
  cycle_pos: "midterm" | "post_election" | "pre_election" | "election";
  rate_dir: "hiking" | "cutting" | "holding" | "whipsaw";
  is_recession: boolean;
  whipsaw: boolean;
  flags: string[];
  anomaly_flags: string[];
  provisional: boolean;
}
interface Validation {
  loyo_years: number;
  n_predictions: number;
  regime_hit: number | null;
  baseline_hit: number | null;
  skill: number | null;
  verdict: "edge" | "no_edge" | "anti" | "untested";
}
interface History {
  first_year: number;
  last_date: string;
  complete_years: number;
  coverage: "deep" | "medium" | "thin";
}
interface SeasonalOutlook {
  schema: string;
  symbol: string;
  as_of: string;
  is_display_only: boolean;
  engine_version: string;
  regime_table_version: string;
  disclaimer: string;
  mode: "regime_weighted" | "baseline_fallback" | "insufficient" | "unavailable";
  default_view: "baseline" | "regime";
  n_eff: number;
  n_eff_note: string;
  relaxed_filters: string[];
  current_year: CurrentYear;
  history: History;
  validation: Validation;
  analogs: Analog[];
  forward_buckets: ForwardBucket[];
  intervals_baseline: Interval[];
  intervals_regime: Interval[];
  honest_read: string;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const P = (v: number | null | undefined) =>
  fmtPct(v, { alreadyPct: true, sign: true, decimals: 1 });
const WRp = (v: number | null | undefined) =>
  v == null ? "—" : `${Math.round(v * 100)}%`;

const dateMs = (s: string) => new Date(s + "T00:00:00Z").getTime();
/** Today as an ISO date, in the same YYYY-MM-DD space the artifact speaks. */
const todayIso = () => new Date().toISOString().slice(0, 10);
/** An artifact this old must say so — the panel used to draw as_of as "now". */
const STALE_MS = 14 * 86400000;

function cyclePosLabel(cp: string, zh: boolean): string {
  switch (cp) {
    case "midterm":
      return pick(zh, "Midterm", "中期选举年");
    case "post_election":
      return pick(zh, "Post-election", "选后年");
    case "pre_election":
      return pick(zh, "Pre-election", "选前年");
    case "election":
      return pick(zh, "Election", "选举年");
    default:
      return cp;
  }
}

function rateDirLabel(rd: string, zh: boolean): string {
  switch (rd) {
    case "hiking":
      return pick(zh, "Rates hiking", "加息周期");
    case "cutting":
      return pick(zh, "Rates cutting", "降息周期");
    case "holding":
      return pick(zh, "Rates holding", "利率不变");
    case "whipsaw":
      return pick(zh, "Rates whipsaw", "利率反复");
    default:
      return rd;
  }
}

/** Parse "2026-07-07" → a JS Date (UTC midnight). */
function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

/** Format a date to a short tick label: "Jul '26" / "Jan '27" (EN) or "7月" / "'27年1月" (zh). */
function tickLabel(d: Date, zh: boolean): string {
  const mi = d.getUTCMonth();
  const yy = String(d.getUTCFullYear()).slice(2);
  if (zh) return mi === 0 ? `'${yy}年1月` : `${mi + 1}月`;
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mi];
  return `${m} '${yy}`;
}

/** ResizeObserver hook (same pattern as AdvancedSeasonality) */
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

/* ── main export ─────────────────────────────────────────────────────────── */
export function RegimeOutlook({ sym, zh = false }: { sym: string; zh?: boolean }) {
  const [data, setData] = useState<SeasonalOutlook | null | "loading">("loading");

  useEffect(() => {
    setData("loading");
    let cancelled = false;
    getJSON(`/data/${sym}.seasonal.json`).then((d: SeasonalOutlook | null) => {
      if (!cancelled) setData(d ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [sym]);

  // Loading gets a skeleton of the panel's own height — the old combined null
  // popped the whole panel in after the fetch and shoved the page down.
  if (data === "loading") {
    return (
      <div className="fin-ro-panel fin-adv-panel">
        <div className="fin-skel" style={{ height: 88 }} />
      </div>
    );
  }
  if (data === null) return null;

  const d = data;

  // insufficient / unavailable → compact panel
  if (d.mode === "insufficient" || d.mode === "unavailable") {
    return (
      <div className="fin-ro-panel">
        <div className="fin-ro-head">
          <span className="fin-ro-title">{pick(zh, "Forward outlook", "前瞻展望")}</span>
          <span className="fin-ro-pill">{pick(zh, "experimental", "实验性")}</span>
        </div>
        <div className="fin-ro-honest">{d.honest_read}</div>
        <div className="fin-ro-disclaimer">{d.disclaimer}</div>
      </div>
    );
  }

  return <RegimeOutlookInner data={d} zh={zh} />;
}

/* ── full panel ──────────────────────────────────────────────────────────── */
function RegimeOutlookInner({ data: d, zh }: { data: SeasonalOutlook; zh: boolean }) {
  const [view, setView] = useState<"baseline" | "regime">(d.default_view);

  const intervals = view === "baseline" ? d.intervals_baseline : d.intervals_regime;
  const val = d.validation;
  const isStale = dateMs(todayIso()) - dateMs(d.as_of) > STALE_MS;

  return (
    <div className="fin-ro-panel fin-adv-panel">
      {/* header row */}
      <div className="fin-ro-head">
        <span className="fin-ro-title">{pick(zh, "Forward outlook", "前瞻展望")}</span>
        <span className="fin-ro-pill">{pick(zh, "experimental", "实验性")}</span>
        {/* the artifact is regenerated by a batch job; when it drifts, say so out loud */}
        {isStale && (
          <span className="fin-tag" style={{ "--c": "var(--warn)" } as CSSProperties}>
            {pick(zh, `stale · as-of ${d.as_of}`, `过期 · 截至 ${d.as_of}`)}
          </span>
        )}
      </div>

      {/* regime badge row */}
      <div className="fin-ro-badge-row">
        <span className="fin-ro-regime-badge">
          {d.current_year.year}
          <span className="fin-ro-sep">·</span>
          {cyclePosLabel(d.current_year.cycle_pos, zh)}
          <span className="fin-ro-sep">·</span>
          {rateDirLabel(d.current_year.rate_dir, zh)}
          {d.current_year.is_recession && (
            <span className="fin-tag fin-ro-flag-rec" style={{ "--c": "var(--down)" } as CSSProperties}>
              {pick(zh, "Recession", "衰退")}
            </span>
          )}
          {d.current_year.provisional && (
            <span
              className="fin-tag fin-ro-provisional"
              style={{ "--c": "var(--warn)" } as CSSProperties}
              title={pick(
                zh,
                "Current-year regime is an as-of estimate while analog years carry full-year hindsight.",
                "当前年度制度为截止估算，历史类比年具有全年后见之明。"
              )}
            >
              {pick(zh, "provisional", "暂定")}
            </span>
          )}
        </span>

        {/* view toggle */}
        <div className="fin-toggle fin-ro-toggle">
          <button
            className={view === "baseline" ? "on" : ""}
            onClick={() => setView("baseline")}
          >
            {pick(zh, "All-years", "所有年份")}
          </button>
          <button
            className={view === "regime" ? "on" : ""}
            onClick={() => setView("regime")}
          >
            {pick(zh, "Regime analogs", "制度类比")}
          </button>
        </div>
      </div>

      {/* timeline */}
      <TimelinePanel
        intervals={intervals}
        asOf={d.as_of}
        forwardBuckets={d.forward_buckets}
        view={view}
        zh={zh}
      />

      {/* validation strip */}
      <ValidationStrip val={val} zh={zh} />

      {/* analog chips */}
      <AnalogChips analogs={d.analogs} relaxedFilters={d.relaxed_filters} nEff={d.n_eff} zh={zh} />

      {/* honest read + disclaimer */}
      <div className="fin-ro-honest">{d.honest_read}</div>
      <div className="fin-ro-disclaimer">{d.disclaimer}</div>

      {/* provenance: which engine, which vintage, how much history it actually saw */}
      <div className="fin-asof">
        <span className="num">
          {pick(
            zh,
            `seasonal_outlook ${d.engine_version} · as-of ${d.as_of} · ${d.history.complete_years}y history · LOYO ${d.validation.loyo_years}y`,
            `seasonal_outlook ${d.engine_version} · 截至 ${d.as_of} · ${d.history.complete_years} 年历史 · 留一年验证 ${d.validation.loyo_years} 年`,
          )}
        </span>
      </div>
    </div>
  );
}

/* ── timeline SVG ────────────────────────────────────────────────────────── */
interface TimelinePanelProps {
  intervals: Interval[];
  asOf: string;
  forwardBuckets: ForwardBucket[];
  view: "baseline" | "regime";
  zh: boolean;
}

function TimelinePanel({ intervals, asOf, forwardBuckets, view, zh }: TimelinePanelProps) {
  const { tip, show, hide } = useFinTip();
  const box = useBoxW(680);
  const vw = box.w;
  const SVG_H = 88; // total SVG height
  const BAND_Y = 22; // top of the band area
  const BAND_H = 40; // height of each interval band
  const TICK_Y = BAND_Y + BAND_H + 10; // y for month labels
  const PAD_L = 0;
  const PAD_R = 0;
  const IW = vw - PAD_L - PAD_R;

  // Anchor on TODAY, not on the artifact's as_of. The artifact is regenerated by a
  // batch job, so as_of drifts; drawing it as "now" silently relabels weeks-old data.
  const today = todayIso();
  const tToday = dateMs(today);
  // Intervals that already ended are history, not outlook — skip them instead of
  // painting them behind the marker (and instead of rendering negative-x slivers).
  const live = intervals.filter((iv) => dateMs(iv.end) > tToday);

  if (live.length === 0) {
    return (
      <div className="fin-ro-timeline-wrap fin-empty">
        {intervals.length === 0
          ? pick(zh, "No intervals available", "暂无区间数据")
          : pick(zh, "Every mapped interval has already ended — this outlook is out of date.", "已绘制的区间均已结束——该展望数据已过期。")}
      </div>
    );
  }

  // time domain: from as_of to end of last interval still ahead of us
  const t0 = dateMs(asOf);
  const lastEnd = live.reduce(
    (mx, iv) => Math.max(mx, dateMs(iv.end)),
    0
  );
  const tSpan = lastEnd - t0;
  if (tSpan <= 0) return null;

  const tx = (dateStr: string) => PAD_L + ((dateMs(dateStr) - t0) / tSpan) * IW;
  const nowX = Math.max(PAD_L, Math.min(PAD_L + IW, tx(today)));
  const nowLblRight = nowX > PAD_L + IW - 34;

  // Build month tick positions
  const tickDates: Date[] = [];
  {
    const start = parseDate(asOf);
    // step to the first of the next month
    let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const endDate = new Date(lastEnd);
    while (cur <= endDate) {
      tickDates.push(new Date(cur));
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
  }

  // Build bucket lookup by label for tooltips
  const bucketByLabel: Record<string, BucketView> = {};
  for (const fb of forwardBuckets) {
    const bv = view === "baseline" ? fb.baseline : fb.regime;
    bucketByLabel[fb.label] = bv;
  }

  return (
    <div className="fin-ro-timeline-wrap" ref={box.ref}>
      <div className="fin-ro-timeline-label">
        {pick(zh, "Key seasonal intervals (historical bias)", "关键季节性区间（历史偏向）")}
      </div>
      <div className="fin-ro-svg-box" style={{ height: SVG_H }}>
        <svg
          viewBox={`0 0 ${vw} ${SVG_H}`}
          preserveAspectRatio="none"
          className="fin-svg fin-ro-svg"
          style={{ display: "block", width: "100%", height: SVG_H }}
        >
          {/* background baseline */}
          <line
            x1={PAD_L}
            x2={vw - PAD_R}
            y1={BAND_Y + BAND_H / 2}
            y2={BAND_Y + BAND_H / 2}
            className="fin-ro-axis-line"
          />

          {/* interval bands */}
          {live.map((iv, i) => {
            // an interval that began before today is drawn from today forward — only
            // the part you can still trade is claimed
            const x1 = Math.max(tx(iv.start), nowX);
            const x2 = tx(iv.end);
            const bw = Math.max(x2 - x1, 2);
            const isBull = iv.dir === "bull";

            // derive confidence from the bucket views for this interval
            const confScores = iv.buckets.map((bl) => {
              const bv = bucketByLabel[bl];
              if (!bv) return 0;
              return bv.confidence === "high" ? 3 : bv.confidence === "medium" ? 2 : 1;
            });
            const minConf = confScores.length ? Math.min(...confScores) : 1;
            const opacity = minConf === 3 ? 0.75 : minConf === 2 ? 0.55 : 0.38;

            const pctTxt = P(iv.expected_move);
            const wrTxt = iv.win_rate != null ? `${Math.round(iv.win_rate * 100)}%` : "";

            return (
              <g key={i}>
                <rect
                  x={x1}
                  y={BAND_Y}
                  width={bw}
                  height={BAND_H}
                  fill={isBull ? "var(--up)" : "var(--down)"}
                  fillOpacity={opacity}
                  rx={3}
                  className="fin-ro-band"
                  onPointerMove={(e: RPointerEvent<SVGRectElement>) => {
                    const rows: { label: string; value: string; color?: string }[] = [];
                    for (const bl of iv.buckets) {
                      const bv = bucketByLabel[bl];
                      if (bv) {
                        rows.push({
                          label: bl,
                          value: `${P(bv.mean)} · ${WRp(bv.win_rate)} WR · n=${bv.n}`,
                          color:
                            bv.dir === "bull"
                              ? "var(--up)"
                              : bv.dir === "bear"
                              ? "var(--down)"
                              : "var(--muted)",
                        });
                        if (bv.lo != null && bv.hi != null) {
                          rows.push({
                            label: pick(zh, "Range (p20–p80)", "区间 (p20–p80)"),
                            value: `${P(bv.lo)} … ${P(bv.hi)}`,
                            color: "var(--muted)",
                          });
                        }
                      }
                    }
                    show(
                      e,
                      `${iv.start} → ${iv.end}`,
                      rows.length > 0
                        ? rows
                        : [
                            {
                              label: pick(zh, "Expected move", "预期涨跌"),
                              value: pctTxt,
                              color: isBull ? "var(--up)" : "var(--down)",
                            },
                            {
                              label: pick(zh, "Win rate", "胜率"),
                              value: wrTxt || "—",
                              color: "var(--text-2)",
                            },
                          ]
                    );
                  }}
                  onPointerLeave={hide}
                />
                {/* label inside band if wide enough */}
                {bw > 42 && (
                  <text
                    x={x1 + bw / 2}
                    y={BAND_Y + BAND_H / 2 - 6}
                    textAnchor="middle"
                    className="fin-ro-band-pct"
                    fill={isBull ? "var(--up)" : "var(--down)"}
                  >
                    {pctTxt}
                  </text>
                )}
                {bw > 42 && wrTxt && (
                  <text
                    x={x1 + bw / 2}
                    y={BAND_Y + BAND_H / 2 + 9}
                    textAnchor="middle"
                    className="fin-ro-band-wr"
                  >
                    {wrTxt}
                  </text>
                )}
              </g>
            );
          })}

          {/* month ticks */}
          {tickDates.map((d, i) => {
            const xp = tx(d.toISOString().slice(0, 10));
            const isYear = d.getUTCMonth() === 0;
            // Only show label for Jan (year boundary) and every 2nd month otherwise
            const showLabel = isYear || i % 2 === 0;
            return (
              <g key={i}>
                <line
                  x1={xp}
                  x2={xp}
                  y1={BAND_Y}
                  y2={BAND_Y + BAND_H}
                  className={isYear ? "fin-ro-tick-year" : "fin-ro-tick"}
                />
                {showLabel && (
                  <text
                    x={xp}
                    y={TICK_Y}
                    textAnchor="middle"
                    className={isYear ? "fin-ro-tick-lbl-year" : "fin-ro-tick-lbl"}
                  >
                    {tickLabel(d, zh)}
                  </text>
                )}
              </g>
            );
          })}

          {/* "today" marker — the real one, clamped into view */}
          <line
            x1={nowX}
            x2={nowX}
            y1={BAND_Y - 4}
            y2={BAND_Y + BAND_H + 4}
            className="fin-ro-now"
          />
          <text
            x={nowLblRight ? nowX - 3 : nowX + 3}
            y={BAND_Y - 6}
            textAnchor={nowLblRight ? "end" : "start"}
            className="fin-ro-now-lbl"
          >
            {pick(zh, "today", "今天")}
          </text>
        </svg>
      </div>
      <FinTip tip={tip} />
    </div>
  );
}

/* ── validation strip ────────────────────────────────────────────────────── */
function ValidationStrip({ val, zh }: { val: Validation; zh: boolean }) {
  const verdictColor =
    val.verdict === "edge"
      ? "var(--up)"
      : val.verdict === "anti"
      ? "var(--down)"
      : "var(--muted)";

  const verdictTxt =
    val.verdict === "edge"
      ? pick(zh, "EDGE", "有优势")
      : val.verdict === "no_edge"
      ? pick(zh, "NO EDGE", "无优势")
      : val.verdict === "anti"
      ? pick(zh, "ANTI", "反向")
      : pick(zh, "UNTESTED", "未验证");

  const skillGloss =
    val.skill == null || val.verdict === "untested"
      ? pick(zh, "Insufficient out-of-sample history to assess skill.", "样本外历史不足，无法评估技能。")
      : val.verdict === "edge"
      ? pick(
          zh,
          "Regime-weighting beat the plain all-years seasonal out-of-sample.",
          "制度加权在样本外优于全年平均季节性。"
        )
      : val.verdict === "anti"
      ? pick(
          zh,
          "Regime-weighting underperformed the plain all-years seasonal out-of-sample.",
          "制度加权在样本外表现逊于全年平均季节性。"
        )
      : pick(
          zh,
          "Regime-weighting matched but did not beat the plain all-years seasonal out-of-sample.",
          "制度加权与全年平均季节性持平，但未超越。"
        );

  return (
    <div className="fin-ro-val">
      <span className="fin-ro-val-label">
        {pick(zh, `Leave-one-year-out (N=${val.loyo_years}): `, `留一年交叉验证 (N=${val.loyo_years}): `)}
        {val.regime_hit != null && (
          <span>
            {pick(zh, "regime ", "制度 ")}
            <strong>{Math.round(val.regime_hit * 100)}%</strong>
            {pick(zh, " vs baseline ", " 对比基准 ")}
            <strong>{val.baseline_hit != null ? `${Math.round(val.baseline_hit * 100)}%` : "—"}</strong>
            {pick(zh, " hit-rate →", " 命中率 →")}
          </span>
        )}
      </span>
      <span className="fin-ro-verdict-chip" style={{ color: verdictColor, borderColor: verdictColor }}>
        {verdictTxt}
      </span>
      <span className="fin-ro-val-gloss">{skillGloss}</span>
    </div>
  );
}

/* ── analog chips ────────────────────────────────────────────────────────── */
function AnalogChips({
  analogs,
  relaxedFilters,
  nEff,
  zh,
}: {
  analogs: Analog[];
  relaxedFilters: string[];
  nEff: number;
  zh: boolean;
}) {
  if (analogs.length === 0) return null;

  const topAnalogs = analogs.slice().sort((a, b) => b.weight - a.weight).slice(0, 15);
  const maxW = topAnalogs[0]?.weight ?? 1;

  return (
    <div className="fin-ro-analogs">
      <div className="fin-ro-analogs-label">
        {pick(zh, `Regime-analog years (n_eff ${nEff.toFixed(1)})`, `制度类比年份 (n_eff ${nEff.toFixed(1)})`)}
      </div>
      <div className="fin-ro-analog-chips">
        {topAnalogs.map((a) => {
          const isWarning = a.is_recession || a.flags.length > 0 || a.whipsaw;
          const tipText = `${cyclePosLabel(a.cycle_pos, zh)} · ${rateDirLabel(a.rate_dir, zh)}${a.is_recession ? (zh ? " · 衰退" : " · Recession") : ""}${a.whipsaw ? (zh ? " · 利率反复" : " · Whipsaw") : ""}${a.provisional ? (zh ? " · 暂定" : " · provisional") : ""}`;
          return (
            <span key={a.year} className="fin-ro-analog-chip" title={tipText}>
              <span className="fin-ro-analog-year">{a.year}</span>
              <span
                className="fin-ro-analog-wbar"
                style={{ width: `${Math.round((a.weight / maxW) * 24)}px` } as CSSProperties}
              />
              {isWarning && <span className="fin-ro-analog-warn" title={pick(zh, "Recession / anomaly flag", "衰退/异常标志")}>●</span>}
            </span>
          );
        })}
      </div>
      {relaxedFilters.length > 0 && (
        <div className="fin-ro-relaxed">
          {pick(zh, "Analog floor relaxed: ", "类比门槛已放宽：")}
          {relaxedFilters.join(", ")}
          {pick(zh, " — confidence capped", " — 置信度上限")}
        </div>
      )}
    </div>
  );
}
