// Shared contract for the flagship onboarding sheet (W1).
//
// This file is the interface boundary between the onboarding UI (this folder) and
// the concurrently-built provider/shell integration. The provider imports these
// types to render <OnboardingSheet />; the sheet imports nothing back from the
// provider. Keep this file dependency-free (pure types) so both sides compile
// against it standalone.

export type OnboardMode = "signup" | "signin";
export type PlanKey = "free" | "essential" | "pro";
export type Period = "monthly" | "annual";

/**
 * Coerce anything that can hand this flow a plan — `?plan=`, the SS_WIZARD stash,
 * the SS_OPEN stash, the LS_ONBOARD_RESUME stash — into a canonical PlanKey.
 *
 * `insider` is the PRE-RENAME name for `essential` and is accepted here FOREVER, not
 * transitionally: a tab opened before the rename keeps its sessionStorage stash for
 * the life of that tab, `mm.onboardResume` survives an OAuth round-trip in
 * localStorage, and a cached landing page can still emit `?plan=insider`. None of
 * those can be migrated. Read-tolerance only — every write is canonical, so a stash
 * re-saved by this build comes back as `essential`.
 *
 * Unknown / missing → null, so callers keep their own default rather than silently
 * landing a user on the wrong plan.
 */
export function normalizePlanKey(value: unknown): PlanKey | null {
  if (value === "essential" || value === "insider") return "essential";
  if (value === "free" || value === "pro") return value;
  return null;
}

export interface OnboardingSheetProps {
  mode: OnboardMode;
  /** Sheet visibility. The provider keeps the sheet MOUNTED once opened (so mid-flow
   *  wizard state survives a dismiss — the state-preserving requirement) and toggles
   *  this instead of unmounting. */
  visible: boolean;
  /** Signed-in email from the shell ("" = guest). */
  email: string;
  /** Deep-link preselect (?plan=). */
  initialPlan?: PlanKey;
  /** Deep-link preselect (?period=). */
  initialPeriod?: Period;
  /** True when returning from Google OAuth redirect (?onboard=resume). */
  resume?: boolean;
  /** Parent (provider) owns open/close; the sheet requests close via this. */
  onClose: () => void;
}

// ── localStorage contract ─────────────────────────────────────────────────────
//
//  mm.onboardResume  — JSON stash written by oauth.ts before the Google OAuth
//                      redirect; the SHEET restores + clears it in its resume
//                      effect (the provider only signals resume via the
//                      ?onboard=resume deep-link). Shape: OnboardResumeStash.
//  mm.pendingPrefs   — JSON preferences captured while confirmPending (no session
//                      yet); the PROVIDER applies + clears it on the first authed
//                      mount. Shape: PendingPrefs.
//
// Both are one-shot: the writer sets, the reader reads-then-removes.

export interface OnboardPrefs {
  market_focus: string[];       // e.g. ["us","cn","hk","ca","global"]
  trade_types: string[];        // e.g. ["stocks","options","crypto"]
  theme_pref: "light" | "dark" | "auto";
}

export interface OnboardResumeStash {
  step: number;                 // step to resume at (2 = Preferences)
  firstName: string;
  lastName: string;
  plan: PlanKey;
  period: Period;
  prefs: OnboardPrefs;
}

export interface PendingPrefs extends OnboardPrefs {
  first_name: string;
  last_name: string;
  onboarded_at: string;         // ISO timestamp
}

export const LS_ONBOARD_RESUME = "mm.onboardResume";
export const LS_PENDING_PREFS = "mm.pendingPrefs";

// ── Wizard step model (W2) ────────────────────────────────────────────────────
//  1 Account · 2 Preferences · 3 Plan · 4 Billing (PAID ONLY) · 5 Done.
//  Free path jumps 3 → 5 (numbering stays stable so the stash stays coherent — the
//  Billing step simply has no free variant). The stepper hides the Billing entry
//  unless a paid plan is selected. Stale W1-shaped stashes (which used step 4 as
//  Done) must rehydrate without crashing: see remapStashStep in OnboardingSheet.
export const STEP_ACCOUNT = 1;
export const STEP_PREFS = 2;
export const STEP_PLAN = 3;
export const STEP_BILLING = 4;
export const STEP_DONE = 5;

// The live wizard fields that survive a client-tree remount (see SS_WIZARD below).
// Password is deliberately absent — never persisted anywhere. Extended in W2 with
// trialActive/trialEnd (the in-sheet trial outcome carried into the Done copy).
export interface WizardStash {
  step: number;
  firstName: string;
  lastName: string;
  email: string;
  prefs: OnboardPrefs;
  plan: PlanKey;
  period: Period;
  confirmPending: boolean;
  // W2: true once an in-sheet Stripe trial has started (Done copy → "trial live").
  trialActive: boolean;
  // W2: epoch seconds when the first charge lands (from subscribe/complete); null
  // until the trial starts. Carried into StepDone for the localized date.
  trialEnd: number | null;
}

// sessionStorage (per-tab): the signup flow's live state. router.refresh() at the
// step-1→2 boundary flips app/terminal/page.tsx from its guest branch to its
// signed-in branch, which REMOUNTS the client tree (provider included) — so both
// the provider's open-state and the sheet's wizard fields must survive a remount.
// One-shot lifecycle: written while the signup wizard is live, cleared when the
// flow finishes (Done → close) . Passwords are never stashed.
export const SS_WIZARD = "mm.onboardWizard";   // sheet: step/name/email/prefs/plan/flags
export const SS_OPEN = "mm.onboardOpen";       // provider: {open, mode, plan, period}
