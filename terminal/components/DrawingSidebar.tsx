"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { Tip } from "@/components/ui/Tip";
import {
  DRAWING_TOOL_GROUPS,
  getDrawingTool,
  type DrawingToolDefinition,
  type DrawingToolGroupId,
} from "@/lib/drawingTools";
import type { Dash, DrawKind } from "@/lib/drawings";
import { useT } from "@/lib/i18n";
import { useIsMobile } from "@/lib/useMediaQuery";

export type DrawingMagnetMode = "off" | "weak" | "strong";
export type DrawingClearScope = "user" | "detected" | "all";
export type DrawingStyle = { color: string; width: number; dash: Dash };

export type DrawingSidebarProps = {
  tool: DrawKind | null;
  magnet: DrawingMagnetMode;
  sticky: boolean;
  drawingsVisible: boolean;
  drawingCount: number;
  canUndo: boolean;
  canRedo: boolean;
  drawStyle: DrawingStyle;
  onTool: (id: DrawKind | null) => void;
  onMagnet: (mode: DrawingMagnetMode) => void;
  onSticky: (sticky: boolean) => void;
  onToggleVisibility: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: (scope: DrawingClearScope) => void;
  onDrawStyle: (patch: Partial<DrawingStyle>) => void;
};

type MenuId = DrawingToolGroupId | "style" | "magnet" | "clear";
type MenuPhase = "open" | "closing";

const STYLE_COLORS = ["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#d6dae3"] as const;
const STYLE_WIDTHS = [1.5, 2.5, 4] as const;
const STYLE_DASHES = ["solid", "dashed", "dotted"] as const satisfies readonly Dash[];
const MENU_HOVER_OPEN_MS = 200;
const MENU_LEAVE_CLOSE_MS = 150;
const MENU_FADE_MS = 150;
const DASH_LABEL_KEYS: Record<Dash, string> = {
  solid: "drawingDashSolid",
  dashed: "drawingDashDashed",
  dotted: "drawingDashDotted",
};
const MAGNET_OPTIONS = [
  { id: "off", labelKey: "drawingMagnetOff" },
  { id: "weak", labelKey: "drawingMagnetWeak" },
  { id: "strong", labelKey: "drawingMagnetStrong" },
] as const satisfies readonly { id: DrawingMagnetMode; labelKey: string }[];

const ICON_CURSOR = "M5 3l14 9-7 2-4 7z";
const ICON_MAGNET = "M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4z";
const ICON_STICKY = "M4 20l4-1 11-11-3-3L5 16l-1 4zM14 7l3 3";
const ICON_UNDO = "M9 7L4 12l5 5M5 12h8a6 6 0 0 1 6 6";
const ICON_REDO = "M15 7l5 5-5 5M19 12h-8a6 6 0 0 0-6 6";
const ICON_STYLE = "M4 19h16M6 15h12M8 11h8M10 7h4";
const ICON_EYE = "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const ICON_EYE_OFF = "M3 3l18 18M10.7 6.1A11.8 11.8 0 0 1 12 6c6.5 0 10 6 10 6a15 15 0 0 1-2.4 3.2M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6c1.1 0 2.1-.2 3-.5M9.9 9.9a3 3 0 0 0 4.2 4.2";
const ICON_TRASH = "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6";

function ToolIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function initialLastUsed(): Partial<Record<DrawingToolGroupId, DrawKind>> {
  const result: Partial<Record<DrawingToolGroupId, DrawKind>> = {};
  for (const group of DRAWING_TOOL_GROUPS) result[group.id] = group.tools[0].id;
  return result;
}

type Translate = (key: string, fallback?: string) => string;

function interpolate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function toolLabel(tool: DrawingToolDefinition, t: Translate): string {
  return t(tool.labelKey, tool.label);
}

function countLabel(count: number, t: Translate): string {
  return interpolate(t(count === 1 ? "drawingCountOne" : "drawingCountMany"), { n: count });
}

export default function DrawingSidebar({
  tool,
  magnet,
  sticky,
  drawingsVisible,
  drawingCount,
  canUndo,
  canRedo,
  drawStyle,
  onTool,
  onMagnet,
  onSticky,
  onToggleVisibility,
  onUndo,
  onRedo,
  onClear,
  onDrawStyle,
}: DrawingSidebarProps) {
  const t = useT();
  const isMobile = useIsMobile();
  const instanceId = useId().replaceAll(":", "");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpenerRef = useRef<HTMLButtonElement | null>(null);
  const toolChoiceTimerRef = useRef<number | null>(null);
  const hoverOpenTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const closeAnimationTimerRef = useRef<number | null>(null);
  const menuOpenedAtRef = useRef(0);
  const focusMenuRef = useRef(false);
  const focusAfterCloseRef = useRef<string | null>(null);
  const previousMobileRef = useRef(isMobile);
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [menuPhase, setMenuPhase] = useState<MenuPhase>("open");
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [floatingHost, setFloatingHost] = useState<HTMLElement | null>(null);
  const [lastUsed, setLastUsed] = useState<Partial<Record<DrawingToolGroupId, DrawKind>>>(initialLastUsed);
  const selectedTool = getDrawingTool(tool);

  const menuDomId = (menu: MenuId) => `${instanceId}-drawing-menu-${menu}`;

  const clearMenuTimers = useCallback(() => {
    if (hoverOpenTimerRef.current !== null) window.clearTimeout(hoverOpenTimerRef.current);
    if (hoverCloseTimerRef.current !== null) window.clearTimeout(hoverCloseTimerRef.current);
    if (closeAnimationTimerRef.current !== null) window.clearTimeout(closeAnimationTimerRef.current);
    hoverOpenTimerRef.current = null;
    hoverCloseTimerRef.current = null;
    closeAnimationTimerRef.current = null;
  }, []);

  const focusToolbarControl = useCallback((preferred: HTMLButtonElement | null) => {
    const preferredTestId = preferred?.getAttribute("data-testid");
    window.requestAnimationFrame(() => {
      const replacement = preferredTestId
        ? Array.from(
            sidebarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
          ).find((button) => button.getAttribute("data-testid") === preferredTestId)
        : null;
      const fallback = sidebarRef.current?.querySelector<HTMLButtonElement>(
        '.ds-group-main[aria-pressed="true"]',
      ) ?? sidebarRef.current?.querySelector<HTMLButtonElement>('[data-testid="drawing-tool-cursor"]');
      const target = preferred?.isConnected ? preferred : replacement ?? fallback;
      target?.focus({ preventScroll: true });
    });
  }, []);

  const dismissMenu = useCallback((restoreFocus: boolean) => {
    clearMenuTimers();
    const opener = menuOpenerRef.current;
    setOpenMenu(null);
    setMenuPhase("open");
    if (!restoreFocus || !opener) return;
    focusToolbarControl(opener);
  }, [clearMenuTimers, focusToolbarControl]);
  const captureSidebar = useCallback((node: HTMLDivElement | null) => {
    sidebarRef.current = node;
    setFloatingHost(node?.parentElement ?? null);
  }, []);

  useEffect(() => {
    if (!openMenu) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (sidebarRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      menuOpenerRef.current = null;
      dismissMenu(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismissMenu(true);
    };

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [dismissMenu, openMenu]);

  // A menu may move between inline and portalled DOM when the responsive mode
  // changes. Close that transient surface and return focus to its logical toolbar
  // control instead of letting the browser drop focus onto <body> during reparenting.
  useLayoutEffect(() => {
    if (previousMobileRef.current === isMobile) return;
    previousMobileRef.current = isMobile;
    if (!openMenu) return;
    const opener = menuOpenerRef.current;
    clearMenuTimers();
    focusMenuRef.current = false;
    focusAfterCloseRef.current = null;
    menuOpenerRef.current = null;
    let closeFrame = window.requestAnimationFrame(() => {
      closeFrame = 0;
      setMenuPosition(null);
      setOpenMenu(null);
      setMenuPhase("open");
      focusToolbarControl(opener);
    });
    return () => {
      if (closeFrame) window.cancelAnimationFrame(closeFrame);
    };
  }, [clearMenuTimers, focusToolbarControl, isMobile, openMenu]);

  useEffect(() => {
    if (!openMenu || !focusMenuRef.current) return;
    focusMenuRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      // Pointer and automation users can focus a specific row before this
      // deferred initial-focus frame runs. Preserve that deliberate target.
      if (menuRef.current?.contains(document.activeElement)) return;
      const checkedItem = menuRef.current?.querySelector<HTMLButtonElement>(
        'button[role="menuitemradio"][aria-checked="true"]',
      );
      const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
        'button[role="menuitemradio"]:not(:disabled), button[role="menuitem"]:not(:disabled)',
      );
      (checkedItem ?? firstItem)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, openMenu]);

  useLayoutEffect(() => {
    if (openMenu || !focusAfterCloseRef.current) return;
    const testId = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    const target = Array.from(
      sidebarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    ).find((button) => button.getAttribute("data-testid") === testId);
    target?.focus({ preventScroll: true });
  }, [openMenu]);

  useEffect(() => () => {
    if (toolChoiceTimerRef.current !== null) window.clearTimeout(toolChoiceTimerRef.current);
    clearMenuTimers();
  }, [clearMenuTimers]);

  // Fixed descendants (the selected-drawing settings surface on compact layouts)
  // need the chart's viewport gaps to stay chart-local. Publishing these measured
  // values on the shared chart host also makes landscape safe-area clamping
  // deterministic without coupling the chart renderer to the responsive shell.
  useLayoutEffect(() => {
    if (!floatingHost) return;
    let syncFrame = 0;
    const syncHostMetrics = () => {
      const rect = floatingHost.getBoundingClientRect();
      floatingHost.style.setProperty("--drawing-host-left-gap", `${Math.max(0, rect.left)}px`);
      floatingHost.style.setProperty("--drawing-host-right-gap", `${Math.max(0, window.innerWidth - rect.right)}px`);
      floatingHost.style.setProperty("--drawing-host-bottom-gap", `${Math.max(0, window.innerHeight - rect.bottom)}px`);
      floatingHost.style.setProperty("--drawing-host-height", `${Math.max(0, rect.height)}px`);
    };
    const scheduleHostMetrics = () => {
      if (syncFrame) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        syncHostMetrics();
      });
    };
    syncHostMetrics();
    const resizeObserver = new ResizeObserver(scheduleHostMetrics);
    resizeObserver.observe(floatingHost);
    window.addEventListener("resize", scheduleHostMetrics);
    window.visualViewport?.addEventListener("resize", scheduleHostMetrics);
    window.visualViewport?.addEventListener("scroll", scheduleHostMetrics);
    document.addEventListener("scroll", scheduleHostMetrics, true);
    return () => {
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleHostMetrics);
      window.visualViewport?.removeEventListener("resize", scheduleHostMetrics);
      window.visualViewport?.removeEventListener("scroll", scheduleHostMetrics);
      document.removeEventListener("scroll", scheduleHostMetrics, true);
      floatingHost.style.removeProperty("--drawing-host-left-gap");
      floatingHost.style.removeProperty("--drawing-host-right-gap");
      floatingHost.style.removeProperty("--drawing-host-bottom-gap");
      floatingHost.style.removeProperty("--drawing-host-height");
    };
  }, [floatingHost]);

  const openMenuNow = useCallback((menu: MenuId, opener: HTMLButtonElement, focusMenu: boolean) => {
    clearMenuTimers();
    // A flyout and the selected-object inspector are alternative editing
    // contexts, especially on mobile where they share the bottom control lane.
    window.dispatchEvent(new CustomEvent("mm:drawing-dismiss-selection"));
    menuOpenerRef.current = opener;
    focusMenuRef.current = focusMenu;
    menuOpenedAtRef.current = performance.now();
    setMenuPosition(null);
    setMenuPhase("open");
    setOpenMenu(menu);
  }, [clearMenuTimers]);

  useLayoutEffect(() => {
    if (!openMenu || isMobile || !floatingHost || !menuRef.current || !menuOpenerRef.current) return;
    const menuElement = menuRef.current;
    const opener = menuOpenerRef.current;
    const place = () => {
      const host = floatingHost.getBoundingClientRect();
      const anchor = opener.getBoundingClientRect();
      // Percentage max-height is unreliable here because `.chart-body` participates
      // in an auto-height flex layout. Pin the portal surface to the chart's measured
      // inner height before reading its geometry so even the 17-item menus clamp.
      menuElement.style.maxHeight = `${Math.max(0, host.height - 16)}px`;
      // offset* reports the stable layout box; getBoundingClientRect() is briefly
      // smaller while the 150ms scale-in animation runs and would under-clamp.
      const menu = { width: menuElement.offsetWidth, height: menuElement.offsetHeight };
      const edge = 8;
      const gap = 8;
      let left = anchor.right - host.left + gap;
      if (left + menu.width > host.width - edge) left = anchor.left - host.left - menu.width - gap;
      left = Math.max(edge, Math.min(host.width - menu.width - edge, left));
      const alignBottom = openMenu === "magnet" || openMenu === "clear";
      let top = alignBottom
        ? anchor.bottom - host.top - menu.height
        : anchor.top - host.top;
      top = Math.max(edge, Math.min(host.height - menu.height - edge, top));
      const next = { left: Math.round(left), top: Math.round(top) };
      setMenuPosition((current) => (
        current?.left === next.left && current.top === next.top ? current : next
      ));
    };
    place();
    // The portalled menu's sticky headings/scroll box settle after the first
    // layout pass. Re-place across two frames so its final (untransformed)
    // height—not the entrance-animation frame—drives collision clamping.
    let settleFrame = window.requestAnimationFrame(() => {
      place();
      settleFrame = window.requestAnimationFrame(place);
    });
    const resizeObserver = new ResizeObserver(place);
    resizeObserver.observe(floatingHost);
    resizeObserver.observe(menuElement);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.cancelAnimationFrame(settleFrame);
      menuElement.style.maxHeight = "";
      resizeObserver.disconnect();
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [floatingHost, isMobile, openMenu]);

  const cancelMenuClose = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) window.clearTimeout(hoverCloseTimerRef.current);
    if (closeAnimationTimerRef.current !== null) window.clearTimeout(closeAnimationTimerRef.current);
    hoverCloseTimerRef.current = null;
    closeAnimationTimerRef.current = null;
    setMenuPhase("open");
  }, []);

  const scheduleMenuClose = useCallback(() => {
    if (!openMenu) return;
    if (hoverCloseTimerRef.current !== null) window.clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = window.setTimeout(() => {
      hoverCloseTimerRef.current = null;
      const restoreFocus = menuRef.current?.contains(document.activeElement) === true;
      const opener = menuOpenerRef.current;
      // Commit the fade state before its removal clock begins. Under a busy
      // concurrent render, an ordinary state update can otherwise land late and
      // visually collapse a nominal 150ms fade into only a few frames.
      flushSync(() => setMenuPhase("closing"));
      closeAnimationTimerRef.current = window.setTimeout(() => {
        closeAnimationTimerRef.current = null;
        menuOpenerRef.current = null;
        setOpenMenu(null);
        setMenuPhase("open");
        if (restoreFocus) focusToolbarControl(opener);
      }, MENU_FADE_MS);
    }, MENU_LEAVE_CLOSE_MS);
  }, [focusToolbarControl, openMenu]);

  const handlePointerLeave = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (isMobile || event.pointerType === "touch") return;
    if (hoverOpenTimerRef.current !== null) {
      window.clearTimeout(hoverOpenTimerRef.current);
      hoverOpenTimerRef.current = null;
    }
    scheduleMenuClose();
  }, [isMobile, scheduleMenuClose]);

  const scheduleGroupOpen = useCallback((
    menu: DrawingToolGroupId,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (isMobile || event.pointerType === "touch") return;
    const opener = event.currentTarget;
    if (openMenu === menu) {
      cancelMenuClose();
      return;
    }
    clearMenuTimers();
    hoverOpenTimerRef.current = window.setTimeout(() => {
      hoverOpenTimerRef.current = null;
      openMenuNow(menu, opener, false);
    }, MENU_HOVER_OPEN_MS);
  }, [cancelMenuClose, clearMenuTimers, isMobile, openMenu, openMenuNow]);

  function toggleMenu(menu: MenuId, event: ReactMouseEvent<HTMLButtonElement>) {
    if (openMenu === menu) {
      if (performance.now() - menuOpenedAtRef.current < 400) {
        cancelMenuClose();
        return;
      }
      dismissMenu(true);
      return;
    }
    openMenuNow(menu, event.currentTarget, true);
  }

  function activateTool(nextTool: DrawingToolDefinition, pin?: boolean) {
    const registered = getDrawingTool(nextTool.id);
    if (!registered) return;
    setLastUsed((current) => (
      current[registered.groupId] === registered.id
        ? current
        : { ...current, [registered.groupId]: registered.id }
    ));
    onTool(registered.id);
    if (pin !== undefined) onSticky(pin);
  }

  function chooseTool(nextTool: DrawingToolDefinition, pin = false) {
    activateTool(nextTool, pin);
    dismissMenu(true);
  }

  function chooseToolFromMenu(nextTool: DrawingToolDefinition, event: ReactMouseEvent<HTMLButtonElement>) {
    // Keep the menu mounted across the browser's two click events so a true
    // double-click can pin any submenu tool. Keyboard activation has detail 0
    // and remains immediate; a normal pointer click pays only a short 180ms
    // disambiguation window.
    if (event.detail === 0) { chooseTool(nextTool); return; }
    if (event.detail > 1) {
      if (toolChoiceTimerRef.current !== null) window.clearTimeout(toolChoiceTimerRef.current);
      toolChoiceTimerRef.current = null;
      chooseTool(nextTool, true);
      return;
    }
    if (toolChoiceTimerRef.current !== null) window.clearTimeout(toolChoiceTimerRef.current);
    toolChoiceTimerRef.current = window.setTimeout(() => {
      toolChoiceTimerRef.current = null;
      chooseTool(nextTool);
    }, 180);
  }

  function chooseMagnet(mode: DrawingMagnetMode) {
    onMagnet(mode);
    dismissMenu(true);
  }

  function chooseClear(scope: DrawingClearScope) {
    onClear(scope);
    dismissMenu(true);
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      event.preventDefault();
      const toolbarButtons = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
      );
      const openerIndex = menuOpenerRef.current ? toolbarButtons.indexOf(menuOpenerRef.current) : -1;
      const direction = event.shiftKey ? -1 : 1;
      const nextIndex = openerIndex < 0
        ? 0
        : (openerIndex + direction + toolbarButtons.length) % toolbarButtons.length;
      const next = toolbarButtons[nextIndex];
      const nextTestId = next?.getAttribute("data-testid");
      focusAfterCloseRef.current = nextTestId ?? null;
      dismissMenu(false);
      if (!nextTestId) window.requestAnimationFrame(() => next?.focus({ preventScroll: true }));
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"], button[role="menuitemradio"]',
      ),
    ).filter((item) => !item.disabled);
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    else if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    else if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;

    event.preventDefault();
    items[nextIndex]?.focus({ preventScroll: true });
  }

  const supportsColor = selectedTool?.capabilities.some((capability) => capability === "stroke" || capability === "fill") ?? false;
  const supportsWidth = selectedTool?.capabilities.includes("width") ?? false;
  const supportsDash = selectedTool?.capabilities.includes("dash") ?? false;
  const showStyle = Boolean(selectedTool && (supportsColor || supportsWidth || supportsDash));
  const magnetOption = MAGNET_OPTIONS.find((option) => option.id === magnet);
  const magnetLabel = magnetOption ? t(magnetOption.labelKey) : magnet;
  const localizedDrawingCount = countLabel(drawingCount, t);
  const floatingMobile = (node: ReactNode) => (
    isMobile && floatingHost ? createPortal(node, floatingHost) : node
  );
  const floatingFlyout = (node: ReactNode) => (
    floatingHost ? createPortal(node, floatingHost) : node
  );
  const floatingFlyoutClass = !isMobile && floatingHost ? " ds-floating-popover" : "";
  const floatingFlyoutStyle = !isMobile && floatingHost && menuPosition
    ? ({ left: menuPosition.left, top: menuPosition.top } satisfies CSSProperties)
    : undefined;
  const labeled = (
    button: ReactElement,
    label: string,
    options: { shortcut?: string; hint?: string; side?: "top" | "right"; key?: string | number } = {},
  ) => {
    if (isMobile) return button;
    const content = options.hint ? (
      <span className="ds-tip-copy">
        <span className="ds-tip-title">
          {label}
          {options.shortcut && <kbd className="ds-kbd">{options.shortcut}</kbd>}
        </span>
        <span className="ds-tip-hint">{options.hint}</span>
      </span>
    ) : label;
    return (
      <Tip
        key={options.key}
        label={content}
        shortcut={options.hint ? undefined : options.shortcut}
        side={options.side ?? "right"}
        size={options.hint ? "card" : "mini"}
        delay={200}
      >
        {button}
      </Tip>
    );
  };

  return (
    <div
      className="ds-dock"
      ref={captureSidebar}
      role="toolbar"
      aria-label={t("drawingToolbar")}
      aria-orientation={isMobile ? "horizontal" : "vertical"}
      data-testid="drawing-toolbar"
    >
      {labeled(<button
        type="button"
        className={`ds-btn${tool === null ? " on" : ""}`}
        aria-label={t("toolCursor")}
        aria-pressed={tool === null}
        data-testid="drawing-tool-cursor"
        data-tool-id="cursor"
        onClick={() => onTool(null)}
      >
        <ToolIcon path={ICON_CURSOR} />
      </button>, t("toolCursor"))}

      <div className="ds-sep" aria-hidden="true" />

      {showStyle && selectedTool && isMobile && (
        <div
          className="ds-group-host ds-style-host"
          onPointerEnter={openMenu === "style" ? cancelMenuClose : undefined}
          onPointerLeave={handlePointerLeave}
        >
          <button
            type="button"
            id={`${menuDomId("style")}-trigger`}
            className={`ds-btn${openMenu === "style" ? " on" : ""}`}
            aria-label={interpolate(t("drawingOpenStyle"), { tool: toolLabel(selectedTool, t) })}
            aria-haspopup="menu"
            aria-expanded={openMenu === "style"}
            aria-controls={openMenu === "style" ? menuDomId("style") : undefined}
            data-testid="drawing-style-trigger"
            onClick={(event) => toggleMenu("style", event)}
          >
            <ToolIcon path={ICON_STYLE} />
          </button>
        </div>
      )}

      {DRAWING_TOOL_GROUPS.map((group) => {
        const remembered = getDrawingTool(lastUsed[group.id]);
        const shown = selectedTool?.groupId === group.id
          ? selectedTool
          : remembered?.groupId === group.id
            ? remembered
            : group.tools[0];
        const active = selectedTool?.groupId === group.id;
        const menuOpen = openMenu === group.id;
        const shownLabel = toolLabel(shown, t);
        const groupLabel = t(group.labelKey, group.label);
        const menuId = menuDomId(group.id);
        const triggerId = `${menuId}-trigger`;
        const openGroupLabel = interpolate(t("drawingOpenGroupTools"), { group: groupLabel });
        const groupMenuLabel = interpolate(t("drawingGroupTools"), { group: groupLabel });
        const mainButton = (
          <button
            type="button"
            className={`ds-btn ds-group-main${active ? " on" : ""}`}
            aria-label={`${shownLabel}${shown.shortcut ? `, ${shown.shortcut.label}` : ""}`}
            aria-pressed={active}
            data-sticky={active && sticky ? "true" : "false"}
            data-testid={`drawing-group-${group.id}-main`}
            data-tool-id={shown.id}
            onClick={() => activateTool(shown)}
            onDoubleClick={() => activateTool(shown, active && sticky ? false : true)}
          >
            <ToolIcon path={shown.iconPath} />
          </button>
        );
        const chevronButton = (
          <button
            type="button"
            id={triggerId}
            className="ds-group-chevron"
            aria-label={openGroupLabel}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            data-testid={`drawing-group-${group.id}-menu-trigger`}
            onPointerEnter={(event) => scheduleGroupOpen(group.id, event)}
            onClick={(event) => toggleMenu(group.id, event)}
          >
            <svg viewBox="0 0 8 12" aria-hidden="true">
              <path d="M2 2l4 4-4 4" />
            </svg>
          </button>
        );

        return (
          <div
            className="ds-group-host"
            key={group.id}
            data-testid={`drawing-group-${group.id}`}
            data-group-id={group.id}
            onPointerEnter={menuOpen ? cancelMenuClose : undefined}
            onPointerLeave={handlePointerLeave}
          >
            {menuOpen
              ? mainButton
              : labeled(mainButton, shownLabel, {
                  shortcut: shown.shortcut?.label,
                  hint: t(sticky && active ? "drawingDoubleClickUnlock" : "drawingDoubleClickKeepActive"),
                })}

            {labeled(chevronButton, openGroupLabel)}

            {menuOpen && floatingFlyout(
              <div
                ref={menuRef}
                id={menuId}
                className={`ds-flyout ds-tool-menu${isMobile ? " ds-mobile-popover" : ""}${floatingFlyoutClass}`}
                style={floatingFlyoutStyle}
                role="menu"
                aria-label={groupMenuLabel}
                aria-labelledby={triggerId}
                data-testid={`drawing-group-${group.id}-menu`}
                data-menu-id={group.id}
                data-state={menuPhase}
                onKeyDown={handleMenuKeyDown}
                onPointerEnter={cancelMenuClose}
                onPointerLeave={handlePointerLeave}
              >
                {group.tools.map((candidate, index) => {
                  const candidateLabel = toolLabel(candidate, t);
                  const beginsSection = index === 0 || group.tools[index - 1]?.section !== candidate.section;
                  return (
                    <Fragment key={candidate.id}>
                      {beginsSection && (
                        <div className="ds-menu-heading" role="presentation">
                          {t(candidate.sectionKey, candidate.section)}
                        </div>
                      )}
                      <button
                        type="button"
                        className={`ds-fly-item${tool === candidate.id ? " on" : ""}`}
                        role="menuitemradio"
                        aria-checked={tool === candidate.id}
                        data-testid={`drawing-tool-${candidate.id}`}
                        data-tool-id={candidate.id}
                        onClick={(event) => chooseToolFromMenu(candidate, event)}
                      >
                        <ToolIcon path={candidate.iconPath} />
                        <span>{candidateLabel}</span>
                        {candidate.shortcut && <kbd className="ds-kbd">{candidate.shortcut.label}</kbd>}
                      </button>
                    </Fragment>
                  );
                })}
              </div>,
            )}
          </div>
        );
      })}

      {showStyle && selectedTool && (!isMobile || openMenu === "style") && floatingMobile(
        <div
          ref={isMobile ? menuRef : undefined}
          id={isMobile ? menuDomId("style") : undefined}
          className={`ds-style${isMobile ? " ds-mobile-style" : ""}`}
          role={isMobile ? "menu" : "group"}
          aria-label={interpolate(t("drawingStyleForTool"), { tool: toolLabel(selectedTool, t) })}
          aria-labelledby={isMobile ? `${menuDomId("style")}-trigger` : undefined}
          data-testid="drawing-style-palette"
          data-menu-id={isMobile ? "style" : undefined}
          data-state={isMobile ? menuPhase : undefined}
          onKeyDown={isMobile ? handleMenuKeyDown : undefined}
          onPointerEnter={isMobile ? cancelMenuClose : undefined}
          onPointerLeave={isMobile ? handlePointerLeave : undefined}
        >
          {supportsColor && STYLE_COLORS.map((color, index) => labeled(
            <button
              type="button"
              key={color}
              className={`ds-sw${drawStyle.color === color ? " on" : ""}`}
              style={{ background: color }}
              aria-label={interpolate(t("drawingUseColor"), { color })}
              aria-pressed={drawStyle.color === color}
              role={isMobile ? "menuitemradio" : undefined}
              aria-checked={isMobile ? drawStyle.color === color : undefined}
              data-testid={`drawing-style-color-${index}`}
              data-color={color}
              onClick={() => onDrawStyle({ color })}
            />,
            interpolate(t("drawingColorValue"), { color }),
            { side: "top", key: color },
          ))}

          {supportsColor && (supportsWidth || supportsDash) && <span className="ds-sty-sep" aria-hidden="true" />}

          {supportsWidth && STYLE_WIDTHS.map((width) => labeled(
            <button
              type="button"
              key={width}
              className={`ds-w${drawStyle.width === width ? " on" : ""}`}
              aria-label={interpolate(t("drawingUseWidth"), { width })}
              aria-pressed={drawStyle.width === width}
              role={isMobile ? "menuitemradio" : undefined}
              aria-checked={isMobile ? drawStyle.width === width : undefined}
              data-testid={`drawing-style-width-${String(width).replace(".", "-")}`}
              data-width={width}
              onClick={() => onDrawStyle({ width })}
            >
              <i style={{ height: Math.max(1, Math.round(width)) }} aria-hidden="true" />
            </button>,
            interpolate(t("drawingUseWidth"), { width }),
            { side: "top", key: width },
          ))}

          {supportsWidth && supportsDash && <span className="ds-sty-sep" aria-hidden="true" />}

          {supportsDash && STYLE_DASHES.map((dash) => {
            const dashLabel = t(DASH_LABEL_KEYS[dash], dash);
            const dashAction = interpolate(t("drawingUseDash"), { dash: dashLabel });
            return labeled(
              <button
                type="button"
                key={dash}
                className={`ds-d${drawStyle.dash === dash ? " on" : ""}`}
                aria-label={dashAction}
                aria-pressed={drawStyle.dash === dash}
                role={isMobile ? "menuitemradio" : undefined}
                aria-checked={isMobile ? drawStyle.dash === dash : undefined}
                data-testid={`drawing-style-dash-${dash}`}
                data-dash={dash}
                onClick={() => onDrawStyle({ dash })}
              >
                <svg viewBox="0 0 20 12" aria-hidden="true">
                  <path
                    d={
                      dash === "solid"
                        ? "M2 6h16"
                        : dash === "dashed"
                          ? "M2 6h4M8 6h4M14 6h4"
                          : "M2 6h.5M6 6h.5M10 6h.5M14 6h.5M18 6h.5"
                    }
                  />
                </svg>
              </button>,
              dashAction,
              { side: "top", key: dash },
            );
          })}
        </div>,
      )}

      <div className="ds-spacer" />

      {labeled(<button
        type="button"
        className={`ds-btn${sticky ? " on" : ""}`}
        aria-label={t(sticky ? "drawingDisableKeepActive" : "drawingKeepActive")}
        aria-pressed={sticky}
        data-testid="drawing-sticky-toggle"
        data-sticky={sticky ? "true" : "false"}
        onClick={() => onSticky(!sticky)}
      >
        <ToolIcon path={ICON_STICKY} />
      </button>, t(sticky ? "drawingKeepActiveOn" : "drawingKeepActiveOff"))}

      <div className="ds-group-host ds-utility-host" onPointerEnter={openMenu === "magnet" ? cancelMenuClose : undefined} onPointerLeave={handlePointerLeave}>
        {labeled(<button
          type="button"
          id={`${menuDomId("magnet")}-trigger`}
          className={`ds-btn${magnet !== "off" ? " on" : ""}`}
          aria-label={interpolate(t("drawingMagnetModeCurrent"), { mode: magnetLabel })}
          aria-haspopup="menu"
          aria-expanded={openMenu === "magnet"}
          aria-controls={openMenu === "magnet" ? menuDomId("magnet") : undefined}
          data-testid="drawing-magnet-trigger"
          data-magnet-mode={magnet}
          onClick={(event) => toggleMenu("magnet", event)}
        >
          <ToolIcon path={ICON_MAGNET} />
          <span className="ds-fly-arrow" aria-hidden="true" />
        </button>, interpolate(t("drawingMagnetCurrent"), { mode: magnetLabel }))}

        {openMenu === "magnet" && floatingFlyout(
          <div
            ref={menuRef}
            id={menuDomId("magnet")}
            className={`ds-flyout ds-magnet-menu${isMobile ? " ds-mobile-popover" : ""}${floatingFlyoutClass}`}
            style={floatingFlyoutStyle}
            role="menu"
            aria-label={t("drawingMagnetMode")}
            aria-labelledby={`${menuDomId("magnet")}-trigger`}
            data-testid="drawing-magnet-menu"
            data-menu-id="magnet"
            data-state={menuPhase}
            onKeyDown={handleMenuKeyDown}
            onPointerEnter={cancelMenuClose}
            onPointerLeave={handlePointerLeave}
          >
            <div className="ds-menu-heading" role="presentation">{t("drawingMagnetMode")}</div>
            {MAGNET_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.id}
                className={`ds-fly-item${magnet === option.id ? " on" : ""}`}
                role="menuitemradio"
                aria-checked={magnet === option.id}
                data-testid={`drawing-magnet-${option.id}`}
                data-magnet-mode={option.id}
                onClick={() => chooseMagnet(option.id)}
              >
                <span className={`ds-magnet-mark ds-magnet-mark-${option.id}`} aria-hidden="true" />
                <span>{t(option.labelKey)}</span>
              </button>
            ))}
          </div>,
        )}
      </div>

      <div className="ds-history" role="group" aria-label={t("drawingHistory")}>
        {labeled(<button
          type="button"
          className="ds-btn"
          aria-label={t("drawingUndo")}
          disabled={!canUndo}
          data-testid="drawing-undo"
          onClick={onUndo}
        >
          <ToolIcon path={ICON_UNDO} />
        </button>, t("drawingUndo"))}
        {labeled(<button
          type="button"
          className="ds-btn"
          aria-label={t("drawingRedo")}
          disabled={!canRedo}
          data-testid="drawing-redo"
          onClick={onRedo}
        >
          <ToolIcon path={ICON_REDO} />
        </button>, t("drawingRedo"))}
      </div>

      {labeled(<button
        type="button"
        className={`ds-btn${drawingsVisible ? "" : " on"}`}
        aria-label={t(drawingsVisible ? "drawingHide" : "drawingShow")}
        aria-pressed={!drawingsVisible}
        data-testid="drawing-visibility-toggle"
        data-drawings-visible={drawingsVisible ? "true" : "false"}
        onClick={onToggleVisibility}
      >
        <ToolIcon path={drawingsVisible ? ICON_EYE : ICON_EYE_OFF} />
      </button>, t(drawingsVisible ? "drawingHide" : "drawingShow"))}

      <div className="ds-group-host ds-utility-host" onPointerEnter={openMenu === "clear" ? cancelMenuClose : undefined} onPointerLeave={handlePointerLeave}>
        {labeled(<button
          type="button"
          id={`${menuDomId("clear")}-trigger`}
          className="ds-btn"
          aria-label={interpolate(t("drawingRemoveAria"), { count: localizedDrawingCount })}
          aria-haspopup="menu"
          aria-expanded={openMenu === "clear"}
          aria-controls={openMenu === "clear" ? menuDomId("clear") : undefined}
          data-testid="drawing-clear-trigger"
          data-drawing-count={drawingCount}
          onClick={(event) => toggleMenu("clear", event)}
        >
          <ToolIcon path={ICON_TRASH} />
          <span className="ds-count" aria-hidden="true">{drawingCount}</span>
          <span className="ds-fly-arrow" aria-hidden="true" />
        </button>, interpolate(t("drawingRemoveWithCount"), { count: localizedDrawingCount }))}

        {openMenu === "clear" && floatingFlyout(
          <div
            ref={menuRef}
            id={menuDomId("clear")}
            className={`ds-flyout ds-clear-menu${isMobile ? " ds-mobile-popover" : ""}${floatingFlyoutClass}`}
            style={floatingFlyoutStyle}
            role="menu"
            aria-label={t("drawingRemove")}
            aria-labelledby={`${menuDomId("clear")}-trigger`}
            data-testid="drawing-clear-menu"
            data-menu-id="clear"
            data-state={menuPhase}
            onKeyDown={handleMenuKeyDown}
            onPointerEnter={cancelMenuClose}
            onPointerLeave={handlePointerLeave}
          >
            <div className="ds-menu-heading" role="presentation">{t("drawingRemove")}</div>
            <button
              type="button"
              className="ds-fly-item ds-danger"
              role="menuitem"
              data-testid="drawing-clear-user"
              data-clear-scope="user"
              onClick={() => chooseClear("user")}
            >
              <span>{t("drawingRemoveUser")}</span>
            </button>
            <button
              type="button"
              className="ds-fly-item ds-danger"
              role="menuitem"
              data-testid="drawing-clear-detected"
              data-clear-scope="detected"
              onClick={() => chooseClear("detected")}
            >
              <span>{t("drawingRemoveDetected")}</span>
            </button>
            <button
              type="button"
              className="ds-fly-item ds-danger"
              role="menuitem"
              data-testid="drawing-clear-all"
              data-clear-scope="all"
              onClick={() => chooseClear("all")}
            >
              <span>{t("drawingRemoveAll")}</span>
              <span className="ds-menu-count" aria-label={localizedDrawingCount}>{drawingCount}</span>
            </button>
          </div>,
        )}
      </div>
    </div>
  );
}
