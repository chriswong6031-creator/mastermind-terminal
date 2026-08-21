"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyLang } from "@/lib/i18n";
import { readStartTf, writeStartTf } from "@/lib/startTf";
import {
  GUEST_IDENTITY, GUEST_OWNER, identityOwnerKey, isAccountOwner, ownerUserId,
  type AccountIdentity,
} from "@/lib/accountIdentity";
import { adoptLegacySlotIntoGuest, browserStorage, readOwnerSlot, writeOwnerSlot } from "@/lib/ownerStorage";
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
// ── The owner boundary (E1) ───────────────────────────────────────────────────────────────
//
// A module-level store outlives the sign-in it was loaded for, so "who does this state belong
// to" has to be an explicit, immutable answer rather than an implicit one. It is the OWNER KEY
// from lib/accountIdentity.ts — `guest` or `account:<auth uuid>` — never the email. An address
// is mutable and reassignable: keyed on it, changing your email silently forks your preferences
// into a second owner, and inheriting a released address inherits its preferences.
//
// The invariant this file must satisfy, stated so a test can falsify it:
//
//   At the instant owner identity changes, no outgoing-owner ACCOUNT state may still be
//   renderable or writable under the incoming owner.
//
// which is enforced by a strict sequence — see `load()`:
//
//   1. detect the owner-generation change SYNCHRONOUSLY;
//   2. invalidate every outgoing-owner write (the generation guard on `pushMeta`);
//   3. publish the incoming owner's not-ready snapshot IMMEDIATELY — an owner change that only
//      set `ready = false` without publishing left subscribers rendering the OUTGOING owner's
//      last `ready: true` snapshot for the whole duration of the incoming account's request;
//   4. load only the incoming owner's durable (account) or local (guest) slot;
//   5. ignore any late answer tagged with the old generation;
//   6. publish incoming authority only after its owner token still matches.
//
// ── Durable owner vs effective device cache ───────────────────────────────────────────────
//
// Not everything here is account state, and namespacing the device caches would be wrong:
//
//   * `terminal.start_tf` / `terminal.updown` and the macro `prefs` blob are DURABLE ACCOUNT
//     preferences. Their owner is the uuid; they reset on an owner change and are re-read from
//     the incoming account.
//   * `mm.startTf` / `mm.updown` / `mm.lang` (and `<html data-updown|data-lang>`) are EFFECTIVE
//     DEVICE CACHES: what this browser is doing right now, reconciled pre-paint before any of
//     this runs. They are not reset by an owner change — a browser does not forget its rendering
//     convention because a session ended — and they are never written INTO an account. The flow
//     is one-way, account → device, and only on a load that answered.
//   * `mm.marketPrefs` was neither: an UNSCOPED slot that a signed-in account wrote to and any
//     later owner read back. It is now an owner-scoped envelope (`mm.marketPrefs.v2`), and the
//     legacy unscoped payload is adopted ONCE into GUEST — never into "the first account that
//     signs in", which is exactly the ownership bug.

/** Pre-boundary, unscoped. Read once by the guest sweep, then removed. */
const LS_KEY_LEGACY = "mm.marketPrefs";
/** Owner-scoped envelope: `{ "<owner>": <market prefs payload> }`. */
const LS_KEY = "mm.marketPrefs.v2";
/** Set once the legacy sweep has run, so a later guest edit is never re-overwritten by it. */
const LS_LEGACY_RECEIPT = "mm.marketPrefs.legacy.v1";

let state: MarketPrefs = DEFAULT_PREFS;
let terminal: TerminalPrefs = DEFAULT_TERMINAL_PREFS;
let metaPrefs: MetaPrefs = {};
// Last-known raw blobs, kept verbatim so a write can spread them. `auth.updateUser` merges
// TOP-LEVEL keys but REPLACES a nested object wholesale, so writing `{ terminal: { updown } }`
// would delete `terminal.start_tf`. Every write goes through the spread of these.
let rawTerminal: Record<string, unknown> = {};
let rawPrefs: Record<string, unknown> = {};
// Edits made before a usable merge base exists — while the auth read is in flight, or after one
// that FAILED. They cannot be pushed yet: a push now would write `{ terminal: { start_tf } }`
// over an account that also held `updown` and silently delete it. Held here until a load that
// actually answered folds them in.
let pendingTerminal: Record<string, unknown> | null = null;
let pendingPrefs: Record<string, unknown> | null = null;
let ready = false;
// `ready` says "the UI may render and filter". `baseLoaded` says something stricter and
// separate: "we know what this account's nested blobs contain, so a merge-and-push is safe".
// They diverge on a FAILED account read, where the UI must stop showing a skeleton but a write
// must NOT go out — with an empty merge base it would delete every sibling key on the account.
let baseLoaded = false;
/** The owner the store currently holds (`guest` | `account:<uuid>`). Never an email. */
let owner: string = GUEST_OWNER;
/** null = nothing loaded yet. Otherwise the owner key `load()` last accepted. */
let loadedFor: string | null = null;
/** Bumped on every owner change. Every async continuation and every write is tagged with it. */
let generation = 0;
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
  /** The owner this snapshot belongs to — `guest` or `account:<uuid>`. Exposed so a consumer
   *  can prove which identity it is rendering rather than inferring it from an email prop. */
  owner: string;
};

let snapshot: AccountPrefsSnapshot = { prefs: state, terminal, metaPrefs, ready, owner };
function publish() {
  snapshot = { prefs: state, terminal, metaPrefs, ready, owner };
  for (const fn of subs) fn();
}
function subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }
function getSnapshot() { return snapshot; }
// Server render has no account, no localStorage and no <html> attributes — hand back the
// permissive defaults so the first paint never hides a symbol that is in fact enabled, and never
// disagrees with what the pre-paint script is about to put on the document.
const SERVER_SNAPSHOT: AccountPrefsSnapshot = {
  prefs: DEFAULT_PREFS, terminal: DEFAULT_TERMINAL_PREFS, metaPrefs: {}, ready: false, owner: GUEST_OWNER,
};
function getServerSnapshot() { return SERVER_SNAPSHOT; }

// ── local persistence, per owner ──────────────────────────────────────────────────────────
// One blob per owner: the `markets` object plus the follow list. Read back through
// readMarketPrefs, which is the same sanitizer the account path uses.
//
// An ACCOUNT writes its slot too, as a same-owner cache: it is what that account falls back to
// when its own auth read fails, which beats resetting a China-only trader's universe to "all
// markets" because Supabase was briefly unreachable. Because the slot is namespaced, that cache
// is unreadable from any other owner — the property the unscoped `mm.marketPrefs` lacked.

/** Adopt the pre-boundary unscoped payload into GUEST once. Idempotent; safe to call per load. */
function sweepLegacyLocal() {
  const storage = browserStorage();
  if (!storage) return;
  adoptLegacySlotIntoGuest(storage, {
    legacyKey: LS_KEY_LEGACY, scopedKey: LS_KEY, receiptKey: LS_LEGACY_RECEIPT,
  });
}

function readLocal(who: string): MarketPrefs | null {
  const storage = browserStorage();
  if (!storage) return null;
  const parsed = readOwnerSlot(storage, LS_KEY, who);
  if (!parsed || typeof parsed !== "object") return null;
  const blob = parsed as Record<string, unknown>;
  return readMarketPrefs({ markets: blob, market_focus: blob.followed } as never);
}

function writeLocal(who: string, p: MarketPrefs) {
  const storage = browserStorage();
  if (!storage) return;
  writeOwnerSlot(storage, LS_KEY, who, { ...serializeMarketPrefs(p).markets, followed: p.followed });
}

/** The chart prefs as they currently stand locally (post pre-paint script, post any account
 *  value we just applied). */
function localTerminal(): TerminalPrefs {
  return { startTf: readStartTf(), updown: readUpDown() };
}

/**
 * Step 1–3 of the owner transition, performed SYNCHRONOUSLY so no subscriber can observe the
 * outgoing owner's account state under the incoming owner — not even for one frame.
 *
 * Account-derived state (markets, the macro prefs blob, both raw merge bases, any held edit)
 * resets to "unknown". Device-effective chart prefs are re-read from the device, not carried
 * over from the outgoing account's snapshot — see the durable-vs-device note at the top.
 */
function beginOwner(next: string) {
  owner = next;
  loadedFor = next;
  generation += 1;          // every in-flight continuation and every queued write is now stale
  state = DEFAULT_PREFS;
  metaPrefs = {};
  rawTerminal = {};
  rawPrefs = {};
  pendingTerminal = null;
  pendingPrefs = null;
  terminal = localTerminal();
  ready = false;
  baseLoaded = false;
  publish();                // step 3: the incoming owner's loading snapshot, immediately
}

function load(next: string) {
  if (loadedFor === next) return;
  sweepLegacyLocal();
  beginOwner(next);
  const gen = generation;

  if (!isAccountOwner(next)) {
    state = readLocal(next) ?? { ...DEFAULT_PREFS, enabled: [...ALL_MARKETS] };
    terminal = localTerminal();
    ready = true;
    baseLoaded = true;      // a guest's merge base is the local slot, and it is loaded
    publish();
    return;
  }

  createClient().auth.getUser()
    .then(({ data, error }) => {
      if (generation !== gen) return;              // a newer owner won the race
      // A read that did not land is NOT an empty account (failure-state-truth-law). Supabase
      // resolves `{ data: { user: null }, error }` on an auth failure rather than rejecting, so
      // treating this as "no metadata" would hand every write an EMPTY merge base and delete
      // the account's sibling keys on the next preference edit.
      if (error || !data?.user) throw error || new Error("no user");
      // The shell resolved this owner from the server session; the client library resolved its
      // own. If they disagree, the browser is not holding the session the page was rendered for
      // — adopt nothing and write nothing, rather than merging one account's blob into another.
      if (data.user.id !== ownerUserId(next)) throw new Error("owner mismatch");

      const meta = data.user.user_metadata as Record<string, unknown> | undefined;
      // readMarketPrefs migrates the legacy `market_focus`-only shape, so a user who onboarded
      // before `markets` existed gets their signup choice honoured on this very load.
      state = readMarketPrefs(meta as never);
      // An edit the user made while this read was in flight is NEWER than what came back, so it
      // layers on top — and only now, with the account's own keys underneath it, is it safe to
      // push. Nothing was lost by waiting: the local half already applied when they clicked.
      rawTerminal = { ...metaObject(meta, "terminal"), ...(pendingTerminal || {}) };
      rawPrefs = { ...metaObject(meta, "prefs"), ...(pendingPrefs || {}) };
      baseLoaded = true;
      if (pendingTerminal) { pushMeta({ terminal: rawTerminal }, gen); pendingTerminal = null; }
      if (pendingPrefs) { pushMeta({ prefs: rawPrefs }, gen); pendingPrefs = null; }

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
      writeLocal(next, state);   // same-owner cache for the next failed read
      publish();
    })
    .catch(() => {
      if (generation !== gen) return;
      // Same-owner last good, or the permissive default. NOT another owner's payload: readLocal
      // reads this owner's slot only.
      state = readLocal(next) ?? { ...DEFAULT_PREFS, enabled: [...ALL_MARKETS] };
      terminal = localTerminal();
      metaPrefs = {};
      rawTerminal = {};
      rawPrefs = {};
      // The UI stops waiting, but the merge base is still unknown, so `baseLoaded` stays false
      // and every write keeps holding as an intent. Held edits are NOT discarded: an intent to
      // change a preference does not stop being the user's intent because one read failed. (The
      // retry that drains them is E2's serialized delivery pump.)
      ready = true;
      baseLoaded = false;
      publish();
    });
}

// ── writes ───────────────────────────────────────────────────────────────────────────────
// Every write is optimistic: a failed round-trip must not block the UI, and the local copy
// already holds the change, so a reload before it lands still shows what the user picked. A
// guest takes the same paths minus the network call.

function pushMeta(data: Record<string, unknown>, gen = generation) {
  if (!isAccountOwner(owner)) return;
  if (gen !== generation) return;    // the owner changed after this write was decided — drop it
  createClient().auth.updateUser({ data }).catch(() => {});
}

/**
 * Merge a patch into one of the two nested blobs and push the WHOLE blob — `updateUser` replaces
 * a nested object rather than merging into it, so the push must carry every sibling key.
 *
 * Without a loaded merge base the patch is HELD instead of pushed; a load that answers folds it
 * in and flushes it. Guests stop at the account check — local only.
 */
function mergeBlob(key: "terminal" | "prefs", patch: Record<string, unknown>) {
  if (key === "terminal") rawTerminal = { ...rawTerminal, ...patch };
  else rawPrefs = { ...rawPrefs, ...patch };
  if (!isAccountOwner(owner)) return;
  if (!baseLoaded) {
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
 *
 * `market_focus` and `markets` are TOP-LEVEL user_metadata keys, which `updateUser` merges
 * rather than replaces, so these do not need the nested-blob merge base.
 */
function persistMarkets(next: MarketPrefs, withFollows: boolean) {
  state = next;
  publish();
  writeLocal(owner, next);
  pushMeta(withFollows
    ? { market_focus: next.followed, ...serializeMarketPrefs(next) }
    : serializeMarketPrefs(next));
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

/**
 * @param identity the shell's resolved AccountIdentity. Keyed on the immutable uuid, so a user
 *        who changes their email keeps the same preferences instead of forking a second owner.
 */
export function useAccountPrefs(identity?: AccountIdentity | null): AccountPrefsApi {
  const who = identityOwnerKey(identity ?? GUEST_IDENTITY);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Depends on the owner KEY, not the identity object: a re-render that rebuilds an equal
  // identity must not re-run the load, and an email change on the same uuid is not an owner
  // change at all.
  useEffect(() => { load(who); }, [who]);

  const toggle = useCallback((m: MarketId) => {
    const next = toggleMarket(state, m);
    if (next !== state) persistMarkets(next, false);
  }, []);

  // Bulk enable. NOT a loop over toggle(): each toggle derives from the current state, and N calls
  // batched into one tick would each start from the same snapshot, so only the last would survive.
  const enableAll = useCallback(() => {
    persistMarkets({ ...state, enabled: [...ALL_MARKETS], autoNarrowed: false }, false);
  }, []);

  const setFollowed = useCallback((next: readonly FollowId[]) => {
    persistMarkets(setFollowedMarkets(state, next), true);
  }, []);

  return {
    prefs: snap.prefs, terminal: snap.terminal, metaPrefs: snap.metaPrefs, ready: snap.ready,
    owner: snap.owner,
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
  baseLoaded = false;
  owner = GUEST_OWNER;
  loadedFor = null;
  generation = 0;
  snapshot = { prefs: state, terminal, metaPrefs, ready, owner };
}

/** Test seam — drives the owner transition directly, exactly as the hook's effect would. */
export function __loadOwner(who: string) { load(who); }

/** Test seam — the same subscription useSyncExternalStore takes, without a React renderer. */
export function __subscribeMarketPrefs(fn: (s: AccountPrefsSnapshot) => void) {
  return subscribe(() => fn(snapshot));
}

/** Test seam — the currently published snapshot. */
export function __marketPrefsSnapshot(): AccountPrefsSnapshot { return snapshot; }

/** Test seam — the store's private bookkeeping, for assertions the snapshot cannot express. */
export function __marketPrefsInternals() {
  return { owner, generation, ready, baseLoaded, rawTerminal, rawPrefs, pendingTerminal, pendingPrefs };
}
