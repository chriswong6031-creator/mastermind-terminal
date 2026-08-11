/**
 * Exact-side unusual-volume read for the Exposure desk.
 *
 * IMPORTANT BOUNDARY: this helper reads `MatrixDoc.cells` BEFORE
 * `buildMatrixGrid()` buckets strikes and sums call/put fields. It must never consume a
 * MatrixGridModel. The baseline contract is (root, expiry, strike, side); collapsing a
 * $100C and $101C into one $2.50 heatmap row would fabricate a contract that never
 * traded and destroy the producer's exact-side baseline window.
 */

import type {
  MatrixDoc,
  MatrixDocCell,
  MatrixUnusualSide,
  MatrixUnusualStatus,
} from "./matrixDoc";

export type MatrixOptionSide = "call" | "put";
export type MatrixUnusualRailState =
  | "unavailable"
  | "insufficient"
  | "clear"
  | "flagged"
  | "malformed";

export interface ExactSideBaselineReceipt {
  availability: "eligible";
  ratio: number;
  currentVolume: number;
  medianVol30d: number;
  samples: number;
  status: MatrixUnusualStatus;
}

export interface ExactSideUnavailableReceipt {
  /** `withheld` means the publisher sent fields, but they failed the exact-side guard. */
  availability: "unavailable" | "withheld";
}

export type ExactSideReceipt = ExactSideBaselineReceipt | ExactSideUnavailableReceipt;

/** One exact expiry/strike cell whose call or put side crossed the producer's boundary. */
export interface ExactContractUnusualFlag {
  strike: number;
  expiry: string;
  sides: {
    call: ExactSideReceipt;
    put: ExactSideReceipt;
  };
}

export interface MatrixUnusualRailModel {
  state: MatrixUnusualRailState;
  /** Stable expiry/strike order. Each card carries independent call AND put receipts. */
  flags: ExactContractUnusualFlag[];
  /** Valid eligible side baselines, including normal sides and published zeros. */
  observedSides: number;
  /** Present-but-invalid side annotations withheld from the rail. */
  malformedSides: number;
}

const MIN_SAMPLES = 10;
const UNUSUAL_RATIO = 3;
const OWN = Object.prototype.hasOwnProperty;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const exactExpiry = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

function exactCellIdentity(value: unknown): string | null {
  if (!isRecord(value) || !finite(value.strike) || value.strike <= 0 || !exactExpiry(value.expiry)) {
    return null;
  }
  return `${value.expiry}|${value.strike}`;
}

type GuardedSide = {
  ratio: number;
  medianVol30d: number;
  samples: number;
  status: MatrixUnusualStatus;
};

/**
 * Validate one producer annotation, including the exact 3x boundary. A contradictory
 * pair (`status: normal` at 3x, or `status: unusual` below 3x) is malformed rather than
 * silently reclassified client-side: the producer owns the method and the desk only
 * displays its honest result.
 */
function guardSide(value: unknown): GuardedSide | null {
  if (!isRecord(value)) return null;
  const ratio = value.ratio;
  const median = value.median_vol_30d;
  const samples = value.samples;
  const status = value.status;
  if (
    !finite(ratio) || ratio < 0 ||
    // The producer publishes a conservatively truncated two-decimal receipt. Refuse
    // extra precision instead of letting presentation rounding fabricate the forbidden
    // `3.00x NORMAL` boundary from a non-canonical value such as 2.999.
    Number(ratio.toFixed(2)) !== ratio ||
    !finite(median) || median <= 0 ||
    !finite(samples) || !Number.isInteger(samples) || samples < MIN_SAMPLES || samples > 30 ||
    (status !== "normal" && status !== "unusual")
  ) {
    return null;
  }
  if ((status === "unusual") !== (ratio >= UNUSUAL_RATIO)) return null;
  return { ratio, medianVol30d: median, samples, status };
}

function currentVolume(cell: MatrixDocCell, side: MatrixOptionSide): number | null {
  const value = side === "call" ? cell.call_vol : cell.put_vol;
  return finite(value) && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Build the desk rail from raw exact-contract cells. Never pass heatmap buckets here. */
export function buildMatrixUnusualRail(
  matrix: MatrixDoc | null | undefined
): MatrixUnusualRailModel {
  const cells = Array.isArray(matrix?.cells) ? matrix.cells : [];
  let sawField = false;
  let observedSides = 0;
  let malformedSides = 0;
  const flags: ExactContractUnusualFlag[] = [];
  // A repeated raw cell makes BOTH rights at that strike/expiry ambiguous, including
  // the case where an earlier duplicate omitted the optional annotation. Count before
  // reading flags so discovering a later collision can never leave a first-wins card.
  const cellCounts = new Map<string, number>();
  for (const cell of cells) {
    const identity = exactCellIdentity(cell);
    if (identity) cellCounts.set(identity, (cellCounts.get(identity) ?? 0) + 1);
  }

  for (const cell of cells) {
    if (!isRecord(cell) || !OWN.call(cell, "unusual")) continue;
    sawField = true;
    const unusual = cell.unusual;
    if (unusual == null) {
      continue;
    }
    if (!isRecord(unusual)) {
      malformedSides++;
      continue;
    }

    // Producer contract: a non-null object owns BOTH keys. One side may be null, but
    // `{call:null,put:null}` must have been outer null. Refuse ambiguous partial shapes.
    const hasBothSideKeys = OWN.call(unusual, "call") && OWN.call(unusual, "put");
    if (!hasBothSideKeys || (unusual.call == null && unusual.put == null)) {
      malformedSides++;
      continue;
    }

    const receipts: ExactContractUnusualFlag["sides"] = {
      call: { availability: "unavailable" },
      put: { availability: "unavailable" },
    };
    let cellFlagged = false;
    for (const side of ["call", "put"] as const) {
      const raw = unusual[side];
      if (raw == null) {
        continue;
      }
      const cellIdentity = exactCellIdentity(cell);
      const guarded = guardSide(raw as MatrixUnusualSide);
      const volume = currentVolume(cell, side);
      if (!cellIdentity || (cellCounts.get(cellIdentity) ?? 0) > 1 || !guarded || volume == null) {
        receipts[side] = { availability: "withheld" };
        malformedSides++;
        continue;
      }
      observedSides++;
      receipts[side] = {
        availability: "eligible",
        status: guarded.status,
        ratio: guarded.ratio,
        currentVolume: volume,
        medianVol30d: guarded.medianVol30d,
        samples: guarded.samples,
      };
      if (guarded.status === "unusual") cellFlagged = true;
    }

    if (cellFlagged) {
      flags.push({ strike: cell.strike, expiry: cell.expiry, sides: receipts });
    }
  }

  // Identity order is deliberately non-ranked: ratio is a receipt, not card authority.
  flags.sort((a, b) =>
    a.expiry.localeCompare(b.expiry) ||
    a.strike - b.strike
  );

  const state: MatrixUnusualRailState = flags.length > 0
    ? "flagged"
    : malformedSides > 0
      ? "malformed"
      : observedSides > 0
        ? "clear"
        : sawField
          ? "insufficient"
          : "unavailable";

  return { state, flags, observedSides, malformedSides };
}
