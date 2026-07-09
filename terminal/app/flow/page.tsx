import FlowPageRoot from "@/components/FlowPageRoot";

// No server-side request data reads — static shell renders instantly; FlowPageRoot fetches client-side.
// Cap the CDN cache at 5 min: without this the static prerender emits s-maxage=31536000 (1yr) and
// EdgeOne serves the OLD build after a deploy until an owner purges it. See app/heatmap/page.tsx.
export const revalidate = 300;

export default function FlowPage() {
  return <FlowPageRoot />;
}
