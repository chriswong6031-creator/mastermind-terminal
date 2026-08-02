// Native shell bridge contract v1.
// Governing doc: docs/NATIVE_APPS_ALPHA_MASTERPLAN_2026-07-30.md §4.2; JSON mirror of the
// outbound message shapes: contracts/native-shell.v1.schema.json. Version bumps are a
// bridge-lane change (affected native shells must ship before the web starts relying on it).

export const SHELL_BRIDGE_VERSION = 1;

/**
 * One engine drawing tool, as advertised to the native Drawings sheet (R2.5). `group` is the
 * TV sheet taxonomy (lib/drawingTaxonomy.ts); `label` is EN — native localizes it itself.
 */
export type ShellDrawTool = { id: string; label: string; group: string };

/** Web modals the native hub can raise (one implementation law — the web owns both). */
export type ShellPanelId = "indicators" | "compare";

/** web → native notifications, posted to `webkit.messageHandlers.mm` (no-op in browsers). */
export type ShellOutboundMessage =
  | {
      type: "ready";
      bridgeVersion: number;
      availableTimeframes: string[];
      /** The user's starred timeframes; the native interval wheel rotates these when non-empty. */
      favTimeframes: string[];
      drawTools: ShellDrawTool[];
    }
  | { type: "symbolChanged"; sym: string }
  | { type: "stateChanged"; tf: string; favTimeframes: string[]; drawTools: ShellDrawTool[] }
  | { type: "openExternal"; url: string };

/** native → web command surface, installed on `window.__mmShell` only in shell mode. */
export interface MmShellApi {
  version: number;
  setSymbol(sym: string): void;
  setTimeframe(tf: string): void;
  setLang(lang: "en" | "zh"): void;
  /**
   * Legacy (bridge v1, pre-R2.1): show/hide the web drawing dock in shell mode. The native pencil
   * now presents its own Drawings sheet and calls setDrawTool instead; kept for compat with
   * already-shipped shells.
   */
  setDrawTools(visible: boolean): boolean;
  /** Arm one drawing tool by registry id — the dock's own activation path. False = unknown id. */
  setDrawTool(id: string): boolean;
  /** Drawing history for the active symbol. A no-op (empty stack) is safe and returns false. */
  drawUndo(): boolean;
  drawRedo(): boolean;
  /** Open a web modal from the native hub. False = unknown panel id. */
  openPanel(id: ShellPanelId): boolean;
  restoreState(state: { sym?: string; tf?: string }): void;
  /** Adopt a session obtained by native auth; resolves false on rejection. Never log tokens. */
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<boolean>;
  getState(): { sym: string; tf: string };
}
