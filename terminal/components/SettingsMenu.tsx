"use client";
import { useEffect, useState } from "react";
import { useLang, useT } from "@/lib/i18n";

// User-settings popover anchored on the top-right avatar: up/down color scheme + language + sign out.
// The up/down scheme and language auto-initialize from the browser locale (pre-paint script in layout),
// and any manual choice here is remembered (localStorage) — "auto + remember override".
export default function SettingsMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [ud, setUd] = useState<"east" | "west">("west");
  const { lang, setLang } = useLang();
  const t = useT();

  useEffect(() => { const v = document.documentElement.getAttribute("data-updown"); setUd(v === "east" ? "east" : "west"); }, []);
  useEffect(() => { if (!open) return; const close = () => setOpen(false); window.addEventListener("click", close); return () => window.removeEventListener("click", close); }, [open]);

  const setUpDown = (v: "east" | "west") => {
    setUd(v);
    try { localStorage.setItem("mm.updown", v); } catch {}
    document.documentElement.setAttribute("data-updown", v);
    window.dispatchEvent(new CustomEvent("mm:updown"));
  };

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
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "zh" ? "on" : ""} onClick={() => setLang("zh")}>中文</button>
          </div>
          <div className="set-sep" />
          <div className="set-acct">{email}</div>
          <form action="/auth/signout" method="post"><button className="menu-row" type="submit"><svg viewBox="0 0 24 24"><path d="M16 17l5-5-5-5M21 12H9M12 19H5V5h7" /></svg>{t("signOut")}</button></form>
        </div>
      )}
    </div>
  );
}
