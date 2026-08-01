/**
 * volTypes.ts — the options_hub.vol/v1 payload contract (verified live).
 *
 * Served via /api/flow?f=vol:{ROOT} (fixture: public/data/vol_fixture.json,
 * prod: Python hub → R2 options_hub/vol/{ROOT}.json).
 *
 * Store facts the UI must respect:
 *   - NIGHTLY EOD only — never dress this data in live chrome.
 *   - history[]: iv_rank and close are NULL in the live store; only atm_iv is real.
 *   - smile[] wings carry garbage deep-ITM IVs (197%-style prints) — default-trim.
 *   - All IV/RV values are percent NUMBERS (58.2 == 58.2%), ranks are 0–100.
 */

export interface VolTermRow {
  dte: number;
  exp: string;
  atm_iv: number | null;
}

export interface VolSmilePoint {
  strike: number;
  call_iv: number | null;
  put_iv: number | null;
}

export interface VolSmileExp {
  exp: string;
  points: VolSmilePoint[];
}

export interface VolHistoryRow {
  date: string;
  /** NULL in the live store — do not build UI on it. */
  iv_rank: number | null;
  atm_iv: number | null;
  /** NULL in the live store — do not build UI on it. */
  close: number | null;
}

export interface VolPayload {
  schema?: string;
  /** "YYYY-MM-DD" in the live store (fixture may carry a full ISO stamp). */
  asof?: string;
  root?: string;
  iv_rank_252?: number | null;
  iv_rank_all?: number | null;
  coverage_days_all?: number | null;
  since_all?: string | null;
  atm_iv?: number | null;
  iv_52w_hi?: number | null;
  iv_52w_lo?: number | null;
  rv20?: number | null;
  /** Published as atm_iv − rv20 upstream — display it, never recompute. */
  vrp?: number | null;
  term?: VolTermRow[];
  smile?: VolSmileExp[];
  history?: VolHistoryRow[];
  coverage?: { n_days?: number; since?: string };
}
