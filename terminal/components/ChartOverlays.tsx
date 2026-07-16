"use client";
// Presentational overlay layer drawn on top of a ChartPanel chart. It renders, per chart pane:
//   • a top-left legend listing the indicators plotted in that pane (price pane = overlay indicators,
//     each sub-pane = its single indicator), each with the TradingView-style hover menu
//     (eye / settings / source / remove / more) + 0.5s tooltips + hidden styling + a fixed crossed-eye
//     quick-toggle, and a "^" collapse control on the price-pane legend.
//   • a top-right pane-ops menu (sub-panes only), revealed on pane hover: move up / move down /
//     remove / collapse / maximize, with active-state highlighting.
// It owns NO chart logic — every action is a callback into ChartPanel, which holds the chart refs.

import { useEffect, useRef, useState } from "react";
import MobileSheet from "@/components/ui/MobileSheet";

export type LegendEntry = {
  key: string;          // "ema" | "bb" | … | "pine" | "cmp:SYM"
  label: string;
  kind: "overlay" | "pane";
  hidden: boolean;
  isPine: boolean;
  isCompare?: boolean;  // compare symbol pseudo-indicator — no read-only source view
  noParams?: boolean;   // signal-style row (e.g. Golden Oracle) — no Settings / Source, just eye + remove
  color?: string;       // line color (used for the compare row's swatch dot)
};

export type PaneInfo = {
  key: string;          // stable pane identity ("__price__" | indicator key) — survives reorder
  paneIndex: number;
  isPrice: boolean;
  top: number;          // px, relative to the chart-wrap
  height: number;
  collapsed: boolean;
  maximized: boolean;
  entries: LegendEntry[];
};

export type OverlayActions = {
  onEye: (key: string) => void;
  onSettings: (key: string) => void;
  onSource: (key: string) => void;
  onRemove: (key: string) => void;
  onMoveUp: (paneIndex: number) => void;
  onMoveDown: (paneIndex: number) => void;
  onCollapse: (paneIndex: number) => void;
  onMaximize: (paneIndex: number) => void;
  canMoveUp: (paneIndex: number) => boolean;
  canMoveDown: (paneIndex: number) => boolean;
};

// B5 icon sizing: width/height removed from inline style so CSS (.lg-ic svg, .po-ic svg) can scale them.
const I = (d: string, sw = 1.7) => (
  <svg viewBox="0 0 24 24" className="lgsvg" style={{ stroke: "currentColor", fill: "none", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round" }}>
    <path d={d} />
  </svg>
);
const EYE = "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z";
const EYE_OFF = "M3 3l18 18M10.6 10.7a2 2 0 0 0 2.8 2.8M9.4 5.2A10.6 10.6 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4M6.1 6.2A18 18 0 0 0 1 12s4 7 11 7a10.6 10.6 0 0 0 3-.4";

// B5: width/height removed from EyeIcon so CSS can scale it per context
function EyeIcon({ off }: { off: boolean }) {
  const base = { stroke: "currentColor", fill: "none", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return off
    ? <svg viewBox="0 0 24 24" className="lgsvg" style={base}><path d={EYE_OFF} /></svg>
    : <svg viewBox="0 0 24 24" className="lgsvg" style={base}><path d={EYE} /><circle cx="12" cy="12" r="3" /></svg>;
}

const ICONS = {
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 6 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 14H4.5a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 6 7.1L5.9 7a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.6V4.5a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9z",
  source: "M8 6l-5 6 5 6M16 6l5 6-5 6",
  remove: "M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  collapse: "M7 4l5 5 5-5M7 20l5-5 5 5",
  maximize: "M4 9V4h5M20 9V4h-5M15 20h5v-5M9 20H4v-5",
};

type MoreState = { key: string; label: string; paneIndex: number; isPane: boolean; hidden: boolean; isCompare: boolean; noParams: boolean; x: number; y: number };

export default function ChartOverlays(props: { panes: PaneInfo[]; hoveredKey: string | null; legendOpen: boolean; onToggleLegend: () => void; coarse?: boolean } & OverlayActions) {
  const coarse = !!props.coarse;
  const [more, setMore] = useState<MoreState | null>(null);
  const [flip, setFlip] = useState<{ key: string; n: number } | null>(null);
  // B5: tap-to-activate pill — activeKey tracks which entry's action pill is shown on coarse
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);
  // bump `n` (a monotonic nonce) so the flipped icon remounts and the CSS animation replays on every click
  const doFlip = (key: string) => setFlip((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  // close desktop More popover on outside click/Escape. NOT on coarse — there the MobileSheet
  // owns dismissal (scrim/swipe/Escape); a window pointerdown listener would unmount the sheet
  // before a row's click can fire.
  useEffect(() => {
    if (!more || coarse) return;
    const close = () => setMore(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMore(null); };
    window.addEventListener("pointerdown", close); window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", onKey); };
  }, [more, coarse]);
  // B5: window pointerdown outside active row clears activeKey
  useEffect(() => {
    if (!coarse || activeKey == null) return;
    const onDown = (e: PointerEvent) => {
      if (activeRowRef.current && activeRowRef.current.contains(e.target as Node)) return;
      setActiveKey(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [coarse, activeKey]);

  const stop = (fn: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); fn(); };
  const openMore = (e: LegendEntry, paneIndex: number, rect: DOMRect) =>
    setMore({ key: e.key, label: e.label, paneIndex, isPane: e.kind === "pane", hidden: e.hidden, isCompare: !!e.isCompare, noParams: !!e.noParams, x: rect.left, y: rect.bottom + 4 });

  // B5: total entries count across all panes (for the count chip)
  const totalEntries = props.panes.reduce((s, p) => s + p.entries.length, 0);

  return (
    <div className="chart-overlays">
      {props.panes.map((p) => {
        const legendTop = p.top + (p.isPrice ? 38 : 9);   // price legend clears the OHLC status line + breathing room
        const primaryKey = p.entries[0]?.key;
        const showOps = !p.isPrice && primaryKey != null;
        // B5: on coarse, pane-ops only visible when collapsed or maximized (restore affordance)
        // a maximized PRICE pane renders a restore-only ops strip (it is reachable via double-click/tap,
        // and without this there is no visible way back — the flattened sub-panes show no ops of their own)
        const priceRestoreOnly = p.isPrice && p.maximized;
        const showPaneOps = priceRestoreOnly || (showOps && (coarse ? (p.collapsed || p.maximized) : (props.hoveredKey === p.key || p.collapsed || p.maximized)));
        // B5: entry row visibility — price pane gated by legendOpen; sub-pane gated by legendOpen on coarse only
        const entriesVisible = p.isPrice ? props.legendOpen : (coarse ? props.legendOpen : true);
        // B5: render the price-pane lg-block even on coarse when it has no entries (so the count chip always shows)
        const showBlock = p.entries.length > 0 || (p.isPrice && coarse);
        return (
          <div key={p.key}>
            {showBlock && (
              <div className="lg-block" style={{ top: legendTop, left: 8 }}>
                {p.entries.map((e) => {
                  const visible = entriesVisible;
                  const isActive = coarse && activeKey === e.key;
                  return (
                    <div
                      key={e.key}
                      ref={isActive ? activeRowRef : undefined}
                      className={`lg-row${e.hidden ? " is-hidden" : ""}${e.isCompare ? " is-cmp" : ""}${isActive ? " is-live" : ""}`}
                      style={visible ? undefined : { display: "none" }}
                    >
                      {e.isCompare && <span className="lg-dot" style={{ background: e.color || "currentColor" }} />}
                      {/* B5: tap name area on coarse → activate pill */}
                      <span
                        className="lg-name"
                        onClick={coarse && !isActive ? (ev) => { ev.stopPropagation(); setActiveKey(e.key); } : undefined}
                      >{e.label}</span>
                      {/* B5 coarse: floating action pill appears on the active row */}
                      {coarse && isActive ? (
                        <span className="lg-menu lg-pill">
                          <button className="lg-ic eye" aria-label={e.hidden ? "Show" : "Hide"} onClick={stop(() => { props.onEye(e.key); setActiveKey(null); })}><EyeIcon off={e.hidden} /></button>
                          {!e.noParams && <button className="lg-ic" aria-label="Settings" onClick={stop(() => { props.onSettings(e.key); setActiveKey(null); })}>{I(ICONS.settings, 1.6)}</button>}
                          <button className="lg-ic" aria-label="Remove" onClick={stop(() => { props.onRemove(e.key); setActiveKey(null); })}>{I(ICONS.remove)}</button>
                          {/* More → MobileSheet on coarse */}
                          <button className="lg-ic" aria-label="More" onClick={stop(() => {
                            setActiveKey(null);
                            setMore({ key: e.key, label: e.label, paneIndex: p.paneIndex, isPane: e.kind === "pane", hidden: e.hidden, isCompare: !!e.isCompare, noParams: !!e.noParams, x: 0, y: 0 });
                          })}>{I(ICONS.more, 2.4)}</button>
                        </span>
                      ) : !coarse ? (
                        <span className="lg-menu">
                          <button className="lg-ic eye" data-tip={e.hidden ? "Show" : "Hide"} onClick={stop(() => props.onEye(e.key))} aria-label={e.hidden ? "Show" : "Hide"}><EyeIcon off={e.hidden} /></button>
                          {!e.noParams && <button className="lg-ic" data-tip="Settings" onClick={stop(() => props.onSettings(e.key))} aria-label="Settings">{I(ICONS.settings, 1.6)}</button>}
                          {!e.isCompare && !e.noParams && <button className="lg-ic" data-tip="Source code" onClick={stop(() => props.onSource(e.key))} aria-label="Source code">{I(ICONS.source)}</button>}
                          <button className="lg-ic" data-tip="Remove" onClick={stop(() => props.onRemove(e.key))} aria-label="Remove">{I(ICONS.remove)}</button>
                          <button className="lg-ic" data-tip="More" onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); openMore(e, p.paneIndex, (ev.currentTarget as HTMLElement).getBoundingClientRect()); }} aria-label="More">{I(ICONS.more, 2.4)}</button>
                        </span>
                      ) : e.hidden ? (
                        // C1 coarse: hidden indicator keeps a persistent crossed-eye in the pill's eye
                        // slot (right after the name) — one tap un-hides without opening the pill
                        <span className="lg-menu">
                          <button className="lg-ic eye" aria-label="Show" onClick={stop(() => props.onEye(e.key))}><EyeIcon off /></button>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                {/* B5: count chip on the collapse button — shows total entry count on coarse */}
                {p.isPrice && (
                  <button className="lg-collapse" title={props.legendOpen ? "Minimize indicator list" : "Show indicator list"} onClick={stop(props.onToggleLegend)}>
                    <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: "currentColor", fill: "none", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", transform: props.legendOpen ? "none" : "rotate(180deg)" }}><path d="M6 15l6-6 6 6" /></svg>
                    {coarse && totalEntries > 0 && <span className="lg-cnt">{totalEntries}</span>}
                  </button>
                )}
              </div>
            )}

            {showPaneOps && (
              <div className="pane-ops" style={{ top: p.top + 3, right: 10 }}>
                {/* on coarse, hide move/remove — only restore affordance (collapse/maximize) */}
                {!coarse && !priceRestoreOnly && <>
                  <button className="po-ic" data-tip="Move pane up" disabled={!props.canMoveUp(p.paneIndex)} onClick={stop(() => { props.onMoveUp(p.paneIndex); doFlip(p.paneIndex + ":up"); })} aria-label="Move pane up">{flip?.key === p.paneIndex + ":up" ? <span key={flip.n} className="po-flip">{I(ICONS.up)}</span> : I(ICONS.up)}</button>
                  <button className="po-ic" data-tip="Move pane down" disabled={!props.canMoveDown(p.paneIndex)} onClick={stop(() => { props.onMoveDown(p.paneIndex); doFlip(p.paneIndex + ":down"); })} aria-label="Move pane down">{flip?.key === p.paneIndex + ":down" ? <span key={flip.n} className="po-flip">{I(ICONS.down)}</span> : I(ICONS.down)}</button>
                  <button className="po-ic" data-tip="Remove" onClick={stop(() => props.onRemove(primaryKey!))} aria-label="Remove">{I(ICONS.remove)}</button>
                </>}
                {!priceRestoreOnly && <button className={`po-ic${p.collapsed ? " on" : ""}`} data-tip={p.collapsed ? "Restore pane" : "Collapse pane"} onClick={stop(() => props.onCollapse(p.paneIndex))} aria-label="Collapse pane">{I(ICONS.collapse)}</button>}
                <button className={`po-ic${p.maximized ? " on" : ""}`} data-tip={p.maximized ? "Restore pane" : "Maximize pane"} onClick={stop(() => props.onMaximize(p.paneIndex))} aria-label="Maximize pane">{I(ICONS.maximize)}</button>
              </div>
            )}
          </div>
        );
      })}

      {/* Desktop More popover */}
      {more && !coarse && (
        <div className="lg-more" style={{ left: more.x, top: more.y }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="lg-more-row" onClick={stop(() => { props.onEye(more.key); setMore(null); })}><span className="mi"><EyeIcon off={more.hidden} /></span>{more.hidden ? "Show" : "Hide"}</div>
          {!more.noParams && <div className="lg-more-row" onClick={stop(() => { props.onSettings(more.key); setMore(null); })}><span className="mi">{I(ICONS.settings, 1.6)}</span>Settings…</div>}
          {!more.isCompare && !more.noParams && <div className="lg-more-row" onClick={stop(() => { props.onSource(more.key); setMore(null); })}><span className="mi">{I(ICONS.source)}</span>Source code…</div>}
          {more.isPane && <>
            <div className="lg-more-sep" />
            <div className={`lg-more-row${props.canMoveUp(more.paneIndex) ? "" : " dis"}`} onClick={stop(() => { if (props.canMoveUp(more.paneIndex)) { props.onMoveUp(more.paneIndex); setMore(null); } })}><span className="mi">{I(ICONS.up)}</span>Move pane up</div>
            <div className={`lg-more-row${props.canMoveDown(more.paneIndex) ? "" : " dis"}`} onClick={stop(() => { if (props.canMoveDown(more.paneIndex)) { props.onMoveDown(more.paneIndex); setMore(null); } })}><span className="mi">{I(ICONS.down)}</span>Move pane down</div>
            <div className="lg-more-row" onClick={stop(() => { props.onCollapse(more.paneIndex); setMore(null); })}><span className="mi">{I(ICONS.collapse)}</span>Collapse pane</div>
            <div className="lg-more-row" onClick={stop(() => { props.onMaximize(more.paneIndex); setMore(null); })}><span className="mi">{I(ICONS.maximize)}</span>Maximize pane</div>
          </>}
          <div className="lg-more-sep" />
          <div className="lg-more-row danger" onClick={stop(() => { props.onRemove(more.key); setMore(null); })}><span className="mi">{I(ICONS.remove)}</span>Remove</div>
        </div>
      )}

      {/* B5: coarse More → MobileSheet */}
      {more && coarse && (
        <MobileSheet open={true} onClose={() => setMore(null)} title={more.label}>
          <div className="msheet-row" onClick={() => { props.onEye(more.key); setMore(null); }}><span className="mi"><EyeIcon off={more.hidden} /></span>{more.hidden ? "Show" : "Hide"}</div>
          {!more.noParams && <div className="msheet-row" onClick={() => { props.onSettings(more.key); setMore(null); }}><span className="mi">{I(ICONS.settings, 1.6)}</span>Settings…</div>}
          {!more.isCompare && !more.noParams && <div className="msheet-row" onClick={() => { props.onSource(more.key); setMore(null); }}><span className="mi">{I(ICONS.source)}</span>Source code…</div>}
          {more.isPane && <>
            <div className="msheet-sep" />
            <div className={`msheet-row${props.canMoveUp(more.paneIndex) ? "" : " dis"}`} onClick={() => { if (props.canMoveUp(more.paneIndex)) { props.onMoveUp(more.paneIndex); setMore(null); } }}><span className="mi">{I(ICONS.up)}</span>Move pane up</div>
            <div className={`msheet-row${props.canMoveDown(more.paneIndex) ? "" : " dis"}`} onClick={() => { if (props.canMoveDown(more.paneIndex)) { props.onMoveDown(more.paneIndex); setMore(null); } }}><span className="mi">{I(ICONS.down)}</span>Move pane down</div>
            <div className="msheet-row" onClick={() => { props.onCollapse(more.paneIndex); setMore(null); }}><span className="mi">{I(ICONS.collapse)}</span>Collapse pane</div>
            <div className="msheet-row" onClick={() => { props.onMaximize(more.paneIndex); setMore(null); }}><span className="mi">{I(ICONS.maximize)}</span>Maximize pane</div>
          </>}
          <div className="msheet-sep" />
          <div className="msheet-row danger" onClick={() => { props.onRemove(more.key); setMore(null); }}><span className="mi">{I(ICONS.remove)}</span>Remove</div>
        </MobileSheet>
      )}
    </div>
  );
}
