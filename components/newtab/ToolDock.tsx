import { useCallback, useEffect, useMemo, useRef } from "react";
import { TOOLS } from "@/lib/tools";
import type { DockSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * A macOS-style dock: icons swell under the pointer and fall off smoothly
 * either side.
 *
 * The magnification runs entirely on refs and requestAnimationFrame, never
 * React state. A pointermove fires far more often than 60Hz, and putting
 * ten icons through a re-render on each one drops frames on exactly the
 * interaction that has to feel liquid.
 *
 * Distances are measured against each icon's *base* centre, computed
 * analytically from the index rather than read back from the DOM —
 * measuring live geometry while that geometry is being animated feeds the
 * output back into the input and the icons judder.
 */
const GAP = 8;
/** How far either side of the pointer the swell reaches, in base widths. */
const REACH = 2.2;

export default function ToolDock({
  enabled,
  activeId,
  onSelect,
  shifted,
  dock,
}: {
  enabled: string[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** True whenever any drawer is open, chat included. */
  shifted: boolean;
  dock: DockSettings;
}) {
  // Memoised: `render` closes over this, and an array rebuilt on every
  // render would re-fire the effect below on every render too.
  const tools = useMemo(
    () =>
      enabled
        .map((id) => TOOLS.find((t) => t.id === id))
        .filter((t): t is (typeof TOOLS)[number] => Boolean(t)),
    [enabled],
  );

  const listRef = useRef<HTMLUListElement>(null);
  const itemsRef = useRef<(HTMLLIElement | null)[]>([]);
  const labelRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const vertical = dock.position !== "bottom";
  const base = dock.size;
  const reach = base * REACH;

  const render = useCallback(() => {
    frameRef.current = null;
    const list = listRef.current;
    if (!list) return;

    const rect = list.getBoundingClientRect();
    const start = vertical ? rect.top : rect.left;
    const pointer = pointerRef.current;

    let nearest = -1;
    let nearestDistance = Infinity;

    itemsRef.current.forEach((item, i) => {
      if (!item) return;

      // Base centre: fixed geometry, unaffected by whatever scale is
      // currently applied to this or any other icon.
      const centre = start + i * (base + GAP) + base / 2;
      const distance = pointer === null ? Infinity : Math.abs(pointer - centre);

      // Gaussian falloff — a linear one has a visible crease at the edge
      // of its range, which reads as a glitch rather than as physics.
      const influence =
        pointer === null || !dock.magnify ? 0 : Math.exp(-((distance / reach) ** 2) * 2.2);

      const scale = 1 + (dock.magnification - 1) * influence;
      // Grow away from the dock's edge so the icons stay seated on it.
      const lift = (scale - 1) * base * 0.5;
      /**
       * Neighbours slide outward to make room for the swollen icon.
       *
       * This has to be driven by (1 - influence), not influence: the icon
       * under the pointer must not move at all, or it slides out from
       * under the cursor as you approach and becomes unclickable, leaving
       * a hole where the pointer is. So the displacement is zero at the
       * cursor and grows to a constant further out — the half-width that
       * the magnified icon actually needs to borrow from its neighbours.
       */
      const push =
        pointer === null
          ? 0
          : Math.sign(centre - pointer || 1) *
            (dock.magnification - 1) *
            base *
            0.5 *
            (1 - influence);

      const offset = vertical
        ? `translate(${-lift}px, ${push}px)`
        : `translate(${push}px, ${-lift}px)`;
      item.style.transform = `${offset} scale(${scale})`;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    });

    const label = labelRef.current;
    if (label) {
      const show = pointer !== null && nearest >= 0 && nearestDistance < base;
      label.style.opacity = show ? "1" : "0";
      if (show) {
        const centre = start + nearest * (base + GAP) + base / 2;
        const local = centre - start;
        label.textContent = tools[nearest]?.label ?? "";
        label.style.transform = vertical
          ? `translateY(${local}px) translateY(-50%)`
          : `translateX(${local}px) translateX(-50%)`;
        // Clear the tallest the icon can get at the current magnification.
        const clearance = (dock.magnification - 1) * base * 0.5 + 14;
        if (vertical) label.style.marginInline = `${clearance}px`;
        else label.style.marginBottom = `${clearance}px`;
      }
    }
  }, [base, dock.magnify, dock.magnification, dock.position, reach, vertical, tools]);

  const schedule = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(render);
  }, [render]);

  // Re-render once when the dock's own settings change, so icons settle
  // into a new base size without needing a pointer move.
  useEffect(() => {
    schedule();
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        // Must be cleared, not just cancelled: schedule() treats a
        // non-null frameRef as "already queued", so leaving a dead id here
        // makes every later schedule() a silent no-op and the dock stops
        // responding to the pointer entirely.
        frameRef.current = null;
      }
    };
  }, [schedule]);

  if (!tools.length) return null;

  const setTransition = (value: string) => {
    itemsRef.current.forEach((item) => {
      if (item) item.style.transition = value;
    });
  };

  const onMove = (e: React.PointerEvent) => {
    // Tracked directly during a hover: a transition here would lag the
    // icons behind the pointer instead of smoothing anything.
    if (pointerRef.current === null) setTransition("none");
    pointerRef.current = vertical ? e.clientY : e.clientX;
    schedule();
  };

  const onLeave = () => {
    // ...but settling back from a standing start does want easing.
    setTransition("transform 260ms cubic-bezier(0.16, 1, 0.3, 1)");
    pointerRef.current = null;
    schedule();
  };

  return (
    <div
      className={cn(
        "glass rise fixed z-40 rounded-2xl p-2 transition-transform duration-300 ease-out",
        dock.position === "bottom" && "bottom-5 left-1/2 -translate-x-1/2",
        dock.position === "left" && "top-1/2 left-5 -translate-y-1/2",
        dock.position === "right" && "top-1/2 right-5 -translate-y-1/2",
        // Only a right-hand dock is in the drawer's way.
        dock.position === "right" && shifted && "-translate-x-[var(--drawer-shift)]",
      )}
      style={{ animationDelay: "400ms" }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="relative">
        <ul
          ref={listRef}
          className={cn("flex", vertical ? "flex-col items-center" : "items-end")}
          style={{ gap: GAP }}
        >
          {tools.map(({ id, label, icon: Icon }, i) => (
            <li
              key={id}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              style={{
                width: base,
                height: base,
                // Anchored to the dock's edge, so magnifying pushes the
                // icon out into the page rather than through the glass.
                transformOrigin:
                  dock.position === "bottom"
                    ? "bottom center"
                    : dock.position === "left"
                      ? "left center"
                      : "right center",
                willChange: "transform",
              }}
              className="shrink-0"
            >
              <button
                onClick={() => onSelect(id)}
                aria-label={label}
                aria-pressed={activeId === id}
                className={cn(
                  "text-on-wallpaper relative flex size-full items-center justify-center rounded-xl transition-colors",
                  !dock.magnify && "hover:bg-[var(--glass-fill-hover)]",
                  !dock.magnify && activeId === id && "bg-[var(--glass-fill-hover)]",
                )}
              >
                <Icon style={{ width: base * 0.45, height: base * 0.45 }} />
                {dock.magnify && activeId === id && (
                  <span
                    className={cn(
                      "absolute rounded-full bg-current",
                      dock.position === "bottom" && "bottom-0 left-1/2 size-[3px] -translate-x-1/2",
                      dock.position === "left" && "top-1/2 left-0 size-[3px] -translate-y-1/2",
                      dock.position === "right" && "top-1/2 right-0 size-[3px] -translate-y-1/2",
                    )}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* One shared label rather than a tooltip per icon — it has to
            track the pointer at frame rate, which a delayed tooltip can't. */}
        <div
          ref={labelRef}
          aria-hidden
          className={cn(
            "glass-strong text-foreground pointer-events-none absolute rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap opacity-0 transition-opacity duration-150",
            dock.position === "bottom" && "bottom-full left-0",
            dock.position === "left" && "top-0 left-full",
            dock.position === "right" && "top-0 right-full",
          )}
        />
      </div>
    </div>
  );
}
