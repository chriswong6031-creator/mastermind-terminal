// Client-side batching + transport for first-party analytics. Used by components/Tracker.tsx
// (and any component that dispatches an "mm:track" window event). Batches events and flushes
// with navigator.sendBeacon to the same-origin /api/collect (survives page unload; CSP
// connect-src 'self' already allows it). Fully fail-silent — analytics must never break the app.

type Ev = Record<string, unknown> & { type: string };

const ENDPOINT = "/api/collect";
const SITE = "terminal";
const MAX_QUEUE = 10;
const FLUSH_MS = 4000;
const SID_KEY = "mm.sid";
const SID_TS_KEY = "mm.sid.ts";
const SID_IDLE_MS = 30 * 60 * 1000; // rotate the session after 30 min idle

let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let fp = "";

export function setFingerprint(v: string) { fp = v || ""; }

function uuid(): string {
  try { return crypto.randomUUID(); }
  catch { return "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}

/** Tab-scoped session id that rotates after 30 min of inactivity. */
function session(): { sid: string; fresh: boolean } {
  try {
    const now = Date.now();
    const ss = window.sessionStorage;
    let sid = ss.getItem(SID_KEY) || "";
    const last = Number(ss.getItem(SID_TS_KEY) || 0);
    let fresh = false;
    if (!sid || !last || now - last > SID_IDLE_MS) { sid = uuid(); fresh = true; }
    ss.setItem(SID_KEY, sid);
    ss.setItem(SID_TS_KEY, String(now));
    return { sid, fresh };
  } catch {
    return { sid: "", fresh: false };
  }
}

/** True the first time this tab starts a session (drives a session_start event). */
export function newSession(): boolean {
  return session().fresh;
}

export function track(ev: Ev) {
  try {
    const { sid } = session();
    queue.push({
      site: SITE,
      sid,
      fp: fp || undefined,
      path: (location.pathname + location.hash) || "/",
      t: Date.now(),
      ...ev, // explicit fields (path/ref/dwell_ms/…) override the defaults above
    });
    if (queue.length >= MAX_QUEUE) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
  } catch { /* never throw into the UI */ }
}

export function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const events = queue;
  queue = [];
  try {
    const body = JSON.stringify({ events });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, {
        method: "POST", body, keepalive: true, credentials: "same-origin",
        headers: { "content-type": "application/json" },
      }).catch(() => {});
    }
  } catch { /* fail silent */ }
}
