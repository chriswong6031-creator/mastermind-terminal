import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";

// Instant placeholder shown the moment a tab is clicked (via each route's loading.tsx),
// while the server streams the real page. Reproduces the persistent chrome — topbar +
// left nav rail (which highlights the destination tab via usePathname) — so switching
// feels immediate instead of freezing on the previous tab. The body shimmers per variant.
export default function RouteSkeleton({
  title,
  variant,
}: {
  title: string;
  variant: "chart" | "table" | "editor";
}) {
  const railRows = Array.from({ length: 9 });
  const tableRows = Array.from({ length: 11 });
  return (
    <div className="app2">
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <span className="page-title">{title}</span>
        <div className="spacer" />
        <div className="avatar" aria-hidden />
      </header>
      <AppNav />
      <main className="main2">
        <div className="skbody">
          {variant !== "table" && (
            <div className="skrail">
              {railRows.map((_, i) => (
                <div key={i} className="sk skrow" />
              ))}
            </div>
          )}
          <div className="skmain">
            {variant === "table" ? (
              <>
                <div className="sk" style={{ height: 34, width: 280 }} />
                {tableRows.map((_, i) => (
                  <div key={i} className="sk" style={{ height: 42 }} />
                ))}
              </>
            ) : (
              <div className="sk" style={{ flex: 1, minHeight: 0 }} />
            )}
          </div>
        </div>
      </main>
      <div className="ticker">
        <span className="lbl" style={{ opacity: 0.6 }}>{title}</span>
        <span style={{ color: "var(--text-dim)" }}>loading…</span>
      </div>
    </div>
  );
}
