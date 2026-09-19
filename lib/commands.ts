import type { LucideIcon } from "lucide-react";
import {
  Image as ImageIcon,
  Wand2,
  LayoutGrid,
  Link as LinkIcon,
  Monitor,
  Moon,
  Music,
  Search,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import { TOOLS } from "@/lib/tools";
import { WIDGETS } from "@/lib/widgets";
import { hostOf } from "@/lib/favicon";
import type { Settings } from "@/lib/settings";

/**
 * Everything the palette can do, built fresh from the same registries the
 * dock and the settings panel already read. A tool added to lib/tools.tsx
 * turns up here without anyone remembering to register it twice.
 */
export interface Command {
  id: string;
  label: string;
  /** Secondary line: what it does, or where it goes. */
  hint?: string;
  group: string;
  icon: LucideIcon;
  /** Extra text to match against that is not worth showing. */
  keywords?: string;
  run: () => void;
}

export interface CommandActions {
  openTool: (id: string) => void;
  openChat: () => void;
  openMusic: () => void;
  openSettings: () => void;
  addWidget: (type: string) => void;
  update: (patch: Partial<Settings>) => void;
  navigate: (url: string) => void;
}

export function buildCommands(
  settings: Settings,
  actions: CommandActions,
): Command[] {
  const commands: Command[] = [];

  commands.push(
    {
      id: "ask",
      label: "Ask",
      hint: "Open the chat panel",
      group: "Actions",
      icon: Sparkles,
      keywords: "ai chat claude gpt question",
      run: actions.openChat,
    },
    {
      id: "music",
      label: "Music",
      hint: "Open the player",
      group: "Actions",
      icon: Music,
      keywords: "play playlist youtube song",
      run: actions.openMusic,
    },
  );

  for (const tool of TOOLS) {
    const enabled = settings.enabledTools.includes(tool.id);
    commands.push({
      id: `tool:${tool.id}`,
      label: tool.label,
      // A tool switched off is still worth finding. Turning it on as part
      // of opening it is what the person asking for it wanted anyway.
      hint: enabled ? tool.description : `${tool.description} (adds it to your dock)`,
      group: "Tools",
      icon: tool.icon,
      keywords: tool.description,
      run: () => {
        if (!enabled) {
          actions.update({ enabledTools: [...settings.enabledTools, tool.id] });
        }
        actions.openTool(tool.id);
      },
    });
  }

  for (const link of settings.quickLinks) {
    commands.push({
      id: `link:${link.id}`,
      label: link.title,
      hint: hostOf(link.url) ?? link.url,
      group: "Links",
      icon: LinkIcon,
      keywords: link.url,
      run: () => actions.navigate(link.url),
    });
  }

  for (const widget of WIDGETS) {
    commands.push({
      id: `widget:${widget.type}`,
      label: `Add ${widget.label} widget`,
      hint: widget.description,
      group: "Widgets",
      icon: widget.icon,
      keywords: widget.description,
      run: () => actions.addWidget(widget.type),
    });
  }

  const themes = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ] as const;

  for (const theme of themes) {
    if (settings.theme === theme.id) continue;
    commands.push({
      id: `theme:${theme.id}`,
      label: `Switch to ${theme.label.toLowerCase()} theme`,
      group: "Appearance",
      icon: theme.icon,
      keywords: "theme dark light appearance colour color",
      run: () => actions.update({ theme: theme.id }),
    });
  }

  commands.push(
    {
      id: "editor",
      label: "Edit an image",
      hint: "Crop, colour, text and arrows, all on this machine",
      group: "Actions",
      icon: Wand2,
      keywords: "image editor photo crop annotate draw screenshot resize",
      run: () => window.open(browser.runtime.getURL("/editor.html"), "_blank", "noopener"),
    },
    {
      id: "settings",
      label: "Settings",
      hint: "Wallpaper, widgets, tools, AI",
      group: "Appearance",
      icon: Settings2,
      keywords: "preferences options configure",
      run: actions.openSettings,
    },
    {
      id: "wallpaper",
      label: "Change wallpaper",
      hint: "Upload an image or pick a gradient",
      group: "Appearance",
      icon: ImageIcon,
      keywords: "background photo gradient",
      run: actions.openSettings,
    },
    {
      id: "toggle-widgets",
      label: settings.showWidgets ? "Hide widgets" : "Show widgets",
      group: "Appearance",
      icon: LayoutGrid,
      keywords: "widgets cards clock weather news",
      run: () => actions.update({ showWidgets: !settings.showWidgets }),
    },
  );

  return commands;
}

/** The web-search fallback, offered only when nothing else matched. */
export function searchCommand(query: string, run: () => void): Command {
  return {
    id: "search",
    label: `Search the web for "${query}"`,
    group: "Search",
    icon: Search,
    run,
  };
}

function isWordStart(text: string, i: number): boolean {
  return i === 0 || /[\s\-_/.:]/.test(text[i - 1]);
}

/**
 * Higher is better, null means no match at all.
 *
 * A plain substring always beats a scattered subsequence, so typing "cal"
 * puts Calculator above Colour picker rather than letting letter-hopping
 * win. Beyond that the scoring rewards matches that start a word and
 * letters that arrived together.
 */
export function score(query: string, text: string): number | null {
  if (!query) return 0;

  const hay = text.toLowerCase();
  const needle = query.toLowerCase();

  const direct = hay.indexOf(needle);
  if (direct === 0) return 1000;
  if (direct > 0) return 800 - direct + (isWordStart(hay, direct) ? 100 : 0);

  let cursor = 0;
  let total = 0;
  let previous = -2;
  let run = 0;

  for (const ch of needle) {
    const at = hay.indexOf(ch, cursor);
    if (at < 0) return null;

    if (at === previous + 1) {
      run += 1;
      total += 8 + run * 2;
    } else {
      run = 0;
      total += 2;
    }
    if (isWordStart(hay, at)) total += 10;

    previous = at;
    cursor = at + 1;
  }

  return total;
}

/** Ranked best-first. An empty query keeps the registry's own order. */
export function rank(commands: Command[], query: string): Command[] {
  const q = query.trim();
  if (!q) return commands;

  return commands
    .map((command) => {
      const label = score(q, command.label);
      // Keywords and the hint can match, but count for less than the name
      // so a description mentioning "clock" never outranks the Clock tool.
      const extra = score(q, `${command.keywords ?? ""} ${command.hint ?? ""}`);
      const best =
        label !== null
          ? label
          : extra !== null
            ? Math.min(extra, 300)
            : null;
      return { command, best };
    })
    .filter((entry): entry is { command: Command; best: number } => entry.best !== null)
    .sort((a, b) => b.best - a.best)
    .map((entry) => entry.command);
}
