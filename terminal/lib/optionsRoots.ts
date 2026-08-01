/**
 * optionsRoots.ts — the ONE source for the options-hub root pickers.
 *
 * Extracted from GexDeskView so every per-root options surface (GEX desk,
 * Volatility tab, …) offers the same universe in its input+datalist instead of
 * each desk growing its own drifting copy.
 *
 * GEX_QUICK_ROOTS — one-click chips next to the ticker box (indices first, then
 * the most liquid single names). GEX_AUTOCOMPLETE_ROOTS — the native <datalist>
 * dropdown: a zero-dependency "instant search" without loading the 1.9MB manifest.
 */

export const GEX_QUICK_ROOTS = ["SPY", "QQQ", "IWM", "NVDA", "TSLA", "META", "AAPL"];

export const GEX_AUTOCOMPLETE_ROOTS = [
  "SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT",
  "NVDA", "TSLA", "AAPL", "META", "AMZN", "MSFT", "GOOGL", "GOOG", "AMD", "NFLX",
  "AVGO", "MU", "PLTR", "COIN", "SMCI", "MSTR", "BABA", "INTC", "CRM", "ORCL",
  "QCOM", "ARM", "MARA", "SOFI", "UBER", "DIS", "BA", "JPM", "XLF", "XLE", "GLD",
];
