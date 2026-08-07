"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyLang } from "@/lib/i18n";
import { readStartTf, writeStartTf } from "@/lib/startTf";
import {
  readMarketPrefs, serializeMarketPrefs, toggleMarket, setFollowedMarkets,
  ALL_MARKETS, DEFAULT_PREFS, type FollowId, type MarketId, type MarketPrefs,
} from "@/lib/markets";
import {
  applyUpDown, isStartTf, metaObject, readLang, readMetaPrefs, readTerminalMeta, readUpDown,
  DEFAULT_TERMINAL_PREFS, type LangId, type MetaPrefs, type TerminalPrefs, type UpDown,
} from "@/lib/accountPrefs";

// Client-side read/write of EVERY account preference, stored in Supabase `user_metadata` — the
// SAME place the macro site's onboarding and settings modal write, on the SAME Supabase project
// both properties share. That shared store is what makes a change here show up over there
// without an API of our own. The field contract:
//
//   market_focus : FollowId[]                      — "markets you follow" (macro owns the UI too)
//   markets      : { home, enabled, autoNarrowed }  — search visibility (Terminal owns the UI)
//   terminal     : { start_tf, updown }             — Terminal chart prefs (Terminal only)
//   prefs        : { theme, themeAuto, lang }       — macro's theme/language sync blob
//
// ONE `auth.getUser()` hydrates all four. Adding a second read for a second field would double
// the auth round-trip on every page load, and the two answers could disagree mid-flight.
//
// This is a module-level store rather than per-component state on purpose: the preference is read
// in at least two places at once (the search dialog and the settings pane), and two independent
// useState copies would drift the moment one of them toggled a market — the pane would show a
// market off while search still returned its symbols. One store, many subscribers.
//
// Guests get a localStorage copy so everything works before signup; on first authed load the
// account wins, because the account is the source of truth and the local keys are a holding pen.

const LS_KEY = "mm.marketPrefs";

let state: MarketPrefs = DEFAULT_PREFS;
let terminal: TerminalPrefs = DEFAULT_TERMINAL_PREFS;
let metaPrefs: MetaPrefs = {};
// Last-known raw blobs, kept verbatim so a write can spread them. `auth.updateUser` merges
// TOP-LEVEL keys but REPLACES a nested object wholesale, so writing `{ terminal: { updown } }`
// would delete `terminal.start_tf`. Every write goes through the spread of these.
let rawTerminal: Record<string, unknown> = {};
let rawPrefs: Record<string, unknown> = {};
// Edits made while the auth read is still in flight. They cannot be pushed yet — the merge base
// is not loaded, so a push now would write `{ terminal: { start_tf } }` over an account that also
// held `updown` and silently delete it. Held here, folded into the loaded blob, then flushed.
let pendingTerminal: Record<string, unknown> | null = null;
let pendingPrefs: Record<string, unknown> | null = null;
let ready = false;
let loadedFor: string | null = null;        // the email whose prefs the store holds ("" = guest)
const subs = new Set<() => void>();

/** The value every subscriber sees. Stable by identity between changes — useSyncExternalStore
 *  compares snapshots by identity, so a fresh object per read would re-render forever. */
export type AccountPrefsSnapshot = {
  /** Markets: followed (boosted), enabled (visible), home (derived, macro-compat). */
  prefs: MarketPrefs;
  /** Effective local chart prefs — what the Terminal is actually doing right now. */
  terminal: TerminalPrefs;
  /** The macro `prefs` blob (theme / themeAuto / lang), sanitized. */
  metaPrefs: MetaPrefs;
  /** false until the account (or the local fallback) has answered. Callers must not filter the
   *  universe while this is false, or the first paint would hide enabled symbols. */
  ready: boolean;
};

let snapshot: AccountPrefsSnapshot = { prefs: state, terminal, metaPrefs, ready };
function publish() {
  snapshot = { prefs: state, terminal, metaPrefs, ready };
  for (const fn of subs) fn();
}
function subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
function getSnapshot() { return snapshot; }
// Server render has no account, no localStorage and no <html> attributes — hand back the
// permissive defaults so the first paint never hides a symbol that is in fact enabled, and never
// disagrees with what the pre-paint script is about to put on the document.
const SERVER_SNAPSHOT: AccountPrefsSnapshot = {
  prefs: DEFAULT_PREFS, terminal: DEFAULT_TERMINAL_PREFS, metaPrefs: {}, ready: false,
};
function getServerSnapshot() { return SERVER_SNAPSHOT; }

// ── local (guest) persistence ────────────────────────────────────────────────────────────
// One blob: the `markets` object plus the follow list, so a guest keeps both halves. Read back
// through readMarketPrefs, which is the same sanitizer the account path uses.

function readLocal(): MarketPrefs | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return readMarketPrefs({ markets: parsed, market_focus: parsed?.followed });
  } catch { return null; }
}
function writeLocal(p: MarketPrefs) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...serializeMarketPrefs(p).markets, followed: p.followed }));
  } catch { /* storage blocked */ }
}

/** The chart prefs as they currently stand locally (post pre-paint script, post any account
 *  value we just applied). */
function localTerminal(): TerminalPrefs {
  return { startTf: readStartTf(), updown: readUpDown() };
}

function load(email: string) {
  if (loadedFor === email) return;
  loadedFor = email;
  ready = false;

  if (!email) {
    state = readLocal() ?? { ...DEFAULT_PREFS, enabled: [...ALL_MARKETS] };
    terminal = localTerminal();
    metaPrefs = {};
    rawTerminal = {};
    rawPrefs = {};
    pendingTerminal = null;
    pendingPrefs = null;
    ready = true;
    publish();
    return;
  }

  createClient().auth.getUser()
    .then(({ data }) => {
      if (loadedFor !== email) return;             // a newer load won the race
      const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
      // readMarketPrefs migrates the legacy `market_focus`-only shape, so a user who onboarded
      // before `markets` existed gets their signup choice honoured on this very load.
      state = readMarketPrefs(meta as never);
      // An edit the user made while this read was in flight is NEWER than what came back, so it
      // layers on top — and only now, with the account's own keys underneath it, is it safe to
      // push. Nothing was lost by waiting: the local half already applied when they clicked.
      rawTerminal = { ...metaObject(meta, "terminal"), ...(pendingTerminal || {}) };
      rawPrefs = { ...metaObject(meta, "prefs"), ...(pendingPrefs || {}) };
      if (pendingTerminal) { pushMeta({ terminal: rawTerminal }, email); pendingTerminal = null; }
      if (pendingPrefs) { pushMeta({ prefs: rawPrefs }, email); pendingPrefs = null; }

      // Apply the account's chart prefs to this device. The account wins over the local copy:
      // that is the entire point of syncing them, and the local copy is only ever a cache of the
      // last device the user touched.
      const tm = readTerminalMeta(rawTerminal);
      if (tm.start_tf) writeStartTf(tm.start_tf);
      if (tm.updown && tm.updown !== readUpDown()) applyUpDown(tm.updown);

      metaPrefs = readMetaPrefs(rawPrefs);
      // Language is the macro dashboard's field; applying it here is what makes a language picked
      // over there arrive here. Only when it actually differs — applyLang dispatches an event
      // every mounted LangProvider listens to, and a no-op re-render on every load is waste.
      if (metaPrefs.lang && metaPrefs.lang !== readLang()) applyLang(metaPrefs.lang);

      terminal = localTerminal();
      ready = true;
      publish();
    })
    .catch(() => {
      if (loadedFor !== email) return;
      state = { ...DEFAULT_PREFS, enabled: [...ALL_MARKETS] };
      terminal = localTerminal();
      metaPrefs = {};
      rawTerminal = {};
      rawPrefs = {};
      // The held edits are dropped, not flushed: we never learned what they were merging into, so
      // pushing them now is exactly the sibling-deleting write the hold exists to prevent. They
      // already applied locally, and the next deliberate edit re-sends them.
      pendingTerminal = null;
      pendingPrefs = null;
      ready = true;
      publish();
    });
}

// ── writes ───────────────────────────────────────────────────────────────────────────────
// Every write is optimistic + fire-and-forget: a failed round-trip must not block the UI, and the
// local copy already holds the change, so a reload before it lands still shows what the user
// picked. A guest takes the same paths minus the network call.

/** "" when signed out or not yet loaded. A helper called before the first load treats the user as
 *  a guest, which is the safe direction — it writes locally and skips the network. */
function authedEmail(): string { return loadedFor || ""; }

function pushMeta(data: Record<string, unknown>, email = authedEmail()) {
  if (!email) return;
  createClient().auth.updateUser({ data }).catch(() => {});
}

/**
 * Merge a patch into one of the two nested blobs and push the WHOLE blob — `updateUser` replaces
 * a nested object rather than merging into it, so the push must carry every sibling key.
 *
 * Before the account has answered we have no merge base, so the patch is held instead of pushed;
 * load() folds it in and flushes it. Guests stop at the authed check — local only.
 */
function mergeBlob(key: "terminal" | "prefs", patch: Record<string, unknown>) {
  if (key === "terminal") rawTerminal = { ...rawTerminal, ...patch };
  else rawPrefs = { ...rawPrefs, ...patch };
  if (!authedEmail()) return;
  if (!ready) {
    if (key === "terminal") pendingTerminal = { ...(pendingTerminal || {}), ...patch };
    else pendingPrefs = { ...(pendingPrefs || {}), ...patch };
    return;
  }
  pushMeta({ [key]: key === "terminal" ? rawTerminal : rawPrefs });
}

/**
 * Commit a market-prefs change. `withFollows` also writes `market_focus` and the re-derived
 * `markets.home` — the two halves of the shared contract that a follow edit owns. A visibility
 * edit (toggle / enableAll) writes only `markets`, never the follow list.
 */
function persistMarkets(next: MarketPrefs, email: string, withFollows: boolean) {
  state = next;
  publish();
  writeLocal(next);
  pushMeta(withFollows
    ? { market_focus: next.followed, ...serializeMarketPrefs(next) }
    : serializeMarketPrefs(next), email);
}

/** Startup timeframe: remember it locally and on the account. Deliberately does NOT retime an
 *  open chart — this names the timeframe the Terminal OPENS on (TerminalShell reads it at mount). */
export function persistStartTf(tf: string) {
  if (!isStartTf(tf)) return;
  writeStartTf(tf);
  terminal = { ...terminal, startTf: tf };
  publish();
  mergeBlob("terminal", { start_tf: tf });
}

/** Up/down color convention: apply it to the live document AND remember it on the account. */
export function persistUpDown(v: UpDown) {
  applyUpDown(v);
  terminal = { ...terminal, updown: v };
  publish();
  mergeBlob("terminal", { updown: v });
}

/**
 * Merge a patch into the macro `prefs` blob (theme / themeAuto / lang). Records the preference
 * only — it applies nothing to the UI, because each of those has its own local applier that the
 * caller already owns (i18n's setLang, the theme toggle).
 */
export function persistMetaPrefs(patch: MetaPrefs) {
  mergeBlob("prefs", patch as Record<string, unknown>);
  metaPrefs = readMetaPrefs(rawPrefs);
  publish();
}

/** Record the account language. Call i18n's `setLang` (or `applyLang`) separately to switch the UI. */
export function persistLang(lang: LangId) { persistMetaPrefs({ lang }); }

// ── hooks ────────────────────────────────────────────────────────────────────────────────

export type AccountPrefsApi = AccountPrefsSnapshot & {
  /** Toggle one market's visibility. Refuses to hide the derived home or to empty the set. */
  toggle: (m: MarketId) => void;
  /** Un-narrow: every market visible again. */
  enableAll: () => void;
  /** Replace the followed list (`market_focus`). Home is re-derived; `enabled` is left alone. */
  setFollowed: (next: readonly FollowId[]) => void;
  setStartTf: (tf: string) => void;
  setUpDown: (v: UpDown) => void;
  /** Records the account language ONLY — pair it with i18n's setLang to switch the live UI. */
  setLangPref: (l: LangId) => void;
};

export function useAccountPrefs(email?: string): AccountPrefsApi {
  const who = email || "";
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => { load(who); }, [who]);

  const toggle = useCallback((m: MarketId) => {
    const next = toggleMarket(state, m);
    if (next !== state) persistMarkets(next, who, false);
  }, [who]);

  // Bulk enable. NOT a loop over toggle(): each toggle derives from the current state, and N calls
  // batched into one tick would each start from the same snapshot, so only the last would survive.
  const enableAll = useCallback(() => {
    persistMarkets({ ...state, enabled: [...ALL_MARKETS], autoNarrowed: false }, who, false);
  }, [who]);

  const setFollowed = useCallback((next: readonly FollowId[]) => {
    persistMarkets(setFollowedMarkets(state, next), who, true);
  }, [who]);

  return {
    prefs: snap.prefs, terminal: snap.terminal, metaPrefs: snap.metaPrefs, ready: snap.ready,
    toggle, enableAll, setFollowed,
    setStartTf: persistStartTf, setUpDown: persistUpDown, setLangPref: persistLang,
  };
}

/** Market-prefs alias kept for the callers that only care about the markets half. */
export const useMarketPrefs = useAccountPrefs;
export type MarketPrefsApi = AccountPrefsApi;

/** Test seam — resets the module store between cases. */
export function __resetMarketPrefsStore() {
  state = DEFAULT_PREFS;
  terminal = DEFAULT_TERMINAL_PREFS;
  metaPrefs = {};
  rawTerminal = {};
  rawPrefs = {};
  pendingTerminal = null;
  pendingPrefs = null;
  ready = false;
  loadedFor = null;
  snapshot = { prefs: state, terminal, metaPrefs, ready };
}
