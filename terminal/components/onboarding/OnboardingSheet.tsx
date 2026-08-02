"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import type {
  OnboardMode, OnboardingSheetProps, OnboardPrefs, PlanKey, Period, PendingPrefs, WizardStash,
} from "./types";
import {
  LS_PENDING_PREFS, LS_ONBOARD_RESUME, SS_WIZARD, normalizePlanKey, type OnboardResumeStash,
  STEP_ACCOUNT, STEP_PREFS, STEP_PLAN, STEP_BILLING, STEP_DONE,
} from "./types";
import RailCard, { MobileStepper, type WizardSnapshot } from "./RailCard";
import StepAccount from "./StepAccount";
import StepPreferences, { StepPreferencesFooter } from "./StepPreferences";
import StepPlan, { StepPlanFooter } from "./StepPlan";
import StepBilling from "./StepBilling";
import StepDone, { StepDoneFooter } from "./StepDone";

const DRAG_MIN_WIDTH = 861; // drag disabled under this viewport width

const emptyPrefs: OnboardPrefs = { market_focus: [], trade_types: [], theme_pref: "dark" };

// Rehydrate a stashed step under the W2 five-step model, tolerating stale W1-shaped
// stashes. In W1, step 4 meant DONE (there was no Billing step). If a stale stash
// lands here, remap: a paid plan with step ≥ 4 → Billing (STEP_BILLING); anything
// else at the old terminal step → Done. Fresh W2 stashes already carry 1–5 and pass
// through unchanged. Missing/garbage → step 1.
function remapStashStep(raw: Partial<WizardStash>): number {
  const s = typeof raw.step === "number" && raw.step >= 1 ? raw.step : STEP_ACCOUNT;
  const paid = normalizePlanKey(raw.plan) === "essential" || raw.plan === "pro";
  // W1 stash never had trialActive/trialEnd; treat a step-4 W1 stash as the old Done.
  const isW1Shape = raw.trialActive === undefined && raw.trialEnd === undefined;
  if (isW1Shape && s >= STEP_BILLING) {
    // Old W1 "step 4 = Done": paid → land on the new Billing step, free → Done.
    return paid ? STEP_BILLING : STEP_DONE;
  }
  return Math.min(s, STEP_DONE);
}

function readWizardStash(): Partial<WizardStash> | null {
  try {
    const raw = sessionStorage.getItem(SS_WIZARD);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Partial<WizardStash>) : null;
  } catch { return null; }
}

export default function OnboardingSheet(props: OnboardingSheetProps) {
  const { onClose } = props;
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // ── Wizard state ─────────────────────────────────────────────────────────────
  // Lazily rehydrated from the per-tab stash so the mid-flow wizard survives the
  // client-tree remount that router.refresh() causes at the step-1→2 boundary.
  const stashRef = useRef<Partial<WizardStash> | null | undefined>(undefined);
  if (stashRef.current === undefined) stashRef.current = props.mode === "signup" ? readWizardStash() : null;
  const stash = stashRef.current;
  const [mode, setMode] = useState<OnboardMode>(props.mode);
  const [step, setStep] = useState(stash ? remapStashStep(stash) : STEP_ACCOUNT);
  const [firstName, setFirstName] = useState(stash?.firstName ?? "");
  const [lastName, setLastName] = useState(stash?.lastName ?? "");
  const [email, setEmail] = useState(stash?.email ?? props.email);
  const [password, setPassword] = useState("");
  const [prefs, setPrefs] = useState<OnboardPrefs>(stash?.prefs ?? emptyPrefs);
  // Stash reads normalize: a tab opened before the rename still holds `insider`.
  const [plan, setPlan] = useState<PlanKey>(normalizePlanKey(stash?.plan) ?? props.initialPlan ?? "pro");
  const [period, setPeriod] = useState<Period>(stash?.period ?? props.initialPeriod ?? "annual");
  const [confirmPending, setConfirmPending] = useState(stash?.confirmPending ?? false);
  // W2: an in-sheet Stripe trial has started (drives the Done "trial live" copy + rail chip).
  const [trialActive, setTrialActive] = useState(stash?.trialActive ?? false);
  const [trialEnd, setTrialEnd] = useState<number | null>(stash?.trialEnd ?? null);
  const [drag, setDrag] = useState({ x: 0, y: 0 }); // header-drag translate

  const paid = plan === "essential" || plan === "pro";

  // Persist the live wizard (signup mode only) so a remount resumes in place; the
  // stash is cleared by handleClose once the flow reaches Done.
  useEffect(() => {
    if (mode !== "signup") return;
    try {
      const w: WizardStash = { step, firstName, lastName, email, prefs, plan, period, confirmPending, trialActive, trialEnd };
      sessionStorage.setItem(SS_WIZARD, JSON.stringify(w));
    } catch { /* storage blocked — flow still works, just without remount resilience */ }
  }, [mode, step, firstName, lastName, email, prefs, plan, period, confirmPending, trialActive, trialEnd]);

  // Effective email for display + persistence: what the user typed wins; otherwise
  // the shell-delivered address (signed-in / resume). Derived — no state sync effect.
  const effEmail = email || props.email;

  // ── Resume from Google OAuth: restore the pre-redirect stash (one-shot — read
  //    then remove, per the types.ts contract), skip to step 2, and fall back to
  //    Google's own name when the user hadn't typed one before redirecting.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!props.resume || resumedRef.current) return;
    resumedRef.current = true;
    let stashedName = false;
    try {
      const raw = localStorage.getItem(LS_ONBOARD_RESUME);
      if (raw) {
        const stash = JSON.parse(raw) as Partial<OnboardResumeStash>;
        if (stash.firstName) { setFirstName(stash.firstName); stashedName = true; }
        if (stash.lastName) setLastName(stash.lastName);
        const resumedPlan = normalizePlanKey(stash.plan);
        if (resumedPlan) setPlan(resumedPlan);
        if (stash.period === "monthly" || stash.period === "annual") setPeriod(stash.period);
        if (stash.prefs && typeof stash.prefs === "object") setPrefs((p) => ({ ...p, ...stash.prefs }));
      }
      localStorage.removeItem(LS_ONBOARD_RESUME);
    } catch { /* storage blocked — degrade to getUser name below */ }
    setStep(2);
    (async () => {
      if (stashedName) return;
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const full = (data.user?.user_metadata?.full_name as string | undefined) ?? "";
        if (full) {
          const [fn, ...rest] = full.split(" ");
          setFirstName(fn);
          setLastName(rest.join(" "));
        }
      } catch { /* non-fatal — greeting just falls back to no-name */ }
    })();
  }, [props.resume]);

  // Close, clearing the wizard stash once the flow is finished (Done) — a mid-flow
  // dismiss keeps the stash so reopening (or a remount) resumes in place.
  const handleClose = useCallback(() => {
    if (step === STEP_DONE || mode === "signin") {
      try { sessionStorage.removeItem(SS_WIZARD); } catch { /* ignore */ }
    }
    onClose();
  }, [step, mode, onClose]);

  // ── Escape closes (only while visible — a hidden mounted sheet must not eat keys) ──
  useEffect(() => {
    if (!props.visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose, props.visible]);

  // ── Move focus to the step heading on step change ─────────────────────────────
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.visible) return; // a display:none heading can't take focus; refocus on re-show
    const id = setTimeout(() => {
      const h = paneRef.current?.querySelector<HTMLElement>("[data-ob-heading]");
      h?.focus();
    }, 40);
    return () => clearTimeout(id);
  }, [step, mode, props.visible]);

  // ── Header drag (desktop only) ────────────────────────────────────────────────
  const dragState = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number }>(
    { active: false, sx: 0, sy: 0, ox: 0, oy: 0 },
  );
  const [dragging, setDragging] = useState(false);
  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (window.innerWidth < DRAG_MIN_WIDTH) return; // disabled on mobile
    if ((e.target as HTMLElement).closest("button")) return; // don't drag from the close X
    dragState.current = { active: true, sx: e.clientX, sy: e.clientY, ox: drag.x, oy: drag.y };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current.active) return;
    const d = dragState.current;
    setDrag({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) });
  }
  function onHeaderPointerUp() {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    setDragging(false);
  }
  function resetDrag() { setDrag({ x: 0, y: 0 }); } // double-click header resets

  // ── Preferences persistence on Continue ───────────────────────────────────────
  const persistPrefs = useCallback(async () => {
    const payload = {
      first_name: firstName,
      last_name: lastName,
      market_focus: prefs.market_focus,
      trade_types: prefs.trade_types,
      theme_pref: prefs.theme_pref,
      onboarded_at: new Date().toISOString(),
    };
    if (confirmPending || !effEmail) {
      // No session yet — stash for the provider to apply on first authed mount.
      try {
        const pending: PendingPrefs = { ...payload };
        localStorage.setItem(LS_PENDING_PREFS, JSON.stringify(pending));
      } catch { /* non-fatal */ }
      return;
    }
    // Session exists — write to user_metadata (non-blocking, errors logged not shown).
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ data: payload });
      if (error) console.warn("[onboarding] updateUser failed:", error.message);
    } catch (e) { console.warn("[onboarding] updateUser threw:", e); }
  }, [firstName, lastName, prefs, confirmPending, effEmail]);

  // ── Step transitions ──────────────────────────────────────────────────────────
  function accountConfirmPending() { setConfirmPending(true); setStep(STEP_PREFS); }
  function accountAdvance() { setStep(STEP_PREFS); }
  function prefsContinue() { void persistPrefs(); setStep(STEP_PLAN); }
  function prefsSkip() { setStep(STEP_PLAN); }
  // "Continue with Free" — also from the quiet or-links (Plan + Billing) while a paid
  // card is selected, so the plan itself must flip to free or the done-card would
  // claim a paid tier. Free path jumps STEP_PLAN → STEP_DONE (no Billing step).
  function chooseFree() { setPlan("free"); setTrialActive(false); setTrialEnd(null); setStep(STEP_DONE); }
  // Paid → advance to the in-sheet Billing step (Stripe Elements). No external link.
  function planPaid() { setStep(STEP_BILLING); }
  // Billing outcomes.
  function billingTrialStarted(end: number | null) { setTrialActive(true); setTrialEnd(end); setStep(STEP_DONE); }
  function billingAlreadyActive() { setStep(STEP_DONE); }       // 409 — plan already active, no in-sheet trial
  function billingContinueToDone() { setStep(STEP_DONE); }       // confirm-first blocker escape

  // ── Snapshot for the rail account card ────────────────────────────────────────
  const snap: WizardSnapshot = {
    firstName, lastName, email: effEmail,
    marketFocus: prefs.market_focus,
    plan, period,
    planChosen: step >= STEP_PLAN,
    paid,
    trialActive,
  };

  // confirmPending + paid with NO session: in-sheet billing REQUIRES auth, so the
  // billing step shows an honest blocker instead of Stripe Elements. (Prod has email
  // confirmation OFF today, so this branch is rare.)
  const billingNeedsConfirmFirst = confirmPending && !effEmail;

  if (!mounted) return null;

  const compact = mode === "signin"; // compact single-step variant

  // Header title reflects the current phase.
  const headerTitle = compact ? t("obSigninTitle") : t("obHeaderHint");

  const node = (
    <div className="ob-scrim ob-root" style={props.visible ? undefined : { display: "none" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div
        className="ob-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={headerTitle}
        style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`ob-hd${dragging ? " dragging" : ""}`}
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          onDoubleClick={resetDrag}
        >
          <span className="ob-hd-title">{headerTitle}</span>
          <button className="ob-x" onClick={handleClose} aria-label={t("obClose")}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {compact ? (
          // ── Compact sign-in variant (no wizard, no rail) ──
          <div className="ob-body">
            <div className="ob-pane" ref={paneRef}>
              <div className="ob-pane-scroll">
                <StepAccount
                  mode="signin"
                  firstName={firstName} lastName={lastName} email={email} password={password}
                  plan={plan} period={period} prefs={prefs}
                  set={(patch) => {
                    if (patch.firstName !== undefined) setFirstName(patch.firstName);
                    if (patch.lastName !== undefined) setLastName(patch.lastName);
                    if (patch.email !== undefined) setEmail(patch.email);
                    if (patch.password !== undefined) setPassword(patch.password);
                  }}
                  onModeSwitch={setMode}
                  onConfirmPending={accountConfirmPending}
                  onAdvance={accountAdvance}
                />
              </div>
            </div>
          </div>
        ) : (
          // ── Full wizard ──
          <div className="ob-body">
            <RailCard step={step} snap={snap} />
            <div className="ob-pane" ref={paneRef}>
              <MobileStepper step={step} paid={paid} />
              <div className="ob-pane-scroll">
                {step === STEP_ACCOUNT && (
                  <StepAccount
                    mode="signup"
                    firstName={firstName} lastName={lastName} email={email} password={password}
                    plan={plan} period={period} prefs={prefs}
                    set={(patch) => {
                      if (patch.firstName !== undefined) setFirstName(patch.firstName);
                      if (patch.lastName !== undefined) setLastName(patch.lastName);
                      if (patch.email !== undefined) setEmail(patch.email);
                      if (patch.password !== undefined) setPassword(patch.password);
                    }}
                    onModeSwitch={setMode}
                    onConfirmPending={accountConfirmPending}
                    onAdvance={accountAdvance}
                  />
                )}
                {step === STEP_PREFS && <StepPreferences prefs={prefs} setPrefs={setPrefs} />}
                {step === STEP_PLAN && <StepPlan plan={plan} period={period} setPlan={setPlan} setPeriod={setPeriod} />}
                {step === STEP_BILLING && plan !== "free" && (
                  <StepBilling
                    tier={plan}
                    period={period}
                    onTrialStarted={billingTrialStarted}
                    onAlreadyActive={billingAlreadyActive}
                    onFree={chooseFree}
                    needsConfirmFirst={billingNeedsConfirmFirst}
                    onContinueToDone={billingContinueToDone}
                  />
                )}
                {step === STEP_DONE && (
                  <StepDone firstName={firstName} email={effEmail}
                    confirmPending={confirmPending} trialActive={trialActive}
                    trialEnd={trialEnd} plan={plan} />
                )}
              </div>

              {/* Footer action bar — per step. Billing (4) owns its own action row
                  (submit lives inside Stripe's <Elements>), so no ob-foot here. */}
              {step === STEP_PREFS && (
                <div className="ob-foot">
                  <StepPreferencesFooter onSkip={prefsSkip} onContinue={prefsContinue} />
                </div>
              )}
              {step === STEP_PLAN && (
                <div className="ob-foot">
                  <StepPlanFooter plan={plan} onFree={chooseFree} onPaid={planPaid} />
                </div>
              )}
              {step === STEP_DONE && (
                <div className="ob-foot">
                  <StepDoneFooter onClose={handleClose} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
