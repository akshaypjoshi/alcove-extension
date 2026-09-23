import type { ToolDef } from "@/lib/tools";

/**
 * A tool's icon as a coloured tile.
 *
 * The glyph is still the Lucide one, so nothing here is an asset: the tile
 * is a gradient and a radius computed from the size it is asked for. That
 * keeps it crisp at any magnification, costs no bundle weight, and means a
 * new tool needs a colour rather than a drawing.
 *
 * Every dimension is derived from `size` instead of using Tailwind's steps,
 * because the dock scales its icons continuously as the pointer passes.
 */
/**
 * Perceived lightness of a #rrggbb, 0 to 1.
 *
 * Weighted the way the eye responds rather than as a plain average: a
 * saturated yellow is far brighter than a blue of the same arithmetic
 * value, and it is exactly the yellows that white glyphs disappear into.
 */
function lightness(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  if (Number.isNaN(value)) return 0;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export default function ToolIcon({ tool, size }: { tool: ToolDef; size: number }) {
  const Icon = tool.icon;
  const { accent } = tool;

  // Pale tiles take a dark glyph of their own hue, rather than white on
  // yellow. Deciding it from the colour means a new tool only ever needs
  // to name one, with no second judgement call about the ink.
  const pale = lightness(accent) > 0.62;
  const ink = pale ? `color-mix(in oklab, black 62%, ${accent})` : "#ffffff";

  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        // The squircle proportion Apple settled on: a rounded square at a
        // quarter of its own width reads as an app, at any size.
        borderRadius: size * 0.235,
        background: `linear-gradient(155deg,
          color-mix(in oklab, white 28%, ${accent}) 0%,
          ${accent} 52%,
          color-mix(in oklab, black 16%, ${accent}) 100%)`,
        boxShadow: [
          // Seats the tile on the surface.
          "0 1px 2px rgba(0, 0, 0, 0.28)",
          `0 6px 14px -8px color-mix(in oklab, black 45%, ${accent})`,
          // The light catching the top bevel, and a hairline edge so a pale
          // tile keeps its shape against a pale wallpaper.
          "inset 0 1px 0 rgba(255, 255, 255, 0.38)",
          "inset 0 0 0 0.5px rgba(255, 255, 255, 0.16)",
        ].join(", "),
      }}
    >
      <Icon
        strokeWidth={2.1}
        style={{
          width: size * 0.54,
          height: size * 0.54,
          color: ink,
          // The lift under a white glyph would only dirty a dark one.
          filter: pale ? undefined : "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28))",
        }}
      />
    </span>
  );
}
