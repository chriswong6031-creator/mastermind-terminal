import AlertsView from "@/components/AlertsView";

// No server-side auth read needed — email is cosmetic only, guest workspace is always open.
export default function AlertsPage() {
  return <AlertsView email="" />;
}
