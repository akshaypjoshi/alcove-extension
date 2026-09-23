import { LayoutGrid } from "lucide-react";
import { anchorClass, anchorStyle } from "@/lib/dockAnchor";
import type { DockSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * The grid's entry point when there is no quick links rail to carry it.
 *
 * With the rail showing, the grid opens from there instead: the rail is
 * already the page's list of places to go, and a second button floating on
 * the wallpaper for one more was exactly the clutter the grid layout is
 * supposed to remove. This sits where the dock would have been.
 */
export default function ToolLauncher({
  onOpen,
  active,
  shifted,
  dock,
}: {
  onOpen: () => void;
  /** A tool is open in the drawer. */
  active: boolean;
  shifted: boolean;
  dock: DockSettings;
}) {
  const edge = dock.position !== "bottom";

  return (
    <div
      className={cn("glass rise rounded-2xl p-2", anchorClass(dock.position, shifted))}
      style={{ animationDelay: "400ms", ...anchorStyle(dock.position) }}
    >
      <button
        onClick={onOpen}
        aria-label="Tools"
        aria-haspopup="dialog"
        className={cn(
          "text-on-wallpaper flex items-center justify-center gap-2 rounded-xl transition-colors hover:bg-[var(--glass-fill-hover)]",
          edge ? "px-0" : "px-3",
        )}
        // Against a side edge the word would stick out into the page, so
        // only the bottom pill spells itself out.
        style={{ height: dock.size, width: edge ? dock.size : undefined }}
      >
        <LayoutGrid style={{ width: dock.size * 0.42, height: dock.size * 0.42 }} />
        {!edge && <span className="text-sm font-medium">Tools</span>}
        {active && <span className="bg-current size-[5px] rounded-full" />}
      </button>
    </div>
  );
}
