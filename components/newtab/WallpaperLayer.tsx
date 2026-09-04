import { useEffect, useState } from "react";
import {
  effectiveLuminance,
  getWallpaper,
  gradientCss,
  listWallpapers,
  type WallpaperRecord,
} from "@/lib/wallpapers";
import type { WallpaperSettings } from "@/lib/settings";

/** Fractal-noise tile, inlined so it costs no request and no bundled asset. */
const GRAIN =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E";

/**
 * Sits behind everything at z-0 — deliberately not a negative z-index.
 * A negative one paints in step 2 of the stacking order, before in-flow
 * descendants' backgrounds in step 3, so `body`'s own opaque background
 * covers it and no wallpaper is ever visible. z-0 puts this in step 6,
 * above that background; `main` is lifted to z-10 to stay on top of it.
 *
 * The image is a plain <div> background
 * rather than an <img>, so `blur` and `scale` can be applied without the
 * blur sampling transparent pixels at the edges (hence the 1.06 scale —
 * it hides the soft border a large blur radius would otherwise expose).
 */
export default function WallpaperLayer({ wallpaper }: { wallpaper: WallpaperSettings }) {
  const [record, setRecord] = useState<WallpaperRecord | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (wallpaper.kind !== "image") {
      setRecord(null);
      setUrl(null);
      return;
    }

    let revoke: (() => void) | null = null;
    let alive = true;

    (async () => {
      let found = wallpaper.imageId ? await getWallpaper(wallpaper.imageId) : undefined;

      // Shuffle picks a different upload on every new tab. Falls back to
      // the pinned image if the library is empty.
      if (wallpaper.shuffle) {
        const all = await listWallpapers();
        if (all.length) found = all[Math.floor(Math.random() * all.length)];
      }

      if (!found || !alive) return;
      const objectUrl = URL.createObjectURL(found.blob);
      revoke = () => URL.revokeObjectURL(objectUrl);
      setRecord(found);
      setUrl(objectUrl);
    })();

    return () => {
      alive = false;
      revoke?.();
    };
  }, [wallpaper.kind, wallpaper.imageId, wallpaper.shuffle]);

  /**
   * Publish how bright the wallpaper reads so `--on-wallpaper` can follow
   * the photo instead of the UI theme. Set on <html> rather than passed
   * down as props: the clock, the search bar and the rails all need it,
   * and none of them are children of this component.
   */
  useEffect(() => {
    const light = effectiveLuminance(wallpaper, record) > 0.5;
    document.documentElement.dataset.wallpaper = light ? "light" : "dark";
  }, [wallpaper, record]);

  const background =
    wallpaper.kind === "solid"
      ? wallpaper.color
      : wallpaper.kind === "image" && url
        ? `url("${url}") center / cover no-repeat`
        : gradientCss(wallpaper.gradientId);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute inset-0 transition-[filter] duration-300"
        style={{
          background,
          filter: wallpaper.blur ? `blur(${wallpaper.blur}px)` : undefined,
          transform: wallpaper.blur ? "scale(1.06)" : undefined,
        }}
      />

      <div
        className="absolute inset-0 bg-black transition-opacity duration-300"
        style={{ opacity: wallpaper.dim / 100 }}
      />

      {/* Vignette. Pulls the corners down so the centre column reads as
          the subject rather than as text floating on a swatch. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 85% at 50% 35%, transparent 35%, oklch(0 0 0 / var(--vignette)) 100%)",
        }}
      />

      {/* Film grain, at 3.5%. Invisible as a texture, but it breaks up the
          banding a wide gradient shows on an 8-bit panel and stops the
          whole thing looking like flat vector art. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{ backgroundImage: `url("${GRAIN}")`, backgroundRepeat: "repeat" }}
      />
    </div>
  );
}
