/**
 * A small, UI-agnostic search engine for indicators, modules, and user scripts.
 *
 * `aliases` is the high-signal vocabulary users are likely to type (including
 * abbreviations and tags). `metadata` is lower-signal supporting copy such as a
 * suite, category, or description.
 */
export interface IndicatorSearchDocument<T> {
  id: string;
  primary: string;
  aliases?: readonly string[];
  metadata?: readonly string[];
  order: number;
  value: T;
}

export interface IndicatorSearchResult<T> {
  document: IndicatorSearchDocument<T>;
  score: number;
}

type PreparedText = {
  text: string;
  words: readonly string[];
};

type Candidate<T> = IndicatorSearchResult<T> & {
  inputIndex: number;
};

const COMBINING_MARK = /\p{M}+/gu;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Makes punctuation and presentation differences irrelevant without transliterating
 * non-Latin scripts. NFKD also folds compatibility forms such as full-width ASCII.
 */
export function normalizeIndicatorSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(COMBINING_MARK, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function prepare(value: string): PreparedText {
  const text = normalizeIndicatorSearch(value);
  return { text, words: text ? text.split(" ") : [] };
}

function uniqueQueryTokens(query: string): string[] {
  const normalized = normalizeIndicatorSearch(query);
  return normalized ? [...new Set(normalized.split(" "))] : [];
}

function scorePrimary(token: string, field: PreparedText): number {
  if (!field.text) return 0;
  if (field.text === token) return 1_000;
  if (field.words.includes(token)) return 940;
  if (field.text.startsWith(token)) return 860;
  if (field.words.some((word) => word.startsWith(token))) return 830;
  return 0;
}

function scoreAlias(token: string, field: PreparedText): number {
  if (!field.text) return 0;
  if (field.text === token) return 980;
  if (field.words.includes(token)) return 920;
  if (field.text.startsWith(token)) return 740;
  if (field.words.some((word) => word.startsWith(token))) return 720;
  if (field.text.includes(token)) return 680;
  return 0;
}

function scoreMetadata(token: string, field: PreparedText): number {
  if (!field.text) return 0;
  if (field.text === token) return 540;
  if (field.words.includes(token)) return 520;
  if (field.text.startsWith(token)) return 480;
  if (field.words.some((word) => word.startsWith(token))) return 460;
  if (field.text.includes(token)) return 420;
  return 0;
}

function withinOneEdit(left: string, right: string): boolean {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > 1) return false;

  if (a.length === b.length) {
    let differences = 0;
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) differences += 1;
      if (differences > 1) return false;
    }
    return differences === 1;
  }

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let shortIndex = 0;
  let longIndex = 0;
  let skipped = false;
  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    longIndex += 1;
  }
  return true;
}

function fuzzyScore(
  token: string,
  primary: PreparedText,
  aliases: readonly PreparedText[],
  metadata: readonly PreparedText[],
): number {
  if (Array.from(token).length < 5 || CJK.test(token)) return 0;
  if (primary.words.some((word) => withinOneEdit(token, word))) return 160;
  if (aliases.some((field) => field.words.some((word) => withinOneEdit(token, word)))) return 140;
  if (metadata.some((field) => field.words.some((word) => withinOneEdit(token, word)))) return 100;
  return 0;
}

function scoreDocument<T>(
  document: IndicatorSearchDocument<T>,
  queryTokens: readonly string[],
): number | null {
  const primary = prepare(document.primary);
  const aliases = (document.aliases ?? []).map(prepare);
  const metadata = (document.metadata ?? []).map(prepare);
  let total = 0;

  for (const token of queryTokens) {
    let tokenScore = scorePrimary(token, primary);
    for (const alias of aliases) tokenScore = Math.max(tokenScore, scoreAlias(token, alias));
    for (const field of metadata) tokenScore = Math.max(tokenScore, scoreMetadata(token, field));
    if (tokenScore === 0) tokenScore = fuzzyScore(token, primary, aliases, metadata);
    if (tokenScore === 0) return null;
    total += tokenScore;
  }

  return total;
}

function candidateOrder<T>(candidate: Candidate<T>): number {
  return Number.isFinite(candidate.document.order) ? candidate.document.order : candidate.inputIndex;
}

function compareCandidates<T>(left: Candidate<T>, right: Candidate<T>): number {
  return right.score - left.score
    || candidateOrder(left) - candidateOrder(right)
    || left.inputIndex - right.inputIndex;
}

/**
 * Ranks matching documents without depending on query-token order.
 *
 * Every distinct query token must match. Duplicate ids collapse to their best-scoring
 * document; equal duplicate candidates retain the earliest original order/input position.
 */
export function rankIndicatorSearch<T>(
  documents: readonly IndicatorSearchDocument<T>[],
  query: string,
): IndicatorSearchResult<T>[] {
  const queryTokens = uniqueQueryTokens(query);
  if (queryTokens.length === 0) return [];

  const bestById = new Map<string, Candidate<T>>();
  documents.forEach((document, inputIndex) => {
    const score = scoreDocument(document, queryTokens);
    if (score === null) return;

    const candidate: Candidate<T> = { document, score, inputIndex };
    const current = bestById.get(document.id);
    if (!current || compareCandidates(candidate, current) < 0) {
      bestById.set(document.id, candidate);
    }
  });

  return [...bestById.values()]
    .sort(compareCandidates)
    .map(({ document, score }) => ({ document, score }));
}
