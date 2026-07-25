/**
 * surfacePins.ts — "send to chart": strike levels the user pinned onto the surface pane,
 * drawn as Lightweight-Charts price lines and listed as removable chips above the field.
 *
 * SCOPE (deliberate): pins live in React state for the life of the mounted workspace —
 * they are NOT persisted. A pin is a scratch annotation ("watch 592 today"), not a saved
 * study, and quietly resurrecting yesterday's levels on a different session would be a
 * small lie about what the user is looking at. The chip row says so in words.
 *
 * Pure + DOM-free so the add/remove/dedup rules are unit-testable.
 */

export interface SurfacePin {
  /** Stable id — the strike itself, so the same strike can only be pinned once. */
  id: string;
  strike: number;
  /** The metric the pin was taken from, for the chip's tooltip/label context. */
  metric: string;
  /** Signed metric value at pin time — display context on the chip, never a signal. */
  value: number | null;
}

export function pinId(strike: number): string {
  return `k${strike}`;
}

/** Add a pin, or return the list unchanged when that strike is already pinned. */
export function addPin(pins: SurfacePin[], pin: SurfacePin): SurfacePin[] {
  if (pins.some((p) => p.id === pin.id)) return pins;
  return [...pins, pin].sort((a, b) => a.strike - b.strike);
}

export function removePin(pins: SurfacePin[], id: string): SurfacePin[] {
  return pins.filter((p) => p.id !== id);
}

export function hasPin(pins: SurfacePin[], strike: number): boolean {
  return pins.some((p) => p.id === pinId(strike));
}
