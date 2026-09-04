import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ChatView from "@/components/chat/ChatView";
import { useSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import "@/assets/tailwind.css";

/**
 * This page is loaded in an iframe by the content script. It runs on the
 * extension origin, which is the whole point: fetch() here is same-origin
 * to the API host permissions, so the chat streams directly instead of
 * relaying every token through a service worker that idles out.
 */
function FloatingChat() {
  const { settings } = useSettings();
  useTheme(settings?.theme);

  return (
    <div className="relative h-full overflow-hidden rounded-xl border shadow-2xl">
      <ChatView
        persistKey="floating"
        onOpenSettings={() => browser.runtime.openOptionsPage()}
        onClose={() => window.parent.postMessage({ type: "tabby:close" }, "*")}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FloatingChat />
  </StrictMode>,
);
