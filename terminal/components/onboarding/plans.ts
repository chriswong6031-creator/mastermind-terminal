// Single source of display truth for onboarding plan pricing.
//
// Mirrors the macro repo's config/plans.yml. The canonical Stripe lookup_keys and
// unit-amount cents (as of 2026-07-23) are:
//
//   insider_monthly  =  6900  ($69/mo)   ← Stripe lookup_key, NOT renamed by the tier rename
//   insider_annual   = 58800  ($588/yr → $49/mo)   ← ditto: an existing Stripe object's key
//   pro_monthly      =  9900  ($99/mo)
//   pro_annual       = 82800  ($828/yr → $69/mo)
//   trial_days       = 7
//
// Everything the UI displays is DERIVED from these cents — no per-month price,
// save-percent, or wedge figure is hardcoded. Change a cents value here and every
// number in Step 3 follows.

import type { PlanKey, Period } from "./types";

export const TRIAL_DAYS = 7;

interface PlanCents {
  monthly: number; // unit cents billed monthly
  annual: number;  // unit cents billed for the full year
}

// Raw cents — the only hand-entered numbers in this file.
const CENTS: Record<Exclude<PlanKey, "free">, PlanCents> = {
  essential: { monthly: 6900, annual: 58800 },
  pro: { monthly: 9900, annual: 82800 },
};

function round(n: number): number {
  return Math.round(n);
}

/** Dollars-per-month a paid tier costs in the given period (annual = year/12). */
export function perMonth(key: Exclude<PlanKey, "free">, period: Period): number {
  const c = CENTS[key];
  return period === "annual" ? round(c.annual / 12 / 100) : round(c.monthly / 100);
}

/** The struck-through "was" price shown in annual mode = the monthly-mode price. */
export function monthlyPrice(key: Exclude<PlanKey, "free">): number {
  return round(CENTS[key].monthly / 100);
}

/** Full annual billed amount in whole dollars (e.g. 588). */
export function annualBilled(key: Exclude<PlanKey, "free">): number {
  return round(CENTS[key].annual / 100);
}

/** Save percent switching a tier from monthly to annual, e.g. 29 / 30. */
export function savePct(key: Exclude<PlanKey, "free">): number {
  const c = CENTS[key];
  const m = c.monthly;
  const a = c.annual / 12;
  return round(((m - a) / m) * 100);
}

/** The best (largest) save% across paid tiers — powers the period-toggle badge. */
export function bestSavePct(): number {
  return Math.max(savePct("essential"), savePct("pro"));
}

/**
 * The real FIRST invoice total (whole dollars) for a paid tier — the amount that
 * lands after the 7-day trial. Annual → the full-year billed amount ($588 / $828);
 * monthly → the monthly price ($69 / $99). Derived from the same cents as everything
 * else — never hardcode this in the UI.
 */
export function firstInvoiceTotal(key: Exclude<PlanKey, "free">, period: Period): number {
  return period === "annual" ? annualBilled(key) : monthlyPrice(key);
}

/** Extra $/mo (annual) that upgrades Essential → Pro, e.g. 20. Powers the wedge row. */
export function proWedgePerMonth(): number {
  return perMonth("pro", "annual") - perMonth("essential", "annual");
}

// Static display shape per tier (name + hue token). Copy/feature lists live in the
// i18n LEX (translated); this const carries only structure + the CSS hue variable.
export interface PlanDisplay {
  key: PlanKey;
  hueVar: string; // CSS var name defined in onboarding.css (--ob-free / --ob-essential / --ob-pro)
}

export const PLANS: PlanDisplay[] = [
  { key: "free", hueVar: "--ob-free" },
  { key: "essential", hueVar: "--ob-essential" },
  { key: "pro", hueVar: "--ob-pro" },
];
