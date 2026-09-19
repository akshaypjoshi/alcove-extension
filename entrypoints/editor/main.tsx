import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Editor from "@/components/editor/Editor";
import { useSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import "@/assets/tailwind.css";

function Page() {
  const { settings } = useSettings();
  useTheme(settings?.theme);
  return <Editor />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
