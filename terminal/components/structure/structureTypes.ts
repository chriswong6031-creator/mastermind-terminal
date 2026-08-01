/**
 * structureTypes.ts — the R3 OI-suite payload contracts (Structure tab).
 *
 * Served via /api/flow?f=oi_time:{ROOT} / max_pain:{ROOT} / oi_change[:{ROOT}]
 * (fixtures: public/data/{oi_time,max_pain,oi_change}_fixture.json; prod:
 * macro build_options_hub_nightly → R2 options_hub/oi_time/{ROOT}.json etc.).
 *
 * Store facts the UI must respect:
 *   - NIGHTLY EOD only — never dress this data in live chrome.
 *   - OI TIMING LAW: every payload carries oi_date "t-1" — the OI report for a
 *     session represents END-OF-PRIOR-SESSION positions (OPRA reports in
 *     arrears). Intraday OI does not exist; every panel must say so.
 *   - max_pain expiries[] hold ALL upcoming expirations (capped, uncut count in
 *     expiries_full_n); only the nearest few carry a `curve` (payload size).
 *   - by_strike is windowed ±20% of spot_ref, capped 160 (by_strike_full_n
 *     discloses the uncut count) — same law as the gex ladder.
 *   - oi_change rows are |ΔOI|-ranked (reductions survive); d_oi_pct is NULL
 *     for brand-new contracts (no prev base — never render as 0%).
 */

export interface OiTimeRow {
  date: string;
  call_oi: number;
  put_oi: number;
  total_oi: number;
}

export interface OiTimePayload {
  schema?: string;
  asof?: string;
  root?: string;
  /** Always "t-1" — the OI timing law disclosure. */
  oi_date?: string;
  window_months?: number;
  history?: OiTimeRow[];
  coverage?: { n_days?: number; since?: string | null };
}

export interface MaxPainCurvePoint {
  strike: number;
  call_value_mn: number | null;
  put_value_mn: number | null;
  value_mn: number | null;
}

export interface MaxPainExpRow {
  exp: string;
  dte: number;
  max_pain: number | null;
  call_oi: number;
  put_oi: number;
  /** Present only on the nearest few expirations (payload size). */
  curve?: MaxPainCurvePoint[];
  curve_full_n?: number;
}

export interface OiStrikeRow {
  strike: number;
  call_oi: number;
  put_oi: number;
}

export interface MaxPainPayload {
  schema?: string;
  asof?: string;
  root?: string;
  spot_ref?: number | null;
  oi_date?: string;
  expiries?: MaxPainExpRow[];
  expiries_full_n?: number;
  by_strike?: OiStrikeRow[];
  by_strike_full_n?: number;
  coverage?: { n_contracts?: number };
}

export interface OiChangeRow {
  root: string;
  right: string;
  exp: string;
  dte: number;
  strike: number;
  oi: number;
  oi_prev: number;
  d_oi: number;
  /** NULL for brand-new contracts (oi_prev 0) — render "new", never 0%. */
  d_oi_pct: number | null;
  mid: number | null;
}

export interface OiChangePayload {
  schema?: string;
  asof?: string;
  root?: string;
  scope?: "root" | "cross_root";
  prev_session?: string | null;
  oi_date?: string;
  rows?: OiChangeRow[];
  /** Set upstream ONLY on the disclosed unchanged-OPRA-vintage empty. */
  note?: string;
  roots_n?: number;
  coverage?: { n_contracts_changed?: number };
}
