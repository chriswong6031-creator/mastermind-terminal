"use client";
import { useEffect, useState } from "react";

// Client hook: fetch the caller's entitlement (/api/me) once per mount. Signed-in
// only — a guest (no email) returns the free default WITHOUT a network call, so the
// public UI never spends a request establishing "you're free". The proxy also softens
// unauthed to a 200 free default, so a stale cookie degrades gracefully either way.
//
// This is a READ surface for gating labels (SettingsMenu tier line). It is deliberately
// NOT the live-options gate — that is a separate lane.

export type Tier = "free" | "insider" | "pro";
export type EntStatus = "trialing" | "active" | "none" | string;

export interface Entitlement {
  tier: Tier;
  status: EntStatus;
  features: string[];
  loading: boolean;
}

const FREE: Omit<Entitlement, "loading"> = { tier: "free", status: "none", features: [] };

function coerceTier(v: unknown): Tier {
  return v === "insider" || v === "pro" ? v : "free";
}

/** @param email signed-in email ("" = guest → free default, no fetch). */
export function useEntitlement(email: string): Entitlement {
  const signedIn = !!email;
  const [ent, setEnt] = useState<Entitlement>({ ...FREE, loading: signedIn });

  useEffect(() => {
    if (!signedIn) { setEnt({ ...FREE, loading: false }); return; }
    let alive = true;
    setEnt((e) => ({ ...e, loading: true }));
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : FREE))
      .then((d: any) => {
        if (!alive) return;
        setEnt({
          tier: coerceTier(d?.tier),
          status: typeof d?.status === "string" ? d.status : "none",
          features: Array.isArray(d?.features) ? d.features : [],
          loading: false,
        });
      })
      .catch(() => { if (alive) setEnt({ ...FREE, loading: false }); });
    return () => { alive = false; };
  }, [signedIn]);

  return ent;
}
