/**
 * searchHistory.ts — ring buffer of recent symbol searches/navigations.
 *
 * CONTRACT:
 *   - push(sym): record a committed navigation; deduplicates (sym already at front → no-op).
 *   - get(): read history, most-recent first; returns string[].
 *   - clear(): wipe history.
 *   - MAX = 50 entries.
 *
 * Persisted in localStorage under mm.searchHistory as JSON string[].
 * SSR-safe: all localStorage calls are guarded.
 */

const KEY = "mm.searchHistory";
const MAX = 50;

function readRaw(): string[] {
  try {
    const v = localStorage.getItem(KEY);
    const parsed = v ? JSON.parse(v) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

/** Add an entry to the front of the history ring. Deduplicates. */
export function pushHistory(sym: string): void {
  if (typeof window === "undefined") return;
  const sym_uc = sym.trim().toUpperCase();
  if (!sym_uc) return;
  const list = readRaw().filter((s) => s !== sym_uc);
  list.unshift(sym_uc);
  writeRaw(list.slice(0, MAX));
}

/** Read history, most-recent first. */
export function getHistory(): string[] {
  if (typeof window === "undefined") return [];
  return readRaw();
}

/** Clear all history. */
export function clearHistory(): void {
  if (typeof window === "undefined") return;
  writeRaw([]);
}
