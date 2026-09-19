import { useEffect, useMemo, useState } from "react";
import { resolveConfig, type WidgetDef } from "@/lib/widgets";
import type { WidgetInstance, WidgetSize } from "@/lib/settings";
import { cn } from "@/lib/utils";

export interface StackMember {
  instance: WidgetInstance;
  def: WidgetDef;
}

/**
 * Several widgets in one slot, showing one at a time.
 *
 * Which one is showing is derived from the clock rather than kept in
 * state: `floor(now / interval) % members` means every tab you open agrees
 * on the current face, and a tab left open overnight is not still sitting
 * on whatever was showing when it loaded. Touching the dots takes over for
 * that tab until it is closed.
 */
export default function WidgetStack({
  members,
  size,
  rotateSeconds,
  frozen,
  onOpenSettings,
  onActiveChange,
}: {
  members: StackMember[];
  size: WidgetSize;
  rotateSeconds: number;
  /** A drag is in progress, so nothing should move under the pointer. */
  frozen: boolean;
  onOpenSettings: () => void;
  onActiveChange: (instanceId: string) => void;
}) {
  const [manual, setManual] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [hovered, setHovered] = useState(false);

  const rotating = rotateSeconds > 0 && members.length > 1;

  useEffect(() => {
    // Hovering holds the current face still: a card that changes out from
    // under the pointer while you are reading it is the whole reason
    // people dislike carousels.
    if (!rotating || manual !== null || hovered || frozen) return;
    const id = setInterval(() => setTick(Date.now()), rotateSeconds * 1000);
    return () => clearInterval(id);
  }, [rotating, rotateSeconds, manual, hovered, frozen]);

  /**
   * Browsers throttle timers in a background tab to about once a minute,
   * so a tab left behind for an hour would come back still showing
   * whichever face was up when it was last awake. Resyncing to the clock
   * on the way back in is what makes "every tab agrees" actually true.
   */
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "visible") setTick(Date.now());
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const index = useMemo(() => {
    if (manual !== null) return manual % members.length;
    if (!rotating) return 0;
    return Math.floor(tick / (rotateSeconds * 1000)) % members.length;
  }, [manual, rotating, tick, rotateSeconds, members.length]);

  const active = members[index] ?? members[0];

  useEffect(() => {
    onActiveChange(active.instance.id);
  }, [active.instance.id, onActiveChange]);

  const { def, instance } = active;

  return (
    <div
      className="relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <def.Component
        key={instance.id}
        size={size}
        config={resolveConfig(def, instance)}
        onOpenSettings={onOpenSettings}
      />

      {/* Dots sit inside the card's own padding rather than below it, so a
          stack keeps exactly the footprint of a single widget. */}
      <div
        className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1"
        // The card is draggable from anywhere; these must not arm that.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {members.map((member, i) => (
          <button
            key={member.instance.id}
            onClick={() => setManual(i)}
            aria-label={`Show ${member.def.label}`}
            aria-current={i === index}
            title={member.def.label}
            className={cn(
              "size-1.5 rounded-full transition-all",
              i === index
                ? "bg-[var(--on-wallpaper)] opacity-90"
                : "bg-[var(--on-wallpaper)] opacity-35 hover:opacity-60",
            )}
          />
        ))}
      </div>
    </div>
  );
}
