import type { DockPosition } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * Where a tools surface sits on the page.
 *
 * Shared by the dock and the grid's launcher button so the two cannot
 * drift apart: both have to dodge the news ticker at the bottom edge and
 * both have to step aside for a drawer when they are on the right.
 */
export function anchorClass(position: DockPosition, shifted: boolean): string {
  return cn(
    "fixed z-40 transition-transform duration-300 ease-out",
    position === "bottom" && "left-1/2 -translate-x-1/2",
    position === "left" && "top-1/2 left-5 -translate-y-1/2",
    position === "right" && "top-1/2 right-5 -translate-y-1/2",
    // Only a right-hand surface is in the drawer's way.
    position === "right" && shifted && "-translate-x-[var(--drawer-shift)]",
  );
}

export function anchorStyle(position: DockPosition): React.CSSProperties {
  // The ticker owns the bottom edge when it is on, so anything anchored
  // there rides above it. --ticker-h is 0px whenever the strip is hidden.
  return position === "bottom"
    ? { bottom: "calc(1.25rem + var(--ticker-h, 0px))" }
    : {};
}
