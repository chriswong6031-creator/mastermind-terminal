"use client";
import { useEffect, useState } from "react";
import { useLang, useT } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useEntitlement } from "@/lib/useEntitlement";
import { DEFAULT_START_TF, TF_CANONICAL_ORDER, readStartTf, writeStartTf } from "@/lib/startTf";

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
// and any manual choice here is remembered (localStorage) — "auto + remember override".
export default function SettingsMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [ud, setUd] = useState<"east" | "west">("west");
  const [startTf, setStartTf] = useState<string>(DEFAULT_START_TF);
  const [firstName, setFirstName] = useState("");
  const { lang, setLang } = useLang();
  const t = useT();
  const onboarding = useOnboarding();
  const signedIn = !!email;
  const ent = useEntitlement(email);

  useEffect(() => { const v = document.documentElement.getAttribute("data-updown"); setUd(v === "east" ? "east" : "west"); }, []);
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

  const setUpDown = (v: "east" | "west") => {
    setUd(v);
    try { localStorage.setItem("mm.updown", v); } catch {}
    document.documentElement.setAttribute("data-updown", v);
    window.dispatchEvent(new CustomEvent("mm:updown"));
  };

  // Startup timeframe. Deliberately does NOT retime the chart that's already open: this names the
  // timeframe the Terminal OPENS on, and a live re-time would silently rewrite the active pane of a
  // deliberate multi-pane layout (MTF is D/3D/W/1M across four panes). The selected chip is the
  // feedback; TerminalShell reads the value at its next mount.
  const pickStartTf = (v: string) => { setStartTf(v); writeStartTf(v); };

  return (
    <div className="pophost" style={{ position: "relative" }}>
      {/* startTf is read here rather than in a mount effect: localStorage isn't readable during render
          (hydration), and re-reading on every open keeps the two mounted SettingsMenus — desktop topbar
          and mobile drawer — showing the same value after one of them changes it. */}
      <button className="avatar" onClick={(e) => { e.stopPropagation(); setStartTf(readStartTf()); setOpen((o) => !o); }} title={t("settings")}>{(email || "U")[0].toUpperCase()}</button>
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
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "zh" ? "on" : ""} onClick={() => setLang("zh")}>中文</button>
          </div>
          <div className="set-grp">{t("setTerminal")}</div>
          <div className="set-sub">{t("setStartTf")}</div>
          <div className="set-tfg">
            {TF_CANONICAL_ORDER.map((tfi) => (
              <button key={tfi} className={startTf === tfi ? "on" : ""} aria-pressed={startTf === tfi} onClick={() => pickStartTf(tfi)}>{tfi}</button>
            ))}
          </div>
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
