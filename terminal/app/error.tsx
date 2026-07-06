"use client";
// Segment-level error boundary — wraps all routes except the root layout itself.
// LangProvider is available here (it lives in RootLayout above this boundary).
import { useEffect } from "react";
import { useT } from "@/lib/i18n";
import { BrandMark } from "@/components/BrandMark";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error("[ErrorBoundary]", error);
  }, [error]);

  return (
    <main className="center">
      <div className="hero">
        <div className="mk"><BrandMark size={48} /></div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>{t("errTitle")}</h1>
        <p className="tag" style={{ marginBottom: 20 }}>
          {t("errBody")}
          {error.digest && (
            <span style={{ display: "block", marginTop: 8, color: "var(--muted)", fontSize: 11, fontFamily: "monospace" }}>
              ref: {error.digest}
            </span>
          )}
        </p>
        <div className="cta">
          <button className="btn btn-primary" onClick={() => unstable_retry()}>
            {t("errRetry")}
          </button>
          <a href="/terminal" className="btn btn-ghost">{t("errGoChart")}</a>
        </div>
      </div>
    </main>
  );
}
