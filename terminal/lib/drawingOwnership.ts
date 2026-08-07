/**
 * React identity for the imperative chart renderer.
 *
 * Authentication is part of the identity because ChartPanel owns native pointer listeners and
 * mutable drafts that must never survive into another drawing owner: a guest↔account transition
 * has to tear the renderer down before a stale transaction can call the next owner's callback.
 *
 * The SYMBOL deliberately is not. Keying on it remounted the whole renderer on every ticker
 * change, which destroyed the canvas and left the chart blank for as long as the new bars took
 * to arrive. ChartPanel already handles a live symbol change in place — its data effect rebuilds
 * the series, indicators, compare overlays and signal marks — and per-symbol drawings reach it as
 * a prop, so the surviving renderer can hold the outgoing chart on screen, dimmed, until the new
 * one is painted. ChartPane owns that swap state; ChartPanel cancels any in-flight drawing
 * transaction on the symbol change that used to die with the unmount.
 */
export function drawingPanelInstanceKey(ownerKey: string): string {
  return ownerKey;
}
