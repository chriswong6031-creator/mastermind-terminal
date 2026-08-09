import { expect } from "@playwright/test";

// Shared helper for assertions about a value a transition is still moving. Not a spec file —
// Playwright's default testMatch only collects *.spec.ts, so this module is imported, never run.

/**
 * Wait for a reading to SETTLE, then hand that reading back for the assertions.
 *
 * `expect.poll(read).toBeGreaterThan(x)` accepts the first frame that clears the bar, and re-reads
 * the page for every following assertion — so a poll that succeeds proves nothing about the state
 * the next line measures. Both call sites of this helper were flaky for exactly that reason, and in
 * both the observed failure was the value coming back at its pre-transition baseline: the gesture
 * behind it had been dropped, not merely delayed, so a longer timeout would have waited out the
 * whole window and still failed.
 *
 * This resolves only on a reading that satisfies `ok` AND repeats (`same` against the sample before
 * it), and returns that settled reading, so every assertion is made against ONE observation.
 *
 * `drive` re-issues the gesture the reading depends on before each sample. It is handed the last
 * reading (`null` before the first) so a gesture that already landed is never re-issued — the
 * mobile call site drives a TOGGLE, and a blind retry there would undo the state it was waiting for.
 */
export async function settled<T>(opts: {
  read: () => Promise<T>;
  ok: (v: T) => boolean;
  same: (prev: T, next: T) => boolean;
  message: string;
  drive?: (last: T | null) => Promise<void>;
  timeout?: number;
  intervals?: number[];
}): Promise<T> {
  const { read, ok, same, message, drive, timeout = 20_000, intervals = [150, 250, 250, 500] } = opts;
  let prev: T | null = null;
  await expect.poll(async () => {
    await drive?.(prev);
    const next = await read();
    const done = prev != null && ok(prev) && ok(next) && same(prev, next);
    prev = next;
    return done;
  }, { timeout, intervals, message }).toBe(true);
  return prev as T;
}
