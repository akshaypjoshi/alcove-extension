import type { WidgetSize } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * The frame every widget renders into. Deliberately provides no header or
 * chrome of its own — iOS widgets don't have one, and a title bar on a
 * 168px card spends a fifth of its height saying what the content already
 * says. Widgets own their whole surface.
 */
export const WIDGET_DIMENSIONS: Record<WidgetSize, string> = {
  sm: "w-42 h-42",
  md: "w-88 h-42",
};

export const WIDGET_SIZE_LABEL: Record<WidgetSize, string> = {
  sm: "Small",
  md: "Wide",
};

export default function WidgetCard({
  size,
  className,
  style,
  children,
}: {
  size: WidgetSize;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      style={style}
      className={cn(
        // text-left is explicit: <main> sets text-center for the centred
        // hero layout, and widgets are its descendants — without this the
        // whole card inherits centring and every label drifts.
        "glass text-on-wallpaper rise flex shrink-0 flex-col overflow-hidden rounded-3xl p-4 text-left",
        WIDGET_DIMENSIONS[size],
        className,
      )}
    >
      {children}
    </div>
  );
}
