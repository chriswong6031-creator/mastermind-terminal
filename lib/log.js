"use strict";
// Leveled logger → stdout → journald. NEVER logs the Polygon key.
// Rate-limits repetitive reconnect-style messages (1st + every 10th) so a flapping
// upstream can't drown the journal.

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2 };
const THRESHOLD = LEVELS[(process.env.HUB_LOG_LEVEL || "INFO").toUpperCase()] ?? LEVELS.INFO;

// Guard against ever emitting the Polygon API key. If it appears verbatim in a
// formatted line, redact it. Cheap belt-and-suspenders on top of "never pass it in".
const SECRET = process.env.POLYGON_API_KEY || "";

// Rate-limit registry: key → count seen. Emit on the 1st and every 10th thereafter.
const _rl = new Map();

function _redact(s) {
  if (SECRET && s.indexOf(SECRET) !== -1) {
    return s.split(SECRET).join("***REDACTED***");
  }
  // Defensive: scrub any apiKey=... / "params":"<long-token>" style leaks regardless of source.
  return s
    .replace(/(apiKey=)[^&\s"']+/gi, "$1***")
    .replace(/("?params"?\s*[:=]\s*"?)[A-Za-z0-9_\-]{16,}("?)/g, "$1***$2");
}

function _fmt(level, args) {
  const parts = args.map((a) => {
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  });
  const line = `${new Date().toISOString()} [${level}] ${parts.join(" ")}`;
  return _redact(line);
}

function _emit(level, args) {
  if (LEVELS[level] > THRESHOLD) return;
  const line = _fmt(level, args);
  if (level === "ERROR" || level === "WARN") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

const log = {
  info: (...a) => _emit("INFO", a),
  warn: (...a) => _emit("WARN", a),
  error: (...a) => _emit("ERROR", a),
  // Rate-limited variant for reconnect/backoff spam. `key` groups related messages.
  every: (key, level, ...a) => {
    const n = (_rl.get(key) || 0) + 1;
    _rl.set(key, n);
    if (n === 1 || n % 10 === 0) {
      _emit(level, [...a, `(occurrence #${n})`]);
    }
  },
  // Reset a rate-limit counter (e.g. after a successful connect so the next failure logs).
  resetEvery: (key) => { _rl.delete(key); },
};

module.exports = log;
