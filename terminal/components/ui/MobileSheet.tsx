"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  ariaLabel?: string;
  children: React.ReactNode;
  maxHeight?: string;
  /** Extra class on the sheet root, for surfaces with their own anatomy (e.g. the Drawings sheet). */
  className?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const SWIPE_TRANSITION = "transform 260ms cubic-bezier(.32,.72,.24,1)";
const SWIPE_CLOSE_MS = 270;

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (
      element.hidden
      || element.getAttribute("aria-disabled") === "true"
      || element.closest("[aria-hidden='true'], [inert]")
      || element.tabIndex < 0
    ) {
      return false;
    }
    return element.getClientRects().length > 0;
  });
}

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined"
    && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function reducedMotionServerSnapshot(): boolean {
  return false;
}

export default function MobileSheet({
  open,
  onClose,
  title,
  ariaLabel,
  children,
  maxHeight,
  className,
}: MobileSheetProps) {
  // Track mount so createPortal only fires client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const mountFrame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(mountFrame);
  }, []);

  // Swipe-to-dismiss state
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startY: number;
    startT: number;
    captured: boolean;
    pointerId: number | null;
  }>({ startY: 0, startT: 0, captured: false, pointerId: null });
  const closeTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const hasTitle = Boolean(title);
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotionPreferred,
    reducedMotionServerSnapshot,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (open || closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Move focus into the modal, contain keyboard navigation, and return focus to
  // the element that opened it. Keep the latest onClose in a ref so inline
  // callbacks do not tear down and recreate the focus boundary every render.
  useEffect(() => {
    if (!open || !mounted) return;
    const sheet = sheetRef.current;
    if (!sheet) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = sheet.querySelector<HTMLElement>("[data-autofocus], [autofocus]")
        ?? focusableElements(sheet)[0]
        ?? sheet;
      initialFocus.focus({ preventScroll: true });
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(sheet);
      if (focusable.length === 0) {
        event.preventDefault();
        sheet.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusEscaped = !(active instanceof Node) || !sheet.contains(active);

      if (active === sheet || focusEscaped) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mounted, open]);

  function clearCloseTimer() {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function closeNow() {
    clearCloseTimer();
    onCloseRef.current();
  }

  function releasePointer(pointerId: number) {
    const sheet = sheetRef.current;
    if (!sheet) return;
    try {
      if (sheet.hasPointerCapture(pointerId)) sheet.releasePointerCapture(pointerId);
    } catch {
      // A native gesture may already have taken ownership of this pointer.
    }
  }

  function resetDrag(pointerId?: number) {
    const drag = dragRef.current;
    if (pointerId !== undefined && drag.pointerId !== pointerId) return;
    const capturedPointer = drag.pointerId;
    drag.captured = false;
    drag.pointerId = null;
    if (capturedPointer !== null) releasePointer(capturedPointer);

    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = reduceMotion ? "none" : SWIPE_TRANSITION;
    sheet.style.transform = "";
    if (reduceMotion) {
      window.requestAnimationFrame(() => {
        if (sheetRef.current === sheet && !dragRef.current.captured) {
          sheet.style.transition = "";
        }
      });
    }
  }

  // Pointer-based swipe dismiss on handle/header and content (when scrollTop===0).
  // Handlers live on the sheet root only — the handle is detected via closest() so a drag
  // never runs two handler chains (the handle-wrap has no handlers of its own).
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const sheet = sheetRef.current;
    if (!sheet || !e.isPrimary || closeTimerRef.current !== null) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Only drag from handle/header or when content is scrolled to top
    const target = e.target as HTMLElement;
    const isHandle = !!target.closest?.('[data-handle="1"]');
    const scrollEl = sheet.querySelector<HTMLElement>(".msheet-body");
    const atTop = !scrollEl || scrollEl.scrollTop === 0;
    if (!isHandle && !atTop) return;
    // Capturing on pointerdown retargets pointerup/click to the sheet in WebKit.
    // Leave interactive content alone so chart-type rows and other sheet
    // controls receive a complete click; swipe remains available from the
    // handle, header/background, and non-interactive content.
    if (!isHandle && target.closest?.(
      "button, a[href], input, select, textarea, label, summary, [role='button'], [role='option'], [role='menuitem'], .msheet-row, [data-no-sheet-drag]",
    )) return;
    dragRef.current = {
      startY: e.clientY,
      startT: Date.now(),
      captured: true,
      pointerId: e.pointerId,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic events and browser gesture arbitration may deny capture.
    }
    sheet.style.transition = "none";
  }

  // Gesture arbitration (pinch, native scroll takeover) fires pointercancel — spring back cleanly.
  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.captured) return;
    resetDrag(e.pointerId);
  }

  function onLostPointerCapture(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.captured || dragRef.current.pointerId !== e.pointerId) return;
    resetDrag(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.captured || dragRef.current.pointerId !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.captured || dragRef.current.pointerId !== e.pointerId) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const dy = Math.max(0, e.clientY - dragRef.current.startY);
    const dt = Date.now() - dragRef.current.startT;
    const fastFlick = dt < 250 && dy > 30;
    dragRef.current.captured = false;
    dragRef.current.pointerId = null;
    releasePointer(e.pointerId);

    if (dy > 90 || fastFlick) {
      if (reduceMotion) {
        sheet.style.transition = "none";
        closeNow();
        return;
      }
      // Animate out, then remove the modal at the matching bounded duration.
      sheet.style.transition = SWIPE_TRANSITION;
      sheet.style.transform = "translateY(100%)";
      closeTimerRef.current = window.setTimeout(closeNow, SWIPE_CLOSE_MS);
    } else {
      // spring back
      resetDrag();
    }
  }

  if (!mounted) return null;

  const node = (
    <>
      {open && (
        <div
          className="msheet-scrim"
          style={reduceMotion ? { animation: "none" } : undefined}
          onClick={closeNow}
          aria-hidden="true"
        />
      )}
      {open && (
        <div
          ref={sheetRef}
          className={className ? `msheet ${className}` : "msheet"}
          style={{
            ...(maxHeight ? { maxHeight } : {}),
            ...(reduceMotion ? { animation: "none" } : {}),
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={hasTitle ? titleId : undefined}
          aria-label={hasTitle ? undefined : (ariaLabel ?? "Sheet")}
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onLostPointerCapture}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Grab handle — drag target (detected via data-handle in the sheet's own handlers) */}
          <div className="msheet-handle-wrap" data-handle="1">
            <div className="msheet-handle" />
          </div>
          {hasTitle && <div id={titleId} className="msheet-title">{title}</div>}
          <div className="msheet-body">{children}</div>
        </div>
      )}
    </>
  );

  return createPortal(node, document.body);
}
