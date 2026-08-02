"use client";
import { useT } from "@/lib/i18n";
import type { PlanKey, Period } from "./types";
import { STEP_ACCOUNT, STEP_PREFS, STEP_PLAN, STEP_BILLING, STEP_DONE } from "./types";
import { perMonth } from "./plans";

// Shared wizard snapshot the rail (and the account card) read from. Owned by
// OnboardingSheet; passed down read-only.
export interface WizardSnapshot {
  firstName: string;
  lastName: string;
  email: string;
  marketFocus: string[]; // keys: us/cn/hk/ca/global
  plan: PlanKey;
  period: Period;
  planChosen: boolean;   // true once the user has reached/interacted with Step 3
  paid: boolean;         // W2: a paid plan is selected → the Billing step exists
  trialActive: boolean;  // W2: an in-sheet trial has started → account card "trial" chip
}

// The stepper's displayed entries, in order, each carrying the wizard step number it
// maps to. The Billing entry is spliced in (paid only) by stepEntries() below — the
// free path jumps STEP_PLAN → STEP_DONE, so its stepper never shows Billing.
interface StepEntry { key: string; step: number; }

function stepEntries(paid: boolean): StepEntry[] {
  const base: StepEntry[] = [
    { key: "obStepAccount", step: STEP_ACCOUNT },
    { key: "obStepPreferences", step: STEP_PREFS },
    { key: "obStepPlan", step: STEP_PLAN },
  ];
  if (paid) base.push({ key: "obBillStep", step: STEP_BILLING });
  base.push({ key: "obStepDone", step: STEP_DONE });
  return base;
}

// Tier hue CSS var per plan key — mirrors onboarding.css tokens.
const HUE: Record<PlanKey, string> = {
  free: "var(--ob-free)",
  essential: "var(--ob-essential)",
  pro: "var(--ob-pro)",
};

const MKT_LBL: Record<string, string> = {
  us: "obMktUs", cn: "obMktCn", hk: "obMktHk", ca: "obMktCa", global: "obMktGlobal",
};

function Check({ cls }: { cls: string }) {
  return <svg className={cls} viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>;
}

/** The signature account card — assembles as the user progresses. */
export function AccountCard({ snap }: { snap: WizardSnapshot }) {
  const t = useT();
  const fullName = [snap.firstName, snap.lastName].filter(Boolean).join(" ").trim();
  const tiered = snap.planChosen;
  const hue = HUE[snap.plan];
  const price = snap.plan === "free" ? null : perMonth(snap.plan, snap.period);

  return (
    <div
      className={`ob-acct${tiered ? " tiered" : ""}`}
      style={tiered ? ({ ["--ob-accent" as string]: hue } as React.CSSProperties) : undefined}
    >
      <div className={`ob-acct-name${fullName ? "" : " ph"}`}>
        {fullName || t("obAcctNamePlaceholder")}
      </div>
      {snap.email && <div className="ob-acct-email">{snap.email}</div>}

      {snap.marketFocus.length > 0 && (
        <div className="ob-acct-chips">
          {snap.marketFocus.map((m) => (
            <span key={m} className="ob-acct-chip">{t(MKT_LBL[m] ?? m)}</span>
          ))}
        </div>
      )}

      {tiered && (
        <div className="ob-acct-tier">
          <span className="ob-acct-tier-nm" style={{ color: hue }}>
            {t(snap.plan === "free" ? "obPlanFree" : snap.plan === "essential" ? "obPlanInsider" : "obPlanPro")}
          </span>
          {snap.trialActive && snap.plan !== "free" && (
            // Non-directional hue = the tier hue (never --up/--down, which flip in zh).
            <span className="ob-acct-trial" style={{ color: hue, borderColor: hue }}>{t("obTrialChip")}</span>
          )}
          {price != null ? (
            <span className="ob-acct-tier-price">
              ${price}<span className="ob-acct-tier-per">{t("obAcctPerMo")}</span>
            </span>
          ) : (
            <span className="ob-acct-tier-price">{t("obPlanFreePrice")}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Desktop left rail: brand eyebrow, vertical stepper, and the live account card. */
export default function RailCard({ step, snap }: { step: number; snap: WizardSnapshot }) {
  const t = useT();
  // Show the Billing entry only when a paid plan is selected (the free path skips it).
  const entries = stepEntries(snap.paid);
  return (
    <aside className="ob-rail">
      <div className="ob-brand">
        <b>{t("obBrand")}</b>
        <small>{t("obBrandSub")}</small>
      </div>

      <nav className="ob-steps" aria-label={t("obHeaderHint")}>
        {entries.map((e) => {
          const state = e.step < step ? "done" : e.step === step ? "on" : "";
          return (
            <div key={e.key} className={`ob-step ${state}`}>
              <span className="ob-step-dot">
                {e.step < step && <Check cls="ob-step-ck" />}
              </span>
              <span className="ob-step-lbl">{t(e.key)}</span>
            </div>
          );
        })}
      </nav>

      <AccountCard snap={snap} />
    </aside>
  );
}

/** Mobile top stepper row (rail is hidden under 861px). */
export function MobileStepper({ step, paid }: { step: number; paid: boolean }) {
  const t = useT();
  const entries = stepEntries(paid);
  // Current label = the last entry we've reached (step numbers may skip Billing).
  const current = [...entries].reverse().find((e) => e.step <= step) ?? entries[0];
  return (
    <div className="ob-mstep" aria-hidden="true">
      {entries.map((e, i) => {
        const dotState = e.step < step ? "done" : e.step === step ? "on" : "";
        return (
          <div key={e.key} style={{ display: "contents" }}>
            {i > 0 && <span className={`ob-mstep-bar${e.step <= step ? " done" : ""}`} />}
            <span className={`ob-mstep-dot ${dotState}`} />
          </div>
        );
      })}
      <span className="ob-mstep-lbl">{t(current.key)}</span>
    </div>
  );
}
