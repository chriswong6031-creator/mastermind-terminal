/**
 * matrixDoc.ts — the `matrix:{ROOT}` payload contract, as the Exposure desk reads it.
 *
 * §5.3: the retired PRISM tab declared this shape inside a VIEW component
 * (prism/PrismView.tsx) and its sibling views imported the type from there. The desk
 * reads the same store from three places (expiry lens, matrix view, heat-seeker), so
 * the contract lives in its own module instead.
 *
 * Assignable BOTH ways by construction:
 *   • to `GexMatrix` (lib/gexLadder) — what the expiry lens sums;
 *   • to `StrikeExpiryDoc` (components/shared/StrikeExpiryMatrix) — what the shared
 *     matrix renderer draws.
 * Keep it that way: widening `gex` to optional would silently break the first.
 */

import type { MatrixLevels } from "@/components/shared/StrikeExpiryMatrix";
import type { HeatSeekerPick } from "./HeatSeekerCard";

/** One matrix cell. `gex` is net gamma exposure in WHOLE DOLLARS. */
export interface MatrixDocCell {
  strike: number;
  expiry: string;
  gex: number | null;
  call_oi?: number | null;
  put_oi?: number | null;
  call_vol?: number | null;
  put_vol?: number | null;
  /** The builder publishes an OBJECT {call, put} (PIT-lagged ΔOI per leg). */
  delta_oi?: { call?: number | null; put?: number | null } | null;
}

export interface MatrixDoc {
  schema?: string;
  asof?: string;
  root?: string;
  spot?: number | null;
  expiries?: string[];
  strikes?: number[];
  cells?: MatrixDocCell[];
  /**
   * The builder's structural levels. NOTE the flip caveat: this block still carries a
   * retired cumulative-by-strike estimator, so consumers must prefer gex_state's
   * `gamma_flip` — see `mergeMatrixLevels` below.
   */
  levels?: MatrixLevels | null;
  heat_seeker?: HeatSeekerPick | null;
  authority_tier?: string;
  /** Prod: the SESSION date; the top-level asof is the build timestamp. */
  _build_meta?: { asof_date?: string | null } | null;
}

/** The gex_state fields the levels merge reads. */
export interface MatrixStateLevels {
  call_wall?: number | null;
  put_wall?: number | null;
  gamma_flip?: number | null;
  magnet?: number | null;
  hvl?: number | null;
}

/**
 * ONE levels provenance for every matrix surface (§5.3).
 *
 * ⚠️ gex_state FIRST for the flip. The matrix builder's own levels block still carries
 * the retired cumulative-by-strike estimator (measured live 2026-08-01: SPY
 * levels.gamma_flip 594.28 against spot 741.69, while gex_state's spot-grid flip was
 * sane) — prefer the builder that uses the profile method until the matrix lane is
 * repaired and republished end to end. RCA:
 * docs/MARKET_STRUCTURE_CORE_MASTERPLAN_2026-08-01.md:270-284.
 *
 * Every other level prefers the matrix (it is strike-resolved there) and falls back to
 * gex_state.
 */
export function mergeMatrixLevels(
  matrix: MatrixDoc | null | undefined,
  state: MatrixStateLevels | null | undefined
): MatrixLevels {
  return {
    call_wall: matrix?.levels?.call_wall ?? state?.call_wall ?? null,
    put_support: matrix?.levels?.put_support ?? state?.put_wall ?? null,
    hvl: matrix?.levels?.hvl ?? state?.hvl ?? state?.magnet ?? null,
    gamma_flip: state?.gamma_flip ?? matrix?.levels?.gamma_flip ?? null,
    max_pain: matrix?.levels?.max_pain ?? null,
  };
}
