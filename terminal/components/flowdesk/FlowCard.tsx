"use client";
/**
 * FlowCard — single event card in the Flow Desk center feed.
 * Observatory restyle: glass obs-card, RingGauge md, lean dashed pill.
 *
 * HONESTY DOCTRINE (non-negotiable):
 *  - Colors are by MAGNITUDE (score tier) — never green/red by asserted buy/sell.
 *  - Direction "lean" is a SOFT chip with neutral styling + explicit tooltip.
 *  - No "validated", no predictive-edge claims in copy.
 *  - Sweep badge carries "heuristic" tooltip — aggressor is UNVERIFIED without NBBO.
 */

import { memo, useState } from "react";
import type { FlowEvent, EnrichEvent } from "./FeedPane";
import { fmtNum } from "@/lib/finFormat";
import { computeFlowScore } from "@/lib/flowScore";
import { makeFlowT } from "@/lib/flowdeskStrings";
import { RingGauge } from "../ui/RingGauge";

// ── Props ─────────────────────────────────────────────────────────────────────

interface FlowCardProps {
  ev: FlowEvent;
  /** v2 enrich data for this event (null when artifact absent/stale) */
  enrichEv: EnrichEvent | null;
  lang: "en" | "zh";
  selected: boolean;
  onSelect: (ev: FlowEvent) => void;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

interface BadgeSet {
  whale: boolean;
  cluster: boolean;
  sweep: boolean;
  unusual: boolean;
  block: boolean;
}

function deriveBadges(ev: FlowEvent): BadgeSet {
  return {
    whale:   ev.premium >= 1_000_000,
    cluster: ev.repeated === true,
    sweep:   ev.n_prints >= 3 && ev.swept === true,
    unusual: ev.premium_z != null && ev.premium_z >= 2,
    block:   ev.n_prints === 1 && ev.size >= 5000,
  };
}

// ── OTM pct computation ───────────────────────────────────────────────────────

function otmPct(ev: FlowEvent): string {
  if (ev.spot == null) return ev.mny_bucket.replace("_", " ");
  const diff = ((ev.strike - ev.spot) / ev.spot) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}%`;
}

// ── Premium formatting ────────────────────────────────────────────────────────

function fmtPremium(v: number): string {
  return "$" + fmtNum(v, { decimals: 1 });
}

// ── Time formatting ───────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/New_York",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

// ── Score tone (auto via RingGauge) ──────────────────────────────────────────
// RingGauge "auto" maps ≥70→brand, ≥50→up, ≥30→muted, <30→down.
// No extra color logic needed here.

// ── Component ─────────────────────────────────────────────────────────────────

// Memoized to avoid re-rendering all 200 cards on every poll tick or selection change.
// Only re-renders when its own event data, selection state, enrich data, or lang changes.
export const FlowCard = memo(function FlowCard({ ev, enrichEv, lang, selected, onSelect }: FlowCardProps) {
  const zh = lang === "zh";
  const [expanded, setExpanded] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);

  const raw = computeFlowScore(ev);
  const score = isNaN(raw.score) ? 0 : raw.score;
  const components = raw.components;
  const badges = deriveBadges(ev);
  const t = makeFlowT(lang);

  // v2 enrichment — present only when artifact is fresh
  const hasEnrich = enrichEv !== null;
  const v2Badges = enrichEv?.badges ?? [];
  const directionDiscounted = enrichEv?.direction_discounted ?? false;

  const isCall = ev.right === "C";

  return (
    <div
      className={`obs-card obs-fc-card${selected ? " sel" : ""}`}
      onClick={() => onSelect(ev)}
      role="option"
      aria-selected={selected}
      data-tut="flow-card"
      style={{ position: "relative" }}
    >
      {/* ── Line 1: ticker / C|P / score ring / lean / time ── */}
      <div className="obs-fc-row1">
        <span className="obs-fc-ticker">{ev.root}</span>

        {/* C/P chip — East-Asian flip aware via var(--up)/var(--down) */}
        <span className={`obs-fc-cp ${isCall ? "call" : "put"}`}>
          {isCall ? (zh ? "认购" : "C") : (zh ? "认沽" : "P")}
        </span>

        {/* Score ring — compact sm size on line 1 */}
        <span className="obs-fc-ring-wrap obs-fc-ring-inline">
          <RingGauge value={score} size="sm" tone="auto" />
        </span>

        {/* Lean chip — dashed border, neutral color.
            direction_discounted=true (spread detected): muted + "spread — direction unreliable" label. */}
        {directionDiscounted ? (
          <span
            className="obs-fc-lean"
            style={{ opacity: 0.5 }}
          >
            {zh ? "价差 — 方向不可靠" : "spread — direction unreliable"}
          </span>
        ) : (
          <span
            className="obs-fc-lean"
            onMouseEnter={() => setTipVisible(true)}
            onMouseLeave={() => setTipVisible(false)}
            aria-label={t("leanTooltip")}
          >
            {ev.side === "~buy"
              ? (zh ? "~买" : "~buy")
              : ev.side === "~sell"
              ? (zh ? "~卖" : "~sell")
              : (zh ? "混合" : "mixed")}
            {tipVisible && (
              <span style={LEAN_TIP_STYLE}>{t("leanTooltip")}</span>
            )}
          </span>
        )}

        <span className="obs-fc-time">{fmtTime(ev.ts)}</span>
      </div>

      {/* ── Line 2: strike / exp / DTE + premium prominent ── */}
      <div className="obs-fc-line2">
        <span className="obs-fc-subtitle num">${ev.strike} · {ev.exp} · {ev.dte}d</span>
        <span className="obs-fc-prem">{fmtPremium(ev.premium)}</span>
      </div>

      {/* ── Line 3: size / OI + badges ── */}
      <div className="obs-fc-line3">
        <span className="obs-fc-meta">
          <span className="num">{zh ? "张" : "Sz"} {ev.size.toLocaleString()}</span>
          {ev.oi != null && (
            <>
              <span className="obs-fc-meta-sep">·</span>
              <span className="num">OI {(ev.oi as number).toLocaleString()}</span>
            </>
          )}
          {ev.iv != null && (
            <>
              <span className="obs-fc-meta-sep">·</span>
              <span className="num">IV {((ev.iv as number) * 100).toFixed(1)}%</span>
            </>
          )}
        </span>
        <span className="obs-fc-badges-row obs-fc-badges-inline">
          {/* v2 detection badges (compact tokens) — only when enrich present */}
          {hasEnrich && v2Badges.map((b) => (
            <V2Badge key={b} badge={b} zh={zh} />
          ))}
          {/* v1 badges shown when enrich absent (graceful fallback) */}
          {!hasEnrich && (
            <>
              {badges.whale && (
                <Badge cls="whale" label={zh ? "巨单" : "WHALE"} tip={t("badgeWhaleDesc")} />
              )}
              {badges.cluster && (
                <Badge cls="cluster" label={zh ? "集群" : "CLUSTER"} tip={t("badgeClusterDesc")} />
              )}
              {badges.sweep && (
                <Badge cls="sweep" label={zh ? "扫单≈" : "SWEEP≈"} tip={t("badgeSweepDesc")} />
              )}
              {badges.unusual && (
                <Badge cls="unusual" label={zh ? "异常" : "UNUSUAL"} tip={t("badgeUnusualDesc")} />
              )}
              {badges.block && (
                <Badge cls="block" label={zh ? "大宗" : "BLOCK"} tip={t("badgeBlockDesc")} />
              )}
            </>
          )}
        </span>
      </div>

      {/* ── Expand toggle ── */}
      <button
        className="obs-fc-expand-btn"
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        aria-expanded={expanded}
      >
        {expanded ? "▲" : "▼"}
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="obs-fc-detail">
          <div className="obs-fc-detail-hd">
            {zh ? "评分组成" : "Score components"}
          </div>
          {components.map((c) => (
            <div key={c.key} className="obs-fc-comp-row">
              <span className="obs-fc-comp-label">{c.label}</span>
              <div className="obs-fc-comp-track">
                <div
                  className="obs-fc-comp-fill"
                  style={{ width: `${Math.min(100, c.value)}%`, opacity: 0.8 }}
                />
              </div>
              <span className="obs-fc-comp-val">{c.value.toFixed(0)}</span>
            </div>
          ))}
          <div className="obs-note" style={{ margin: "8px 0 0" }}>
            {zh
              ? "评分反映大小/活跃度/新意，非胜率预测。等级为描述性，在前瞻账本完成之前无历史预测效力。"
              : "Score reflects magnitude/activity/novelty — not a win-rate prediction. Tiers are descriptive; no historical predictive edge until a forward ledger gates authority."}
          </div>
          <div className="obs-fc-detail-note">
            {zh ? "方向倾向" : "Direction lean"}:{" "}
            <span style={{ color: "var(--text-2)" }}>
              {ev.side} — {zh ? "tick规则推断，非NBBO确认" : "tick-rule inferred, not NBBO-confirmed"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Badge sub-component ───────────────────────────────────────────────────────

function Badge({ cls, label, tip }: { cls: string; label: string; tip: string }) {
  const [vis, setVis] = useState(false);
  return (
    <span
      className={`obs-fc-badge obs-fc-badge-${cls}`}
      onMouseEnter={() => setVis(true)}
      onMouseLeave={() => setVis(false)}
      style={{ position: "relative" }}
    >
      {label}
      {vis && (
        <span style={BADGE_TIP_STYLE}>{tip}</span>
      )}
    </span>
  );
}

// ── V2 Badge sub-component (compact token from enrich artifact) ───────────────

const V2_BADGE_LABELS: Record<string, { en: string; zh: string }> = {
  MULTI_LEG:    { en: "MULTI-LEG", zh: "多腿" },
  LADDER:       { en: "LADDER",    zh: "梯形" },
  REPEAT_HITTER:{ en: "REPEAT",    zh: "重复" },
  SIZE_VS_OI:   { en: "SZ>OI",     zh: "量超OI" },
  WHALE:        { en: "WHALE",     zh: "巨单" },
  FRESH:        { en: "FRESH",     zh: "新仓" },
  Z_OUTLIER:    { en: "Z-OUT",     zh: "Z异常" },
  OI_CONFIRMED: { en: "OI✓",      zh: "OI确认" },
};

type EnrichBadgeKey = keyof typeof V2_BADGE_LABELS;

function V2Badge({ badge, zh }: { badge: EnrichBadgeKey; zh: boolean }) {
  const labels = V2_BADGE_LABELS[badge] ?? { en: badge, zh: badge };
  return (
    <span
      className={`obs-fc-badge obs-fc-badge-v2 obs-fc-badge-${badge.toLowerCase().replace(/_/g, "-")}`}
      style={V2_BADGE_STYLE}
    >
      {zh ? labels.zh : labels.en}
    </span>
  );
}

const V2_BADGE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  fontSize: 8,
  fontWeight: 800,
  letterSpacing: "0.06em",
  padding: "1px 4px",
  borderRadius: 3,
  border: "1px solid var(--line-2)",
  background: "rgba(77,130,255,0.08)",
  color: "var(--brand-2)",
  whiteSpace: "nowrap" as const,
};

// ── Tooltip styles ────────────────────────────────────────────────────────────

const LEAN_TIP_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 5px)",
  left: "50%",
  transform: "translateX(-50%)",
  whiteSpace: "normal",
  maxWidth: 220,
  background: "var(--panel-3)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-md)",
  padding: "6px 9px",
  font: "500 10.5px/1.4 var(--font-ui)",
  color: "var(--text-2)",
  zIndex: 50,
  pointerEvents: "none",
  boxShadow: "var(--shadow-1)",
};

const BADGE_TIP_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  left: "50%",
  transform: "translateX(-50%)",
  maxWidth: 240,
  whiteSpace: "normal",
  background: "var(--panel-3)",
  border: "1px solid var(--line-3)",
  borderRadius: "var(--r-md)",
  padding: "6px 9px",
  font: "500 10.5px/1.4 var(--font-ui)",
  color: "var(--text-2)",
  zIndex: 50,
  pointerEvents: "none",
  boxShadow: "var(--shadow-1)",
};
