"use client";
import { useEffect, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useEntitlement } from "@/lib/useEntitlement";
import { TF_CANONICAL_ORDER } from "@/lib/startTf";
import { useAccountPrefs } from "@/lib/useMarketPrefs";
import { ALL_MARKETS, MARKET_TKEY } from "@/lib/markets";

// Tier label key, with a "· trial" suffix only while status === "trialing".
function tierLabelKey(tier: string, status: string): string {
  const trial = status === "trialing";
  if (tier === "insider") return trial ? "obTierInsiderTrial" : "obTierInsider";
  if (tier === "pro") return trial ? "obTierProTrial" : "obTierPro";
  return "obTierFree";
}

// User-settings popover anchored on the top-right avatar: up/down color scheme + language +
// Terminal settings + sign out.
// The up/down scheme and language auto-initialize from the browser locale (pre-paint script in layout),
// and any manual choice here is remembered — "auto + remember override". Remembering now means
// localStorage AND, for a signed-in user, Supabase user_metadata, so the choice follows the account
// to another device and to the macro dashboard. lib/useMarketPrefs.ts owns both writes.
export default function SettingsMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const { lang, setLang } = useLang();
  const t = useT();
  const onboarding = useOnboarding();
  const signedIn = !!email;
  const ent = useEntitlement(email);
  // Shared module store — the same object SearchModal filters against, so this pane and the
  // search results can never disagree about which markets are on. `terminal` carries the live
  // up/down + startup-timeframe values, so the two mounted SettingsMenus (desktop topbar and
  // mobile drawer) can never show different ones, and an account value applies without a reload.
  const { prefs, terminal, toggle, setStartTf, setUpDown, setLangPref } = useAccountPrefs(email);

  useEffect(() => { if (!open) return; const close = () => setOpen(false); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, [open]);

  // Signed-in only: pull first_name from user_metadata once (the component is handed just `email`).
  // Guarded against unmount so a late resolve never sets state on a torn-down component.
  useEffect(() => {
    if (!signedIn) { setFirstName(""); return; }
    let alive = true;
    createClient().auth.getUser().then(({ data }) => {
      const fn = (data.user?.user_metadata?.first_name as string | undefined) || "";
      if (alive) setFirstName(fn);
    }).catch(() => {});
    return () => { alive = false; };
  }, [signedIn]);

  // Language is two writes: the live UI switch (i18n) and the account record (the macro
  // dashboard's `prefs.lang`, which it applies on its own sign-in).
  const pickLang = (l: "en" | "zh") => { setLang(l); setLangPref(l); };

  const ud = terminal.updown;

  return (
    <div className="pophost" style={{ position: "relative" }}>
      <button className="avatar" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title={t("settings")}>{(email || "U")[0].toUpperCase()}</button>
      {open && (
        <div className="pop show settings-pop" style={{ top: 38, right: 0 }} onClick={(e) => e.stopPropagation()}>
          <div className="set-h"><b>{t("settings")}</b></div>
          <div className="set-grp">{t("updownColors")}</div>
          <div className="set-seg">
            <button className={ud === "west" ? "on" : ""} onClick={() => setUpDown("west")}><i style={{ background: "#26c281" }} />{t("greenUp")}</button>
            <button className={ud === "east" ? "on" : ""} onClick={() => setUpDown("east")}><i style={{ background: "#f0566b" }} />{t("redUp")}</button>
          </div>
          <div className="set-grp">{t("language")}</div>
          <div className="set-seg">
            <button className={lang === "en" ? "on" : ""} onClick={() => pickLang("en")}>EN</button>
            <button className={lang === "zh" ? "on" : ""} onClick={() => pickLang("zh")}>中文</button>
          </div>
          <div className="set-grp">{t("setTerminal")}</div>
          <div className="set-sub">{t("setStartTf")}</div>
          {/* Deliberately does NOT retime the chart that's already open: this names the timeframe
              the Terminal OPENS on, and a live re-time would silently rewrite the active pane of a
              deliberate multi-pane layout (MTF is D/3D/W/1M across four panes). The selected chip
              is the feedback; TerminalShell reads the value at its next mount. */}
          <div className="set-tfg">
            {TF_CANONICAL_ORDER.map((tfi) => (
              <button key={tfi} className={terminal.startTf === tfi ? "on" : ""} aria-pressed={terminal.startTf === tfi} onClick={() => setStartTf(tfi)}>{tfi}</button>
            ))}
          </div>

          {/* ── Markets ──────────────────────────────────────────────────────────────────
              Which markets exist for this user at all. Turning one off removes its symbols
              from search entirely — the operator's requirement that a China-only trader can
              stop seeing US names.

              The HOME MARKET radio that used to sit under this list is gone: ranking now boosts
              every market the user FOLLOWS (user_metadata.market_focus), which is edited in the
              account settings panel, not here. `prefs.home` survives as the derived first-followed
              country — the macro dashboard still reads it — and stays un-hideable so the user can
              never strand themselves with an empty universe. */}
          <div className="set-grp">{t("mktSettingsTitle")}</div>
          <div className="set-note">{t("mktSettingsSub")}</div>
          {prefs.autoNarrowed && <div className="set-note set-note-hint">{t("mktAutoNarrowed")}</div>}
          {ALL_MARKETS.map((m) => {
            const on = prefs.enabled.includes(m);
            const isHome = prefs.home === m;
            return (
              <div
                key={m}
                className={`set-row${on ? " on" : ""}${isHome ? " set-row-home" : ""}`}
                aria-disabled={isHome}
                onClick={() => { if (!isHome) toggle(m); }}
                title={isHome ? t("mktHomeNote") : undefined}
              >
                <span className="cbx"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg></span>
                {t(MARKET_TKEY[m])}
                {isHome && <span className="set-row-tag">{t("mktHome")}</span>}
              </div>
            );
          })}
          <div className="set-sep" />
          {signedIn ? (
            <>
              {firstName && <div className="set-acct-name">{firstName}</div>}
              <div className="set-acct">{email}</div>
              {!ent.loading && (
                // Small muted tier line under the email — inline so no globals.css class is added.
                <div style={{ padding: "0 13px 6px", font: "600 11px/1.2 var(--font-ui)", color: "var(--text-2)" }}>
                  {t(tierLabelKey(ent.tier, ent.status))}
                </div>
              )}
              <form action="/auth/signout" method="post"><button className="menu-row" type="submit"><svg viewBox="0 0 24 24"><path d="M16 17l5-5-5-5M21 12H9M12 19H5V5h7" /></svg>{t("signOut")}</button></form>
            </>
          ) : (
            <>
              <button className="menu-row" onClick={() => { setOpen(false); onboarding.open("signup"); }}><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6" /></svg>{t("obwCreateAccount")}</button>
              <button className="menu-row" onClick={() => { setOpen(false); onboarding.open("signin"); }}><svg viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>{t("obwSignIn")}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
