"use strict";

// Shared U.S. equity session classification for every quote-hub feed.
// Feed timestamps are real UTC instants; convert them to America/New_York
// before routing a print. Callers classifying an aggregate should pass its
// START timestamp so the 09:30 bar is regular and the 16:00 bar is post-market.

const ET_PARTS_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "numeric",
  minute: "numeric",
  weekday: "short",
  hour12: false,
});

function etParts(ms) {
  const out = {};
  for (const part of ET_PARTS_FMT.formatToParts(new Date(ms))) out[part.type] = part.value;
  const hour = Number(out.hour) === 24 ? 0 : Number(out.hour);
  return {
    date: `${out.year}-${out.month}-${out.day}`,
    weekday: out.weekday,
    minuteOfDay: hour * 60 + Number(out.minute),
  };
}

function classifySession(nowMs) {
  const { minuteOfDay, weekday } = etParts(nowMs);
  // There is no U.S. regular session on weekends. Treat the closed window as
  // overnight so callers never splice a weekend print into the regular lane.
  if (weekday === "Sat" || weekday === "Sun") return "overnight";
  if (minuteOfDay >= 4 * 60 && minuteOfDay < 9 * 60 + 30) return "pre";
  if (minuteOfDay >= 9 * 60 + 30 && minuteOfDay < 16 * 60) return "rth";
  if (minuteOfDay >= 16 * 60 && minuteOfDay < 20 * 60) return "post";
  return "overnight";
}

function etDate(ms) {
  return etParts(ms).date;
}

module.exports = { classifySession, etDate, etParts };
