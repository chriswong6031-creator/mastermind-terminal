// The non-market half of the account preference contract: everything else that lives in Supabase
// `user_metadata` and must survive a device change.
//
// Two blobs, two owners:
//   • `terminal: { start_tf, updown }` — Terminal-only chart prefs. We own this field outright;
//     the macro dashboard neither reads nor writes it.
//   • `prefs: { theme, themeAuto, lang }` — the macro dashboard's theme/language sync blob
//     (theme.js applies it on sign-in). We must MERGE into it, never replace it, or a Terminal
//     language change would wipe the user's macro theme.
//
// Deliberately free of React, Supabase and i18n imports so it stays a pure contract module that
// can be unit-tested without a DOM harness. The store (lib/useMarketPrefs.ts) owns the network
// and React sides; this file owns "what does a valid value look like" and the two DOM writes
// (`data-updown`) that are the local application of a saved value.

import { TF_CANONICAL_ORDER, DEFAULT_START_TF } from "@/lib/startTf";

export type LangId = "en" | "zh";
export type ThemeId = "light" | "dark";
export type UpDown = "east" | "west";

export const UPDOWN_KEY = "mm.updown";
export const LANG_KEY = "mm.lang";
export const DEFAULT_UPDOWN: UpDown = "west";

export const isLangId = (v: unknown): v is LangId => v === "en" || v === "zh";
export const isThemeId = (v: unknown): v is ThemeId => v === "light" || v === "dark";
export const isUpDown = (v: unknown): v is UpDown => v === "east" || v === "west";
export const isStartTf = (v: unknown): v is string => typeof v === "string" && TF_CANONICAL_ORDER.includes(v);

/** `user_metadata.terminal`, sanitized. Absent keys stay absent — an absent value means "this
 *  account has never expressed one", which is NOT the same as "this account wants the default". */
export type TerminalMeta = { start_tf?: string; updown?: UpDown };

/** The macro dashboard's `user_metadata.prefs` blob, sanitized. `themeAuto` is a "1"/"0" STRING
 *  on their side — kept verbatim rather than coerced to a boolean, because they read it back. */
export type MetaPrefs = { theme?: ThemeId; themeAuto?: "1" | "0"; lang?: LangId };

/** The *effective* local values the UI renders. Distinct from TerminalMeta: this is never
 *  partial — it is what the chart is actually doing right now. */
export type TerminalPrefs = { startTf: string; updown: UpDown };

export const DEFAULT_TERMINAL_PREFS: TerminalPrefs = { startTf: DEFAULT_START_TF, updown: DEFAULT_UPDOWN };

/** A shallow copy of `meta[key]` when it is a plain object, else {}. The copy matters: the store
 *  keeps this around to spread into the next write, and Supabase's `updateUser` REPLACES nested
 *  objects wholesale — a write that forgets a sibling key deletes it. */
export function metaObject(meta: unknown, key: string): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  const v = (meta as Record<string, unknown>)[key];
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return { ...(v as Record<string, unknown>) };
}

export function readTerminalMeta(blob: unknown): TerminalMeta {
  const o = (blob && typeof blob === "object" && !Array.isArray(blob) ? blob : {}) as Record<string, unknown>;
  const out: TerminalMeta = {};
  if (isStartTf(o.start_tf)) out.start_tf = o.start_tf;
  if (isUpDown(o.updown)) out.updown = o.updown;
  return out;
}

export function readMetaPrefs(blob: unknown): MetaPrefs {
  const o = (blob && typeof blob === "object" && !Array.isArray(blob) ? blob : {}) as Record<string, unknown>;
  const out: MetaPrefs = {};
  if (isThemeId(o.theme)) out.theme = o.theme;
  if (o.themeAuto === "1" || o.themeAuto === "0") out.themeAuto = o.themeAuto;
  if (isLangId(o.lang)) out.lang = o.lang;
  return out;
}

// ── local application ────────────────────────────────────────────────────────────────────
// The <html> attributes are the live source of truth for the current session — the pre-paint
// script in app/layout.tsx has already reconciled localStorage against the browser locale by the
// time any of this runs, so reading the attribute (not localStorage) is what "current" means.

export function readUpDown(): UpDown {
  if (typeof document === "undefined") return DEFAULT_UPDOWN;
  const attr = document.documentElement.getAttribute("data-updown");
  if (isUpDown(attr)) return attr;
  try {
    const raw = localStorage.getItem(UPDOWN_KEY);
    if (isUpDown(raw)) return raw;
  } catch { /* storage blocked */ }
  return DEFAULT_UPDOWN;
}

/** Apply the up/down convention: remember it, repaint it, and tell the charts. The event is what
 *  makes an already-drawn canvas recolor — CSS variables alone don't reach canvas fills. */
export function applyUpDown(v: UpDown) {
  try { localStorage.setItem(UPDOWN_KEY, v); } catch { /* storage blocked */ }
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-updown", v);
  window.dispatchEvent(new CustomEvent("mm:updown"));
}

export function readLang(): LangId {
  if (typeof document === "undefined") return "en";
  const attr = document.documentElement.getAttribute("data-lang");
  return isLangId(attr) ? attr : "en";
}
