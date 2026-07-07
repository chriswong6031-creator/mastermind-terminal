/**
 * sectorMap.ts — per-ticker GICS sector assignment for the 34-name manifest universe.
 *
 * The manifest `sec` field only gives "Equities" | "Crypto" — not GICS.
 * This table provides the GICS sector for each ticker in the manifest.
 * ETFs and indices get the "ETF" pseudo-sector.
 * Crypto gets "Crypto".
 * Anything unknown falls to "Other".
 *
 * This should be superseded once the nightly manifest build injects a `gics` field.
 */

import type { GicsSector } from "./types";

export const TICKER_SECTOR: Record<string, GicsSector> = {
  // ── Technology ──────────────────────────────────────────────────────────────
  NVDA:  "Information Technology",
  AAPL:  "Information Technology",
  MSFT:  "Information Technology",
  AMD:   "Information Technology",
  AVGO:  "Information Technology",
  CRM:   "Information Technology",
  SMCI:  "Information Technology",
  ARM:   "Information Technology",
  MU:    "Information Technology",
  INTC:  "Information Technology",
  V:     "Financials",   // Visa is Financials in GICS

  // ── Communication Services ───────────────────────────────────────────────────
  GOOGL: "Communication Services",
  META:  "Communication Services",
  NFLX:  "Communication Services",

  // ── Consumer Discretionary ───────────────────────────────────────────────────
  AMZN:  "Consumer Discretionary",
  TSLA:  "Consumer Discretionary",

  // ── Consumer Staples ─────────────────────────────────────────────────────────
  COST:  "Consumer Staples",

  // ── Financials ───────────────────────────────────────────────────────────────
  JPM:   "Financials",

  // ── Health Care ──────────────────────────────────────────────────────────────
  LLY:   "Health Care",

  // ── Energy ───────────────────────────────────────────────────────────────────
  XOM:   "Energy",

  // ── Specialty / fintech ──────────────────────────────────────────────────────
  PLTR:  "Information Technology",
  MSTR:  "Information Technology",  // Software holding company
  COIN:  "Financials",

  // ── ETFs / indices ───────────────────────────────────────────────────────────
  SPY:   "ETF",
  QQQ:   "ETF",
  IWM:   "ETF",
  DIA:   "ETF",
  SOXL:  "ETF",
  GLD:   "ETF",
  TLT:   "ETF",

  // ── Crypto ────────────────────────────────────────────────────────────────────
  "BTC-USD": "Crypto",
  "ETH-USD": "Crypto",
  "SOL-USD": "Crypto",
  "XRP-USD": "Crypto",
};

/** Short display label for each sector, matching the flowdesk idiom. */
export const SECTOR_LABEL: Record<GicsSector, string> = {
  "Information Technology": "TECH",
  "Communication Services": "COMM",
  "Consumer Discretionary": "CONS DISC",
  "Consumer Staples":       "STAPLES",
  "Financials":             "FINANCE",
  "Health Care":            "HEALTH",
  "Energy":                 "ENERGY",
  "Industrials":            "INDUSTRIAL",
  "Materials":              "MATERIALS",
  "Utilities":              "UTILITIES",
  "Real Estate":            "REAL EST",
  "Crypto":                 "CRYPTO",
  "ETF":                    "ETF",
  "Other":                  "OTHER",
};

/** Sector display order for grouping in the treemap. */
export const SECTOR_ORDER: GicsSector[] = [
  "Information Technology",
  "Communication Services",
  "Consumer Discretionary",
  "Consumer Staples",
  "Financials",
  "Health Care",
  "Energy",
  "Industrials",
  "Materials",
  "Utilities",
  "Real Estate",
  "Crypto",
  "ETF",
  "Other",
];

export function getSector(ticker: string): GicsSector {
  return TICKER_SECTOR[ticker] ?? "Other";
}
