import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ActionMenu from "@/components/newtab/ActionMenu";
import ChatView from "@/components/chat/ChatView";
import Clock from "@/components/newtab/Clock";
import Drawer from "@/components/newtab/Drawer";
import QuickLinks from "@/components/newtab/QuickLinks";
import RecentSites from "@/components/newtab/RecentSites";
import ReminderAlert from "@/components/newtab/ReminderAlert";
import SearchBar from "@/components/newtab/SearchBar";
import ToolDock from "@/components/newtab/ToolDock";
import ToolDrawer from "@/components/newtab/ToolDrawer";
import WallpaperLayer from "@/components/newtab/WallpaperLayer";
import WidgetLayer from "@/components/newtab/WidgetLayer";
import MusicDrawerBody from "@/components/music/MusicDrawerBody";
import SettingsPanel from "@/components/settings/SettingsPanel";
import { MusicProvider } from "@/lib/music/context";
import { useSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * One drawer slot, two kinds of occupant. Chat and tools are mutually
 * exclusive rather than stacked: they'd otherwise land on the same strip
 * of screen, and "two overlapping panels" is a worse answer than "the
 * dock stays visible so switching is one click".
 */
type Panel =
  { kind: "chat" } | { kind: "music" } | { kind: "tool"; id: string } | null;

export default function App() {
  const { settings, update } = useSettings();
  const [panel, setPanel] = useState<Panel>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useTheme(settings?.theme);

  /**
   * How much room the bottom-centre widget zone has to leave for the dock.
   * Published as a CSS variable rather than threaded through props, since
   * the zones are positioned entirely in CSS.
   */
  useEffect(() => {
    const dock = settings?.dock;
    const clearance =
      dock && settings?.showTools && dock.position === "bottom"
        ? `${dock.size + 32}px`
        : "0px";
    document.documentElement.style.setProperty("--dock-clearance", clearance);
  }, [settings?.dock, settings?.showTools]);

  const panelOpen = panel !== null;
  const activeToolId = panel?.kind === "tool" ? panel.id : null;

  const toggleChat = () =>
    setPanel((current) => (current?.kind === "chat" ? null : { kind: "chat" }));

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

      if (e.key === "Escape") setPanel(null);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>("form input")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
            onRemove={(id) =>
              update({ widgets: settings.widgets.filter((w) => w.id !== id) })
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
          />
        )}

        {settings.showTools && (
          <ToolDock
            enabled={settings.enabledTools}
            activeId={activeToolId}
            onSelect={toggleTool}
            shifted={panelOpen}
            dock={settings.dock}
          />
        )}

        {/* One CTA for both panels. Two stacked pills was already the busiest
          corner of the page, and the dock had made them read as a second,
          competing row of controls. Shifts alongside the dock instead of
          hiding, so you can go from a tool straight to chat. */}
        <ActionMenu
          active={
            panel?.kind === "chat" || panel?.kind === "music" ? panel.kind : null
          }
          shifted={panelOpen}
          onSelect={(id) => (id === "chat" ? toggleChat() : toggleMusic())}
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

        <Drawer
          open={panel?.kind === "chat"}
          onClose={() => setPanel(null)}
          hideClose
        >
          <ChatView
            persistKey="newtab"
            className="bg-transparent"
            onOpenSettings={() => setSettingsOpen(true)}
            onClose={() => setPanel(null)}
          />
        </Drawer>

        <ToolDrawer toolId={activeToolId} onClose={() => setPanel(null)} />

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
