import { resolveRegularSessionDisplay, type QuoteDisplayInput } from "@/lib/quoteDisplay";

export type WatchlistManifestQuote = {
  last?: number | null;
  chg?: number | null;
};

export type WatchlistLiveQuote = QuoteDisplayInput & {
  regularPrice?: number | null;
  regularChg?: number | null;
};

export type WatchlistQuoteSnapshot = {
  price: number | null;
  change: number | null;
  source: "quote" | "manifest" | "none";
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Resolve the two numbers shown in compact watchlist rows.
 *
 * The public quote contract's explicit regular-session lane wins. Older/internal
 * quote objects are normalized through resolveRegularSessionDisplay, and the
 * nightly manifest remains the honest final fallback when no current quote exists.
 * Extended-hours fields are intentionally excluded from this primary lane.
 */
export function resolveWatchlistQuote(
  manifest: WatchlistManifestQuote | null | undefined,
  quote: WatchlistLiveQuote | null | undefined,
): WatchlistQuoteSnapshot {
  const regular = resolveRegularSessionDisplay(quote);
  const quotePrice = finite(quote?.regularPrice) && quote.regularPrice > 0
    ? quote.regularPrice
    : regular.regularPrice;
  const quoteChange = finite(quote?.regularChg) ? quote.regularChg : regular.regularChg;

  if (quotePrice != null || quoteChange != null) {
    return {
      price: quotePrice ?? (finite(manifest?.last) ? manifest.last : null),
      change: quoteChange ?? (finite(manifest?.chg) ? manifest.chg : null),
      source: "quote",
    };
  }

  const price = finite(manifest?.last) ? manifest.last : null;
  const change = finite(manifest?.chg) ? manifest.chg : null;
  return { price, change, source: price != null || change != null ? "manifest" : "none" };
}

export function formatWatchlistPrice(price: number | null): string {
  if (price == null || !Number.isFinite(price)) return "—";
  const decimals = Math.abs(price) < 10 ? 4 : 2;
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatWatchlistChange(change: number | null): string {
  if (change == null || !Number.isFinite(change)) return "—";
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
}
