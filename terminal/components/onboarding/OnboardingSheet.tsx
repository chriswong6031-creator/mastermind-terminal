"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import type {
  OnboardMode, OnboardingSheetProps, OnboardPrefs, PlanKey, Period, PendingPrefs,
} from "./types";
import { LS_PENDING_PREFS, LS_ONBOARD_RESUME, SS_WIZARD, type OnboardResumeStash } from "./types";
import { PLANS_URL } from "./StepPlan";
import RailCard, { MobileStepper, type WizardSnapshot } from "./RailCard";
import StepAccount from "./StepAccount";
import StepPreferences, { StepPreferencesFooter } from "./StepPreferences";
import StepPlan, { StepPlanFooter } from "./StepPlan";
import StepDone, { StepDoneFooter } from "./StepDone";

const DRAG_MIN_WIDTH = 861; // drag disabled under this viewport width

const emptyPrefs: OnboardPrefs = { market_focus: [], trade_types: [], theme_pref: "dark" };

// Wizard fields that survive a client-tree remount (see SS_WIZARD in types.ts).
// The password is deliberately absent — never persisted anywhere.
interface WizardStash {
  step: number;
  firstName: string;
  lastName: string;
  email: string;
  prefs: OnboardPrefs;
  plan: PlanKey;
  period: Period;
  confirmPending: boolean;
  paidPending: boolean;
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
  const [step, setStep] = useState(stash?.step ?? 1);
  const [firstName, setFirstName] = useState(stash?.firstName ?? "");
  const [lastName, setLastName] = useState(stash?.lastName ?? "");
  const [email, setEmail] = useState(stash?.email ?? props.email);
  const [password, setPassword] = useState("");
  const [prefs, setPrefs] = useState<OnboardPrefs>(stash?.prefs ?? emptyPrefs);
  const [plan, setPlan] = useState<PlanKey>(stash?.plan ?? props.initialPlan ?? "pro");
  const [period, setPeriod] = useState<Period>(stash?.period ?? props.initialPeriod ?? "annual");
  const [confirmPending, setConfirmPending] = useState(stash?.confirmPending ?? false);
  const [paidPending, setPaidPending] = useState(stash?.paidPending ?? false);
  const [drag, setDrag] = useState({ x: 0, y: 0 }); // header-drag translate

  // Persist the live wizard (signup mode only) so a remount resumes in place; the
  // stash is cleared by handleClose once the flow reaches Done.
  useEffect(() => {
    if (mode !== "signup") return;
    try {
      const w: WizardStash = { step, firstName, lastName, email, prefs, plan, period, confirmPending, paidPending };
      sessionStorage.setItem(SS_WIZARD, JSON.stringify(w));
    } catch { /* storage blocked — flow still works, just without remount resilience */ }
  }, [mode, step, firstName, lastName, email, prefs, plan, period, confirmPending, paidPending]);

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
        if (stash.plan === "free" || stash.plan === "insider" || stash.plan === "pro") setPlan(stash.plan);
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
    if (step === 4 || mode === "signin") {
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
  function accountConfirmPending() { setConfirmPending(true); setStep(2); }
  function accountAdvance() { setStep(2); }
  function prefsContinue() { void persistPrefs(); setStep(3); }
  function prefsSkip() { setStep(3); }
  // "Continue with Free" — also from the quiet or-link while a paid card is selected,
  // so the plan itself must flip to free or the done-card would claim a paid tier.
  function planFree() { setPlan("free"); setPaidPending(false); setStep(4); }
  function planPaid() {
    setPaidPending(true);
    window.open(PLANS_URL, "_blank", "noopener,noreferrer");
    setStep(4);
  }

  // ── Snapshot for the rail account card ────────────────────────────────────────
  const snap: WizardSnapshot = {
    firstName, lastName, email: effEmail,
    marketFocus: prefs.market_focus,
    plan, period,
    planChosen: step >= 3,
  };

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
              <MobileStepper step={step} />
              <div className="ob-pane-scroll">
                {step === 1 && (
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
                {step === 2 && <StepPreferences prefs={prefs} setPrefs={setPrefs} />}
                {step === 3 && <StepPlan plan={plan} period={period} setPlan={setPlan} setPeriod={setPeriod} />}
                {step === 4 && (
                  <StepDone firstName={firstName} email={effEmail}
                    confirmPending={confirmPending} paidPending={paidPending} />
                )}
              </div>

              {/* Footer action bar — per step */}
              {step === 2 && (
                <div className="ob-foot">
                  <StepPreferencesFooter onSkip={prefsSkip} onContinue={prefsContinue} />
                </div>
              )}
              {step === 3 && (
                <div className="ob-foot">
                  <StepPlanFooter plan={plan} onFree={planFree} onPaid={planPaid} />
                </div>
              )}
              {step === 4 && (
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
