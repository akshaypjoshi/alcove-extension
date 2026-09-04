import { clear, createStore, del, entries, get, set } from "idb-keyval";
import type { WallpaperSettings } from "./settings";

/**
 * Wallpapers are blobs in IndexedDB, not base64 in extension storage.
 * `sync` caps an item at 8KB and `local` at 10MB (hence "unlimitedStorage"
 * in the manifest), and base64 inflates a file by a third before either
 * limit applies. Blobs also hand back an object URL the compositor can
 * decode off-thread, which matters when the image is the full viewport.
 */

/**
 * NOTE: one database per store, deliberately. idb-keyval's createStore()
 * opens the database at version 1 and creates only its own object store in
 * onupgradeneeded - so two createStore() calls sharing a database name is a
 * trap: whichever runs first creates the database, onupgradeneeded never
 * fires for the second, and every transaction against it throws
 * "One of the specified object stores was not found".
 */
// Database name is deliberately unchanged by the rename to Alcove:
// it addresses data already on disk, and renaming it would orphan
// every wallpaper the user has uploaded.
const store = createStore("tabby-wallpapers", "wallpapers");

export interface WallpaperRecord {
  id: string;
  name: string;
  /** Full-size (downscaled) image shown as the background. */
  blob: Blob;
  /** Small version for the settings grid, so the picker doesn't decode 8 x 4MB. */
  thumb: Blob;
  width: number;
  height: number;
  addedAt: number;
  /** Mean relative luminance, 0-1. Decides light-vs-dark foreground text. */
  luminance: number;
}

export interface Gradient {
  id: string;
  label: string;
  css: string;
  /** Approximate mean luminance, same scale as WallpaperRecord.luminance. */
  luminance: number;
}

/** Built-ins, so a fresh install looks intentional before any upload. */
/**
 * Mesh gradients - several soft radial blobs over a base colour - rather
 * than a three-stop linear ramp. A linear gradient reads as "a CSS
 * default"; overlapping radials read as light in a room, and they hold up
 * at any aspect ratio because every stop is placed in percentages.
 */
export const GRADIENTS: Gradient[] = [
  {
    id: "dusk",
    label: "Dusk",
    luminance: 0.22,
    css: `radial-gradient(at 18% 22%, #4c1d95 0px, transparent 55%),
          radial-gradient(at 74% 18%, #9d174d 0px, transparent 45%),
          radial-gradient(at 62% 88%, #6d28d9 0px, transparent 55%),
          radial-gradient(at 8% 85%, #1e1b4b 0px, transparent 50%),
          #150f2e`,
  },
  {
    id: "aurora",
    label: "Aurora",
    luminance: 0.2,
    css: `radial-gradient(at 20% 25%, #065f46 0px, transparent 55%),
          radial-gradient(at 78% 18%, #0e7490 0px, transparent 50%),
          radial-gradient(at 55% 90%, #15803d 0px, transparent 55%),
          radial-gradient(at 90% 75%, #164e63 0px, transparent 50%),
          #04121a`,
  },
  {
    id: "ember",
    label: "Ember",
    luminance: 0.22,
    css: `radial-gradient(at 15% 20%, #7c2d12 0px, transparent 55%),
          radial-gradient(at 85% 25%, #b45309 0px, transparent 50%),
          radial-gradient(at 50% 92%, #991b1b 0px, transparent 55%),
          radial-gradient(at 88% 85%, #78350f 0px, transparent 50%),
          #160b06`,
  },
  {
    id: "slate",
    label: "Slate",
    luminance: 0.2,
    css: `radial-gradient(at 22% 18%, #334155 0px, transparent 55%),
          radial-gradient(at 80% 22%, #1e3a5f 0px, transparent 50%),
          radial-gradient(at 55% 88%, #475569 0px, transparent 55%),
          #0b1220`,
  },
  {
    id: "linen",
    label: "Linen",
    luminance: 0.88,
    css: `radial-gradient(at 18% 20%, #fde8d7 0px, transparent 55%),
          radial-gradient(at 82% 18%, #ffe9c9 0px, transparent 50%),
          radial-gradient(at 60% 88%, #e8d5c4 0px, transparent 55%),
          radial-gradient(at 10% 88%, #f5e6d3 0px, transparent 50%),
          #fbf3e9`,
  },
  {
    id: "mint",
    label: "Mint",
    luminance: 0.9,
    css: `radial-gradient(at 20% 22%, #ccfbf1 0px, transparent 55%),
          radial-gradient(at 80% 15%, #d9f99d 0px, transparent 50%),
          radial-gradient(at 55% 90%, #a7f3d0 0px, transparent 55%),
          #eefbf6`,
  },
  {
    id: "cobalt",
    label: "Cobalt",
    luminance: 0.2,
    css: `radial-gradient(at 20% 20%, #1d4ed8 0px, transparent 55%),
          radial-gradient(at 82% 25%, #0369a1 0px, transparent 50%),
          radial-gradient(at 50% 92%, #1e40af 0px, transparent 55%),
          radial-gradient(at 92% 80%, #0891b2 0px, transparent 45%),
          #050b1c`,
  },
  {
    id: "plum",
    label: "Plum",
    luminance: 0.25,
    css: `radial-gradient(at 18% 25%, #6d28d9 0px, transparent 55%),
          radial-gradient(at 85% 15%, #db2777 0px, transparent 50%),
          radial-gradient(at 55% 90%, #7c3aed 0px, transparent 55%),
          radial-gradient(at 86% 80%, #f59e0b 0px, transparent 35%),
          #160726`,
  },
];

export function gradientCss(id: string): string {
  return (GRADIENTS.find((g) => g.id === id) ?? GRADIENTS[0]).css;
}

const MAX_EDGE = 2560; // Retina-sharp on any laptop, ~10x smaller than a phone photo.
const THUMB_EDGE = 360;

/**
 * Mean relative luminance of what's on the canvas. Sampled every 4th pixel
 * - an average doesn't need every one, and this runs on the main thread
 * while the user waits for the upload.
 */
function meanLuminance(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): number {
  const { data } = ctx.getImageData(0, 0, width, height);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 16) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    count++;
  }
  return count ? sum / count / 255 : 0.35;
}

async function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
  measure = false,
): Promise<{ blob: Blob; width: number; height: number; luminance: number }> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Measured before encoding, and only on the thumbnail - getImageData on
  // a 2560px canvas would pull ~26MB for a number we round anyway.
  const luminance = measure ? meanLuminance(ctx, width, height) : 0.35;

  const blob = await canvas.convertToBlob({ type: "image/webp", quality });
  return { blob, width, height, luminance };
}

export async function addWallpaper(file: File): Promise<WallpaperRecord> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} isn't an image.`);
  }

  const bitmap = await createImageBitmap(file);
  try {
    // Downscale on the way in rather than on every paint. A 48MP phone
    // photo is otherwise decoded in full on every new tab.
    const full = await encode(bitmap, MAX_EDGE, 0.9);
    const thumb = await encode(bitmap, THUMB_EDGE, 0.75, true);

    const record: WallpaperRecord = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ""),
      blob: full.blob,
      thumb: thumb.blob,
      width: full.width,
      height: full.height,
      addedAt: Date.now(),
      luminance: thumb.luminance,
    };
    await set(record.id, record, store);
    return record;
  } finally {
    bitmap.close();
  }
}

export async function listWallpapers(): Promise<WallpaperRecord[]> {
  const all = await entries<string, WallpaperRecord>(store);
  return all.map(([, v]) => v).sort((a, b) => b.addedAt - a.addedAt);
}

export function getWallpaper(id: string) {
  return get<WallpaperRecord>(id, store);
}

export function deleteWallpaper(id: string) {
  return del(id, store);
}

export function clearWallpapers() {
  return clear(store);
}

/**
 * Object URLs leak until revoked, and a new tab is opened dozens of times
 * an hour. Every caller gets a matching revoke.
 */
/** Relative luminance of a #rrggbb / #rgb string, 0-1. */
export function colorLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0.35;
  let value = match[1];
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const n = parseInt(value, 16);
  return (
    (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
  );
}

/**
 * How bright the wallpaper actually reads, dim scrim included - so pushing
 * the dim slider up on a bright photo flips the clock to white on its own,
 * which is exactly when you'd want it to.
 */
export function effectiveLuminance(
  wallpaper: WallpaperSettings,
  record?: WallpaperRecord | null,
): number {
  const base =
    wallpaper.kind === "image"
      ? (record?.luminance ?? 0.35)
      : wallpaper.kind === "solid"
        ? colorLuminance(wallpaper.color)
        : (GRADIENTS.find((g) => g.id === wallpaper.gradientId) ?? GRADIENTS[0])
            .luminance;

  return base * (1 - wallpaper.dim / 100);
}

export function objectUrl(blob: Blob): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}
