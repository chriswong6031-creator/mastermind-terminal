"use client";

import { BrandMark } from "@/components/BrandMark";
import { useT } from "@/lib/i18n";

export default function DashboardBackButton({
  onClick,
  variant = "desktop",
}: {
  onClick?: () => void;
  variant?: "desktop" | "mobile";
}) {
  const t = useT();
  const label = t("backToDashboard");

  if (variant === "mobile") {
    return (
      <button className="m-back-prom breathe" onClick={onClick} title={label} aria-label={label}>
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        <span>{t("dashboard")}</span>
      </button>
    );
  }

  return (
    <button className="brand-back" onClick={onClick} title={label} aria-label={label}>
      <span className="bb-chev"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></span>
      <BrandMark />
      <span className="wm"><b>MASTERMIND</b><small>&larr; {t("dashboard")}</small></span>
    </button>
  );
}
