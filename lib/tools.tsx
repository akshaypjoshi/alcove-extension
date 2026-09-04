import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Braces,
  Pilcrow,
  Calculator as CalcIcon,
  Clock,
  DollarSign,
  ListChecks,
  Palette,
  Ruler,
  StickyNote,
  Timer as TimerIcon,
  Type,
} from "lucide-react";
import type { ComponentType } from "react";

import CalculatorTool from "@/components/tools/Calculator";
import JsonTool from "@/components/tools/JsonTool";
import Lorem from "@/components/tools/Lorem";
import RemindersTool from "@/components/tools/Reminders";
import Todos from "@/components/tools/Todos";
import ColorTool from "@/components/tools/ColorTool";
import CurrencyConverter from "@/components/tools/CurrencyConverter";
import Notes from "@/components/tools/Notes";
import TextTools from "@/components/tools/TextTools";
import TimerTool from "@/components/tools/Timer";
import UnitConverter from "@/components/tools/UnitConverter";
import WorldClock from "@/components/tools/WorldClock";

/**
 * One registry, consumed by both the dock and the settings panel. Adding a
 * tool is one entry here plus one component - nothing else needs editing.
 */
export interface ToolDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  Component: ComponentType;
}

export const TOOLS: ToolDef[] = [
  {
    id: "world-clock",
    label: "World Clock",
    description: "Times across the cities you care about",
    icon: Clock,
    Component: WorldClock,
  },
  {
    id: "calculator",
    label: "Calculator",
    description: "Expressions, functions, and a running history",
    icon: CalcIcon,
    Component: CalculatorTool,
  },
  {
    id: "units",
    label: "Units",
    description: "Length, mass, temperature, data, and more",
    icon: Ruler,
    Component: UnitConverter,
  },
  {
    id: "currency",
    label: "Currency",
    description: "Daily exchange rates, cached offline",
    icon: DollarSign,
    Component: CurrencyConverter,
  },
  {
    id: "timer",
    label: "Timer",
    description: "Countdown with a notification, plus a stopwatch",
    icon: TimerIcon,
    Component: TimerTool,
  },
  {
    id: "reminders",
    label: "Reminders",
    description: "Nudge me in 20 minutes, or at 6pm",
    icon: Bell,
    Component: RemindersTool,
  },
  {
    id: "todos",
    label: "To-Do List",
    description: "A short list that outlives the tab",
    icon: ListChecks,
    Component: Todos,
  },
  {
    id: "notes",
    label: "Notepad",
    description: "A note that survives closing the tab",
    icon: StickyNote,
    Component: Notes,
  },
  {
    id: "json",
    label: "JSON",
    description: "Format, minify, sort keys, and validate",
    icon: Braces,
    Component: JsonTool,
  },
  {
    id: "lorem",
    label: "Lorem Ipsum",
    description: "Placeholder text by paragraph, sentence, or word",
    icon: Pilcrow,
    Component: Lorem,
  },
  {
    id: "color",
    label: "Color",
    description: "Convert, build a ramp, check contrast",
    icon: Palette,
    Component: ColorTool,
  },
  {
    id: "text",
    label: "Text & Dev",
    description: "Base64, hashes, case conversion, UUIDs",
    icon: Type,
    Component: TextTools,
  },
];

export function getTool(id: string) {
  return TOOLS.find((t) => t.id === id);
}
