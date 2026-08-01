// Neural Web market-plane feed (neuralweb.market_plane.v1) — types + pure display helpers.
// Produced by the macro repo and served from mastermind-x.com/neuralwebdata/market_plane.json;
// the Terminal proxies it through /api/nw. Everything here is display-only context: the
// Terminal never ranks, gates, or scores any feature off this feed.

export type MarketPlane = {
  schema?: string;
  asof?: string;
  is_context_only?: boolean;
  verdict?: { verdict?: string; score?: number; label_en?: string; label_zh?: string };
  regime?: {
    quad?: string;
    quad_name?: string;
    confidence?: number;
    cycle_tag?: string;
    transition_state?: string;
    flip_margin?: number;
    liquidity_overlay?: string;
  };
  vol?: { regime?: string; risk_score?: number };
  liquidity_plumbing?: {
    state?: string;
    netliq_bn?: number;
    netliq_d20_bn?: number;
    rrp_buffer_state?: string;
    tga_bn?: number;
  };
  // Dealer positioning (Market Structure Core §6). A CONDITIONING variable for the rest
  // of this plane, not another signal beside it: "risk-on with dealers long gamma" and
  // "risk-on with dealers short gamma below the flip" are different states with
  // different realized-vol distributions. Display-only, like everything here.
  options_structure?: {
    root?: string | null;
    index_regime?: "long_gamma" | "short_gamma" | "near_flip" | null;
    regime_trend?: "strengthening" | "stable" | "weakening" | "unknown";
    regime_velocity_1d?: number | null;
    net_gex_bn?: number | null;
    dist_to_flip_pct?: number | null;
    /** 0..1 — how far the book's call and put gamma are from cancelling. */
    sign_confidence?: number | null;
    expiring_gamma_share_pct?: number | null;
    opex_window?: boolean | null;
    roots?: string[];
    asof?: string | null;
  };
  contradiction_count?: number;
  cortex?: { status?: string; degradation_reason?: string | null };
  stale?: boolean;
  produced_at?: string;
};

// Producer staleness contract (Mastermind bot convention): grey/hide when the feed says
// stale=true or its asof is older than 4 days.
export const STALE_AFTER_DAYS = 4;

export function isStalePlane(p: MarketPlane, nowMs: number): boolean {
  if (p.stale) return true;
  if (!p.asof) return false;
  const iso = p.asof.includes("T") ? p.asof : `${p.asof}T00:00:00Z`;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return nowMs - t > STALE_AFTER_DAYS * 86_400_000;
}

export type Tone = "up" | "down" | "warn" | "muted";

export function verdictTone(verdict?: string): Tone {
  const v = (verdict ?? "").toUpperCase();
  if (v.includes("RISK_ON") || v.includes("BULL")) return "up";
  if (v.includes("RISK_OFF") || v.includes("BEAR")) return "down";
  if (v.includes("NEUTRAL") || v.includes("MIXED") || v.includes("CAUTION")) return "warn";
  return "muted";
}

export function cortexTone(status?: string): Tone {
  const s = (status ?? "").toLowerCase();
  if (s === "ok" || s === "healthy" || s === "fresh") return "up";
  if (s === "degraded" || s === "stale") return "warn";
  if (s === "down" || s === "error" || s === "failed" || s === "unavailable") return "down";
  return "muted";
}

// "stress_liquidity_expansion" → "Stress Liquidity Expansion"
export function prettyToken(token?: string): string {
  if (!token) return "—";
  return token
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// Token dictionaries for the states the producer emits today. Unknown tokens fall back to
// the prettified English token in both languages — never blank, never a wrong translation.
const VOL_EN: Record<string, string> = {
  normalizing: "Normalizing",
  calm: "Calm",
  low: "Low",
  normal: "Normal",
  elevated: "Elevated",
  high: "High",
  stressed: "Stressed",
  crisis: "Crisis",
};
const VOL_ZH: Record<string, string> = {
  normalizing: "回归正常",
  calm: "平静",
  low: "低波动",
  normal: "正常",
  elevated: "偏高",
  high: "高波动",
  stressed: "高压",
  crisis: "危机",
};
const LIQ_EN: Record<string, string> = {
  expansion: "Expanding",
  expanding: "Expanding",
  contraction: "Contracting",
  contracting: "Contracting",
  neutral: "Neutral",
  stress_liquidity_expansion: "Stress Expansion",
};
const LIQ_ZH: Record<string, string> = {
  expansion: "扩张",
  expanding: "扩张",
  contraction: "收缩",
  contracting: "收缩",
  neutral: "中性",
  stress_liquidity_expansion: "压力式扩张",
};

export function volLabel(token: string | undefined, lang: "en" | "zh"): string {
  const k = (token ?? "").toLowerCase();
  const hit = lang === "zh" ? VOL_ZH[k] : VOL_EN[k];
  return hit ?? prettyToken(token);
}

export function liqLabel(token: string | undefined, lang: "en" | "zh"): string {
  const k = (token ?? "").toLowerCase();
  const hit = lang === "zh" ? LIQ_ZH[k] : LIQ_EN[k];
  return hit ?? prettyToken(token);
}

// ─── Dealer gamma regime (Market Structure Core §6) ─────────────────────────────────
//
// The TYPE above is the whole Terminal-side surface of this integration, and that is
// deliberate. §6 of the masterplan specified "add one chip to NeuralWebStrip" — but the
// operator ordered that strip unmounted on 2026-07-12 ("internal-jargon at the glance
// tier — get rid of it", commit 12d8c395), and it has been dead code since. Adding a
// chip there would either render nothing or re-introduce a surface that was rejected.
//
// The substance of §6 lives on the producer side: engine/neuralweb/options_plane.py puts
// the gamma regime into market_plane so the Neural Web's OWN reasoning can condition on
// it — which is the integration that was asked for. The type is kept because /api/nw
// still proxies this payload and a consumer should not have to guess its shape.
//
// If a glance-tier surface for this is ever wanted, it needs an operator decision about
// WHERE, not a re-mount of the strip they deleted.
