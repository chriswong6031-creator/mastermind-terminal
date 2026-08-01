// Native shell bridge contract v1.
// Governing doc: docs/NATIVE_APPS_ALPHA_MASTERPLAN_2026-07-30.md §4.2; JSON mirror of the
// outbound message shapes: contracts/native-shell.v1.schema.json. Version bumps are a
// bridge-lane change (affected native shells must ship before the web starts relying on it).

export const SHELL_BRIDGE_VERSION = 1;

/** web → native notifications, posted to `webkit.messageHandlers.mm` (no-op in browsers). */
export type ShellOutboundMessage =
  | { type: "ready"; bridgeVersion: number; availableTimeframes: string[] }
  | { type: "symbolChanged"; sym: string }
  | { type: "stateChanged"; tf: string }
  | { type: "openExternal"; url: string };

/** native → web command surface, installed on `window.__mmShell` only in shell mode. */
export interface MmShellApi {
  version: number;
  setSymbol(sym: string): void;
  setTimeframe(tf: string): void;
  setLang(lang: "en" | "zh"): void;
  /** Show/hide the drawing toolbar in shell mode (hidden by default; the native pencil toggles it). */
  setDrawTools(visible: boolean): boolean;
  restoreState(state: { sym?: string; tf?: string }): void;
  /** Adopt a session obtained by native auth; resolves false on rejection. Never log tokens. */
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<boolean>;
  getState(): { sym: string; tf: string };
}
