import RouteSkeleton from "@/components/RouteSkeleton";

// Shared Suspense fallback for every (shell) workspace. The chrome (.app2 grid +
// topbar + AppNav + MobileNav) is owned by app/(shell)/layout.tsx, which wraps
// this fallback — so the skeleton renders the .main2 body only (`bare`) to avoid
// double-rendering the shell grid inside the layout's grid cell (same contract as
// the old app/flow/loading.tsx).
export default function Loading() {
  return <RouteSkeleton title="Workspace" variant="table" bare />;
}
