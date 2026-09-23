import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Braces,
  Pilcrow,
  Calculator as CalcIcon,
  Clock,
  DollarSign,
  Globe,
  ListChecks,
  Image as ImageIcon,
  Newspaper,
  Palette,
  Ruler,
  StickyNote,
  Timer as TimerIcon,
  Type,
} from "lucide-react";
import type { ComponentType } from "react";

import CalculatorTool from "@/components/tools/Calculator";
import ImagesTool from "@/components/tools/Images";
import MyIpTool from "@/components/tools/MyIp";
import JsonTool from "@/components/tools/JsonTool";
import Lorem from "@/components/tools/Lorem";
import RemindersTool from "@/components/tools/Reminders";
import Todos from "@/components/tools/Todos";
import ColorTool from "@/components/tools/ColorTool";
import CurrencyConverter from "@/components/tools/CurrencyConverter";
import NewsTool from "@/components/tools/News";
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
  /**
   * The tile colour behind the glyph.
   *
   * Colour is what makes a row of icons scannable: you find the timer by
   * its orange and confirm with the glyph, rather than reading fourteen
   * identical line drawings. Hues are kept apart from their neighbours in
   * dock order, since adjacency is where confusion actually happens.
   */
  accent: string;
  Component: ComponentType;
}

export const TOOLS: ToolDef[] = [
  {
    id: "world-clock",
    label: "World Clock",
    description: "Times across the cities you care about",
    icon: Clock,
    accent: "#0ea5e9",
    Component: WorldClock,
  },
  {
    id: "calculator",
    label: "Calculator",
    description: "Expressions, functions, and a running history",
    icon: CalcIcon,
    accent: "#3f4756",
    Component: CalculatorTool,
  },
  {
    id: "units",
    label: "Units",
    description: "Length, mass, temperature, data, and more",
    icon: Ruler,
    accent: "#14b8a6",
    Component: UnitConverter,
  },
  {
    id: "currency",
    label: "Currency",
    description: "Daily exchange rates, cached offline",
    icon: DollarSign,
    accent: "#10b981",
    Component: CurrencyConverter,
  },
  {
    id: "timer",
    label: "Timer",
    description: "Countdown with a notification, plus a stopwatch",
    icon: TimerIcon,
    accent: "#f97316",
    Component: TimerTool,
  },
  {
    id: "reminders",
    label: "Reminders",
    description: "Nudge me in 20 minutes, or at 6pm",
    icon: Bell,
    accent: "#ef4444",
    Component: RemindersTool,
  },
  {
    id: "todos",
    label: "To-Do List",
    description: "A short list that outlives the tab",
    icon: ListChecks,
    accent: "#6366f1",
    Component: Todos,
  },
  {
    id: "notes",
    label: "Notepad",
    description: "A note that survives closing the tab",
    icon: StickyNote,
    accent: "#eab308",
    Component: Notes,
  },
  {
    id: "json",
    label: "JSON",
    description: "Format, minify, sort keys, and validate",
    icon: Braces,
    accent: "#8b5cf6",
    Component: JsonTool,
  },
  {
    id: "lorem",
    label: "Lorem Ipsum",
    description: "Placeholder text by paragraph, sentence, or word",
    icon: Pilcrow,
    accent: "#78716c",
    Component: Lorem,
  },
  {
    id: "color",
    label: "Color",
    description: "Convert, build a ramp, check contrast",
    icon: Palette,
    accent: "#d946ef",
    Component: ColorTool,
  },
  {
    id: "text",
    label: "Text & Dev",
    description: "Base64, hashes, case conversion, UUIDs",
    icon: Type,
    accent: "#06b6d4",
    Component: TextTools,
  },
  {
    id: "news",
    label: "News",
    description: "Headlines for the topics you follow",
    icon: Newspaper,
    accent: "#f43f5e",
    Component: NewsTool,
  },
  {
    id: "images",
    label: "Images",
    description: "Convert, resize and compress, without uploading anything",
    icon: ImageIcon,
    accent: "#3b82f6",
    Component: ImagesTool,
  },
  {
    id: "ip",
    label: "My IP",
    description: "The address the internet sees, and who it belongs to",
    icon: Globe,
    accent: "#84cc16",
    Component: MyIpTool,
  },
];

export function getTool(id: string) {
  return TOOLS.find((t) => t.id === id);
}
