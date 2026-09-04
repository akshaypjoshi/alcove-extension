import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The single right-hand panel surface. Chat and every tool slide into
 * this same shell, so they share width, easing, and glass treatment -
 * there's only ever one of them on screen at a time.
 *
 * Closed state translates by the drawer width *plus* its right offset;
 * a plain 100% would leave a 1rem sliver of glass parked on the edge.
 */
export default function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  className,
  hideClose,
}: {
  open: boolean;
  onClose: () => void;
  /** Omit for surfaces that draw their own header (the chat does). */
  title?: string;
  description?: string;
  /**
   * For children with their own header row: the floating close button is
   * positioned absolutely over the top-right corner, which is exactly
   * where such a header puts its own controls, and they overlap.
   */
  hideClose?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      // `inert` keeps a closed drawer out of the tab order - without it,
      // tabbing from the search box walks into an off-screen panel.
      inert={!open}
      aria-hidden={!open}
      className={cn(
        "glass-strong fixed top-4 right-4 bottom-4 z-40 flex w-[var(--drawer-w)] flex-col overflow-hidden rounded-2xl shadow-2xl transition-transform duration-300 ease-out",
        open
          ? "translate-x-0"
          : "pointer-events-none translate-x-[calc(var(--drawer-w)+2rem)]",
        className,
      )}
    >
      {title ? (
        <header className="flex items-start justify-between gap-3 border-border/60 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            {description && (
              <p className="text-muted-foreground truncate text-xs">{description}</p>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="-mt-0.5 size-7 shrink-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>
      ) : hideClose ? null : (
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2.5 right-2.5 z-10 size-7"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      )}

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
