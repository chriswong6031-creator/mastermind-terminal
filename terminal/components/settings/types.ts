// Shared contracts for the account settings dashboard sections.
// Lives apart from SettingsPanel so the sections can import types without a
// cycle (the panel imports the sections).

import type { AcsUser } from "./SettingsProvider";

/** One metered lane as reported by the Brain gateway / `chat_budget`. */
export interface AcsLane {
  remaining?: number;
  /** < 0 = uncapped · 0 = not included on this tier · > 0 = a real cap. */
  limit?: number;
  period?: string;
}

export interface AcsQuotas {
  fast?: AcsLane;
  pro?: AcsLane;
}

/** GET /api/me — the billing gateway's entitlement payload, piped through
 *  verbatim by app/api/me/route.ts (it narrows nothing). */
export interface AcsPlan {
  tier?: string;
  status?: string;
  current_period_end?: string | null;
  /** 'stripe' | 'comp' | … — a non-Stripe source has no portal to open. */
  source?: string | null;
  interval?: string | null;
  chat_budget?: AcsQuotas | null;
}

/** GET /api/brain/me — the canonical usage view. */
export interface AcsUsage {
  tier?: string;
  quotas?: AcsQuotas;
}

/** What every section receives from the panel. */
export interface SectionProps {
  t: (key: string, fallback?: string) => string;
  lang: "en" | "zh";
  email: string;
  user: AcsUser | null;
  onClose: () => void;
  /** Merge a user_metadata patch into the cached user after a successful save. */
  onPatchMeta: (patch: Record<string, unknown>) => void;
  onRefreshUser: () => Promise<void>;
}

/** Locale-aware date, matching the macro dashboard's `_sdDate`. */
export function acsDate(iso: string | null | undefined, lang: "en" | "zh"): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/** Tier → display label key. Unlimited reads as Pro (it is an uncapped Pro). */
export function acsTierLabelKey(tier: string | undefined): string {
  if (tier === "pro" || tier === "unlimited") return "acsTierPro";
  if (tier === "insider") return "acsTierInsider";
  return "acsTierFree";
}

/**
 * Per-month display price by tier+interval, mirroring the macro dashboard's
 * SD_PRICE (and config/plans.yml). Billing-hero DECORATION ONLY — never a gate.
 * The upgrade sheet owns the real pricing; this exists so the hero can say what
 * the user is paying without a second network call.
 */
export const ACS_PRICE: Record<string, { monthly: number; annual: number; annualYr: number }> = {
  insider: { monthly: 69, annual: 49, annualYr: 588 },
  pro: { monthly: 99, annual: 69, annualYr: 828 },
};

/**
 * Plain-word plan highlights for Billing's "Your plan includes".
 * Decorative only (never a gate).
 *
 * NOTE — upstream bug fixed here: the macro table has no `unlimited` key, so
 * `SD_PLAN_FEATURES[tier] || SD_PLAN_FEATURES.free` silently showed unlimited
 * users the FREE feature list. Unlimited maps to the Pro list, which is what it
 * actually grants.
 */
export const ACS_PLAN_FEATURES: Record<string, string[]> = {
  free: ["acsFeatFree1", "acsFeatFree2", "acsFeatFree3", "acsFeatFree4"],
  insider: ["acsFeatInsider1", "acsFeatInsider2", "acsFeatInsider3", "acsFeatInsider4"],
  pro: ["acsFeatPro1", "acsFeatPro2", "acsFeatPro3", "acsFeatPro4"],
  unlimited: ["acsFeatPro1", "acsFeatPro2", "acsFeatPro3", "acsFeatPro4"],
};

/**
 * Where an upgrade goes.
 *
 * A free user is choosing a plan for the first time — the Terminal's own
 * onboarding sheet does that natively, so it stays in-app (operator default:
 * Pro / annual preselected).
 *
 * Every other move (Insider → Pro, monthly → annual) is a CHANGE to a live
 * subscription with proration, which the Terminal's sheet cannot perform: only
 * the landing's upgrade flow talks to that gateway lane. Those open the landing
 * in a new tab rather than pretending in-app.
 */
export const ACS_UPGRADE_URL = "https://www.mastermind-x.com/index.html?upgrade=1";

export function acsUpgradeIsInApp(tier: string | undefined): boolean {
  return (tier || "free") === "free";
}

/** The CTA label for a tier+interval, or null when nothing is left to buy. */
export function acsUpgradeLabelKey(
  tier: string | undefined,
  interval: string | null | undefined,
): string | null {
  const tr = tier || "free";
  if (tr === "unlimited") return null;
  if (tr === "pro" && interval === "annual") return null;
  if (tr === "free") return "acsChoosePlan";
  if (tr === "insider") return "acsUpgradePro";
  return "acsSwitchAnnual";
}
