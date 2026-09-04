import { useEffect } from "react";
import type { ThemeMode } from "./settings";

/**
 * Tailwind's dark variant is wired to a `.dark` class on <html>, so
 * "system" has to be resolved by hand and re-resolved when the OS flips.
 */
export function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function useTheme(mode: ThemeMode | undefined) {
  useEffect(() => {
    if (!mode) return;
    applyTheme(mode);
    if (mode !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);
}
