import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The circular control in the bottom-right corner.
 *
 * It used to be a menu that fanned out two options, Ask and Music. With
 * the chat gone there is one thing behind it, and a menu that opens to a
 * single item is a click charged for nothing - so it opens music directly.
 */
export default function MusicButton({
  active,
  shifted,
  onClick,
}: {
  active: boolean;
  /** A drawer is open, so the button moves clear of it. */
  shifted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Music"
      aria-pressed={active}
      className={cn(
        "glass rise text-on-wallpaper fixed right-6 z-40 flex size-12 items-center justify-center rounded-full outline-none transition-all duration-300 ease-out hover:scale-105 hover:bg-[var(--glass-fill-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--glass-highlight)]",
        active && "bg-[var(--glass-fill-hover)]",
        shifted && "-translate-x-[calc(var(--drawer-w)+0.25rem)]",
      )}
      style={{
        animationDelay: "460ms",
        bottom: "calc(1.5rem + var(--ticker-h, 0px))",
      }}
    >
      <Music className="text-primary size-5" />
    </button>
  );
}
