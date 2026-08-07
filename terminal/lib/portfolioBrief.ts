// Portfolio brief — pure render-selection logic for the "Your book today" panel.
//
// The desk composes the brief upstream (macro-api GET /api/portfolio/brief, schema
// portfolio_brief.v1). Every user-facing sentence arrives PRE-LOCALIZED in both EN and
// ZH — this module never re-composes or truncates a fact; it only *selects* the active
// language's string and decides which UI state to render (Law: LLM/desk originates the
// facts, the client only picks and arranges). Keeping this pure and free of React makes
// the language/order/stale/uncovered decisions unit-testable without a DOM.

export type Lang = "en" | "zh";

/** A bilingual string pair as it arrives on the wire. */
export interface Bilingual {
  en: string;
  zh: string;
}

/** One composed sentence line inside a section. */
export type BriefLine = Bilingual;

/** A brief section. `key` is a stable machine id; titles arrive pre-localized. */
export interface BriefSection {
  key: string;
  title_en: string;
  title_zh: string;
  lines: BriefLine[];
}

export interface BriefWeighting {
  mode: string;
  label_en: string;
  label_zh: string;
}

export interface BriefBook {
  n: number;
  covered: number;
  uncovered: string[];
}

/** The full portfolio_brief.v1 payload (200 response body). */
export interface PortfolioBrief {
  schema: string;
  asof: string;
  generated_at: string;
  stale: boolean;
  weighting: BriefWeighting;
  book: BriefBook;
  headline: Bilingual;
  sections: BriefSection[];
}

/** The teaser tier reported by a 403 body. */
export type TeaserTier = "free" | "insider";

/**
 * The four terminal states the panel can be in. `hidden` means render nothing
 * (guest / 401) — the page already handles guests, so the brief simply absents itself.
 */
export type BriefState =
  | { kind: "ready"; brief: PortfolioBrief }
  | { kind: "teaser"; tier: TeaserTier | null }
  | { kind: "unavailable" } // 503 / network — one quiet line, never blocks the book
  | { kind: "hidden" }; // 401 / guest — no panel at all
  // (loading is a component concern, not a payload state, so it lives in the view.)

/**
 * The canonical order the desk sections render in. The API sends a fixed-order subset;
 * we re-assert the canonical order so a reordered payload can't scramble the read, and
 * unknown keys fall to the end (forward-compatible with new desk sections).
 */
export const SECTION_ORDER = [
  "exposure",
  "lanes",
  "signals",
  "regime",
  "earnings",
  "filings",
] as const;

/** Pick the active language's string from a bilingual pair. */
export function pickLang(pair: Bilingual, lang: Lang): string {
  return lang === "zh" ? pair.zh : pair.en;
}

/** Pick a section's title in the active language. */
export function sectionTitle(section: BriefSection, lang: Lang): string {
  return lang === "zh" ? section.title_zh : section.title_en;
}

/** Pick the weighting label ("by cost basis" / "按成本权重") in the active language. */
export function weightingLabel(w: BriefWeighting, lang: Lang): string {
  return lang === "zh" ? w.label_zh : w.label_en;
}

/**
 * Return the payload's sections re-sorted into the canonical desk order. Sections with a
 * known key sort by SECTION_ORDER; unknown keys keep their original relative order after
 * the known ones (stable). Sections with no lines are dropped — an empty section is a
 * silent hole in the read, not a fact.
 */
export function orderedSections(brief: PortfolioBrief): BriefSection[] {
  const rank = (key: string): number => {
    const i = (SECTION_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? SECTION_ORDER.length : i;
  };
  return brief.sections
    .filter((s) => Array.isArray(s.lines) && s.lines.length > 0)
    .map((s, i) => ({ s, i })) // carry original index for a stable tiebreak
    .sort((a, b) => rank(a.s.key) - rank(b.s.key) || a.i - b.i)
    .map(({ s }) => s);
}

/**
 * Map an HTTP status + optional body into a BriefState. This is the single place the
 * network contract (200 / 401 / 403 / 503) becomes a UI decision, so the view stays dumb
 * and the mapping is testable in isolation.
 *
 * - 200 → ready (caller must supply the parsed brief)
 * - 401 → hidden (guest; the page already handles guests)
 * - 403 → teaser (read tier from the body when present)
 * - anything else (incl. 503, 502, network throw modeled as 0) → unavailable
 */
export function stateForResponse(
  status: number,
  body: unknown,
): BriefState {
  if (status === 200) {
    return { kind: "ready", brief: body as PortfolioBrief };
  }
  if (status === 401) {
    return { kind: "hidden" };
  }
  if (status === 403) {
    const tier = readTier(body);
    return { kind: "teaser", tier };
  }
  return { kind: "unavailable" };
}

/** Extract a "free" | "insider" tier from a 403 body, or null when absent/unknown. */
function readTier(body: unknown): TeaserTier | null {
  if (body && typeof body === "object" && "tier" in body) {
    const t = (body as { tier?: unknown }).tier;
    if (t === "free" || t === "insider") return t;
  }
  return null;
}

/**
 * Whether the "no desk coverage yet for: …" honest-null line should show, and the list
 * of tickers it names. Returns null when every held name is covered — no empty disclosure.
 */
export function uncoveredNotice(
  brief: PortfolioBrief,
): { tickers: string[] } | null {
  const u = brief.book?.uncovered;
  if (Array.isArray(u) && u.length > 0) return { tickers: u };
  return null;
}
