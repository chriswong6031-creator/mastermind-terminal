"use client";
import { useT } from "@/lib/i18n";

export interface StepDoneProps {
  firstName: string;
  email: string;
  confirmPending: boolean;
  paidPending: boolean;
}

export default function StepDone({ firstName, email, confirmPending, paidPending }: StepDoneProps) {
  const t = useT();
  const name = firstName.trim();
  const title = name
    ? t("obDoneTitleNamed").replace("{firstName}", name)
    : t("obDoneTitle");

  return (
    <div className="ob-fade">
      <div className="ob-done">
        <div className="ob-done-mark">
          <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="ob-h1" data-ob-heading tabIndex={-1} style={{ margin: 0 }}>{title}</h1>
        <div className="ob-done-body">
          {confirmPending && (
            <p className="ob-done-line">
              {t("obDoneConfirm").replace("{email}", email || "your inbox")}
            </p>
          )}
          {paidPending && (
            <p className="ob-done-line">{t("obDonePaid")}</p>
          )}
          {!confirmPending && !paidPending && (
            <p className="ob-done-line">{t("obDoneReady")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Footer for Step 4.
export function StepDoneFooter({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <>
      <div className="ob-foot-spacer" />
      <button type="button" className="ob-btn" onClick={onClose}>{t("obOpenTerminal")}</button>
    </>
  );
}
