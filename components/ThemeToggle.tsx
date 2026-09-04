import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSettings, type ThemeMode } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * One button that cycles system → light → dark → system, rather than a
 * two-state switch. A plain light/dark toggle has to throw away "follow
 * the OS", which is the setting most people actually want — and this is
 * still one click, with the icon naming the current state.
 */
const NEXT: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const META: Record<ThemeMode, { icon: LucideIcon; label: string }> = {
  system: { icon: Monitor, label: "System theme" },
  light: { icon: Sun, label: "Light theme" },
  dark: { icon: Moon, label: "Dark theme" },
};

export function useThemeToggle() {
  const { settings, update } = useSettings();
  const mode = settings?.theme ?? "system";
  const next = NEXT[mode];

  return {
    mode,
    next,
    ...META[mode],
    nextLabel: META[next].label,
    cycle: () => update({ theme: next }),
  };
}

/** Icon-button form, for panel headers. */
export default function ThemeToggle({ className }: { className?: string }) {
  const { icon: Icon, label, nextLabel, cycle } = useThemeToggle();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className={cn("size-7", className)}
          onClick={cycle}
          aria-label={`${label}. Switch to ${nextLabel.toLowerCase()}`}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Switch to {nextLabel.toLowerCase()}</TooltipContent>
    </Tooltip>
  );
}
