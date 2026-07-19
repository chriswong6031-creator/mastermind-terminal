import RouteSkeleton from "@/components/RouteSkeleton";

// Chrome (.app2 grid + topbar + AppNav + MobileNav) is owned by app/flow/layout.tsx,
// which wraps this Suspense fallback — so the skeleton renders the .main2 body only
// (bare) to avoid double-rendering the shell grid inside the layout's grid cell.
export default function Loading() {
  return <RouteSkeleton title="Options" variant="table" bare />;
}
