"use client";
import { useT } from "@/lib/i18n";
import type { PlanKey, Period } from "./types";
import {
  PLANS, perMonth, monthlyPrice, annualBilled, bestSavePct, proWedgePerMonth,
} from "./plans";

const PRICING_URL = "https://www.mastermind-x.com/#pricing";

const HUE: Record<PlanKey, string> = {
  free: "var(--ob-free)", insider: "var(--ob-insider)", pro: "var(--ob-pro)",
};
const NAME_KEY: Record<PlanKey, string> = {
  free: "obPlanFree", insider: "obPlanInsider", pro: "obPlanPro",
};

function SCk() { return <svg className="ob-sck" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>; }
function RadioCk() { return <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>; }

export interface StepPlanProps {
  plan: PlanKey;
  period: Period;
  setPlan: (p: PlanKey) => void;
  setPeriod: (p: Period) => void;
}

// A summary list row.
function Row({ children, miss, chip }: { children: React.ReactNode; miss?: boolean; chip?: React.ReactNode }) {
  return (
    <li className={`ob-sitem${miss ? " miss" : ""}`}>
      <SCk />
      <span style={{ flex: 1 }}>{children}</span>
      {chip}
    </li>
  );
}

export default function StepPlan({ plan, period, setPlan, setPeriod }: StepPlanProps) {
  const t = useT();
  const annual = period === "annual";

  function priceBlock(key: Exclude<PlanKey, "free">) {
    const now = perMonth(key, period);
    const was = monthlyPrice(key);
    return (
      <div className="ob-plan-price">
        <b>${now}</b>
        {annual && <span className="ob-plan-was">${was}</span>}
        <span className="ob-plan-per">{t("obAcctPerMo")}</span>
      </div>
    );
  }

  return (
    <div className="ob-fade">
      <h1 className="ob-h1" data-ob-heading tabIndex={-1}>{t("obPlanTitle")}</h1>
      <p className="ob-sub">{t("obPlanSub")}</p>

      {/* Period toggle */}
      <div className="ob-period" role="group" aria-label={t("obPeriodAnnual") + " / " + t("obPeriodMonthly")}>
        <button type="button" className={`ob-period-btn${annual ? " on" : ""}`}
          aria-pressed={annual} onClick={() => setPeriod("annual")}>
          {t("obPeriodAnnual")}
          <span className="ob-save-badge">{t("obSaveBadge").replace("{n}", String(bestSavePct()))}</span>
        </button>
        <button type="button" className={`ob-period-btn${!annual ? " on" : ""}`}
          aria-pressed={!annual} onClick={() => setPeriod("monthly")}>
          {t("obPeriodMonthly")}
        </button>
      </div>

      {/* Plan cards */}
      <div className="ob-plans">
        {PLANS.map(({ key }) => {
          const on = plan === key;
          const hue = HUE[key];
          const isPro = key === "pro";
          return (
            <button key={key} type="button"
              className={`ob-plan${on ? " on" : ""}`}
              aria-pressed={on}
              style={{ ["--ob-hue" as string]: hue } as React.CSSProperties}
              onClick={() => setPlan(key)}>
              {isPro && <span className="ob-plan-badge">{t("obMostPopular")}</span>}
              <div className="ob-plan-hd">
                <span className="ob-plan-nm">{t(NAME_KEY[key])}</span>
                <span className="ob-plan-radio"><RadioCk /></span>
              </div>
              {key === "free" ? (
                <div className="ob-plan-price"><b>$0</b><span className="ob-plan-per">{t("obPlanFreePrice")}</span></div>
              ) : priceBlock(key)}
              {key !== "free" && annual && (
                <div className="ob-plan-fine">
                  {t("obBilledAnnually").replace("{total}", String(annualBilled(key)))}
                </div>
              )}
              {key !== "free" && !annual && (
                <div className="ob-plan-fine">{t("obBilledMonthly")}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary panel — repaints per selected tier (content fade via key) */}
      <div className="ob-summary ob-fade" key={plan}>
        {plan === "free" && (
          <>
            <div className="ob-slists">
              <div>
                <div className="ob-slist-lbl">{t("obWhatYouGet")}</div>
                <ul className="ob-slist">
                  <Row>{t("obFreeGet1")}</Row>
                  <Row>{t("obFreeGet2")}</Row>
                  <Row>{t("obFreeGet3")}</Row>
                  <Row>{t("obFreeGet4")}</Row>
                </ul>
              </div>
              <div>
                <div className="ob-slist-lbl miss">{t("obWhatYouMiss")}</div>
                <ul className="ob-slist">
                  <Row miss chip={<span className="ob-mini-chip insider">{t("obPlanInsider")}</span>}>{t("obFreeMiss1")}</Row>
                  <Row miss chip={<span className="ob-mini-chip insider">{t("obPlanInsider")}</span>}>{t("obFreeMiss2")}</Row>
                  <Row miss chip={<span className="ob-mini-chip insider">{t("obPlanInsider")}</span>}>{t("obFreeMiss3")}</Row>
                  <Row miss chip={<span className="ob-mini-chip pro">{t("obPlanPro")}</span>}>{t("obFreeMiss4")}</Row>
                </ul>
              </div>
            </div>
          </>
        )}

        {plan === "insider" && (
          <>
            <div className="ob-summary-hd">{t("obInsiderHd")}</div>
            <ul className="ob-slist">
              <Row>{t("obInsider1")}</Row>
              <Row>{t("obInsider2")}</Row>
              <Row>{t("obInsider3")}</Row>
              <Row>{t("obInsider4")}</Row>
              <Row>{t("obInsider5")}</Row>
              <Row>{t("obInsider6")}</Row>
            </ul>
            {annual && (
              <div className="ob-wedge">
                <span className="ob-wedge-txt">
                  {t("obWedge").replace("{n}", String(proWedgePerMonth()))}
                </span>
                <button type="button" className="ob-wedge-btn" onClick={() => setPlan("pro")}>
                  {t("obWedgeBtn")}
                </button>
              </div>
            )}
          </>
        )}

        {plan === "pro" && (
          <>
            <div className="ob-summary-hd">{t("obProHd")}</div>
            <ul className="ob-slist">
              <Row>{t("obPro1")}</Row>
              <Row>
                {t("obPro2")}
                <div className="ob-fine-note">{t("obProResearchFine")}</div>
              </Row>
              <Row>{t("obPro3")}</Row>
              <Row chip={<span className="ob-mini-chip soon">{t("obComingSoon")}</span>}>{t("obPro4")}</Row>
            </ul>
          </>
        )}

        <div className="ob-compare">
          <a className="ob-link brand" href={PRICING_URL} target="_blank" rel="noopener noreferrer">
            {t("obCompare")}
          </a>
        </div>
      </div>
    </div>
  );
}
// Footer for Step 3 — CTAs depend on the selected tier. Paid now advances to the
// in-sheet Billing step (no external-link glyph) instead of opening plans.html.
export function StepPlanFooter(
  { plan, onFree, onPaid }: { plan: PlanKey; onFree: () => void; onPaid: () => void },
) {
  const t = useT();
  if (plan === "free") {
    return (
      <>
        <div className="ob-foot-spacer" />
        <button type="button" className="ob-btn" onClick={onFree}>{t("obContinueFree")}</button>
      </>
    );
  }
  return (
    <>
      <button type="button" className="ob-link" onClick={onFree}>{t("obOrFree")}</button>
      <div className="ob-foot-spacer" />
      <button type="button" className="ob-btn" onClick={onPaid}>
        {t("obContinueBilling")}
      </button>
    </>
  );
}
