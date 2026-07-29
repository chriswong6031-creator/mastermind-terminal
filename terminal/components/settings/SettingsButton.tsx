"use client";
import { useT } from "@/lib/i18n";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useSettings } from "./SettingsProvider";

// The topbar avatar. Keeps the existing `.avatar` look — only what it opens has
// changed: signed-in users get the settings dashboard, and a visitor gets the
// signup wizard (with plan picking) instead of a settings pane that could only
// tell them to sign in.
//
// Mounted three times on /terminal (desktop topbar, mobile topbar, drawer
// footer) and once on the other shells. That is fine now: the panel itself lives
// in SettingsProvider and is mounted exactly once, so no state can drift between
// buttons. Both hooks degrade to no-ops outside their providers (RouteSkeleton).
export default function SettingsButton({ email }: { email: string }) {
  const t = useT();
  const settings = useSettings();
  const onboarding = useOnboarding();
  const signedIn = !!email;

  return (
    <button
      className="avatar"
      title={t("settings")}
      aria-label={t("settings")}
      aria-haspopup="dialog"
      onClick={(e) => {
        e.stopPropagation();
        if (signedIn) settings.open("account");
        else onboarding.open("signup");
      }}
    >
      {(email || "U")[0].toUpperCase()}
    </button>
  );
}
