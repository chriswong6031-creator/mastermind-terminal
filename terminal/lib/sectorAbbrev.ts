/**
 * Sector display-name abbreviations.
 * Full names come from the feed API; the table columns are narrow
 * so we shorten them here for display only.
 * The full name is preserved as the filter key everywhere.
 */
export const SECTOR_ABBREV: Record<string, string> = {
  "Information Technology": "Info Tech",
  "Communication Services": "Comm Svcs",
  "Consumer Discretionary": "Cons Disc",
  "Consumer Staples": "Staples",
  "Health Care": "Health",
  "Real Estate": "Real Est",
  // These stay as-is:
  "Financials": "Financials",
  "Industrials": "Industrials",
  "Utilities": "Utilities",
  "Energy": "Energy",
  "Materials": "Materials",
};

/** Returns the abbreviated display name for a sector; falls back to the full name. */
export function abbrevSector(name: string): string {
  return SECTOR_ABBREV[name] ?? name;
}
