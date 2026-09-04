import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { useSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import "@/assets/tailwind.css";

function Options() {
  const { settings } = useSettings();
  useTheme(settings?.theme);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Alcove</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        Everything here is stored in your browser. Nothing leaves this machine
        except the messages you send to your chosen AI provider.
      </p>
      <SettingsPanel />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
