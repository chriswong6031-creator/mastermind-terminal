"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";

// Lightweight in-modal auth sheet (Part E). Lifts the sign-in/sign-up logic from
// app/login/page.tsx but with ZERO redirect: on success we router.refresh() so the
// server component re-runs and delivers the user's real props into TerminalShell,
// while the modal stays open. The sheet closes itself once the fresh props land
// (the parent unmounts it when `email` transitions from "" to a real address).
//
// Two traps handled explicitly:
//  • signUp with email-confirmation ON returns data.session === null — we detect
//    that and show an honest "check your email" state rather than faking success.
//  • signUp that DOES return a session behaves like a successful sign-in.
export default function AuthSheet({
  initialMode, onClose,
}: {
  initialMode: "signin" | "signup";
  onClose: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false); // TRAP 2 — email-confirm pending
  const emailRef = useRef<HTMLInputElement>(null);

  // (No initialMode→mode sync effect: the parent re-keys AuthSheet on mode change, so a fresh
  //  mount carries the right initial mode. In-sheet toggling uses switchMode.)
  useEffect(() => { const id = setTimeout(() => emailRef.current?.focus(), 60); return () => clearTimeout(id); }, []);

  function switchMode(m: "signin" | "signup") { setMode(m); setErr(""); setBusy(false); setConfirmSent(false); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setConfirmSent(false);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) { setErr(error.message); setBusy(false); return; }
      // success → re-run the server component; parent closes the sheet when new props arrive.
      router.refresh();
      return; // keep busy state until unmount
    }
    // signup
    const { data, error } = await supabase.auth.signUp({ email, password: pw });
    if (error) { setErr(error.message); setBusy(false); return; }
    if (data.session == null) {
      // TRAP 2: confirmation required, no session issued — be honest.
      setConfirmSent(true); setBusy(false); return;
    }
    // session issued (confirmation OFF) — proceed like a sign-in.
    router.refresh();
  }

  const title = mode === "signin" ? t("authSigninTitle") : t("authSignupTitle");

  return (
    <div className="auth-sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auth-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="auth-sheet-hd">
          <span className="auth-sheet-title">{title}</span>
          <button className="auth-sheet-x" onClick={onClose} aria-label={t("cancelListName")}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {confirmSent ? (
          <div className="auth-confirm">
            <svg viewBox="0 0 24 24" className="auth-confirm-ic"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
            <p>{t("authCheckEmail")}</p>
            <button className="auth-sub" onClick={() => switchMode("signin")}>{t("authSubmitSignin")}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="as-email">{t("authEmail")}</label>
            <input id="as-email" ref={emailRef} className="auth-field" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <label htmlFor="as-pw">{t("authPassword")}</label>
            <input id="as-pw" className="auth-field" type="password" required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
            {err && <div className="auth-err">{err}</div>}
            <button className="auth-sub" type="submit" disabled={busy}>
              {busy ? t("authBusy") : mode === "signup" ? t("authSubmitSignup") : t("authSubmitSignin")}
            </button>
            <button type="button" className="auth-alt" onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}>
              {mode === "signup" ? t("authToSignin") : t("authToSignup")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
