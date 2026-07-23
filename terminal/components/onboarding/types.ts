// Shared contract for the flagship onboarding sheet (W1).
//
// This file is the interface boundary between the onboarding UI (this folder) and
// the concurrently-built provider/shell integration. The provider imports these
// types to render <OnboardingSheet />; the sheet imports nothing back from the
// provider. Keep this file dependency-free (pure types) so both sides compile
// against it standalone.

export type OnboardMode = "signup" | "signin";
export type PlanKey = "free" | "insider" | "pro";
export type Period = "monthly" | "annual";

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

// sessionStorage (per-tab): the signup flow's live state. router.refresh() at the
// step-1→2 boundary flips app/terminal/page.tsx from its guest branch to its
// signed-in branch, which REMOUNTS the client tree (provider included) — so both
// the provider's open-state and the sheet's wizard fields must survive a remount.
// One-shot lifecycle: written while the signup wizard is live, cleared when the
// flow finishes (Done → close) . Passwords are never stashed.
export const SS_WIZARD = "mm.onboardWizard";   // sheet: step/name/email/prefs/plan/flags
export const SS_OPEN = "mm.onboardOpen";       // provider: {open, mode, plan, period}
