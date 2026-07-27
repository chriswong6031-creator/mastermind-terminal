// Market taxonomy + the user's market preference — the ONE contract both properties read.
//
// Background: onboarding (macro-side templates/onboard.js) has always written
// `user_metadata.market_focus` — an array of "us" | "cn" | "hk" | "ca" | "global" — and
// OnboardingProvider faithfully pushes the stashed copy into user_metadata on first authed
// mount. Nothing ever READ it. The write path was complete and the read path did not exist,
// so a user who picked "China only" got a US-shaped product anyway. This module is the read
// path, and it is deliberately pure so both the Next.js Terminal and the static macro site
// can agree on what "my markets" means without sharing a runtime.
//
// Two ideas that are easy to conflate and must not be:
//   • HOME market   — the single market whose surfaces get promoted (landing page, search
//                     ranking boost, default watchlist seed). Exactly one, or null.
//   • ENABLED set   — every market the user can see at all. A market that is not enabled is
//                     not searchable; its symbols behave as though they are not in the
//                     universe. Always a superset of {home}.
//
// Crypto is a market in the taxonomy (it classifies symbols) but NOT a country: it is not a
// candidate for `home`, and it stays enabled by default even for a US-only signup, because a
// US equities trader who also holds BTC should not silently lose BTC. See DEFAULT_ENABLED.

export type MarketId = "us" | "cn" | "hk" | "ca" | "intl" | "crypto";

export const MARKET_IDS: readonly MarketId[] = ["us", "cn", "hk", "ca", "intl", "crypto"] as const;

// Markets a user can pick as their home. Crypto is excluded — it is an asset class that spans
// every country, so "my home market is crypto" would not tell us which equity surfaces to show.
export const HOME_MARKET_IDS: readonly MarketId[] = ["us", "cn", "hk", "ca", "intl"] as const;

const MARKET_SET = new Set<string>(MARKET_IDS);
export const isMarketId = (v: unknown): v is MarketId => typeof v === "string" && MARKET_SET.has(v);

// ── manifest `mkt` → market group ────────────────────────────────────────────────────────
// The manifest's `mkt` is an EXCHANGE/venue string, not a market group: the production
// manifest carries NYSE, NASDAQ, AMEX, US, SSE, SZSE, HKEX, TSX plus a long tail of country
// names (United Kingdom, Japan, India, South Korea, Taiwan, Australia, France, Germany,
// Switzerland, Netherlands, Italy, Spain, …). Anything not named here falls to "intl", which
// is the correct default: the tail is genuinely international and new venues should not
// silently land in "us" just because they are unmapped.
const VENUE_GROUP: Record<string, MarketId> = {
  // United States
  NYSE: "us", NASDAQ: "us", AMEX: "us", US: "us", ARCA: "us", BATS: "us", OTC: "us",
  // Mainland China
  SSE: "cn", SZSE: "cn", BSE: "cn", CN: "cn",
  // Hong Kong
  HKEX: "hk", HK: "hk", SEHK: "hk",
  // Canada
  TSX: "ca", TSXV: "ca", CA: "ca", NEO: "ca",
  // Crypto — the production manifest sets mkt:"Crypto" alongside sec:"Crypto". `sec` already
  // wins in marketOf, but mapping the venue too keeps a row with only `mkt` set from falling
  // through to "intl".
  CRYPTO: "crypto", Crypto: "crypto",
};

// Symbol-suffix fallback, for rows whose `mkt` is missing. Mirrors intradayShared.classify()'s
// routing rules so a symbol can never be classified into one market for data-fetching and a
// different one for search. Kept in sync deliberately — see lib/__tests__/markets.test.ts.
function groupFromSymbol(sym: string): MarketId {
  if (/-USD(T)?$/i.test(sym)) return "crypto";
  if (/\.(SS|SZ|BJ)$/i.test(sym)) return "cn";
  if (/\.HK$/i.test(sym)) return "hk";
  if (/\.(TO|V|NE)$/i.test(sym)) return "ca";
  // Any other dotted suffix is a foreign venue (.L, .T, .PA, .DE, .AX, .KS, .TW, …).
  if (/\.[A-Z]{1,3}$/i.test(sym)) return "intl";
  return "us";
}

/** Market group for a manifest row. `sec === "Crypto"` wins over venue — a crypto pair listed
 *  against a US venue is still crypto to a user choosing what to see. */
export function marketOf(sym: string, row?: { mkt?: string; sec?: string } | null): MarketId {
  if (row?.sec === "Crypto") return "crypto";
  const venue = (row?.mkt || "").trim();
  if (venue) {
    const hit = VENUE_GROUP[venue] || VENUE_GROUP[venue.toUpperCase()];
    if (hit) return hit;
    return "intl"; // named venue we don't map == international, never a silent "us"
  }
  return groupFromSymbol(sym);
}

// ── the preference itself ────────────────────────────────────────────────────────────────

export type MarketPrefs = {
  home: MarketId | null;      // null = never onboarded / skipped; callers must treat as "no opinion"
  enabled: MarketId[];        // markets the user can see and search; always contains `home`
  /** true when `enabled` came from the US-only-signup default rather than an explicit choice.
   *  The UI uses this to explain WHY other markets are hidden, so the narrowing never reads as
   *  a bug or a missing-data failure. */
  autoNarrowed: boolean;
};

export const ALL_MARKETS: MarketId[] = [...MARKET_IDS];

export const DEFAULT_PREFS: MarketPrefs = { home: null, enabled: [...MARKET_IDS], autoNarrowed: false };

// Legacy onboarding chip ids → MarketId. "global" is the onboarding's word for "I trade
// everywhere", which enables everything rather than mapping to the `intl` bucket alone.
const LEGACY_CHIP: Record<string, MarketId | "all"> = {
  us: "us", cn: "cn", china: "cn", hk: "hk", ca: "ca", canada: "ca",
  intl: "intl", international: "intl", global: "all",
};

/**
 * Operator rule (2026-07-25): a signup that picks ONLY the US starts with non-US markets off,
 * because most US traders never touch them and the narrower product is the better default.
 * Every OTHER selection — China, HK, Canada, global, or any multi-pick — starts with
 * everything on and must be narrowed by hand in settings.
 *
 * Crypto stays on regardless: it is not a country market, and silently removing BTC from a US
 * trader's search would be a bug, not a personalization.
 */
export function defaultEnabledFor(picks: MarketId[]): { enabled: MarketId[]; autoNarrowed: boolean } {
  const uniq = Array.from(new Set(picks));
  const countries = uniq.filter((m) => m !== "crypto");
  if (countries.length === 1 && countries[0] === "us") {
    return { enabled: ["us", "crypto"], autoNarrowed: true };
  }
  return { enabled: [...MARKET_IDS], autoNarrowed: false };
}

type MetaShape = {
  markets?: { home?: unknown; enabled?: unknown; autoNarrowed?: unknown } | null;
  market_focus?: unknown;
} | null | undefined;

/**
 * Read the canonical preference out of Supabase `user_metadata`, migrating the legacy
 * `market_focus` array when the new `markets` object is absent.
 *
 * Precedence: an explicit `markets` object always wins, even if a stale `market_focus` is
 * still sitting next to it — otherwise a user who narrows their markets in settings would be
 * silently reverted on next load by the signup-time array.
 *
 * Never throws: malformed metadata degrades to DEFAULT_PREFS (everything visible), because the
 * failure mode of "show too much" is recoverable and "show nothing" is not.
 */
export function readMarketPrefs(meta: MetaShape): MarketPrefs {
  const m = meta?.markets;
  if (m && typeof m === "object") {
    const enabled = Array.isArray(m.enabled) ? m.enabled.filter(isMarketId) : [];
    const home = isMarketId(m.home) ? m.home : null;
    // An empty/garbage enabled list would make the whole product unsearchable — fall back to
    // "home only + crypto" if we at least know the home, else everything.
    const safeEnabled: MarketId[] = enabled.length ? enabled : home ? [home, "crypto"] : [...MARKET_IDS];
    return {
      home,
      enabled: withHome(safeEnabled, home),
      autoNarrowed: m.autoNarrowed === true,
    };
  }

  const focus = meta?.market_focus;
  if (Array.isArray(focus) && focus.length) {
    const mapped: MarketId[] = [];
    let all = false;
    for (const raw of focus) {
      const hit = typeof raw === "string" ? LEGACY_CHIP[raw.toLowerCase()] : undefined;
      if (hit === "all") all = true;
      else if (hit) mapped.push(hit);
    }
    if (all) return { home: mapped[0] ?? null, enabled: [...MARKET_IDS], autoNarrowed: false };
    if (mapped.length) {
      const { enabled, autoNarrowed } = defaultEnabledFor(mapped);
      return { home: mapped[0], enabled: withHome(enabled, mapped[0]), autoNarrowed };
    }
  }

  return { ...DEFAULT_PREFS, enabled: [...MARKET_IDS] };
}

/** `enabled` must always contain `home` — a user cannot hide their own home market by accident. */
function withHome(enabled: MarketId[], home: MarketId | null): MarketId[] {
  const set = new Set(enabled);
  if (home) set.add(home);
  return MARKET_IDS.filter((m) => set.has(m));   // canonical order, deduped
}

/** The shape written back to `user_metadata`. Kept separate from readMarketPrefs so the write
 *  is explicit at every call site — this object is shared with the macro site. */
export function serializeMarketPrefs(p: MarketPrefs): { markets: { home: MarketId | null; enabled: MarketId[]; autoNarrowed: boolean } } {
  return { markets: { home: p.home, enabled: withHome(p.enabled, p.home), autoNarrowed: p.autoNarrowed } };
}

/** Toggle one market, refusing to disable the home market or to empty the set entirely. */
export function toggleMarket(p: MarketPrefs, m: MarketId): MarketPrefs {
  const on = p.enabled.includes(m);
  if (on && (m === p.home || p.enabled.length <= 1)) return p;   // never leave the user with nothing
  const next = on ? p.enabled.filter((x) => x !== m) : [...p.enabled, m];
  // Any hand edit means the narrowing is now the user's, not ours — stop explaining it as a default.
  return { ...p, enabled: withHome(next, p.home), autoNarrowed: false };
}

/** Change the home market. Enabling follows automatically — you cannot have a hidden home. */
export function setHomeMarket(p: MarketPrefs, home: MarketId | null): MarketPrefs {
  return { ...p, home, enabled: withHome(p.enabled, home), autoNarrowed: false };
}

/** True when this symbol is visible under the current preference. */
export function isSymbolVisible(sym: string, row: { mkt?: string; sec?: string } | undefined | null, p: MarketPrefs): boolean {
  return p.enabled.includes(marketOf(sym, row));
}

// ── search ranking ───────────────────────────────────────────────────────────────────────

/**
 * Relevance score for a symbol against a lowercased query. Higher is better; -1 means no match.
 *
 * Search was previously an unranked `Object.entries(manifest).filter(...).slice(0, 30)`, so the
 * result order was manifest insertion order and a query of "aa" could bury AA under any name
 * that happened to contain "aa". Ranking fixes that independently of personalization; the home
 * boost then sits on top as a tiebreak that cannot outrank an exact ticker hit.
 */
export function scoreSymbol(
  sym: string,
  row: { name?: string; zh?: string; mkt?: string; sec?: string },
  ql: string,
  home: MarketId | null,
): number {
  const s = sym.toLowerCase();
  const name = (row.name || "").toLowerCase();
  const zh = row.zh || "";

  let base: number;
  if (s === ql) base = 1000;                              // exact ticker
  else if (s.startsWith(ql)) base = 800 - Math.min(s.length - ql.length, 50);   // ticker prefix, shorter wins
  else if (name.startsWith(ql)) base = 600;               // name prefix
  else if (zh && zh.startsWith(ql)) base = 600;
  else if (s.includes(ql)) base = 400;                    // ticker substring
  else if (name.includes(ql)) base = 200;                 // name substring
  else if (zh && zh.includes(ql)) base = 200;
  else return -1;

  // Home-market boost: +60 is smaller than the gap between any two match tiers, so a home-market
  // substring hit can never outrank a foreign exact-ticker hit. Personalization reorders ties;
  // it does not override what the user literally typed.
  if (home && marketOf(sym, row) === home) base += 60;
  return base;
}

/**
 * The display name for a manifest row in the ACTIVE UI language.
 *
 * Rows carry both an English `name` and, for the names that have one, a Chinese `zh`. Every
 * surface used to render `zh || name`, which unconditionally preferred Chinese — so an English
 * user saw "WTI原油" where the row plainly carried "WTI Crude Oil", and the same for every
 * A-share and HK name. The pick is by language, with the other language as the fallback so a
 * row that carries only one of the two still shows something rather than a blank.
 *
 * Pure and hook-free so it can be shared by client components (which pass useLang()'s value)
 * and by imperative code reading the <html data-lang> attribute.
 */
export function displayName(
  row: { name?: string | null; zh?: string | null } | null | undefined,
  lang: string,
): string {
  if (!row) return "";
  const en = row.name || "";
  const zh = row.zh || "";
  return lang === "zh" ? (zh || en) : (en || zh);
}
