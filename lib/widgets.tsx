import type { LucideIcon } from "lucide-react";
import { Clock, CloudSun, Music } from "lucide-react";
import type { ComponentType } from "react";

import ClockWidget from "@/components/widgets/ClockWidget";
import MusicWidget from "@/components/widgets/MusicWidget";
import WeatherWidget from "@/components/widgets/WeatherWidget";
import type { Settings, WidgetInstance, WidgetSize } from "@/lib/settings";

/**
 * Same shape as the tool registry in lib/tools.tsx: one entry plus one
 * component adds a widget to both the new tab and the settings panel.
 */
export interface WidgetProps {
  size: WidgetSize;
  config: Record<string, string>;
  onOpenSettings?: () => void;
}

/**
 * A per-instance choice the settings panel renders as a select. `choices`
 * takes the current settings so a widget can offer options that depend on
 * them — the clock lists the World Clock cities the user already added,
 * rather than a second copy of the whole IANA database.
 */
export interface WidgetOption {
  key: string;
  label: string;
  fallback: string;
  choices: (settings: Settings) => { id: string; label: string }[];
}

export interface WidgetDef {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Which sizes this widget knows how to lay out. */
  sizes: WidgetSize[];
  defaultSize: WidgetSize;
  options?: WidgetOption[];
  Component: ComponentType<WidgetProps>;
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "clock",
    label: "Clock",
    description: "Analogue or digital, in any of your World Clock zones",
    icon: Clock,
    sizes: ["sm", "md"],
    defaultSize: "sm",
    options: [
      {
        key: "variant",
        label: "Style",
        fallback: "analogue",
        choices: () => [
          { id: "analogue", label: "Analogue" },
          { id: "digital", label: "Digital" },
        ],
      },
      {
        key: "timezone",
        label: "Time zone",
        fallback: "local",
        choices: (settings) => [
          { id: "local", label: "This device" },
          ...settings.worldClocks.map((zone) => ({
            id: zone,
            label: zone.split("/").pop()!.replace(/_/g, " "),
          })),
        ],
      },
    ],
    Component: ClockWidget,
  },
  {
    type: "music",
    label: "Music",
    description: "What's playing, with play and skip",
    icon: Music,
    sizes: ["sm", "md"],
    defaultSize: "md",
    Component: MusicWidget,
  },
  {
    type: "weather",
    label: "Weather",
    description: "Now, today's range, and the next six hours",
    icon: CloudSun,
    sizes: ["sm", "md"],
    defaultSize: "md",
    Component: WeatherWidget,
  },
];

export function getWidget(type: string) {
  return WIDGETS.find((w) => w.type === type);
}

/**
 * An instance stored before an option existed simply has no value for it,
 * so every read goes through the declared fallback rather than each widget
 * re-deriving its own defaults.
 */
export function resolveConfig(
  def: WidgetDef,
  instance: { config?: Record<string, string> },
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const option of def.options ?? []) {
    resolved[option.key] = instance.config?.[option.key] ?? option.fallback;
  }
  return resolved;
}
