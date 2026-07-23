"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/BrandMark";

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  // switching modes must clear any stale error / in-flight state from the other form
  function switchMode(m: "signin" | "signup") { setMode(m); setErr(""); setBusy(false); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const supabase = createClient();
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password: pw })
        : await supabase.auth.signUp({ email, password: pw });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    router.push("/terminal");
    router.refresh();
  }

  return (
    <main className="center">
      <form className="authcard" onSubmit={submit}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Link href="/"><BrandMark size={40} /></Link>
        </div>
        <h2>{mode === "signin" ? "Sign in to Mastermind" : "Create your account"}</h2>
        <p className="sub">
          {mode === "signin" ? "Welcome back." : "Free access to charts; Pro unlocks custom + proprietary indicators."}
        </p>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label htmlFor="auth-pw">Password</label>
        <input id="auth-pw" className="field" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
        {err && <div className="err">{err}</div>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} disabled={busy}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <div className="alt">
          {mode === "signin" ? (
            <>New here? <button type="button" className="lnk" onClick={() => switchMode("signup")}>Create an account</button></>
          ) : (
            <>Already have an account? <button type="button" className="lnk" onClick={() => switchMode("signin")}>Sign in</button></>
          )}
        </div>
      </form>
    </main>
  );
}

// Legacy full-page form — rendered ONLY when TERMINAL_REQUIRE_AUTH=1 (a redirect
// to /terminal?signin=1 would loop through the auth guard in that mode). The
// public product's login surface is the onboarding sheet (see page.tsx).
export default function LoginFormLegacy() {
  return (
    <Suspense fallback={<main className="center" />}>
      <LoginForm />
    </Suspense>
  );
}
