import { useEffect, useRef, useState } from "react";
import { Music, Plus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionId = "chat" | "music";

const ACTIONS: { id: ActionId; label: string; icon: LucideIcon }[] = [
  { id: "music", label: "Music", icon: Music },
  { id: "chat", label: "Ask", icon: Sparkles },
];

/**
 * One circular trigger that fans its options out above it.
 *
 * The options are always mounted and animated by class rather than
 * conditionally rendered - unmounting them would give an opening
 * animation and no closing one, which reads as a glitch. They're
 * pointer-events-none while closed so they can't be clicked through.
 *
 * The stagger reverses on close: opening runs bottom-up from the trigger,
 * closing collapses top-down back into it, so the motion always looks like
 * it's coming from or returning to the button you pressed.
 */
export default function ActionMenu({
  active,
  shifted,
  onSelect,
}: {
  active: ActionId | null;
  /** A drawer is open, so the whole cluster moves clear of it. */
  shifted: boolean;
  onSelect: (id: ActionId) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "rise fixed right-6 bottom-6 z-40 flex flex-col items-end gap-3 transition-transform duration-300 ease-out",
        shifted && "-translate-x-[calc(var(--drawer-w)+0.25rem)]",
      )}
      style={{ animationDelay: "460ms" }}
    >
      {ACTIONS.map(({ id, label, icon: Icon }, index) => (
        <button
          key={id}
          onClick={() => {
            onSelect(id);
            setOpen(false);
          }}
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          aria-pressed={active === id}
          className={cn(
            // One pill per option rather than a label chip beside an icon
            // button: split into two pieces they read as two controls, and
            // the ragged right edge fought the trigger below them.
            "glass text-on-wallpaper flex h-11 items-center gap-2 rounded-full pr-5 pl-4 text-[14px] font-medium transition-all duration-250 ease-out",
            open
              ? "translate-y-0 scale-100 opacity-100"
              : "pointer-events-none translate-y-4 scale-90 opacity-0",
            active === id
              ? "bg-[var(--glass-fill-hover)]"
              : "hover:bg-[var(--glass-fill-hover)]",
          )}
          style={{
            // Nearest the trigger moves first on the way out, last on the
            // way back in.
            transitionDelay: `${(open ? ACTIONS.length - 1 - index : index) * 45}ms`,
          }}
        >
          <Icon className="text-primary size-[17px]" />
          {label}
        </button>
      ))}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className={cn(
          "glass text-on-wallpaper flex size-12 items-center justify-center rounded-full transition-all duration-300 ease-out outline-none hover:scale-105 hover:bg-[var(--glass-fill-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--glass-highlight)]",
          open && "bg-[var(--glass-fill-hover)]",
        )}
      >
        {/* One icon rotated rather than two swapped: a plus at 45 degrees
            is a cross, and rotating it animates where a swap can't. */}
        <Plus
          className={cn(
            "text-primary size-5 transition-transform duration-300 ease-out",
            open && "rotate-45",
          )}
        />
      </button>
    </div>
  );
}
