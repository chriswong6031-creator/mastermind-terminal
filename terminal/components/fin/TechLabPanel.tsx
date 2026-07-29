"use client";
/**
 * TechLabPanel — "Lab" tab in the MegaPane financials rail.
 *
 * Shows the Macro Dashboard Technical Lab signal profiles for the current symbol:
 *   (a) Header: asof timestamp + descriptive framing caveat.
 *   (b) "Firing now" list: signals with state==1 in intel.tech.events.
 *   (c) Per-signal profile stats: WR 21d vs base (bar), edge, era split, fires+months,
 *       up-tape %.
 *   (d) Empty state when no tech block is available.
 *   (e) Footer link to the Technical Lab page.
 *
 * House laws:
 *   - Display-tier only. No "BUY"/"SELL" wording. No "validated" in UI strings.
 *     (TLT-R3: the Terminal only RENDERS data produced by the macro Python engine.)
 *   - TLT-R4: lab markers on chart are default OFF (handled in ChartPanel.tsx).
 *   - Survivor-universe caveat rides with every statistic shown (copied from the source).
 *   - No "danny"/"whale" vocabulary (DT-R20).
 *
 * Props: {sym, intel?, zh?}
 *   intel — the full <SYM>.intel.json payload (may be null or missing the "tech" key).
 */
import { memo, useMemo } from "react";
import { pick, fmtDate } from "../../lib/finFormat";

// ── Types (narrow — only what we render) ──────────────────────────────────────

interface TechSignalProfile {
  display_en?: string | null;
  family?: string | null;
  direction?: number | null;    // +1 up, -1 down, 0 neutral
  n_fires?: number | null;
  n_months?: number | null;
  wr_21d?: number | null;
  base_wr?: number | null;
  edge_wr?: number | null;
  mfe_mae_med?: number | null;
  durable_rate?: number | null;
  up_tape_pct?: number | null;
  wr_pre2010?: number | null;
  wr_post2010?: number | null;
  kind?: string | null;
}

interface TechSignalState {
  dir?: 1 | -1 | 0 | null;
  kind?: "event" | "state" | null;
  fires?: string[];
  state?: 0 | 1 | null;
}

interface TechEventsPayload {
  ticker?: string;
  generated_utc?: string;
  window_start?: string;
  signals?: Record<string, TechSignalState>;
}

interface TechBlock {
  events?: TechEventsPayload | null;
  profiles?: Record<string, TechSignalProfile> | null;
  asof?: string | null;
}

interface TechLabPanelProps {
  sym: string;
  intel?: any | null;
  zh?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Direction glyph: +1 → ▲, -1 → ▼, 0 → ○ */
function dirGlyph(dir: number | null | undefined): string {
  if (dir === 1) return "▲";
  if (dir === -1) return "▼";
  return "○";
}

/** CSS class for direction colouring. */
function dirClass(dir: number | null | undefined): string {
  if (dir === 1) return "up";
  if (dir === -1) return "down";
  return "mut";
}

/** Direction → the design-system colour token that feeds the .fin-tag tint (--c).
 *  Tokens only: the east red-up flip rides --up/--down for free. */
function dirTone(dir: number | null | undefined): string {
  if (dir === 1) return "var(--up)";
  if (dir === -1) return "var(--down)";
  return "var(--muted)";
}

/** Format a win-rate as a percentage string, or "—". */
function fmtWr(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return (v * 100).toFixed(1) + "%";
}

/** Days since a date string ("YYYY-MM-DD") to today. */
function daysSince(dateStr: string): number | null {
  try {
    const ms = Date.now() - new Date(dateStr + "T00:00:00Z").getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  } catch {
    return null;
  }
}

/** Most recent fire date from a fires array. */
function lastFireDate(fires: string[] | undefined): string | null {
  if (!fires || !fires.length) return null;
  return fires[fires.length - 1];
}

/** Family label → display name (bilingual). */
function familyLabel(family: string | null | undefined, zh: boolean): string {
  if (!family) return "";
  const map: Record<string, [string, string]> = {
    ma_crosses: ["MA Cross", "均线交叉"],
    pivot_patterns: ["Pivot", "枢轴"],
    rsi_extremes: ["RSI", "RSI 极值"],
    pattern_recognition: ["Pattern", "形态"],
    bollinger_signals: ["Bollinger", "布林带"],
    trend_regime: ["Trend", "趋势"],
    momentum_breakout: ["Momentum", "动量突破"],
    return_z: ["Return", "收益 Z 值"],
    strength_flag: ["Strength", "强度"],
    valuation: ["Valuation", "估值"],
    insider: ["Insider", "内部人"],
    ma_stars: ["MA Star", "均线星"],
  };
  const hit = map[family];
  return hit ? pick(zh, hit[0], hit[1]) : family.replace(/_/g, " ");
}

// ── Small bar: WR vs base ─────────────────────────────────────────────────────

function WrBar({ wr, base, zh }: { wr: number | null | undefined; base: number | null | undefined; zh: boolean }) {
  if (wr == null || base == null) return <span className="fin-tl-dim">—</span>;
  const maxPct = 80; // clamp to 80% for display
  const wrPct = Math.min(wr * 100, maxPct);
  const basePct = Math.min(base * 100, maxPct);
  const ahead = wr > base;
  return (
    <div
      className="tl-wr-bar fin-tl-wr"
      title={pick(
        zh,
        `21d win rate: ${(wr * 100).toFixed(1)}% · universe base: ${(base * 100).toFixed(1)}%`,
        `21日胜率：${(wr * 100).toFixed(1)}% · 样本基准：${(base * 100).toFixed(1)}%`,
      )}
    >
      <div className="tl-wr-track fin-tl-wr-track">
        {/* base marker */}
        <div className="tl-wr-base fin-tl-wr-base" style={{ left: `${basePct}%` }} />
        {/* actual bar */}
        <div
          className={`tl-wr-fill fin-tl-wr-fill ${ahead ? "up" : "down"}`}
          style={{ width: `${wrPct}%` }}
        />
      </div>
      <span className={`tl-wr-num fin-tl-wr-num ${ahead ? "up" : "down"}`}>{(wr * 100).toFixed(1)}%</span>
    </div>
  );
}

// ── Signal row ────────────────────────────────────────────────────────────────

function SignalRow({
  id,
  profile,
  firing,
  daysSinceFire,
  zh,
}: {
  id: string;
  profile: TechSignalProfile | undefined;
  firing: boolean;
  daysSinceFire: number | null;
  zh: boolean;
}) {
  const dir = profile?.direction ?? null;
  const name = profile?.display_en || id;
  const family = familyLabel(profile?.family, zh);

  return (
    <div className={`tl-sig-row fin-card${firing ? " tl-sig-row--firing fin-tl-firing" : ""}`}>
      {/* Signal name + family + direction */}
      <div className="tl-sig-head fin-tl-sighead">
        <span
          className={`tl-dir ${dirClass(dir)} fin-tag`}
          style={{ "--c": dirTone(dir) } as React.CSSProperties}
        >
          {dirGlyph(dir)}
        </span>
        <span className="tl-sig-name fin-tl-signame">{name}</span>
        {family && (
          <span className="tl-family fin-tag" style={{ "--c": "var(--muted)" } as React.CSSProperties}>
            {family}
          </span>
        )}
        {firing && daysSinceFire !== null && (
          <span className="tl-days-ago fin-tag" style={{ "--c": "var(--signal)" } as React.CSSProperties}>
            {daysSinceFire === 0
              ? pick(zh, "today", "今日")
              : pick(zh, `${daysSinceFire}d ago`, `${daysSinceFire}天前`)}
          </span>
        )}
      </div>

      {/* Profile stats (omit when profile unavailable) */}
      {profile && (
        <div className="tl-sig-stats fin-tl-stats">
          <div className="tl-stat-pair fin-tl-wrpair">
            <span className="tl-stat-label fin-tl-k">{pick(zh, "Win rate 21d vs base", "21日胜率 vs 基准")}</span>
            <WrBar wr={profile.wr_21d} base={profile.base_wr} zh={zh} />
          </div>

          <div className="tl-stat-grid fin-kpis">
            <div className="tl-stat fin-kpi">
              <span className="tl-stat-label k">{pick(zh, "Edge WR", "胜率优势")}</span>
              <span className={`tl-stat-val v ${(profile.edge_wr ?? 0) >= 0 ? "up" : "down"}`}>
                {profile.edge_wr != null ? `${(profile.edge_wr * 100) >= 0 ? "+" : ""}${(profile.edge_wr * 100).toFixed(1)}pp` : "—"}
              </span>
            </div>
            <div className="tl-stat fin-kpi">
              <span className="tl-stat-label k">{pick(zh, "MFE/MAE", "盈亏幅度比")}</span>
              <span className="tl-stat-val v">{profile.mfe_mae_med != null ? profile.mfe_mae_med.toFixed(2) : "—"}</span>
            </div>
            <div className="tl-stat fin-kpi">
              <span className="tl-stat-label k">{pick(zh, "Fires", "触发次数")}</span>
              <span className="tl-stat-val v">{profile.n_fires != null ? profile.n_fires.toLocaleString() : "—"}</span>
            </div>
            <div className="tl-stat fin-kpi">
              <span className="tl-stat-label k">{pick(zh, "Up-tape %", "上行行情占比")}</span>
              <span className="tl-stat-val v">{profile.up_tape_pct != null ? (profile.up_tape_pct * 100).toFixed(0) + "%" : "—"}</span>
            </div>
          </div>

          {/* Era split: pre/post 2010 */}
          <div className="tl-era-split fin-tl-era">
            {profile.wr_pre2010 != null ? (
              <>
                <span className="tl-era-label">{pick(zh, "Pre-2010", "2010 年前")}</span>
                <span className="tl-era-val fin-tl-era-v">{fmtWr(profile.wr_pre2010)}</span>
                <span className="tl-era-sep">·</span>
              </>
            ) : (
              <>
                <span className="tl-era-label">{pick(zh, "Pre-2010", "2010 年前")}</span>
                <span className="tl-era-val">{pick(zh, "n/a", "无")}</span>
                <span className="tl-era-sep">·</span>
              </>
            )}
            <span className="tl-era-label">{pick(zh, "Post-2010", "2010 年后")}</span>
            <span className="tl-era-val fin-tl-era-v">{fmtWr(profile.wr_post2010)}</span>
            {profile.n_months != null && (
              <span className="tl-era-months">
                {pick(zh, ` (${profile.n_months}mo of history)`, `（${profile.n_months} 个月样本）`)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default memo(TechLabPanel);
function TechLabPanel({ sym, intel = null, zh = false }: TechLabPanelProps) {
  const tech: TechBlock | null = intel?.tech ?? null;

  // Derive lists of firing and non-firing signals from the tech block.
  const { firing, other } = useMemo(() => {
    if (!tech?.events?.signals) return { firing: [] as string[], other: [] as string[] };
    const signals = tech.events.signals as Record<string, TechSignalState>;
    const firingIds: string[] = [];
    const otherIds: string[] = [];
    for (const [id, state] of Object.entries(signals)) {
      if (state?.state === 1) firingIds.push(id);
      else otherIds.push(id);
    }
    return { firing: firingIds, other: otherIds };
  }, [tech]);

  const profiles = tech?.profiles ?? null;
  const events = tech?.events ?? null;
  const asof = tech?.asof ?? null;

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!tech) {
    return (
      <div className="fin-body">
        <div className="fin-empty fin-empty-lg" role="status">
          <span className="fin-empty-title">
            {pick(zh, "No Lab profile for this symbol", "该标的暂无实验室档案")}
          </span>
          <span className="fin-empty-why">
            {pick(
              zh,
              `The Technical Lab publishes signal profiles for its research universe only — ${sym} carries no tech block in its intel payload yet.`,
              `技术实验室仅为其研究样本发布信号档案 — ${sym} 的 intel 数据中尚无 tech 区块。`,
            )}
          </span>
        </div>
        <LabFooter zh={zh} />
      </div>
    );
  }

  return (
    <div className="fin-body tl-panel">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="tl-header fin-tl-header">
        <div className="tl-caveat fin-sec-cap">
          {pick(
            zh,
            "Descriptive research profiles from the Macro Dashboard Technical Lab — survivor universe, not a verdict.",
            "Macro Dashboard 技术实验室的描述性研究档案——幸存者样本，仅供参考，非投资建议。",
          )}
        </div>
        {asof && (
          <div className="tl-asof fin-asof">
            {pick(
              zh,
              `Macro Dashboard Technical Lab · as of ${asof.slice(0, 10)}`,
              `Macro Dashboard 技术实验室 · 截至 ${asof.slice(0, 10)}`,
            )}
          </div>
        )}
      </div>

      {/* ── Firing now ──────────────────────────────────────────────────────── */}
      <div className="fin-sec">
        <div className="fin-eyebrow">{pick(zh, "Active state", "当前状态")}</div>
        <div
          className="fin-sec-h rail rule"
          style={{ "--rail": "var(--brand)" } as React.CSSProperties}
        >
          {pick(zh, "Firing now", "当前触发")}
          {firing.length > 0 && (
            <span
              className="tl-firing-count fin-tag"
              style={{ "--c": "var(--signal)" } as React.CSSProperties}
            >
              {firing.length}
            </span>
          )}
        </div>

        {firing.length === 0 ? (
          <div className="fin-empty">
            {pick(zh, "No signals in active state for this symbol.", "该标的目前无活跃信号。")}
          </div>
        ) : (
          <div className="tl-sig-list fin-tl-siglist">
            {firing.map((id) => {
              const state = events?.signals?.[id];
              const lastFire = lastFireDate(state?.fires);
              const daysAgo = lastFire ? daysSince(lastFire) : null;
              return (
                <SignalRow
                  key={id}
                  id={id}
                  profile={profiles?.[id]}
                  firing
                  daysSinceFire={daysAgo}
                  zh={zh}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Other signals with profiles ──────────────────────────────────── */}
      {other.length > 0 && profiles && (
        <div className="fin-sec">
          <div className="fin-eyebrow">{pick(zh, "Research", "研究")}</div>
          <div
            className="fin-sec-h rail rule"
            style={{ "--rail": "var(--brand)" } as React.CSSProperties}
          >
            {pick(zh, "Signal profiles", "信号档案")}
          </div>
          <div className="tl-sig-list tl-sig-list--other fin-tl-siglist">
            {other.map((id) => (
              <SignalRow
                key={id}
                id={id}
                profile={profiles?.[id]}
                firing={false}
                daysSinceFire={null}
                zh={zh}
              />
            ))}
          </div>
        </div>
      )}

      <LabFooter zh={zh} />
    </div>
  );
}

function LabFooter({ zh }: { zh: boolean }) {
  return (
    <div className="tl-footer fin-tl-footer">
      <a
        href="https://mastermind-x.com/tech_lab.html"
        target="_blank"
        rel="noopener noreferrer"
        className="tl-footer-link fin-tl-footer-link"
      >
        {pick(zh, "Open Technical Lab ↗", "打开技术实验室 ↗")}
      </a>
    </div>
  );
}
