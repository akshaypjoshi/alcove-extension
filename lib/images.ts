import { createStore, del, get, set } from "idb-keyval";
import { objectUrl } from "@/lib/wallpapers";

/**
 * The shared image core, used by both the drawer tool and the editor page.
 *
 * Everything here runs on the user's machine. That is the point of building
 * it at all: every site that converts or compresses an image for you takes
 * a copy of it first, and the privacy policy already promises this one
 * does not.
 */

/**
 * What a canvas can actually encode, measured rather than assumed. AVIF is
 * deliberately absent: `toDataURL("image/avif")` silently returns a PNG, so
 * offering it would hand people a mislabelled file.
 */
export const FORMATS = ["image/jpeg", "image/png", "image/webp"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABEL: Record<Format, string> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

const EXTENSION: Record<Format, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** PNG is lossless, so its encoder ignores the quality argument entirely. */
export function supportsQuality(type: Format): boolean {
  return type !== "image/png";
}

export function decode(file: File): Promise<ImageBitmap> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }
  return createImageBitmap(file);
}

export interface Sized {
  readonly width: number;
  readonly height: number;
}

/** Longest-edge clamp that never upscales, matching lib/wallpapers.ts. */
export function fit(source: Sized, maxEdge?: number) {
  const scale = maxEdge
    ? Math.min(1, maxEdge / Math.max(source.width, source.height))
    : 1;
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

export interface EncodeOptions {
  type: Format;
  quality?: number;
  /** Clamp the longest edge. Omit to keep the source size. */
  maxEdge?: number;
  /** Explicit output size, which wins over maxEdge. */
  width?: number;
  height?: number;
}

export async function encode(
  source: CanvasImageSource & Sized,
  opts: EncodeOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const target =
    opts.width && opts.height
      ? { width: opts.width, height: opts.height }
      : fit(source, opts.maxEdge);

  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser would not give us a canvas.");

  // Matters when shrinking a photo a long way; the default is noticeably
  // rougher than the browser's own downscaler at high quality.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, target.width, target.height);

  const blob = await canvas.convertToBlob({
    type: opts.type,
    quality: opts.quality,
  });
  return { blob, ...target };
}

/** Searching at this size keeps eight encodes cheap on a 12MP photo. */
const PROXY_EDGE = 2048;

export interface TargetResult {
  blob: Blob;
  quality: number;
  /** False when even the lowest quality could not get under the target. */
  hitTarget: boolean;
}

/**
 * Squeeze an image under a byte budget.
 *
 * Quality against file size is not a formula anyone can invert, so this
 * bisects it. Eight steps lands within a few percent, which is close
 * enough that a ninth is not worth the wait.
 *
 * The search runs against a proxy no larger than 2048px rather than the
 * full image: eight full-resolution encodes of a large photo is a lot of
 * work to throw away. The winning quality is then encoded once at the real
 * size and walked down if the larger image came out heavier, which it
 * usually does not by much.
 */
export async function toTargetBytes(
  source: ImageBitmap,
  opts: { type: Format; bytes: number; width?: number; height?: number },
): Promise<TargetResult> {
  if (!supportsQuality(opts.type)) {
    throw new Error(
      "PNG is lossless, so its size can only be reduced by making the image smaller. Choose JPEG or WebP, or set a size instead.",
    );
  }

  const out =
    opts.width && opts.height
      ? { width: opts.width, height: opts.height }
      : { width: source.width, height: source.height };

  const proxy = fit({ width: out.width, height: out.height }, PROXY_EDGE);
  const searchAtFullSize =
    proxy.width === out.width && proxy.height === out.height;

  let low = 0.05;
  let high = 0.95;
  let best: { blob: Blob; quality: number } | null = null;

  for (let step = 0; step < 8; step++) {
    const quality = (low + high) / 2;
    const { blob } = await encode(source, { type: opts.type, quality, ...proxy });
    if (blob.size <= opts.bytes) {
      best = { blob, quality };
      low = quality;
    } else {
      high = quality;
    }
  }

  // Nothing fit, so hand back the smallest we could make and let the caller
  // say so. A silent failure here reads as the tool being broken.
  if (!best) {
    const { blob } = await encode(source, { type: opts.type, quality: 0.05, ...proxy });
    const full = searchAtFullSize
      ? blob
      : (await encode(source, { type: opts.type, quality: 0.05, ...out })).blob;
    return { blob: full, quality: 0.05, hitTarget: false };
  }

  if (searchAtFullSize) return { ...best, hitTarget: true };

  /**
   * The proxy only approximates the real thing, so the winning quality has
   * to be checked at full size. Usually it still fits and this costs one
   * encode.
   *
   * When it does not, bisect *below* it rather than stepping down by a
   * fixed amount. A fixed step overshoots badly: aiming for 150 KB landed
   * at 107 KB, a third of the budget wasted on a file nobody asked to be
   * that small.
   */
  const atProxyQuality = await encode(source, {
    type: opts.type,
    quality: best.quality,
    ...out,
  });
  if (atProxyQuality.blob.size <= opts.bytes) {
    return { blob: atProxyQuality.blob, quality: best.quality, hitTarget: true };
  }

  let low2 = 0.05;
  let high2 = best.quality;
  let fitted: { blob: Blob; quality: number } | null = null;

  for (let step = 0; step < 4; step++) {
    const quality = (low2 + high2) / 2;
    const { blob } = await encode(source, { type: opts.type, quality, ...out });
    if (blob.size <= opts.bytes) {
      fitted = { blob, quality };
      low2 = quality;
    } else {
      high2 = quality;
    }
  }

  if (fitted) return { ...fitted, hitTarget: true };

  const { blob } = await encode(source, { type: opts.type, quality: 0.05, ...out });
  return { blob, quality: 0.05, hitTarget: blob.size <= opts.bytes };
}

/**
 * Hand a file back to the user.
 *
 * Nothing in the extension had ever done this, so there was no helper to
 * reuse. A plain anchor is enough and needs no `downloads` permission; the
 * object URL is revoked on the next frame, once the browser has taken it.
 */
export function download(blob: Blob, filename: string): void {
  const { url, revoke } = objectUrl(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(revoke, 0);
}

/** "holiday.png" and JPEG gives "holiday.jpg". */
export function renameFor(name: string, type: Format): string {
  const stem = name.replace(/\.[^.]+$/, "") || "image";
  return `${stem}.${EXTENSION[type]}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Passing an image from the drawer tool to the editor page.
 *
 * The two live in different documents, so the blob goes through IndexedDB
 * and the id travels in the URL. Its own database rather than a store
 * inside an existing one: idb-keyval only creates its own store at version
 * 1, so two createStore calls sharing a database name leave the second one
 * missing. That bug has already been paid for once here.
 */
const handoffStore = createStore("alcove-handoff", "files");

export async function stageForEditor(blob: Blob, name: string): Promise<string> {
  const id = crypto.randomUUID();
  await set(id, { blob, name, at: Date.now() }, handoffStore);
  return id;
}

/** Reads once and deletes, so a refresh cannot resurrect a stale image. */
export async function takeStaged(
  id: string,
): Promise<{ blob: Blob; name: string } | null> {
  const record = await get<{ blob: Blob; name: string }>(id, handoffStore);
  if (!record) return null;
  await del(id, handoffStore);
  return record;
}
