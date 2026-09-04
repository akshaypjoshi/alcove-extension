import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ChatView from "@/components/chat/ChatView";
import { useSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import "@/assets/tailwind.css";

function SidePanel() {
  const { settings } = useSettings();
  useTheme(settings?.theme);

  return (
    <ChatView
      persistKey="sidepanel"
      onOpenSettings={() => browser.runtime.openOptionsPage()}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
