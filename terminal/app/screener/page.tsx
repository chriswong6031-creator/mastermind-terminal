import ScreenerView from "@/components/ScreenerView";

// No server-side auth read needed — email is cosmetic only, guest workspace is always open.
export default function ScreenerPage() {
  return <ScreenerView email="" />;
}
