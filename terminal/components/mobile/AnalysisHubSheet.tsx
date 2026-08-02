"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";

export type HubAction = "indicators" | "compare" | "alerts" | "symbolDetails";

export type AnalysisHubSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Real tiles only; ghosts never call out. */
  onAction: (action: HubAction) => void;
};

type Tile = {
  id: string;
  labelKey: string;
  path: string;
  action?: HubAction;
};

// TV's hub (IMG_2351/2352) is two banded sections of icon tiles. Ours carries only what the web
// really does — Indicators, Compare, Alerts and Symbol details — plus honestly-marked ghosts for
// the surfaces this alpha does not ship. There is deliberately no broker CTA anywhere.
const TOOL_TILES: readonly Tile[] = [
  { id: "indicators", labelKey: "indicators", path: "M5 12h14M12 5v14", action: "indicators" },
  { id: "compare", labelKey: "compare", path: "M4 18l5-9 4 5 3-4 4 8", action: "compare" },
  { id: "alerts", labelKey: "alerts", path: "M18 15V10a6 6 0 1 0-12 0v5l-2 3h16zM10 21h4", action: "alerts" },
  { id: "chartType", labelKey: "hubChartType", path: "M6 6v12M6 8h4M6 14h4M15 4v16M15 7h4M15 16h4" },
  { id: "objectTree", labelKey: "hubObjectTree", path: "M4 6h16M8 12h12M12 18h8" },
  { id: "templates", labelKey: "hubTemplates", path: "M4 5h16v14H4zM4 9h16M9 9v10" },
];

const INFO_TILES: readonly Tile[] = [
  { id: "symbolDetails", labelKey: "hubSymbolDetails", path: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 11v6M12 7.5h.01", action: "symbolDetails" },
];

const HALF = 0.6;
const FULL = 0.96;

/**
 * The phone Analysis hub — the ••• of the roller strip. Presents at 60% of the viewport and DRAGS
 * to full (and back), matching the native hub's detents; the body scrolls once it is at full.
 * The drag below is the twin of MobileSheet's `detents` prop, kept here rather than shared because
 * this surface has its own scrim, markup and focus model — change one and check the other.
 */
export default function AnalysisHubSheet({ open, onClose, onAction }: AnalysisHubSheetProps) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [full, setFull] = useState(false);
  const [dragH, setDragH] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // liveH mirrors dragH: the release handler must read the height the last MOVE produced, and a
  // burst of pointer events inside one task would leave the state value a render behind.
  const drag = useRef<{ startY: number; startH: number; id: number | null; liveH: number | null }>(
    { startY: 0, startH: 0, id: null, liveH: null },
  );
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Each presentation starts at the 60% detent (React's adjust-state-on-prop-change pattern).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) { setFull(false); setDragH(null); }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); } };
    document.addEventListener("keydown", onKey, true);
    const focus = window.requestAnimationFrame(() => sheetRef.current?.focus({ preventScroll: true }));
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey, true);
      window.cancelAnimationFrame(focus);
    };
  }, [open]);

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (!sheet || !event.isPrimary) return;
    const target = event.target as HTMLElement;
    const fromGrip = !!target.closest?.('[data-handle="1"]');
    const body = sheet.querySelector<HTMLElement>(".mhub-body");
    // Anywhere on the grabber/header, or on the body while it is scrolled to the top.
    if (!fromGrip && (!body || body.scrollTop > 0 || target.closest?.("button, a[href], input"))) return;
    drag.current = {
      startY: event.clientY,
      startH: sheet.getBoundingClientRect().height,
      id: event.pointerId,
      liveH: null,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* gesture arbitration */ }
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current.id !== event.pointerId) return;
    const max = window.innerHeight * FULL;
    const height = Math.min(max, Math.max(80, drag.current.startH - (event.clientY - drag.current.startY)));
    drag.current.liveH = height;
    setDragH(height);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current.id !== event.pointerId) return;
    drag.current.id = null;
    const height = drag.current.liveH;
    drag.current.liveH = null;
    setDragH(null);
    if (height == null) return;
    const half = window.innerHeight * HALF;
    const upperBand = (half + window.innerHeight * FULL) / 2;
    if (height >= upperBand) setFull(true);
    else if (height < half - 90) onCloseRef.current();
    else setFull(false);
  }

  if (!mounted || !open) return null;

  const tile = (entry: Tile) => (
    <button
      key={entry.id}
      className={`mhub-tile${entry.action ? "" : " ghost"}`}
      data-testid={`hub-tile-${entry.id}`}
      aria-disabled={entry.action ? undefined : true}
      onClick={() => { if (entry.action) onAction(entry.action); }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={entry.path} /></svg>
      <span>{t(entry.labelKey)}</span>
      {!entry.action && <i className="mhub-ghost-tag">{t("hubSoon")}</i>}
    </button>
  );

  return createPortal(
    <>
      <div className={`mhub-scrim${full ? " at-full" : ""}`} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`mhub${full ? " is-full" : ""}${dragH != null ? " is-dragging" : ""}`}
        style={{ height: dragH != null ? `${dragH}px` : `${(full ? FULL : HALF) * 100}dvh` }}
        role="dialog"
        aria-modal="true"
        aria-label={t("hubTitle")}
        tabIndex={-1}
        data-testid="analysis-hub"
        data-detent={full ? "full" : "half"}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="mhub-grip" data-handle="1"><span /></div>
        <div className="mhub-hd" data-handle="1">
          <b>{t("hubTitle")}</b>
          <button className="mhub-close" onClick={onClose} aria-label={t("sheetClose")}>
            <svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg>
          </button>
        </div>
        <div className="mhub-body">
          <div className="mhub-ghd">{t("hubTools")}</div>
          <div className="mhub-grid">{TOOL_TILES.map(tile)}</div>
          <div className="mhub-ghd">{t("hubInfo")}</div>
          <div className="mhub-grid">{INFO_TILES.map(tile)}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}
