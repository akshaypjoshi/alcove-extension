import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import ToolIcon from "@/components/newtab/ToolIcon";
import type { ToolDef } from "@/lib/tools";
import { cn } from "@/lib/utils";

/** Fixed, so arrow keys can do the arithmetic without measuring the DOM. */
const COLUMNS = 5;
const TILE = 54;

/**
 * Every tool at once, named.
 *
 * The dock's weakness is that it can only show glyphs: fourteen line
 * drawings with no names, which is fine for the three you use daily and
 * useless for the rest. This is the other half of that trade - it costs a
 * click, and in exchange nothing is anonymous and the page stays empty
 * until you ask.
 */
export default function ToolGrid({
  open,
  tools,
  hidden,
  activeId,
  onSelect,
  onEnable,
  onClose,
}: {
  open: boolean;
  /** Enabled tools, in the user's own order. */
  tools: ToolDef[];
  /** Switched off in settings, offered here so that is not a dead end. */
  hidden: ToolDef[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onEnable: (id: string) => void;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"];
      if (!keys.includes(e.key)) return;

      // Each grid is its own run of columns, so a down-arrow from the
      // last enabled row must not land in the "Switched off" section as
      // though the two were one long list.
      const active = document.activeElement as HTMLButtonElement | null;
      const group = active?.closest("[data-grid]") ?? cardRef.current?.querySelector("[data-grid]");
      const items = Array.from(
        group?.querySelectorAll<HTMLButtonElement>("[data-tile]") ?? [],
      );
      if (!items.length) return;

      const here = items.indexOf(document.activeElement as HTMLButtonElement);
      const step =
        e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? COLUMNS : -COLUMNS;
      // From nowhere, the first arrow lands on the first tile rather than
      // jumping into the middle of the grid.
      const next = here < 0 ? 0 : here + step;
      if (next < 0 || next >= items.length) return;

      e.preventDefault();
      items[next].focus();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the grid on open so it is usable from the keyboard immediately,
  // and so Escape reaches the handler above rather than the page behind.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const first = cardRef.current?.querySelector<HTMLButtonElement>("[data-tile]");
    first?.focus();
    // Put focus back where it was, so dismissing the grid returns the
    // keyboard to the button that opened it rather than to the page top.
    return () => opener?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-xl duration-200 animate-in fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={cardRef}
        // The backdrop closes on click; the card must not pass its own
        // clicks up to it, or choosing a tool would be a click on both.
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tools"
        className="glass-strong duration-200 animate-in zoom-in-95 max-h-[80vh] w-[min(40rem,100%)] overflow-y-auto rounded-3xl p-6 shadow-2xl"
      >
        <div
          data-grid="enabled"
          className="grid justify-items-center gap-x-2 gap-y-5"
          style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
        >
          {tools.map((tool, i) => (
            <Tile
              key={tool.id}
              tool={tool}
              index={i}
              active={activeId === tool.id}
              // Dismissing on a pick belongs to the grid rather than to
              // whoever opened it: a launcher that stays up over the thing
              // it just launched is in the way, and leaving that to the
              // caller means every new caller can forget it.
              onClick={() => {
                onClose();
                onSelect(tool.id);
              }}
            />
          ))}
        </div>

        {hidden.length > 0 && (
          <>
            {/* Turning a tool back on lived only in Settings, which made
                the grid a half-truth about what Alcove can do. */}
            <div className="mt-6 mb-3 flex items-center gap-3">
              <span className="text-on-wallpaper/70 text-xs tracking-wide uppercase">
                Switched off
              </span>
              <span className="bg-[var(--glass-line)] h-px flex-1" />
            </div>
            <div
              data-grid="hidden"
              className="grid justify-items-center gap-x-2 gap-y-5"
              style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
            >
              {hidden.map((tool, i) => (
                <Tile
                  key={tool.id}
                  tool={tool}
                  index={tools.length + i}
                  muted
                  onClick={() => onEnable(tool.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({
  tool,
  index,
  active = false,
  muted = false,
  onClick,
}: {
  tool: ToolDef;
  index: number;
  active?: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      data-tile
      onClick={onClick}
      aria-label={muted ? `Switch on ${tool.label}` : tool.label}
      aria-pressed={active || undefined}
      title={tool.description}
      className={cn(
        "rise text-on-wallpaper focus-visible:ring-primary group flex w-full flex-col items-center gap-2 rounded-2xl p-2 transition-colors outline-none focus-visible:ring-2",
        "hover:bg-[var(--glass-fill-hover)] focus-visible:bg-[var(--glass-fill-hover)]",
      )}
      // A short stagger across the grid, the way the page's own content
      // arrives. Capped so the last tile is not left waiting.
      style={{ ["--rise-delay" as string]: `${Math.min(index * 18, 320)}ms` }}
    >
      <span className={cn("relative", muted && "opacity-45 transition-opacity group-hover:opacity-90")}>
        <ToolIcon tool={tool} size={TILE} />
        {muted && (
          <span className="bg-foreground text-background absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full shadow">
            <Plus className="size-2.5" strokeWidth={3} />
          </span>
        )}
        {active && (
          <span className="bg-current absolute -bottom-1.5 left-1/2 size-[3px] -translate-x-1/2 rounded-full" />
        )}
      </span>
      <span className="w-full text-center text-[11px] leading-tight font-medium">
        {tool.label}
      </span>
    </button>
  );
}
