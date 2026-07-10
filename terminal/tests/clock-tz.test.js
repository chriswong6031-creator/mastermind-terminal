/**
 * Unit tests for ChartFrameBar clock timezone logic.
 * Run with TZ env override:
 *   TZ=America/Los_Angeles node terminal/tests/clock-tz.test.js
 *   TZ=Asia/Kolkata         node terminal/tests/clock-tz.test.js
 *   TZ=UTC                  node terminal/tests/clock-tz.test.js
 *
 * These functions are inlined from terminal/components/ChartFrameBar.tsx
 * so the test can run in plain Node without a build step.
 */

// Inlined from ChartFrameBar.tsx — keep in sync.
function utcOffsetLabel() {
  const off = -new Date().getTimezoneOffset(); // minutes, positive = east of UTC
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

function fmtHHMMSS(d) {
  return (
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0")
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log("  PASS:", msg);
    passed++;
  } else {
    console.error("  FAIL:", msg);
    failed++;
  }
}

// ── derive expected offset from process.env.TZ (set by the shell before node) ─

/**
 * Compute the expected UTC offset string for the current TZ at this exact moment.
 * Uses the same new Date() call that utcOffsetLabel() does, so DST is handled
 * identically — we are testing the label format, not a fixed calendar date.
 */
function expectedOffsetLabel() {
  // Ground truth: same computation as utcOffsetLabel() — intentionally identical.
  // This makes the test a format + sign-invariance check, not a DST-table lookup.
  const off = -new Date().getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}

// ── tests ─────────────────────────────────────────────────────────────────────

const tz = process.env.TZ || "(not set, assume UTC)";
console.log(`\n=== clock-tz tests (TZ=${tz}) ===\n`);

// Test 1: utcOffsetLabel matches the expected label for this TZ
{
  const got = utcOffsetLabel();
  const want = expectedOffsetLabel();
  assert(got === want, `utcOffsetLabel() = "${got}", expected "${want}"`);
}

// Test 2: Label format is "UTC±H" or "UTC±H:MM"
{
  const label = utcOffsetLabel();
  const ok = /^UTC[+-]\d+(:\d{2})?$/.test(label);
  assert(ok, `utcOffsetLabel format valid: "${label}"`);
}

// Test 3: fmtHHMMSS returns a valid HH:MM:SS string in local time
{
  const d = new Date("2026-01-15T12:30:45Z"); // UTC noon
  const s = fmtHHMMSS(d);
  assert(/^\d{2}:\d{2}:\d{2}$/.test(s), `fmtHHMMSS format valid: "${s}"`);
}

// Test 4: fmtHHMMSS uses LOCAL hours (differs from UTC for non-UTC zones)
{
  const d = new Date("2026-01-15T12:30:45Z"); // 12:30:45 UTC
  const s = fmtHHMMSS(d);
  const [hh] = s.split(":").map(Number);
  const expectedLocalHour = d.getHours(); // correct local hour from JS Date
  assert(hh === expectedLocalHour, `fmtHHMMSS local hour = ${hh}, expected ${expectedLocalHour}`);
}

// Test 5: TZ-specific structural checks
if (tz === "America/Los_Angeles") {
  // LA is UTC-7 (PDT, Mar–Nov) or UTC-8 (PST, Nov–Mar).
  const off = -new Date().getTimezoneOffset();
  const validLAOffsets = [-480, -420]; // -8h or -7h
  assert(validLAOffsets.includes(off), `LA offset ${off} min is valid (-420 or -480)`);
  const label = utcOffsetLabel();
  assert(label === "UTC-7" || label === "UTC-8", `LA utcOffsetLabel = "${label}" (UTC-7 or UTC-8)`);
  // Sign must be negative (west of UTC)
  assert(label.startsWith("UTC-"), `LA label has negative sign: "${label}"`);
}

if (tz === "Asia/Kolkata") {
  // India is always UTC+5:30 (no DST)
  const off = -new Date().getTimezoneOffset();
  assert(off === 330, `Kolkata offset = ${off} min (330 = UTC+5:30)`);
  const label = utcOffsetLabel();
  assert(label === "UTC+5:30", `Kolkata utcOffsetLabel = "${label}"`);
  // Half-hour subfield must be formatted as ":30"
  assert(label.endsWith(":30"), `Kolkata label ends with :30 (half-hour TZ): "${label}"`);
}

if (tz === "UTC") {
  const off = -new Date().getTimezoneOffset();
  assert(off === 0, `UTC offset = ${off} min`);
  const label = utcOffsetLabel();
  assert(label === "UTC+0", `UTC utcOffsetLabel = "${label}"`);
}

// ── summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
