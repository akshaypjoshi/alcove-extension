import { useEffect, useMemo, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MusicButton from "@/components/newtab/MusicButton";
import CommandPalette from "@/components/newtab/CommandPalette";
import NewsTicker from "@/components/newtab/NewsTicker";
import Clock from "@/components/newtab/Clock";
import Drawer from "@/components/newtab/Drawer";
import QuickLinks from "@/components/newtab/QuickLinks";
import RecentSites from "@/components/newtab/RecentSites";
import ReminderAlert from "@/components/newtab/ReminderAlert";
import SearchBar from "@/components/newtab/SearchBar";
import ToolDock from "@/components/newtab/ToolDock";
import ToolGrid from "@/components/newtab/ToolGrid";
import ToolLauncher from "@/components/newtab/ToolLauncher";
import ToolDrawer from "@/components/newtab/ToolDrawer";
import WallpaperLayer from "@/components/newtab/WallpaperLayer";
import WidgetLayer from "@/components/newtab/WidgetLayer";
import MusicDrawerBody from "@/components/music/MusicDrawerBody";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { MusicProvider } from "@/lib/music/context";
import { buildCommands } from "@/lib/commands";
import { TOOLS, type ToolDef } from "@/lib/tools";
import { getWidget } from "@/lib/widgets";
import { runSearch } from "@/lib/search";
import { SEARCH_ENGINES, useSettings, type Settings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * One drawer slot, two kinds of occupant. Music and tools are mutually
 * exclusive rather than stacked: they'd otherwise land on the same strip
 * of screen, and "two overlapping panels" is a worse answer than "the
 * dock stays visible so switching is one click".
 */
function drop(widgets: Settings["widgets"], id: string) {
  return widgets.filter((w) => w.id !== id);
}

/**
 * A stack of one is just a widget. Clearing the marker keeps the dots and
 * the unstack button from showing on something that has nothing to page
 * through.
 */
function dissolve(widgets: Settings["widgets"]) {
  const counts = new Map<string, number>();
  for (const w of widgets) {
    if (w.stack) counts.set(w.stack, (counts.get(w.stack) ?? 0) + 1);
  }
  return widgets.map((w) =>
    w.stack && counts.get(w.stack) === 1 ? { ...w, stack: undefined } : w,
  );
}

type Panel = { kind: "music" } | { kind: "tool"; id: string } | null;

export default function App() {
  const { settings, update } = useSettings();
  const [panel, setPanel] = useState<Panel>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  useTheme(settings?.theme);

  /**
   * How much room the bottom-centre widget zone has to leave for the dock.
   * Published as a CSS variable rather than threaded through props, since
   * the zones are positioned entirely in CSS.
   */
  useEffect(() => {
    const dock = settings?.dock;
    // In the grid layout the rail usually carries the entry point, which
    // leaves the bottom edge empty and the widgets free to use it.
    const occupied =
      dock?.layout !== "grid" || !settings?.showQuickLinks;
    const clearance =
      dock && settings?.showTools && dock.position === "bottom" && occupied
        ? `${dock.size + 32}px`
        : "0px";
    document.documentElement.style.setProperty("--dock-clearance", clearance);
  }, [settings?.dock, settings?.showTools, settings?.showQuickLinks]);

  const panelOpen = panel !== null;
  const gridLayout = settings?.dock.layout === "grid";
  const activeToolId = panel?.kind === "tool" ? panel.id : null;

  const toggleMusic = () =>
    setPanel((current) =>
      current?.kind === "music" ? null : { kind: "music" },
    );

  const toggleTool = (id: string) =>
    setPanel((current) =>
      current?.kind === "tool" && current.id === id
        ? null
        : { kind: "tool", id },
    );

  /** Enabled tools as definitions, kept in the user's own dock order. */
  const orderedTools = useMemo(
    () =>
      (settings?.enabledTools ?? [])
        .map((id) => TOOLS.find((t) => t.id === id))
        .filter((t): t is ToolDef => Boolean(t)),
    [settings?.enabledTools],
  );

  /**
   * Built from the live registries, so a tool or widget added anywhere
   * else turns up in the palette without a second registration. Memoised
   * on the settings it actually reads: rebuilding this on every keystroke
   * in the palette would rebuild the list being filtered.
   */
  const commands = useMemo(
    () =>
      settings
        ? buildCommands(settings, {
            openTool: (id) => setPanel({ kind: "tool", id }),
            openMusic: () => setPanel({ kind: "music" }),
            openSettings: () => setSettingsOpen(true),
            update,
            navigate: (url) => {
              window.location.href = url;
            },
            addWidget: (type) => {
              const def = getWidget(type);
              if (!def) return;
              update({
                widgets: [
                  ...settings.widgets,
                  {
                    id: crypto.randomUUID(),
                    type,
                    size: def.defaultSize,
                    placement: "top-right",
                  },
                ],
              });
            },
          })
        : [],
    [settings, update],
  );

  // "/" focuses search the way it does everywhere else; Escape closes the
  // drawer. Both are skipped while a field already has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        // Works while typing too: the whole point is to reach it from
        // wherever you are, including the search box.
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      // The palette and the tool grid handle their own Escape. Without this
      // guard, dismissing either would also close whatever drawer was
      // already open behind it.
      if (e.key === "Escape" && !paletteOpen && !toolsOpen) setPanel(null);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("form input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, toolsOpen]);

  // Render nothing rather than a default-settings flash: the wallpaper
  // swapping in a beat after paint is the most visible jank on this page.
  if (!settings) return <div className="bg-background h-full" />;

  return (
    /*
      MusicProvider wraps everything: it owns the off-screen player, so the
      drawer and the widget are only views. Closing either leaves the audio
      untouched.
    */
    <MusicProvider>
      <TooltipProvider delayDuration={400}>
        <WallpaperLayer wallpaper={settings.wallpaper} />

        <main
          // relative z-10 keeps this above WallpaperLayer, which is a
          // positioned z-0 element rather than a negative z-index one.
          className={cn(
            "relative z-10 flex h-full flex-col justify-center gap-10 px-28",
            settings.layout === "center"
              ? "items-center text-center"
              : "items-start",
          )}
        >
          <Clock settings={settings} />
          {settings.showSearch && (
            <SearchBar engineId={settings.searchEngine} />
          )}
          {settings.showRecent && (
            <RecentSites
              source={settings.recentSource}
              count={settings.recentCount}
              fetchIcons={settings.fetchLinkIcons}
              centred={settings.layout === "center"}
            />
          )}
        </main>

        {settings.showWidgets && (
          <WidgetLayer
            settings={settings}
            panelOpen={panelOpen}
            onOpenSettings={() => setSettingsOpen(true)}
            onMove={(id, placement) =>
              update({
                widgets: settings.widgets.map((w) =>
                  w.id === id ? { ...w, placement } : w,
                ),
              })
            }
            onResize={(id, size) =>
              update({
                widgets: settings.widgets.map((w) =>
                  w.id === id ? { ...w, size } : w,
                ),
              })
            }
            onRemove={(id) => update({ widgets: dissolve(drop(settings.widgets, id)) })}
            onStack={(sourceId, targetId) => {
              const target = settings.widgets.find((w) => w.id === targetId);
              const source = settings.widgets.find((w) => w.id === sourceId);
              if (!target || !source) return;
              // Joining an existing stack keeps its id; two loose widgets
              // mint a new one. The source adopts the target's slot
              // wholesale, because a stack is one position and one size.
              const stack = target.stack ?? crypto.randomUUID();
              update({
                widgets: settings.widgets.map((w) =>
                  w.id === targetId
                    ? { ...w, stack }
                    : w.id === sourceId
                      ? {
                          ...w,
                          stack,
                          placement: target.placement,
                          size: target.size,
                        }
                      : w,
                ),
              });
            }}
            onUnstack={(id) =>
              update({
                widgets: dissolve(
                  settings.widgets.map((w) =>
                    w.id === id ? { ...w, stack: undefined } : w,
                  ),
                ),
              })
            }
          />
        )}

        {settings.showQuickLinks && (
          <QuickLinks
            links={settings.quickLinks}
            fetchIcons={settings.fetchLinkIcons}
            // A left-hand dock would sit exactly where the rail lives, so
            // the rail moves across rather than the two overlapping.
            side={
              settings.showTools && settings.dock.position === "left"
                ? "right"
                : "left"
            }
            onChange={(quickLinks) => update({ quickLinks })}
            onOpenSettings={() => setSettingsOpen(true)}
            // Only the grid layout needs a way in from here. The dock is
            // its own way in.
            onOpenTools={
              settings.showTools && gridLayout
                ? () => setToolsOpen(true)
                : undefined
            }
            toolsActive={activeToolId !== null}
          />
        )}

        {settings.showTools &&
          (gridLayout ? (
            <>
              {/* The rail carries the entry point whenever it is showing;
                  this is only for a page that has no rail. */}
              {!settings.showQuickLinks && (
                <ToolLauncher
                  onOpen={() => setToolsOpen(true)}
                  active={activeToolId !== null}
                  shifted={panelOpen}
                  dock={settings.dock}
                />
              )}
              <ToolGrid
                open={toolsOpen}
                tools={orderedTools}
                hidden={TOOLS.filter(
                  (t) => !settings.enabledTools.includes(t.id),
                )}
                activeId={activeToolId}
                onSelect={toggleTool}
                onEnable={(id) =>
                  update({ enabledTools: [...settings.enabledTools, id] })
                }
                onClose={() => setToolsOpen(false)}
              />
            </>
          ) : (
            <ToolDock
              enabled={settings.enabledTools}
              activeId={activeToolId}
              onSelect={toggleTool}
              shifted={panelOpen}
              dock={settings.dock}
            />
          ))}

        {/* Shifts alongside the dock rather than hiding, so music stays
          one click away with a tool already open. */}
        <MusicButton
          active={panel?.kind === "music"}
          shifted={panelOpen}
          onClick={toggleMusic}
        />

        <Drawer
          open={panel?.kind === "music"}
          onClose={() => setPanel(null)}
          title="Music"
          description="What's playing, and what's next"
        >
          <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
            <MusicDrawerBody />
          </div>
        </Drawer>

        <ToolDrawer toolId={activeToolId} onClose={() => setPanel(null)} />

        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          commands={commands}
          onSearchWeb={(q) => {
            const engine =
              SEARCH_ENGINES[settings.searchEngine] ?? SEARCH_ENGINES.browser;
            runSearch(q, engine.url, settings.searchEngine);
          }}
        />

        <NewsTicker shifted={panelOpen} />

        {/* Fires regardless of whether the OS let the notification through. */}
        <ReminderAlert />

        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
            </DialogHeader>
            <SettingsPanel />
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </MusicProvider>
  );
}
