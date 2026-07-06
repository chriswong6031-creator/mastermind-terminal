import FlowPageRoot from "@/components/FlowPageRoot";

// No server-side request data reads — static shell renders instantly; FlowPageRoot fetches client-side.
export default function FlowPage() {
  return <FlowPageRoot />;
}
