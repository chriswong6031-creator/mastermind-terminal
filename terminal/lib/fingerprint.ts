// Client device fingerprint — a stable-ish 16-hex hash of coarse device/browser signals, used
// with the mm_aid cookie + IP to resolve one human across changing IPs. Best-effort and
// privacy-light (no cross-site supercookie); never throws; returns "" when the environment is
// too locked-down to read anything. Cached for the page lifetime.

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let h2 = (0x811c9dc5 ^ h) >>> 0;
  for (let i = str.length - 1; i >= 0; i--) {
    h2 ^= str.charCodeAt(i);
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

function canvasSignal(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 200; c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(10, 5, 80, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("mm-fp-✨", 12, 8);
    return c.toDataURL().slice(-48);
  } catch { return ""; }
}

function webglSignal(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return "";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info") as any;
    const r = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(r || "");
  } catch { return ""; }
}

let cached: string | null = null;

export function deviceFingerprint(): string {
  if (cached != null) return cached;
  if (typeof navigator === "undefined" || typeof screen === "undefined") { cached = ""; return cached; }
  try {
    const n: any = navigator;
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
    const parts = [
      n.userAgent || "",
      (n.languages && n.languages.join(",")) || n.language || "",
      n.platform || "",
      String(n.hardwareConcurrency || ""),
      String(n.deviceMemory || ""),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      String(window.devicePixelRatio || ""),
      tz,
      String(n.maxTouchPoints || 0),
      webglSignal(),
      canvasSignal(),
    ];
    cached = fnv1a(parts.join("|"));
  } catch {
    cached = "";
  }
  return cached;
}
