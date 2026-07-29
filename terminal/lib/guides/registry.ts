// Guide registry — lazy dynamic imports so guide text code-splits out of the main chart bundle.
// Add a module here when its guide lands; GuidePanel falls back to an honest empty state otherwise.

type GuideDoc = { en?: string; zh?: string };

const LOADERS: Record<string, () => Promise<GuideDoc>> = {
  "structure/fvg": () => import("./structure/fvg"),
  "structure/liq": () => import("./structure/liq"),
  "structure/ms": () => import("./structure/ms"),
  "structure/ob": () => import("./structure/ob"),
  "structure/pd": () => import("./structure/pd"),
  "structure/sfp": () => import("./structure/sfp"),
  "trend/cp": () => import("./trend/cp"),
  "trend/fb": () => import("./trend/fb"),
  "trend/te": () => import("./trend/te"),
  "trend/vb": () => import("./trend/vb"),
};

export function hasGuide(suiteKey: string, moduleKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOADERS, `${suiteKey}/${moduleKey}`);
}

/** Returns the guide text for the requested language, or the EN fallback, or null. */
export async function loadGuide(suiteKey: string, moduleKey: string, lang: "en" | "zh"): Promise<{ text: string; fellBack: boolean } | null> {
  const loader = LOADERS[`${suiteKey}/${moduleKey}`];
  if (!loader) return null;
  let doc: GuideDoc;
  try { doc = await loader(); } catch { return null; }
  const want = doc[lang];
  if (typeof want === "string" && want.trim()) return { text: want, fellBack: false };
  const en = doc.en;
  if (typeof en === "string" && en.trim()) return { text: en, fellBack: lang !== "en" };
  return null;
}
