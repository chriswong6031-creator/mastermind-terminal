import FlowChrome from "./FlowChrome";

// Persistent shell for the /flow route. Owns the .app2 grid + MobileNav + topbar
// (BrandLockup) + AppNav; the page (OptionsHubView) renders ONLY .main2 inside it.
// Because the chrome sits outside the page tree, a crash in the view surfaces the
// route error boundary INSIDE the chrome instead of tearing down logo + nav with it.
// The grid CSS expects .topbar/.appnav/.main2 as direct children of .app2, so
// OptionsHubView's root element is the .main2 grid cell.
//
// Layouts are server components by default; the chrome needs client hooks
// (useLang / useT / MobileNav drawer state), so it is isolated in the thin
// client FlowChrome component.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <FlowChrome>{children}</FlowChrome>;
}
