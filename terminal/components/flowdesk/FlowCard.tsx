"use client";
/**
 * FlowCard — single event card in the Flow Desk center feed.
 *
 * HONESTY DOCTRINE (non-negotiable):
 *  - Colors are by MAGNITUDE (score tier) — never green/red by asserted buy/sell.
 *  - Direction "lean" is a SOFT chip with neutral styling + explicit tooltip.
 *  - No "validated", no predictive-edge claims in copy.
 *  - Sweep badge carries "heuristic" tooltip — aggressor is UNVERIFIED without NBBO.
 *
 * Badge derivation conditions (each documented in inline comments):
 *  WHALE    — premium >= 1_000_000 (magnitude gate; reliable)
 *  CLUSTER  — ev.repeated === true  (chain-heat campaign flag from feed)
 *  SWEEP    — ev.n_prints >= 3 AND ev.swept === true  (heuristic; labeled)
 *  UNUSUAL  — ev.premium_z != null AND ev.premium_z >= 2  (z vs 252d baseline)
 *  BLOCK    — ev.size >= 5000 AND ev.n_prints === 1  (single large print)
 */

import { useState } from "react";
import type { FlowEvent } from "./FeedPane";
import { fmtNum } from "@/lib/finFormat";
import { computeFlowScore } from "@/lib/flowScore";
import { makeFlowT } from "@/lib/flowdeskStrings";

// ── Props ─────────────────────────────────────────────────────────────────────

interface FlowCardProps {
  ev: FlowEvent;
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
    // WHALE: premium >= $1M — magnitude-only gate (reliable; no direction required)
    whale: ev.premium >= 1_000_000,

    // CLUSTER: feed marks "repeated" true when chain-heat algorithm sees
    // accumulated same-contract-day premium crossing the $3M campaign threshold
    cluster: ev.repeated === true,

    // SWEEP: n_prints >= 3 simultaneous/rapid prints AND poller sweep flag present.
    // Lee-Ready aggressor is NOT verified (no NBBO) — labeled heuristic in tooltip.
    sweep: ev.n_prints >= 3 && ev.swept === true,

    // UNUSUAL: premium z-score vs 252-day rolling baseline >= 2σ
    // null z means no baseline (floor events) — treated as not unusual
    unusual: ev.premium_z != null && ev.premium_z >= 2,

    // BLOCK: single large print (n_prints===1) with size >= exchange block threshold (5000 contracts)
    // Direction not inferred from block status; size is reliable
    block: ev.n_prints === 1 && ev.size >= 5000,
  };
}

// ── Score tier → pill color (magnitude-based, NOT buy/sell) ──────────────────

type Tier = "ELITE" | "STRONG" | "HIGH" | "MEDIUM" | "LOW";

function tierColor(tier: Tier): string {
  switch (tier) {
    case "ELITE":  return "#9d86ff"; // purple — top tier
    case "STRONG": return "#e8a33d"; // amber
    case "HIGH":   return "#4d82ff"; // brand blue
    case "MEDIUM": return "var(--text-2)";
    default:       return "var(--muted)";
  }
}

function tierBg(tier: Tier): string {
  switch (tier) {
    case "ELITE":  return "rgba(157,134,255,.15)";
    case "STRONG": return "rgba(232,163,61,.13)";
    case "HIGH":   return "rgba(77,130,255,.13)";
    case "MEDIUM": return "rgba(134,141,156,.1)";
    default:       return "rgba(90,97,111,.08)";
  }
}

// ── OTM pct computation ───────────────────────────────────────────────────────

function otmPct(ev: FlowEvent): string {
  // spot is optional in the feed; if absent we show the moneyness bucket label
  if (ev.spot == null) return ev.mny_bucket.replace("_", " ");
  const diff = ((ev.strike - ev.spot) / ev.spot) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(1)}%`;
}

// ── Premium formatting (e.g. $1.2M) ──────────────────────────────────────────

function fmtPremium(v: number): string {
  return "$" + fmtNum(v, { decimals: 1 });
}

// ── Time formatting (HH:MM) ───────────────────────────────────────────────────

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/New_York",
    });
  } catch {
    return iso.slice(11, 16);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FlowCard({ ev, lang, selected, onSelect }: FlowCardProps) {
  const zh = lang === "zh";
  const [expanded, setExpanded] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);

  const { score, tier, components } = computeFlowScore(ev);
  const badges = deriveBadges(ev);
  const t = makeFlowT(lang);

  const cardStyle: React.CSSProperties = {
    position: "relative",
    background: selected ? "var(--panel-2)" : "var(--panel)",
    border: `1px solid ${selected ? "var(--brand)" : "var(--line)"}`,
    borderRadius: "var(--r-lg)",
    padding: "10px 12px",
    cursor: "pointer",
    transition: "border-color var(--t), background var(--t)",
    marginBottom: 4,
  };

  const rightBadgeColor = ev.right === "C"
    ? "rgba(38,194,129,.18)"  // call — green tint (not asserting direction, just option type)
    : "rgba(240,86,107,.18)"; // put — red tint
  const rightTextColor = ev.right === "C" ? "var(--up)" : "var(--down)";

  return (
    <div
      style={cardStyle}
      onClick={() => onSelect(ev)}
      aria-selected={selected}
      role="option"
    >
      {/* ── Row 1: ticker / C|P / lean / premium / time ── */}
      <div style={ROW}>
        {/* Ticker + right */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={TICKER_STYLE}>{ev.root}</span>
          <span
            style={{
              ...CHIP_BASE,
              background: rightBadgeColor,
              color: rightTextColor,
              fontWeight: 700,
            }}
          >
            {ev.right === "C" ? (zh ? "认购" : "C") : (zh ? "认沽" : "P")}
          </span>

          {/* Soft lean chip — neutral styling with honesty tooltip */}
          <span
            style={{ ...CHIP_BASE, background: "var(--panel-3)", color: "var(--text-2)", position: "relative" }}
            onMouseEnter={() => setTipVisible(true)}
            onMouseLeave={() => setTipVisible(false)}
            aria-label={t("leanTooltip")}
          >
            {ev.side === "~buy"
              ? (zh ? "~买" : "~buy")
              : ev.side === "~sell"
              ? (zh ? "~卖" : "~sell")
              : (zh ? "混合" : "mixed")}
            {/* inline tooltip */}
            {tipVisible && (
              <span style={LEAN_TIP_STYLE}>{t("leanTooltip")}</span>
            )}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Score pill — colored by tier, not by direction */}
          <span
            style={{
              ...CHIP_BASE,
              background: tierBg(tier as Tier),
              color: tierColor(tier as Tier),
              fontWeight: 700,
              letterSpacing: ".01em",
            }}
          >
            {score} {tier}
          </span>

          <span style={TIME_STYLE}>{fmtTime(ev.ts)}</span>
        </div>
      </div>

      {/* ── Row 2: strike / expiry / DTE / OTM% / premium ── */}
      <div style={{ ...ROW, marginTop: 6, gap: 10 }}>
        <div style={FACTS_STYLE}>
          <span style={FACT_LABEL}>{zh ? "行权价" : "Strike"}</span>
          <span style={FACT_VAL}>{ev.strike}</span>
        </div>
        <div style={FACTS_STYLE}>
          <span style={FACT_LABEL}>{zh ? "到期" : "Exp"}</span>
          <span style={FACT_VAL}>{ev.exp}</span>
        </div>
        <div style={FACTS_STYLE}>
          <span style={FACT_LABEL}>DTE</span>
          <span style={FACT_VAL}>{ev.dte}</span>
        </div>
        <div style={FACTS_STYLE}>
          <span style={FACT_LABEL}>{zh ? "价外%" : "OTM%"}</span>
          <span style={FACT_VAL}>{otmPct(ev)}</span>
        </div>
        <div style={{ ...FACTS_STYLE, marginLeft: "auto" }}>
          <span style={FACT_LABEL}>{zh ? "权利金" : "Premium"}</span>
          <span style={{ ...FACT_VAL, color: "var(--signal)", fontWeight: 700 }}>
            {fmtPremium(ev.premium)}
          </span>
        </div>
      </div>

      {/* ── Row 3: size / OI / size/OI / IV (if present) ── */}
      <div style={{ ...ROW, marginTop: 4, gap: 10, fontSize: 11, color: "var(--text-2)" }}>
        <span className="num">{zh ? "张数" : "Size"} {ev.size.toLocaleString()}</span>
        {ev.oi != null && (
          <>
            <span style={{ color: "var(--text-dim)" }}>·</span>
            <span className="num">OI {(ev.oi as number).toLocaleString()}</span>
            <span style={{ color: "var(--text-dim)" }}>·</span>
            <span className="num">
              {zh ? "量/OI" : "Sz/OI"} {((ev.size / (ev.oi as number))).toFixed(2)}
            </span>
          </>
        )}
        {ev.iv != null && (
          <>
            <span style={{ color: "var(--text-dim)" }}>·</span>
            <span className="num">IV {((ev.iv as number) * 100).toFixed(1)}%</span>
          </>
        )}
        {ev.spot != null && (
          <>
            <span style={{ color: "var(--text-dim)" }}>·</span>
            <span className="num">{zh ? "现价" : "Spot"} {(ev.spot as number).toFixed(2)}</span>
          </>
        )}
      </div>

      {/* ── Row 4: badges ── */}
      {Object.values(badges).some(Boolean) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
          {badges.whale && <Badge label={zh ? "巨单" : "WHALE"} tip={t("badgeWhaleDesc")} color="#e8a33d" />}
          {badges.cluster && <Badge label={zh ? "集群" : "CLUSTER"} tip={t("badgeClusterDesc")} color="#9d86ff" />}
          {badges.sweep && <Badge label={zh ? "扫单(启发)" : "SWEEP (heuristic)"} tip={t("badgeSweepDesc")} color="var(--text-2)" />}
          {badges.unusual && <Badge label={zh ? "异常" : "UNUSUAL"} tip={t("badgeUnusualDesc")} color="#19c2c2" />}
          {badges.block && <Badge label={zh ? "大宗" : "BLOCK"} tip={t("badgeBlockDesc")} color="var(--text-2)" />}
        </div>
      )}

      {/* ── Expand toggle ── */}
      <button
        style={EXPAND_BTN_STYLE}
        onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
        aria-expanded={expanded}
      >
        {expanded ? "▲" : "▼"}
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={DETAIL_STYLE}>
          <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 11, color: "var(--text-2)" }}>
            {zh ? "评分组成" : "Score components"}
          </div>
          {components.map((c) => (
            <div key={c.key} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
              <span style={{ color: "var(--text-2)" }}>{c.label}</span>
              <span className="num" style={{ color: "var(--text)" }}>{c.value}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-dim)", lineHeight: 1.45 }}>
            {zh
              ? "评分反映大小/活跃度/新意，非胜率预测。等级为描述性，在前瞻账本完成之前无历史预测效力。"
              : "Score reflects magnitude/activity/novelty — not a win-rate prediction. Tiers are descriptive; no historical predictive edge until a forward ledger gates authority."}
          </div>
          <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-dim)" }}>
            {zh ? "方向倾向" : "Direction lean"}:{" "}
            <span style={{ color: "var(--text-2)" }}>
              {ev.side} — {zh ? "tick规则推断，非NBBO确认" : "tick-rule inferred, not NBBO-confirmed"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Badge sub-component ───────────────────────────────────────────────────────

function Badge({ label, tip, color }: { label: string; tip: string; color: string }) {
  const [vis, setVis] = useState(false);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        font: "600 9.5px/1 var(--font-ui)",
        color,
        border: `1px solid ${color === "var(--text-2)" ? "var(--line)" : color}`,
        borderRadius: "var(--r-pill)",
        padding: "3px 7px",
        opacity: color === "var(--text-2)" ? 0.7 : 1,
        cursor: "help",
      }}
      onMouseEnter={() => setVis(true)}
      onMouseLeave={() => setVis(false)}
    >
      {label}
      {vis && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: 240,
            whiteSpace: "normal" as React.CSSProperties["whiteSpace"],
            background: "var(--panel-3)",
            border: "1px solid var(--line-3)",
            borderRadius: "var(--r-md)",
            padding: "6px 9px",
            font: "500 10.5px/1.4 var(--font-ui)",
            color: "var(--text-2)",
            zIndex: 50,
            pointerEvents: "none",
            boxShadow: "var(--shadow-1)",
          }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}

// ── Style constants ───────────────────────────────────────────────────────────

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap" as const,
};

const TICKER_STYLE: React.CSSProperties = {
  font: "700 13px/1 var(--font-ui)",
  color: "var(--text)",
  letterSpacing: ".01em",
};

const CHIP_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  font: "600 10px/1 var(--font-ui)",
  borderRadius: "var(--r-pill)",
  padding: "3px 7px",
  whiteSpace: "nowrap",
};

const TIME_STYLE: React.CSSProperties = {
  font: "500 10.5px/1 var(--font-num)",
  color: "var(--muted)",
  letterSpacing: ".03em",
};

const FACTS_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const FACT_LABEL: React.CSSProperties = {
  font: "500 9.5px/1 var(--font-ui)",
  color: "var(--muted)",
};

const FACT_VAL: React.CSSProperties = {
  font: "600 11.5px/1 var(--font-num)",
  color: "var(--text)",
};

const EXPAND_BTN_STYLE: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 8,
  font: "600 8px/1 var(--font-ui)",
  color: "var(--muted)",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
};

const DETAIL_STYLE: React.CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid var(--line-2)",
};

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
