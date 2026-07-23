"use client";
import { useT } from "@/lib/i18n";
import type { OnboardPrefs } from "./types";

function Check() {
  return <svg className="ob-chip-ck" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>;
}
function CardCheck() {
  return <span className="ob-card-ck"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></span>;
}

const MARKETS: [string, string][] = [
  ["us", "obMktUs"], ["cn", "obMktCn"], ["hk", "obMktHk"], ["ca", "obMktCa"], ["global", "obMktGlobal"],
];
const THEMES: [OnboardPrefs["theme_pref"], string, string][] = [
  ["light", "obThemeLight", ""], ["dark", "obThemeDark", ""], ["auto", "obThemeAuto", ""],
];
const TRADES: [string, string][] = [
  ["stocks", "obTradeStocks"], ["options", "obTradeOptions"], ["crypto", "obTradeCrypto"],
];

export interface StepPreferencesProps {
  prefs: OnboardPrefs;
  // Functional updater (React setState) — toggles MUST derive from the latest state,
  // not the render snapshot, or rapid taps in one batch drop each other's selections.
  setPrefs: React.Dispatch<React.SetStateAction<OnboardPrefs>>;
}

export default function StepPreferences({ prefs, setPrefs }: StepPreferencesProps) {
  const t = useT();

  function toggleMarket(k: string) {
    setPrefs((p) => ({
      ...p,
      market_focus: p.market_focus.includes(k) ? p.market_focus.filter((x) => x !== k) : [...p.market_focus, k],
    }));
  }
  function toggleTrade(k: string) {
    setPrefs((p) => ({
      ...p,
      trade_types: p.trade_types.includes(k) ? p.trade_types.filter((x) => x !== k) : [...p.trade_types, k],
    }));
  }
  function setTheme(th: OnboardPrefs["theme_pref"]) {
    setPrefs((p) => ({ ...p, theme_pref: th }));
  }

  return (
    <div className="ob-fade">
      <h1 className="ob-h1" data-ob-heading tabIndex={-1}>{t("obPrefsTitle")}</h1>
      <p className="ob-sub">{t("obPrefsSub")}</p>

      <div className="ob-section-lbl">{t("obMarketFocus")}</div>
      <div className="ob-chips" role="group" aria-label={t("obMarketFocus")}>
        {MARKETS.map(([k, lbl]) => {
          const on = prefs.market_focus.includes(k);
          return (
            <button key={k} type="button" className={`ob-chip${on ? " on" : ""}`}
              aria-pressed={on} onClick={() => toggleMarket(k)}>
              {on && <Check />}{t(lbl)}
            </button>
          );
        })}
      </div>

      <div className="ob-section-lbl">{t("obTheme")}</div>
      <div className="ob-cards" role="group" aria-label={t("obTheme")}>
        {THEMES.map(([k, lbl]) => {
          const on = prefs.theme_pref === k;
          return (
            <button key={k} type="button" className={`ob-card${on ? " on" : ""}`}
              aria-pressed={on} onClick={() => setTheme(k)}>
              <span className="ob-card-nm">{t(lbl)}</span>
              <CardCheck />
            </button>
          );
        })}
      </div>
      <p className="ob-caption">{t("obThemeCaption")}</p>

      <div className="ob-section-lbl">{t("obTrade")}</div>
      <div className="ob-chips" role="group" aria-label={t("obTrade")}>
        {TRADES.map(([k, lbl]) => {
          const on = prefs.trade_types.includes(k);
          return (
            <button key={k} type="button" className={`ob-chip${on ? " on" : ""}`}
              aria-pressed={on} onClick={() => toggleTrade(k)}>
              {on && <Check />}{t(lbl)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Footer for Step 2 — rendered by the orchestrator so the action bar stays pinned.
export function StepPreferencesFooter({ onSkip, onContinue }: { onSkip: () => void; onContinue: () => void }) {
  const t = useT();
  return (
    <>
      <button type="button" className="ob-link" onClick={onSkip}>{t("obSkipForNow")}</button>
      <div className="ob-foot-spacer" />
      <button type="button" className="ob-btn" onClick={onContinue}>{t("obContinue")}</button>
    </>
  );
}
