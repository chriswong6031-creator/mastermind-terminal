"use client";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useAccountPrefs } from "@/lib/useMarketPrefs";
import { persistMetaPrefs } from "@/lib/useMarketPrefs";
import { FOLLOW_IDS, FOLLOW_TKEY, type FollowId } from "@/lib/markets";
import { Group, IconCheck, Msg, Row, SectionHead } from "./icons";
import type { SectionProps } from "./types";

// ── Preferences ──────────────────────────────────────────────────────────────
// Ported from the macro dashboard's desk-prefs + `_renderSDPrefs`. These are the
// two questions signup asks (markets you follow / what you trade), editable ever
// after, plus appearance and language.

const TRADES: [string, string][] = [
  ["stocks", "acsTrStocks"],
  ["options", "acsTrOptions"],
  ["crypto", "acsTrCrypto"],
];

type ThemeChoice = "light" | "auto" | "dark";

function Chip({
  on, label, onClick, groupLabel,
}: { on: boolean; label: string; onClick: () => void; groupLabel?: string }) {
  return (
    <button
      type="button"
      className="acs-pchip"
      aria-pressed={on}
      aria-label={groupLabel ? `${groupLabel}: ${label}` : undefined}
      onClick={onClick}
    >
      <span className="box"><IconCheck /></span>
      {label}
    </button>
  );
}

export default function SectionPreferences({ t, identity, email, user, onClose, onPatchMeta }: SectionProps) {
  const { lang, setLang } = useLang();
  const { prefs, metaPrefs, setFollowed, setLangPref } = useAccountPrefs(identity);

  const [followMsg, setFollowMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tradeMsg, setTradeMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // `trade_types` is a TOP-LEVEL user_metadata array — a safe whole-value replace
  // (unlike the nested `terminal`/`prefs` blobs, which lib/useMarketPrefs merges).
  const metaTrades = Array.isArray(user?.meta?.trade_types)
    ? (user!.meta.trade_types as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  // Derived, not synced: the account answer shows until the user edits, then the
  // local pick wins. (A props→state useEffect here would both lag the first paint
  // and clobber a live edit when the cached user refreshes.)
  const [pendingTrades, setPendingTrades] = useState<string[] | null>(null);
  const trades = pendingTrades ?? metaTrades;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (msgTimer.current) clearTimeout(msgTimer.current);
  }, []);

  function flash(set: (v: { kind: "ok" | "err"; text: string } | null) => void, kind: "ok" | "err", text: string) {
    set({ kind, text });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    if (kind !== "err") msgTimer.current = setTimeout(() => set(null), 2600);
  }

  function toggleFollow(id: FollowId) {
    const next = prefs.followed.includes(id)
      ? prefs.followed.filter((f) => f !== id)
      : [...prefs.followed, id];
    try {
      setFollowed(next);
      flash(setFollowMsg, "ok", email ? t("acsPrefSaved") : t("acsPrefLocal"));
    } catch {
      flash(setFollowMsg, "err", t("acsPrefErr"));
    }
  }

  // Debounced like macro's `_sdSaveDesk` — a burst of chip taps is one write.
  function toggleTrade(id: string) {
    const next = trades.includes(id) ? trades.filter((v) => v !== id) : [...trades, id];
    setPendingTrades(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!email) { flash(setTradeMsg, "ok", t("acsPrefLocal")); return; }
    saveTimer.current = setTimeout(() => {
      createClient().auth.updateUser({ data: { trade_types: next } })
        .then(({ error }) => {
          if (error) { flash(setTradeMsg, "err", t("acsPrefErr")); return; }
          onPatchMeta({ trade_types: next });
          flash(setTradeMsg, "ok", t("acsPrefSaved"));
        })
        .catch(() => flash(setTradeMsg, "err", t("acsPrefErr")));
    }, 500);
  }

  const themeChoice: ThemeChoice = metaPrefs.themeAuto === "1"
    ? "auto"
    : (metaPrefs.theme === "light" ? "light" : "dark");

  function pickTheme(choice: ThemeChoice) {
    // Matches the macro semantics: `auto` records the flag and lets the dashboard
    // compute the theme from local time; an explicit pick records the theme and
    // clears the flag. Nothing is applied to the Terminal — it has no light mode.
    if (choice === "auto") persistMetaPrefs({ themeAuto: "1" });
    else persistMetaPrefs({ theme: choice, themeAuto: "0" });
  }

  function pickLang(l: "en" | "zh") {
    setLang(l);       // live UI switch (writes localStorage + <html data-lang>)
    setLangPref(l);   // and the account record the macro dashboard reads
  }

  return (
    <>
      <SectionHead title={t("acsPrefs")} sub={t("acsPrefsSub")} closeLabel={t("acsClose")} onClose={onClose} />
      <div className="acs-body">
        <Group title={t("acsDeskGroup")}>
          <Row label={t("acsMarkets")} desc={t("acsMarketsNote")}>
            <div className="acs-pchips" role="group" aria-label={t("acsMarkets")}>
              {FOLLOW_IDS.map((id) => (
                <Chip
                  key={id}
                  on={prefs.followed.includes(id)}
                  label={t(FOLLOW_TKEY[id])}
                  groupLabel={t("acsMarkets")}
                  onClick={() => toggleFollow(id)}
                />
              ))}
            </div>
            <Msg text={followMsg?.text || ""} kind={followMsg?.kind || "ok"} />
          </Row>

          <Row label={t("acsTrades")} desc={t("acsTradesNote")}>
            <div className="acs-pchips" role="group" aria-label={t("acsTrades")}>
              {TRADES.map(([id, key]) => (
                <Chip
                  key={id}
                  on={trades.includes(id)}
                  label={t(key)}
                  groupLabel={t("acsTrades")}
                  onClick={() => toggleTrade(id)}
                />
              ))}
            </div>
            <Msg text={tradeMsg?.text || ""} kind={tradeMsg?.kind || "ok"} />
          </Row>
        </Group>

        <Group title={t("acsThemeLang")}>
          <Row
            label={t("acsAppearance")}
            desc={t("acsAppearNote")}
            control={
              <span className="acs-seg" role="group" aria-label={t("acsAppearance")}>
                {(["light", "auto", "dark"] as ThemeChoice[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`acs-seg-b${themeChoice === c ? " active" : ""}`}
                    aria-pressed={themeChoice === c}
                    onClick={() => pickTheme(c)}
                  >
                    {t(c === "light" ? "acsThemeLight" : c === "auto" ? "acsThemeAuto" : "acsThemeDark")}
                  </button>
                ))}
              </span>
            }
          />
          <Row
            label={t("language")}
            desc={t("acsLangNote")}
            control={
              <span className="acs-seg" role="group" aria-label={t("language")}>
                <button
                  type="button"
                  className={`acs-seg-b${lang === "en" ? " active" : ""}`}
                  aria-pressed={lang === "en"}
                  onClick={() => pickLang("en")}
                >EN</button>
                <button
                  type="button"
                  className={`acs-seg-b${lang === "zh" ? " active" : ""}`}
                  aria-pressed={lang === "zh"}
                  onClick={() => pickLang("zh")}
                >中文</button>
              </span>
            }
          />
        </Group>
      </div>
    </>
  );
}
