"use client";
/**
 * EodReplayTag — "EOD structure — not replayed".
 *
 * Whole-workspace time travel has a hard boundary: the intraday stores (the surface field,
 * the premium tide) have a value for every minute of the session and CAN be replayed; the
 * end-of-day structural stores (the GEX ladder's by_strike, the expiry drawer's by_expiry)
 * have exactly one — the close. There is no intraday history behind them to scrub through.
 *
 * So when the scrubber moves off the head, those panes must neither follow it nor pretend
 * they did. Faking it would mean inventing a 13:45 gamma ladder out of a 16:00 snapshot —
 * exactly the fabrication the honesty doctrine exists to prevent. Instead they keep showing
 * the close they genuinely describe and wear this tag, which says so in one line.
 *
 * Renders NOTHING when no replay is mounted or the workspace is at the live head, so a desk
 * nobody is replaying is visually untouched. Its own string source is surfaceStrings — the
 * replay vocabulary belongs to the replay spine, not to each desk that borrows it.
 */

import React from "react";
import { makeSurfaceT } from "./surfaceStrings";
import { useWorkspaceReplay } from "./replayBus";
import type { Lang } from "@/lib/i18n";

export function EodReplayTag({ lang }: { lang: Lang }) {
  const replay = useWorkspaceReplay();
  if (!replay.active || !replay.offHead) return null;
  const t = makeSurfaceT(lang);
  return (
    <span style={TAG} aria-label={t("eodNotReplayedNote")}>
      <span style={DOT} aria-hidden />
      {t("eodNotReplayed")}
    </span>
  );
}

const TAG: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: "var(--muted)",
  padding: "1px 7px",
  border: "1px dashed var(--line)",
  borderRadius: 5,
  whiteSpace: "nowrap",
};

const DOT: React.CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: "50%",
  background: "var(--signal)",
  flexShrink: 0,
};
