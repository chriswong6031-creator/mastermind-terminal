"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/BrandMark";

export default function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

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
        <label>Email</label>
        <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label>Password</label>
        <input className="field" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
        {err && <div className="err">{err}</div>}
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} disabled={busy}>
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
        <div className="alt">
          {mode === "signin" ? (
            <>New here? <b onClick={() => setMode("signup")}>Create an account</b></>
          ) : (
            <>Already have an account? <b onClick={() => setMode("signin")}>Sign in</b></>
          )}
        </div>
      </form>
    </main>
  );
}
