"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
}

export default function MobileSheet({ open, onClose, title, children, maxHeight }: MobileSheetProps) {
  // Track mount so createPortal only fires client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Swipe-to-dismiss state
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startT: number; captured: boolean }>({ startY: 0, startT: 0, captured: false });

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // Pointer-based swipe dismiss on handle/header and content (when scrollTop===0).
  // Handlers live on the sheet root only — the handle is detected via closest() so a drag
  // never runs two handler chains (the handle-wrap has no handlers of its own).
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    // Only drag from handle/header or when content is scrolled to top
    const isHandle = !!(e.target as HTMLElement).closest?.('[data-handle="1"]');
    const scrollEl = sheet.querySelector<HTMLElement>(".msheet-body");
    const atTop = !scrollEl || scrollEl.scrollTop === 0;
    if (!isHandle && !atTop) return;
    dragRef.current = { startY: e.clientY, startT: Date.now(), captured: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sheet.style.transition = "none";
  }

  // Gesture arbitration (pinch, native scroll takeover) fires pointercancel — spring back cleanly.
  function onPointerCancel() {
    if (!dragRef.current.captured) return;
    dragRef.current.captured = false;
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = "";
    sheet.style.transform = "";
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.captured) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.captured) return;
    dragRef.current.captured = false;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    const dt = Date.now() - dragRef.current.startT;
    const fastFlick = dt < 250 && dy > 30;
    sheet.style.transition = "";
    if (dy > 90 || fastFlick) {
      // animate out then close
      sheet.style.transform = "translateY(100%)";
      setTimeout(onClose, 270);
    } else {
      // spring back
      sheet.style.transform = "";
    }
  }

  if (!mounted) return null;

  const node = (
    <>
      {open && (
        <div
          className="msheet-scrim"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {open && (
        <div
          ref={sheetRef}
          className="msheet"
          style={maxHeight ? { maxHeight } : undefined}
          role="dialog"
          aria-modal="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Grab handle — drag target (detected via data-handle in the sheet's own handlers) */}
          <div className="msheet-handle-wrap" data-handle="1">
            <div className="msheet-handle" />
          </div>
          {title && <div className="msheet-title">{title}</div>}
          <div className="msheet-body">{children}</div>
        </div>
      )}
    </>
  );

  return createPortal(node, document.body);
}
