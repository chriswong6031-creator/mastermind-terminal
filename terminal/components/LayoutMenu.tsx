"use client";
import { useT } from "@/lib/i18n";
import type { SavedLayout } from "@/lib/layouts";

// The Saved-Layouts popover body, extracted so the toolbar popover and the responsive
// overflow ("More ▸ Layouts") menu cannot drift apart. They previously carried two hand-copied
// copies of the same markup, and only one of them was ever updated.
//
// Every state this renders is a state the layout store can actually be in. The old menu had
// exactly one: a list plus "No saved layouts", which it also showed to a guest whose GET was
// refused and to a signed-in user whose query had failed. Those are different facts and the user
// has to be able to tell them apart:
//
//   loading      — the read is in flight; say nothing about the library yet
//   auth         — signed-out. Saving is account-owned, so Save is genuinely unavailable: the
//                  control is DISABLED (not wired to a guaranteed 401) and the sign-up path is
//                  offered as its own action.
//   unavailable  — the store refused. Never rendered as "no saved layouts", and the last-good
//                  list stays on screen underneath rather than being replaced by emptiness.
//   ready        — an authoritative answer, which may legitimately be zero layouts.

export type LayoutStatus = "loading" | "auth" | "unavailable" | "ready";
export type LayoutFeedback =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; name: string }
  | { kind: "error"; message: string };

export type LayoutMenuProps = {
  status: LayoutStatus;
  layouts: SavedLayout[];
  name: string;
  onNameChange: (value: string) => void;
  onSave: () => void;
  saving: boolean;
  feedback: LayoutFeedback;
  deleteError: string | null;
  onLoad: (layout: SavedLayout) => void;
  onDelete: (id: string) => void;
  onRetry: () => void;
  onSignUp: () => void;
  /** The overflow menu renders rows as real menuitems; the toolbar popover uses plain divs. */
  rowAs?: "div" | "button";
  /** Overflow menu closes itself once a layout is picked. */
  onPicked?: () => void;
};

export default function LayoutMenu({
  status, layouts, name, onNameChange, onSave, saving, feedback, deleteError,
  onLoad, onDelete, onRetry, onSignUp, rowAs = "div", onPicked,
}: LayoutMenuProps) {
  const t = useT();
  const isGuest = status === "auth";
  const Row = rowAs;

  return (
    <>
      <div className="menu-save" data-layout-save>
        <input
          placeholder={isGuest ? t("layoutSignInToSave") : t("saveCurrentAs")}
          value={name}
          disabled={isGuest || saving}
          aria-label={t("saveCurrentAs")}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !isGuest && !saving) onSave(); }}
        />
        <button
          type="button"
          data-layout-save-btn
          disabled={isGuest || saving}
          title={isGuest ? t("layoutSignInToSave") : undefined}
          onClick={onSave}
        >{saving ? t("layoutSaving") : t("save")}</button>
      </div>

      {isGuest && (
        <button type="button" role="menuitem" className="menu-row layout-gate" data-layout-gate onClick={onSignUp}>
          <span>{t("gateLayouts")}</span>
          <span className="layout-gate-cta">{t("gateSignupCta")}</span>
        </button>
      )}

      {feedback.kind === "saved" && (
        <div className="menu-note ok" role="status" data-layout-feedback="saved">{t("layoutSaved")}</div>
      )}
      {feedback.kind === "error" && (
        <div className="menu-note bad" role="alert" data-layout-feedback="error">{feedback.message}</div>
      )}
      {deleteError && (
        <div className="menu-note bad" role="alert" data-layout-delete-error>{deleteError}</div>
      )}

      {status === "loading" && <div className="menu-row empty" data-layout-status="loading">{t("layoutsLoading")}</div>}
      {status === "unavailable" && (
        <div className="menu-note bad" role="alert" data-layout-status="unavailable">
          <span>{t("layoutsUnavailable")}</span>
          <button type="button" className="menu-note-retry" data-layout-retry onClick={onRetry}>{t("layoutRetry")}</button>
        </div>
      )}
      {status === "ready" && layouts.length === 0 && (
        <div className="menu-row empty" data-layout-status="empty">{t("noSavedLayouts")}</div>
      )}

      {layouts.map((l) => (
        <Row
          key={l.id}
          {...(rowAs === "button" ? { type: "button" as const, role: "menuitem" } : {})}
          className="menu-row"
          data-layout-row={l.name}
          onClick={() => { onLoad(l); onPicked?.(); }}
        >
          {l.name}
          <span
            className="rm"
            role="button"
            aria-label={`${t("delete")} ${l.name}`}
            data-layout-delete={l.name}
            onClick={(e) => { e.stopPropagation(); onDelete(l.id); }}
          ><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg></span>
        </Row>
      ))}
    </>
  );
}
