import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let value = m[1];
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const n = parseInt(value, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [h * 360, s * 100, l * 100];
}

/** Relative luminance per WCAG 2.1, used for the contrast readout. */
function luminance([r, g, b]: [number, number, number]) {
  const [rl, gl, bl] = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="hover:bg-accent/60 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-xs">
        {value}
        {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3 opacity-40" />}
      </span>
    </button>
  );
}

export default function ColorTool() {
  const [hex, setHex] = useState("#6366f1");
  const rgb = useMemo(() => hexToRgb(hex) ?? ([99, 102, 241] as [number, number, number]), [hex]);
  const [h, s, l] = rgbToHsl(...rgb);

  // Tints toward white and shades toward black - the palette you actually
  // want when picking a hover/active variant of a brand color.
  const ramp = useMemo(
    () =>
      [0.9, 0.75, 0.6, 0.45, 0.3, 0.15, 0, -0.15, -0.3, -0.45].map((amount) => {
        const mix = (c: number) =>
          amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
        return rgbToHex(mix(rgb[0]), mix(rgb[1]), mix(rgb[2]));
      }),
    [rgb],
  );

  const onWhite = contrast(rgb, [255, 255, 255]);
  const onBlack = contrast(rgb, [0, 0, 0]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="color"
          value={rgbToHex(...rgb)}
          onChange={(e) => setHex(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent"
          aria-label="Pick a color"
        />
        <Input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          spellCheck={false}
          className="font-mono"
        />
      </div>

      <div className="grid grid-cols-10 overflow-hidden rounded-md border">
        {ramp.map((c) => (
          <button
            key={c}
            className="h-9"
            style={{ background: c }}
            title={c}
            onClick={() => setHex(c)}
          />
        ))}
      </div>

      <div className="space-y-0.5">
        <CopyRow label="HEX" value={rgbToHex(...rgb)} />
        <CopyRow label="RGB" value={`rgb(${rgb.map(Math.round).join(", ")})`} />
        <CopyRow
          label="HSL"
          value={`hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`}
        />
      </div>

      <div className="text-muted-foreground flex justify-between text-xs">
        <span>Contrast on white: {onWhite.toFixed(2)}:1</span>
        <span>on black: {onBlack.toFixed(2)}:1</span>
      </div>
    </div>
  );
}
