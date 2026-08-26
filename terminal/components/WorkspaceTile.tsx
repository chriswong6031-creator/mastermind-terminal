"use client";
import { useT } from "@/lib/i18n";

// The generic-widget-graph fallback (W2A_WORKSPACE_UX_SPEC.md §6; freeze §2/§9). A loaded workspace
// envelope's widgets are exactly two things this build knows how to place today — the primary chart
// (the existing multi-pane chart surface, unchanged) and the dock Brain — plus, potentially, MORE:
// a widget of a type this build does not implement, or one placed in a lane (`secondary`/`rail`)
// this build does not yet consume (freeze §9: "accepted, rendered after primary… never dropped
// silently"). Either shape is a widget the specialized renderers (pane-grid, BrainWidget) have no
// slot for; this tile is the ONE deterministic fallback for both, so nothing in a validly-loaded
// workspace is ever silently dropped. Text-safe by construction: React escapes `{String(type)}`,
// never `dangerouslySetInnerHTML` (freeze §3 — no strings interpreted as markup).

export default function WorkspaceTile({ type }: { type: string }) {
  const t = useT();
  return (
    <div className="ws-tile-missing" role="note" data-ws-missing-widget={type}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z" /><path d="M9 12h6" /></svg>
      <b>{t("wsPanelUnavailable")}</b>
      <span className="ws-tile-type">
        <span>{t("wsPanelType")}</span>
        {String(type)}
      </span>
      <p>{t("wsPanelUnavailableSub")}</p>
    </div>
  );
}
