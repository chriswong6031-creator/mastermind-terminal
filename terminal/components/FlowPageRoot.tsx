"use client";
import OptionsHubView from "@/components/OptionsHubView";

// Client wrapper for the /flow route. LangProvider and the beforeInteractive
// locale-init Script are already provided by the root app/layout.tsx, so this
// just mounts the hub view directly.
export default function FlowPageRoot() {
  return <OptionsHubView />;
}
