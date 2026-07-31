export type QuoteDisplayInput = {
  last?: number | null;
  chg?: number | null;
  close?: number | null;
  prevClose?: number | null;
  prevSessionChg?: number | null;
};

export type RegularSessionDisplay = {
  regularPrice: number | null;
  regularChg: number | null;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Resolve the primary quote lane shown by every Terminal client.
 *
 * During RTH, `last/chg` are the live regular-session values. After the close,
 * the official `close` wins and its move is measured against `prevClose`.
 * Before the next RTH begins, `prevSessionChg` preserves the completed session's
 * performance instead of letting an overnight print turn the primary percentage
 * into an extended-hours move.
 *
 * Extended prints deliberately do not appear in this function; they live only in
 * the `extPrice/extChg` namespace.
 */
export function resolveRegularSessionDisplay(
  quote: QuoteDisplayInput | null | undefined,
): RegularSessionDisplay {
  if (!quote) return { regularPrice: null, regularChg: null };

  const officialClose = finite(quote.close) && quote.close > 0 ? quote.close : null;
  const liveLast = finite(quote.last) && quote.last > 0 ? quote.last : null;
  const regularPrice = officialClose ?? liveLast;

  let regularChg: number | null = null;
  if (officialClose != null && finite(quote.prevClose) && quote.prevClose !== 0) {
    regularChg = ((officialClose - quote.prevClose) / quote.prevClose) * 100;
  } else if (finite(quote.prevSessionChg)) {
    regularChg = quote.prevSessionChg;
  } else if (finite(quote.chg)) {
    regularChg = quote.chg;
  }

  return { regularPrice, regularChg };
}

/** Add explicit display lanes to the public quote contract without mutating the cache. */
export function withRegularSessionDisplay<T extends QuoteDisplayInput>(
  quote: T,
): T & RegularSessionDisplay {
  return { ...quote, ...resolveRegularSessionDisplay(quote) };
}
