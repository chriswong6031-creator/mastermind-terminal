"use client";
import { useT } from "@/lib/i18n";
import type { PlanKey, Period } from "./types";
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
}

const STEP_KEYS = ["obStepAccount", "obStepPreferences", "obStepPlan", "obStepDone"] as const;

// Tier hue CSS var per plan key — mirrors onboarding.css tokens.
const HUE: Record<PlanKey, string> = {
  free: "var(--ob-free)",
  insider: "var(--ob-insider)",
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
            {t(snap.plan === "free" ? "obPlanFree" : snap.plan === "insider" ? "obPlanInsider" : "obPlanPro")}
          </span>
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
  return (
    <aside className="ob-rail">
      <div className="ob-brand">
        <b>{t("obBrand")}</b>
        <small>{t("obBrandSub")}</small>
      </div>

      <nav className="ob-steps" aria-label={t("obHeaderHint")}>
        {STEP_KEYS.map((k, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "on" : "";
          return (
            <div key={k} className={`ob-step ${state}`}>
              <span className="ob-step-dot">
                {n < step && <Check cls="ob-step-ck" />}
              </span>
              <span className="ob-step-lbl">{t(k)}</span>
            </div>
          );
        })}
      </nav>

      <AccountCard snap={snap} />
    </aside>
  );
}

/** Mobile top stepper row (rail is hidden under 861px). */
export function MobileStepper({ step }: { step: number }) {
  const t = useT();
  const labelKey = STEP_KEYS[Math.min(step - 1, STEP_KEYS.length - 1)];
  return (
    <div className="ob-mstep" aria-hidden="true">
      {STEP_KEYS.map((k, i) => {
        const n = i + 1;
        const dotState = n < step ? "done" : n === step ? "on" : "";
        return (
          <div key={k} style={{ display: "contents" }}>
            {i > 0 && <span className={`ob-mstep-bar${n <= step ? " done" : ""}`} />}
            <span className={`ob-mstep-dot ${dotState}`} />
          </div>
        );
      })}
      <span className="ob-mstep-lbl">{t(labelKey)}</span>
    </div>
  );
}
