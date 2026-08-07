/**
 * Where a two-detent bottom sheet lands when the finger lifts.
 *
 * MobileSheet (the `detents` prop) and AnalysisHubSheet each own their own markup, scrim and
 * focus model but must feel like ONE drawer, so the release decision lives here rather than
 * being written twice. Heights are px; `velocity` is px/ms, positive downward (the direction
 * that shrinks the sheet).
 */

/** A release below the resting detent by more than this dismisses instead of snapping back. */
export const DETENT_DISMISS_SLACK = 56;
/**
 * Release speed above which the drag is read as a FLICK and takes the detent it was thrown at,
 * however short the throw. Without it a sheet answers only to distance, which is why a quick
 * swipe down used to leave it sitting there.
 */
export const DETENT_FLICK_V = 0.45;

export type DetentRelease = "full" | "initial" | "dismiss";

export function resolveDetentRelease(input: {
  /** Sheet height at release. */
  height: number;
  /** Sheet height when the drag began — which detent the throw started from. */
  startHeight: number;
  /** px/ms at release, positive downward. */
  velocity: number;
  /** Resting detent height in px. */
  initial: number;
  /** Full detent height in px. */
  full: number;
}): DetentRelease {
  const { height, startHeight, velocity, initial, full } = input;
  const upperBand = (initial + full) / 2;
  const pulledUnderRest = height < initial - DETENT_DISMISS_SLACK;

  // Up is unambiguous: whatever it was thrown from, it opens.
  if (velocity <= -DETENT_FLICK_V) return "full";

  // A downward flick steps ONE detent down — full → resting, resting → gone — unless it was
  // thrown clear under the resting detent, which reads as "get rid of it" from either.
  if (velocity >= DETENT_FLICK_V) {
    if (pulledUnderRest) return "dismiss";
    return startHeight >= upperBand ? "initial" : "dismiss";
  }

  // Otherwise the sheet simply goes to whichever detent it was left nearest.
  if (height >= upperBand) return "full";
  if (pulledUnderRest) return "dismiss";
  return "initial";
}
