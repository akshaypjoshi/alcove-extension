import { useCallback, useEffect, useRef, useState } from "react";
import { RectangleHorizontal, Square, X } from "lucide-react";
import { getWidget, resolveConfig } from "@/lib/widgets";
import { WIDGET_DIMENSIONS } from "@/components/widgets/WidgetCard";
import type {
  Settings,
  WidgetInstance,
  WidgetPlacement,
  WidgetSize,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * Widgets are placed by dragging them to one of six anchor zones. The zone
 * is derived from where the pointer is - top/bottom half by left/centre/
 * right third - rather than by hit-testing the zone elements, because an
 * empty zone has no size to hit-test against.
 */
/**
 * Every zone lays out horizontally, so a second widget grows along the
 * screen edge rather than down into the furniture - the rails and the tool
 * dock are vertically centred, so a stacked column in any corner runs
 * straight into them. Right-anchored zones reverse, keeping the first
 * widget in the corner and growing inward.
 */
const ZONES: Record<WidgetPlacement, string> = {
  "top-left": "top-5 left-5 flex-row items-start",
  "top-center": "top-5 left-1/2 -translate-x-1/2 flex-row items-start",
  "top-right": "top-5 right-5 flex-row-reverse items-start",
  "bottom-left": "bottom-5 left-5 flex-row items-end",
  // Lifted by --dock-clearance, which App sets when the dock is at
  // the bottom - the only zone the dock can actually collide with.
  "bottom-center":
    "bottom-[calc(1.25rem+var(--dock-clearance,0px))] left-1/2 -translate-x-1/2 flex-row items-end",
  // Lifted clear of the Ask button, which owns the very bottom-right.
  "bottom-right": "bottom-[5.5rem] right-5 flex-row-reverse items-end",
};

const ORDER = Object.keys(ZONES) as WidgetPlacement[];

/** Cycles through whatever sizes the widget declares, in order. */
function nextSize(sizes: WidgetSize[], current: WidgetSize): WidgetSize {
  const index = sizes.indexOf(current);
  return sizes[(index + 1) % sizes.length];
}

function zoneAt(x: number, y: number): WidgetPlacement {
  const row = y < window.innerHeight / 2 ? "top" : "bottom";
  const third = window.innerWidth / 3;
  const col = x < third ? "left" : x > third * 2 ? "right" : "center";
  return `${row}-${col}` as WidgetPlacement;
}

interface DragState {
  id: string;
  /** Where inside the card the pointer grabbed it. */
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  over: WidgetPlacement;
}

export default function WidgetLayer({
  settings,
  panelOpen,
  onOpenSettings,
  onMove,
  onResize,
  onRemove,
}: {
  settings: Settings;
  /** A chat/tool drawer is open, so right-anchored zones must move aside. */
  panelOpen: boolean;
  onOpenSettings: () => void;
  onMove: (id: string, placement: WidgetPlacement) => void;
  onResize: (id: string, size: WidgetSize) => void;
  onRemove: (id: string) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Set the moment a drag starts, read by the click handler to swallow the
  // click that pointerup would otherwise fire on whatever is underneath.
  const dragged = useRef(false);

  const start = useCallback(
    (event: React.PointerEvent, instance: WidgetInstance) => {
      // Left button only, and never from a control inside the widget.
      if (event.button !== 0) return;
      // Reset per gesture. A drag that ends off the card dispatches its
      // click on a common ancestor instead, so onClickCapture below never
      // runs and the flag would otherwise stay set and eat the next real
      // click inside the widget.
      dragged.current = false;
      const card = event.currentTarget as HTMLElement;
      const rect = card.getBoundingClientRect();
      const originX = event.clientX;
      const originY = event.clientY;
      let active = false;

      const move = (e: PointerEvent) => {
        // A 6px threshold, so a click inside the widget stays a click.
        if (!active && Math.hypot(e.clientX - originX, e.clientY - originY) < 6) return;
        active = true;
        dragged.current = true;
        setDrag({
          id: instance.id,
          grabX: originX - rect.left,
          grabY: originY - rect.top,
          x: e.clientX,
          y: e.clientY,
          over: zoneAt(e.clientX, e.clientY),
        });
      };

      const up = (e: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (active) onMove(instance.id, zoneAt(e.clientX, e.clientY));
        setDrag(null);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [onMove],
  );

  // Escape cancels a drag in progress without committing the move.
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  const entries = settings.widgets
    .map((instance) => ({ instance, def: getWidget(instance.type) }))
    .filter((e): e is { instance: WidgetInstance; def: NonNullable<typeof e.def> } =>
      Boolean(e.def),
    );

  if (!entries.length) return null;

  const draggedEntry = drag ? entries.find((e) => e.instance.id === drag.id) : undefined;
  const targetSize = draggedEntry
    ? draggedEntry.def.sizes.includes(draggedEntry.instance.size)
      ? draggedEntry.instance.size
      : draggedEntry.def.defaultSize
    : "sm";

  return (
    <>
      {/* Drop targets, only while dragging. */}
      {drag &&
        ORDER.map((placement) => (
          <div
            key={placement}
            className={cn(
              // Sized to the widget actually being dragged, so the outline
              // shows where it will really land.
              "pointer-events-none fixed z-30 rounded-3xl border-2 border-dashed transition-colors",
              WIDGET_DIMENSIONS[targetSize],
              ZONES[placement].replace(/flex-\w+|items-\w+/g, ""),
              drag.over === placement
                ? "border-[var(--glass-highlight)] bg-[var(--glass-fill)]"
                : "border-[var(--glass-line)]",
            )}
          />
        ))}

      {ORDER.map((placement) => {
        const inZone = entries.filter((e) => e.instance.placement === placement);
        if (!inZone.length) return null;
        const right = placement.endsWith("right");

        return (
          <div
            key={placement}
            className={cn(
              "fixed z-20 flex gap-4 transition-transform duration-300 ease-out",
              ZONES[placement],
              // Right-anchored widgets have to clear both the drawer and
              // the dock that tucks in beside it.
              right && panelOpen && "-translate-x-[var(--drawer-shift-widget)]",
            )}
          >
            {inZone.map(({ instance, def }, i) => {
              const dragging = drag?.id === instance.id;
              const size = def.sizes.includes(instance.size)
                ? instance.size
                : def.defaultSize;
              return (
                <div
                  key={instance.id}
                  onPointerDown={(e) => start(e, instance)}
                  onClickCapture={(e) => {
                    if (!dragged.current) return;
                    // Swallow the click synthesised at the end of a drag.
                    e.preventDefault();
                    e.stopPropagation();
                    dragged.current = false;
                  }}
                  style={{
                    "--rise-delay": `${560 + i * 90}ms`,
                    ...(dragging
                      ? {
                          position: "fixed" as const,
                          left: drag.x - drag.grabX,
                          top: drag.y - drag.grabY,
                          zIndex: 60,
                          pointerEvents: "none" as const,
                        }
                      : {}),
                  } as React.CSSProperties}
                  className={cn(
                    "group/widget relative cursor-grab touch-none active:cursor-grabbing",
                    dragging && "scale-[1.03] cursor-grabbing drop-shadow-2xl",
                  )}
                >
                  <def.Component
                    size={size}
                    config={resolveConfig(def, instance)}
                    onOpenSettings={onOpenSettings}
                  />

                  {/* Resize and remove, revealed on hover. Resizing lived
                      only in settings before, which is a long trip for a
                      widget that's simply the wrong shape where it sits. */}
                  {!drag && (
                    <div className="glass absolute -top-2 -right-2 flex items-center gap-0.5 rounded-full p-0.5 opacity-0 transition-opacity group-hover/widget:opacity-100 focus-within:opacity-100">
                      {def.sizes.length > 1 && (
                        <button
                          // Stop the wrapper arming a drag from this button.
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onResize(instance.id, nextSize(def.sizes, size))}
                          aria-label={
                            nextSize(def.sizes, size) === "sm"
                              ? "Make square"
                              : "Make wide"
                          }
                          title={
                            nextSize(def.sizes, size) === "sm"
                              ? "Make square"
                              : "Make wide"
                          }
                          className="text-on-wallpaper flex size-6 items-center justify-center rounded-full transition hover:bg-[var(--glass-fill-hover)]"
                        >
                          {nextSize(def.sizes, size) === "sm" ? (
                            <Square className="size-3" />
                          ) : (
                            <RectangleHorizontal className="size-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onRemove(instance.id)}
                        aria-label={`Remove ${def.label}`}
                        title={`Remove ${def.label}`}
                        className="text-on-wallpaper flex size-6 items-center justify-center rounded-full transition hover:bg-[var(--glass-fill-hover)]"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
