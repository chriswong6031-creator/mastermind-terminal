import { BrandLockup } from "@/components/BrandMark";
import { AppNav } from "@/components/AppNav";
import MobileNav from "@/components/MobileNav";

// Instant placeholder shown the moment a tab is clicked (via each route's loading.tsx),
// while the server streams the real page. Reproduces the persistent chrome — topbar +
// left nav rail (which highlights the destination tab via usePathname) + the mobile bar —
// so switching feels immediate instead of freezing on the previous tab or blanking the
// top bar on mobile. The body shimmers per variant.
//
// `bare` mode renders ONLY the .main2 body (no .app2 grid / topbar / AppNav / MobileNav):
// used by routes whose chrome is already owned by a layout (e.g. /flow), where re-emitting
// the full shell would double-render the grid inside the layout's grid cell.
export default function RouteSkeleton({
  title,
  variant,
  bare = false,
}: {
  title: string;
  variant: "chart" | "table" | "editor";
  bare?: boolean;
}) {
  const railRows = Array.from({ length: 9 });
  const tableRows = Array.from({ length: 11 });
  const body = (
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
  );

  if (bare) return body;

  return (
    <div className="app2">
      <MobileNav email="" />
      <header className="topbar">
        <BrandLockup />
        <div className="tdiv" />
        <span className="page-title">{title}</span>
        <div className="spacer" />
        <div className="avatar" aria-hidden />
      </header>
      <AppNav />
      {body}
      <div className="ticker">
        <span className="lbl" style={{ opacity: 0.6 }}>{title}</span>
        <span style={{ color: "var(--text-dim)" }}>loading…</span>
      </div>
    </div>
  );
}
