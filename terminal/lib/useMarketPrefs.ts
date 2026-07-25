"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  readMarketPrefs, serializeMarketPrefs, toggleMarket, setHomeMarket,
  ALL_MARKETS, DEFAULT_PREFS, type MarketId, type MarketPrefs,
} from "@/lib/markets";

// Client-side read/write of the market preference, stored in Supabase `user_metadata` — the SAME
// place the macro site's onboarding writes it, on the SAME Supabase project both properties share.
// That shared store is what makes a change here show up over there without an API of our own.
//
// This is a module-level store rather than per-component state on purpose: the preference is read
// in at least two places at once (the search dialog and the Markets settings pane), and two
// independent useState copies would drift the moment one of them toggled a market — the pane would
// show a market off while search still returned its symbols. One store, many subscribers.
//
// Guests get a localStorage copy so the preference works before signup; on first authed load the
// account wins, because the account is the source of truth and the local key is only a holding pen.

const LS_KEY = "mm.marketPrefs";

let state: MarketPrefs = DEFAULT_PREFS;
let ready = false;
let loadedFor: string | null = null;        // the email whose prefs `state` holds ("" = guest)
const subs = new Set<() => void>();

// useSyncExternalStore compares snapshots by identity, so the snapshot object must be stable
// between notifications or React will loop forever re-rendering.
let snapshot: { prefs: MarketPrefs; ready: boolean } = { prefs: state, ready };
function publish() {
  snapshot = { prefs: state, ready };
  for (const fn of subs) fn();
}
function subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
function getSnapshot() { return snapshot; }
// Server render has no account and no localStorage — hand back the permissive default so the
// first paint never hides a symbol that is in fact enabled.
const SERVER_SNAPSHOT = { prefs: DEFAULT_PREFS, ready: false };
function getServerSnapshot() { return SERVER_SNAPSHOT; }

function readLocal(): MarketPrefs | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return readMarketPrefs({ markets: JSON.parse(raw) });
  } catch { return null; }
}
function writeLocal(p: MarketPrefs) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(serializeMarketPrefs(p).markets)); } catch { /* storage blocked */ }
}

function load(email: string) {
  if (loadedFor === email) return;
  loadedFor = email;
  ready = false;

  if (!email) {
    state = readLocal() ?? { ...DEFAULT_PREFS, enabled: [...ALL_MARKETS] };
    ready = true;
    publish();
    return;
  }

  createClient().auth.getUser()
    .then(({ data }) => {
      if (loadedFor !== email) return;             // a newer load won the race
      // readMarketPrefs migrates the legacy `market_focus` array, so a user who onboarded before
      // `markets` existed gets their signup choice honoured on this very load.
      state = readMarketPrefs(data.user?.user_metadata as never);
      ready = true;
      publish();
    })
    .catch(() => {
      if (loadedFor !== email) return;
      state = { ...DEFAULT_PREFS, enabled: [...ALL_MARKETS] };
      ready = true;
      publish();
    });
}

function persist(next: MarketPrefs, email: string) {
  state = next;
  publish();
  writeLocal(next);
  if (!email) return;
  // Fire-and-forget: a failed write must not block the UI, and the local copy already holds the
  // change, so a reload before the round-trip lands still shows what the user picked.
  createClient().auth.updateUser({ data: serializeMarketPrefs(next) }).catch(() => {});
}

export type MarketPrefsApi = {
  prefs: MarketPrefs;
  /** false until the account (or the local fallback) has answered. Callers must not filter the
   *  universe while this is true, or the first paint would hide enabled symbols. */
  ready: boolean;
  toggle: (m: MarketId) => void;
  setHome: (m: MarketId | null) => void;
  enableAll: () => void;
};

export function useMarketPrefs(email?: string): MarketPrefsApi {
  const who = email || "";
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => { load(who); }, [who]);

  const toggle = useCallback((m: MarketId) => {
    const next = toggleMarket(state, m);
    if (next !== state) persist(next, who);
  }, [who]);

  const setHome = useCallback((m: MarketId | null) => { persist(setHomeMarket(state, m), who); }, [who]);

  // Bulk enable. NOT a loop over toggle(): each toggle derives from the current state, and N calls
  // batched into one tick would each start from the same snapshot, so only the last would survive.
  const enableAll = useCallback(() => {
    persist({ ...state, enabled: [...ALL_MARKETS], autoNarrowed: false }, who);
  }, [who]);

  return { prefs: snap.prefs, ready: snap.ready, toggle, setHome, enableAll };
}

/** Test seam — resets the module store between cases. */
export function __resetMarketPrefsStore() {
  state = DEFAULT_PREFS; ready = false; loadedFor = null; snapshot = { prefs: state, ready };
}
