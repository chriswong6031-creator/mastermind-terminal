import ScreenerView from "@/components/ScreenerView";

// No server-side auth read needed — email is cosmetic only, guest workspace is always open.
// Cap the CDN cache at 5 min: without this the static prerender emits s-maxage=31536000 (1yr) and
// EdgeOne serves the OLD build after a deploy until an owner purges it. See app/heatmap/page.tsx.
export const revalidate = 300;

export default function ScreenerPage() {
  return <ScreenerView email="" />;
}
