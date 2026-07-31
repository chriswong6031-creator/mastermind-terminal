"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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

type MenuId = DrawingToolGroupId | "magnet" | "clear";

const STYLE_COLORS = ["#4d82ff", "#26c281", "#f0566b", "#e8b339", "#d6dae3"] as const;
const STYLE_WIDTHS = [1.5, 2.5, 4] as const;
const STYLE_DASHES = ["solid", "dashed", "dotted"] as const satisfies readonly Dash[];
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

function toolTitle(tool: DrawingToolDefinition, t: Translate): string {
  const shortcut = tool.shortcut ? ` (${tool.shortcut.label})` : "";
  return `${toolLabel(tool, t)}${shortcut}\n${t("drawingDoubleClickKeepActive")}`;
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
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);
  const [floatingHost, setFloatingHost] = useState<HTMLElement | null>(null);
  const [lastUsed, setLastUsed] = useState<Partial<Record<DrawingToolGroupId, DrawKind>>>(initialLastUsed);
  const selectedTool = getDrawingTool(tool);

  const menuDomId = (menu: MenuId) => `${instanceId}-drawing-menu-${menu}`;

  const dismissMenu = useCallback((restoreFocus: boolean) => {
    const opener = menuOpenerRef.current;
    setOpenMenu(null);
    if (!restoreFocus || !opener) return;
    window.requestAnimationFrame(() => opener.focus());
  }, []);
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
      setOpenMenu(null);
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

  useEffect(() => {
    if (!openMenu) return;
    const frame = window.requestAnimationFrame(() => {
      const checkedItem = menuRef.current?.querySelector<HTMLButtonElement>(
        'button[role="menuitemradio"][aria-checked="true"]',
      );
      const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
        'button[role="menuitemradio"]:not(:disabled), button[role="menuitem"]:not(:disabled)',
      );
      (checkedItem ?? firstItem)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobile, openMenu]);

  useEffect(() => () => {
    if (toolChoiceTimerRef.current !== null) window.clearTimeout(toolChoiceTimerRef.current);
  }, []);

  function toggleMenu(menu: MenuId, event: ReactMouseEvent<HTMLButtonElement>) {
    if (openMenu === menu) {
      dismissMenu(true);
      return;
    }
    menuOpenerRef.current = event.currentTarget;
    setOpenMenu(menu);
  }

  function activateTool(nextTool: DrawingToolDefinition, pin = false) {
    const registered = getDrawingTool(nextTool.id);
    if (!registered) return;
    setLastUsed((current) => (
      current[registered.groupId] === registered.id
        ? current
        : { ...current, [registered.groupId]: registered.id }
    ));
    onTool(registered.id);
    if (pin) onSticky(true);
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
      dismissMenu(false);
      window.requestAnimationFrame(() => next?.focus());
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
    items[nextIndex]?.focus();
  }

  const supportsColor = selectedTool?.capabilities.some((capability) => capability === "stroke" || capability === "fill") ?? false;
  const supportsWidth = selectedTool?.capabilities.includes("width") ?? false;
  const supportsDash = selectedTool?.capabilities.includes("dash") ?? false;
  const showStyle = Boolean(selectedTool && (supportsColor || supportsWidth || supportsDash));
  const magnetOption = MAGNET_OPTIONS.find((option) => option.id === magnet);
  const magnetLabel = magnetOption ? t(magnetOption.labelKey) : magnet;
  const localizedDrawingCount = countLabel(drawingCount, t);
  const floating = (node: ReactNode) => (
    isMobile && floatingHost ? createPortal(node, floatingHost) : node
  );

  return (
    <div
      className="ds-dock"
      ref={captureSidebar}
      role="toolbar"
      aria-label={t("drawingToolbar")}
      aria-orientation={isMobile ? "horizontal" : "vertical"}
      data-testid="drawing-toolbar"
    >
      <button
        type="button"
        className={`ds-btn${tool === null ? " on" : ""}`}
        title={t("toolCursor")}
        aria-label={t("toolCursor")}
        aria-pressed={tool === null}
        data-testid="drawing-tool-cursor"
        data-tool-id="cursor"
        onClick={() => onTool(null)}
      >
        <ToolIcon path={ICON_CURSOR} />
      </button>

      <div className="ds-sep" aria-hidden="true" />

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
        const title = toolTitle(shown, t);
        const menuId = menuDomId(group.id);
        const triggerId = `${menuId}-trigger`;
        const openGroupLabel = interpolate(t("drawingOpenGroupTools"), { group: groupLabel });
        const groupMenuLabel = interpolate(t("drawingGroupTools"), { group: groupLabel });

        return (
          <div
            className="ds-group-host"
            key={group.id}
            data-testid={`drawing-group-${group.id}`}
            data-group-id={group.id}
          >
            <button
              type="button"
              className={`ds-btn ds-group-main${active ? " on" : ""}`}
              title={title}
              aria-label={`${shownLabel}${shown.shortcut ? `, ${shown.shortcut.label}` : ""}`}
              aria-pressed={active}
              data-testid={`drawing-group-${group.id}-main`}
              data-tool-id={shown.id}
              onClick={() => activateTool(shown)}
              onDoubleClick={() => activateTool(shown, true)}
            >
              <ToolIcon path={shown.iconPath} />
            </button>

            <button
              type="button"
              id={triggerId}
              className="ds-group-chevron"
              title={openGroupLabel}
              aria-label={openGroupLabel}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              data-testid={`drawing-group-${group.id}-menu-trigger`}
              onClick={(event) => toggleMenu(group.id, event)}
            >
              <svg viewBox="0 0 8 12" aria-hidden="true">
                <path d="M2 2l4 4-4 4" />
              </svg>
            </button>

            {menuOpen && floating(
              <div
                ref={menuRef}
                id={menuId}
                className={`ds-flyout ds-tool-menu${isMobile ? " ds-mobile-popover" : ""}`}
                role="menu"
                aria-label={groupMenuLabel}
                aria-labelledby={triggerId}
                data-testid={`drawing-group-${group.id}-menu`}
                data-menu-id={group.id}
                onKeyDown={handleMenuKeyDown}
              >
                <div className="ds-menu-heading" role="presentation">{groupLabel}</div>
                {group.tools.map((candidate) => {
                  const candidateLabel = toolLabel(candidate, t);
                  const candidateTitle = toolTitle(candidate, t);
                  return (
                    <button
                      type="button"
                      key={candidate.id}
                      className={`ds-fly-item${tool === candidate.id ? " on" : ""}`}
                      title={candidateTitle}
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
                  );
                })}
              </div>,
            )}
          </div>
        );
      })}

      {showStyle && selectedTool && floating(
        <div
          className={`ds-style${isMobile ? " ds-mobile-style" : ""}`}
          role="group"
          inert={isMobile && openMenu !== null}
          aria-hidden={isMobile && openMenu !== null ? "true" : undefined}
          aria-label={interpolate(t("drawingStyleForTool"), { tool: toolLabel(selectedTool, t) })}
          data-testid="drawing-style-palette"
        >
          {supportsColor && STYLE_COLORS.map((color, index) => (
            <button
              type="button"
              key={color}
              className={`ds-sw${drawStyle.color === color ? " on" : ""}`}
              style={{ background: color }}
              title={interpolate(t("drawingColorValue"), { color })}
              aria-label={interpolate(t("drawingUseColor"), { color })}
              aria-pressed={drawStyle.color === color}
              data-testid={`drawing-style-color-${index}`}
              data-color={color}
              onClick={() => onDrawStyle({ color })}
            />
          ))}

          {supportsColor && (supportsWidth || supportsDash) && <span className="ds-sty-sep" aria-hidden="true" />}

          {supportsWidth && STYLE_WIDTHS.map((width) => (
            <button
              type="button"
              key={width}
              className={`ds-w${drawStyle.width === width ? " on" : ""}`}
              title={interpolate(t("drawingUseWidth"), { width })}
              aria-label={interpolate(t("drawingUseWidth"), { width })}
              aria-pressed={drawStyle.width === width}
              data-testid={`drawing-style-width-${String(width).replace(".", "-")}`}
              data-width={width}
              onClick={() => onDrawStyle({ width })}
            >
              <i style={{ height: Math.max(1, Math.round(width)) }} aria-hidden="true" />
            </button>
          ))}

          {supportsWidth && supportsDash && <span className="ds-sty-sep" aria-hidden="true" />}

          {supportsDash && STYLE_DASHES.map((dash) => {
            const dashLabel = t(DASH_LABEL_KEYS[dash], dash);
            const dashAction = interpolate(t("drawingUseDash"), { dash: dashLabel });
            return (
              <button
                type="button"
                key={dash}
                className={`ds-d${drawStyle.dash === dash ? " on" : ""}`}
                title={dashAction}
                aria-label={dashAction}
                aria-pressed={drawStyle.dash === dash}
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
              </button>
            );
          })}
        </div>,
      )}

      <div className="ds-spacer" />

      <button
        type="button"
        className={`ds-btn${sticky ? " on" : ""}`}
        title={t(sticky ? "drawingKeepActiveOn" : "drawingKeepActiveOff")}
        aria-label={t(sticky ? "drawingDisableKeepActive" : "drawingKeepActive")}
        aria-pressed={sticky}
        data-testid="drawing-sticky-toggle"
        data-sticky={sticky ? "true" : "false"}
        onClick={() => onSticky(!sticky)}
      >
        <ToolIcon path={ICON_STICKY} />
      </button>

      <div className="ds-group-host ds-utility-host">
        <button
          type="button"
          id={`${menuDomId("magnet")}-trigger`}
          className={`ds-btn${magnet !== "off" ? " on" : ""}`}
          title={interpolate(t("drawingMagnetCurrent"), { mode: magnetLabel })}
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
        </button>

        {openMenu === "magnet" && floating(
          <div
            ref={menuRef}
            id={menuDomId("magnet")}
            className={`ds-flyout ds-magnet-menu${isMobile ? " ds-mobile-popover" : ""}`}
            role="menu"
            aria-label={t("drawingMagnetMode")}
            aria-labelledby={`${menuDomId("magnet")}-trigger`}
            data-testid="drawing-magnet-menu"
            data-menu-id="magnet"
            onKeyDown={handleMenuKeyDown}
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
        <button
          type="button"
          className="ds-btn"
          title={t("drawingUndo")}
          aria-label={t("drawingUndo")}
          disabled={!canUndo}
          data-testid="drawing-undo"
          onClick={onUndo}
        >
          <ToolIcon path={ICON_UNDO} />
        </button>
        <button
          type="button"
          className="ds-btn"
          title={t("drawingRedo")}
          aria-label={t("drawingRedo")}
          disabled={!canRedo}
          data-testid="drawing-redo"
          onClick={onRedo}
        >
          <ToolIcon path={ICON_REDO} />
        </button>
      </div>

      <button
        type="button"
        className={`ds-btn${drawingsVisible ? "" : " on"}`}
        title={t(drawingsVisible ? "drawingHide" : "drawingShow")}
        aria-label={t(drawingsVisible ? "drawingHide" : "drawingShow")}
        aria-pressed={!drawingsVisible}
        data-testid="drawing-visibility-toggle"
        data-drawings-visible={drawingsVisible ? "true" : "false"}
        onClick={onToggleVisibility}
      >
        <ToolIcon path={drawingsVisible ? ICON_EYE : ICON_EYE_OFF} />
      </button>

      <div className="ds-group-host ds-utility-host">
        <button
          type="button"
          id={`${menuDomId("clear")}-trigger`}
          className="ds-btn"
          title={interpolate(t("drawingRemoveWithCount"), { count: localizedDrawingCount })}
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
        </button>

        {openMenu === "clear" && floating(
          <div
            ref={menuRef}
            id={menuDomId("clear")}
            className={`ds-flyout ds-clear-menu${isMobile ? " ds-mobile-popover" : ""}`}
            role="menu"
            aria-label={t("drawingRemove")}
            aria-labelledby={`${menuDomId("clear")}-trigger`}
            data-testid="drawing-clear-menu"
            data-menu-id="clear"
            onKeyDown={handleMenuKeyDown}
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
