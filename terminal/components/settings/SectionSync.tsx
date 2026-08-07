"use client";
import Link from "next/link";
import { Group, IconExtLink, Row, SectionHead } from "./icons";
import type { SectionProps } from "./types";

// ── Sync ─────────────────────────────────────────────────────────────────────
// Ported from the macro dashboard's `_renderSDSync`, plus a third row for the
// Terminal-only settings that now ride with the account.
//
// The settings button only opens this panel for a signed-in user, so the
// off-state below is unreachable in practice — it is kept because the panel is
// reachable programmatically via useSettings().open() and a signed-out card is
// the honest thing to render if it ever is.

export default function SectionSync({ t, email, user, onClose }: SectionProps) {
  const addr = user?.email || email;
  const signedIn = !!addr;
  // The zh lead ends in a full-width colon, which already carries its own space.
  const lead = t("acsSignedInAs");
  const signedInLine = /：$/.test(lead) ? `${lead}${addr}` : `${lead} ${addr}`;

  return (
    <>
      <SectionHead title={t("acsSyncT")} sub={t("acsSyncSub")} closeLabel={t("acsClose")} onClose={onClose} />
      <div className="acs-body">
        <div className={`acs-sync${signedIn ? "" : " off"}`}>
          <span className="dot" />
          <span className="acs-sync-main">
            <span className="acs-sync-t">{signedIn ? t("acsSyncOn") : t("acsSyncOff")}</span>
            <span className="acs-sync-s">{signedIn ? signedInLine : t("acsSignInToOn")}</span>
          </span>
        </div>

        <Group>
          <Row label={t("acsThemeLang")} desc={t("acsThemeLangN")} />
          <Row
            label={t("acsWatchlists")}
            desc={t("acsWatchNote")}
            control={
              <Link className="acs-link" href="/portfolio" onClick={onClose}>
                {t("acsOpenPortal")}
                <IconExtLink />
              </Link>
            }
          />
          <Row label={t("acsTermSettings")} desc={t("acsTermSettingsNote")} />
        </Group>
      </div>
    </>
  );
}
