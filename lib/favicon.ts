import { createStore, get, set } from "idb-keyval";

/**
 * Quick-link icons, resolved in order of least-invasive-first:
 *
 *   1. An emoji the user typed — always wins.
 *   2. A blob already cached in IndexedDB.
 *   3. Chrome's own on-disk favicon cache (no network at all) — but it
 *      only knows sites you've actually visited, and it answers with a
 *      generic globe rather than a 404 for the rest, so it can't be the
 *      only source or every fresh profile shows five grey globes.
 *   4. A favicon service, fetched once and then cached forever.
 *   5. The first letter of the title.
 *
 * Step 4 is the only one that touches the network, it happens once per
 * hostname for the lifetime of the install, and Settings → Links can turn
 * it off.
 */

// Its own database — see the note in lib/wallpapers.ts.
// Unchanged by the rename — see the note in lib/wallpapers.ts.
const store = createStore("tabby-favicons", "favicons");

interface CachedIcon {
  blob: Blob;
  fetchedAt: number;
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function initials(title: string): string {
  return title.trim().slice(0, 1).toUpperCase() || "?";
}

/** Accepts "github.com" as readily as a full URL. */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Google first, and given the full origin rather than the bare hostname —
 * that's what makes mail.google.com and calendar.google.com resolve to the
 * Gmail envelope and the Calendar tile instead of a generic Google "G".
 * DuckDuckGo answers per registered domain, so every *.google.com link
 * comes back byte-identical; it's the fallback, not the first choice.
 *
 * Only the origin is ever sent — never the path or query of the page.
 * 64px so the 16px rail render stays crisp on a retina display.
 */
function sources(origin: string, host: string): string[] {
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  ];
}

async function fetchIcon(origin: string, host: string): Promise<Blob | null> {
  for (const url of sources(origin, host)) {
    try {
      const res = await fetch(url);
      // Google answers 404 for a domain it has nothing for, which is the
      // signal to move on rather than cache a placeholder.
      if (!res.ok) continue;
      const blob = await res.blob();
      // Both services answer 200 with an empty or near-empty body when
      // they have nothing; a real icon is never this small.
      if (blob.size < 100) continue;
      return blob;
    } catch {
      // Network refused or blocked — try the next source.
    }
  }
  return null;
}

/**
 * Object URLs are cached per hostname for the life of the document and
 * deliberately never revoked: several links can share a host, and handing
 * the same URL to two components means whichever unmounts first would
 * break the other. A new tab is torn down in seconds, which reclaims them.
 */
const objectUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

async function resolve(
  origin: string,
  host: string,
  allowRemote: boolean,
): Promise<string | null> {
  const existing = objectUrls.get(host);
  if (existing) return existing;

  const cached = await get<CachedIcon>(host, store);
  let blob = cached?.blob ?? null;

  if (!blob && allowRemote) {
    blob = await fetchIcon(origin, host);
    if (blob) await set(host, { blob, fetchedAt: Date.now() } satisfies CachedIcon, store);
  }

  if (!blob) return null;

  const url = URL.createObjectURL(blob);
  objectUrls.set(host, url);
  return url;
}

/**
 * Deduped by hostname: five links to the same host trigger one fetch, not
 * five, and the second new tab of the session doesn't refetch at all.
 */
export function faviconFor(pageUrl: string, allowRemote: boolean): Promise<string | null> {
  let origin: string;
  let host: string;
  try {
    const parsed = new URL(pageUrl);
    origin = parsed.origin;
    host = parsed.hostname;
  } catch {
    return Promise.resolve(null);
  }

  const pending = inflight.get(host);
  if (pending) return pending;

  const promise = resolve(origin, host, allowRemote).finally(() =>
    inflight.delete(host),
  );
  inflight.set(host, promise);
  return promise;
}

/**
 * Chrome's local cache. Free and offline, but returns a placeholder globe
 * for anything unvisited — so it's the fallback, not the first choice.
 */
export function localFaviconUrl(pageUrl: string, size = 32): string | null {
  try {
    const base = browser.runtime.getURL("/_favicon/" as any);
    const url = new URL(base);
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", String(size));
    return url.toString();
  } catch {
    return null;
  }
}

/** Drops every cached icon, so the next render re-fetches. */
export async function clearFaviconCache() {
  const { clear } = await import("idb-keyval");
  objectUrls.clear();
  await clear(store);
}
