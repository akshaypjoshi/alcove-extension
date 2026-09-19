import { storage } from "#imports";

/**
 * Headlines, filtered to topics the user picked.
 *
 * Google News RSS is the source for the same reason Open-Meteo is the one
 * for weather: it needs no key, no account and no signup, which is what
 * lets the privacy policy keep saying there is no backend. Every keyed
 * alternative either forbids browser use on its free tier or hands out a
 * quota too small to ship.
 *
 * It also covers both halves of the feature from one endpoint family: the
 * eight built-in sections, and arbitrary search queries for "follow this
 * subject". One parser, one cache, one merge.
 *
 * The trade-off is that it is undocumented. There is no contract here, so
 * the parser assumes nothing beyond RSS 2.0 and every failure degrades to
 * a visible message rather than an empty panel.
 */

const BASE = "https://news.google.com/rss";

export const NEWS_ORIGIN = "https://news.google.com/*";

/** Google's own section ids. The labels are ours. */
export const NEWS_SECTIONS: { value: string; label: string }[] = [
  { value: "WORLD", label: "World" },
  { value: "NATION", label: "Nation" },
  { value: "BUSINESS", label: "Business" },
  { value: "TECHNOLOGY", label: "Technology" },
  { value: "SCIENCE", label: "Science" },
  { value: "HEALTH", label: "Health" },
  { value: "SPORTS", label: "Sports" },
  { value: "ENTERTAINMENT", label: "Entertainment" },
];

/** Each topic is one request, so the list is capped rather than unbounded. */
export const MAX_TOPICS = 6;

export interface NewsTopic {
  id: string;
  /** A built-in section, or free text run through the search feed. */
  kind: "section" | "query";
  value: string;
  label: string;
}

export interface NewsItem {
  title: string;
  /** A news.google.com redirect, not the publisher's own URL. */
  link: string;
  publishedAt: number;
  source: string;
  /** The publisher's origin, which is what makes a favicon possible. */
  sourceUrl: string;
  /** Which of the user's topics this arrived under. */
  topicId: string;
}

/**
 * Google wants three overlapping locale parameters. Deriving them from the
 * browser's own language is better than a picker nobody would find: a user
 * in India gets Indian editions without being asked.
 */
function locale() {
  const tag = navigator.language || "en-US";
  const [lang = "en", region = "US"] = tag.split("-");
  const country = region.toUpperCase();
  return { hl: `${lang}-${country}`, gl: country, ceid: `${country}:${lang}` };
}

function feedUrl(topic: NewsTopic): string {
  const { hl, gl, ceid } = locale();
  const params = new URLSearchParams({ hl, gl, ceid });

  if (topic.kind === "query") {
    params.set("q", topic.value);
    return `${BASE}/search?${params}`;
  }
  return `${BASE}/headlines/section/topic/${encodeURIComponent(topic.value)}?${params}`;
}

/**
 * Every headline arrives as "Some story - The Publisher". The suffix is
 * already shown separately as the source, so it is redundant twice over.
 * Anchored to the end and length-bounded so a title that legitimately
 * contains a dash keeps it.
 */
function stripSuffix(title: string, source: string): string {
  const trimmed = title.trim();

  if (source && trimmed.endsWith(` - ${source}`)) {
    const once = trimmed.slice(0, -(source.length + 3)).trim();

    /**
     * Some publishers put their own name in the headline as well, so the
     * brand arrives twice: "... drop prices - GSMArena.com news -
     * gsmarena.com". One pass leaves the other copy behind.
     *
     * The second pass matches on the source's own domain root rather than
     * any trailing " - words", because a headline can legitimately end in
     * a dashed subtitle and that should survive.
     */
    const root = source.toLowerCase().replace(/^www\./, "").split(".")[0];
    const tail = /\s+-\s+([^-]{2,40})$/.exec(once);
    if (
      root &&
      tail &&
      tail[1].toLowerCase().replace(/[^a-z0-9]/g, "").includes(root)
    ) {
      return once.slice(0, tail.index).trim();
    }
    return once;
  }

  return trimmed.replace(/\s+-\s+[^-]{2,40}$/, "").trim();
}

function textOf(parent: Element, tag: string): string {
  return parent.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function parseFeed(xml: string, topic: NewsTopic): NewsItem[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  // DOMParser reports XML failures as a node in the output rather than by
  // throwing, so this is the only way to tell a parse error from an empty
  // feed.
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The news feed came back in a format we could not read.");
  }

  const items: NewsItem[] = [];
  for (const node of Array.from(doc.getElementsByTagName("item"))) {
    const link = textOf(node, "link");
    if (!link) continue;

    const sourceNode = node.getElementsByTagName("source")[0];
    const source = sourceNode?.textContent?.trim() ?? "";
    const published = Date.parse(textOf(node, "pubDate"));

    items.push({
      title: stripSuffix(textOf(node, "title"), source),
      link,
      publishedAt: Number.isNaN(published) ? Date.now() : published,
      source,
      sourceUrl: sourceNode?.getAttribute("url") ?? "",
      topicId: topic.id,
    });
  }
  return items;
}

async function fetchTopic(topic: NewsTopic): Promise<NewsItem[]> {
  let res: Response;
  try {
    res = await fetch(feedUrl(topic));
  } catch {
    // fetch rejects with a bare TypeError for a dropped connection and for
    // a revoked host permission alike, and "Failed to fetch" in a panel
    // tells the user nothing they can act on.
    throw new Error("Could not reach Google News. Check your connection.");
  }
  if (!res.ok) throw new Error(`News request failed (${res.status})`);
  return parseFeed(await res.text(), topic);
}

const MAX_ITEMS = 60;

async function request(topics: NewsTopic[]): Promise<NewsItem[]> {
  // allSettled, not all: one topic with a typo or a section Google has
  // retired should thin the list, not blank it.
  const results = await Promise.allSettled(topics.map(fetchTopic));

  const merged = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  if (!merged.length) {
    const reason = results.find((r) => r.status === "rejected");
    if (reason && reason.status === "rejected") {
      throw reason.reason instanceof Error
        ? reason.reason
        : new Error("Could not load the news.");
    }
    return [];
  }

  // The same story surfaces under several topics; first one wins so it
  // keeps the topic it was found under.
  const seen = new Set<string>();
  return merged
    .filter((item) => !seen.has(item.link) && seen.add(item.link))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_ITEMS);
}

interface Cached {
  key: string;
  items: NewsItem[];
  fetchedAt: number;
}

const cacheStore = storage.defineItem<Cached | null>("local:news", {
  fallback: null,
});

const TTL = 20 * 60_000;

/**
 * One slot rather than a map, like the weather cache: the key folds in the
 * topic set and the locale, so changing either counts as a miss instead of
 * accumulating a second entry that never gets evicted.
 */
function cacheKey(topics: NewsTopic[]): string {
  const { ceid } = locale();
  return `${ceid}|${topics.map((t) => `${t.kind}:${t.value}`).sort().join(",")}`;
}

/**
 * Stale-while-revalidate. A new tab must never wait on the network to
 * paint, so cached headlines come back immediately and `onFresh` fires
 * later if a refresh actually landed.
 */
export async function getNews(
  topics: NewsTopic[],
  onFresh?: (items: NewsItem[]) => void,
): Promise<NewsItem[] | null> {
  if (!topics.length) return [];

  const key = cacheKey(topics);
  const cached = await cacheStore.getValue();
  const hit = cached?.key === key ? cached : null;

  const stale = !hit || Date.now() - hit.fetchedAt > TTL;

  if (stale) {
    const pending = request(topics)
      .then(async (items) => {
        await cacheStore.setValue({ key, items, fetchedAt: Date.now() });
        return items;
      })
      .catch((err) => {
        // A failed refresh with usable headlines on hand is not an error
        // the user needs to see; a failed *first* load is.
        if (hit) return null;
        throw err;
      });

    if (!hit) return pending;
    pending.then((items) => items && onFresh?.(items)).catch(() => {});
  }

  return hit?.items ?? null;
}

/** Drops the cache so the next read refetches. Backs the refresh button. */
export async function clearNewsCache(): Promise<void> {
  await cacheStore.setValue(null);
}

/**
 * news.google.com is an optional host permission, not a required one.
 *
 * Adding a required host in an update trips Chrome's permission-increase
 * flow, which disables the extension for everyone already running it until
 * they accept a new prompt. That is a steep price for a feature not every
 * user wants, so this follows the same request-on-use shape as the on-page
 * chat launcher in lib/companion.ts.
 */
export function hasNewsPermission(): Promise<boolean> {
  return Promise.resolve(
    browser.permissions.contains({ origins: [NEWS_ORIGIN] }),
  ).catch(() => false);
}

/**
 * Must be called from a user gesture. Chrome rejects permissions.request
 * outside one, and the rejection is indistinguishable from a refusal.
 */
export function requestNewsPermission(): Promise<boolean> {
  return Promise.resolve(
    browser.permissions.request({ origins: [NEWS_ORIGIN] }),
  ).catch(() => false);
}

/** Hands the host back, so a switched-off feature leaves no grant behind. */
export async function revokeNewsPermission(): Promise<void> {
  await clearNewsCache();
  try {
    await browser.permissions.remove({ origins: [NEWS_ORIGIN] });
  } catch {
    // Firefox can refuse to drop an origin. The feature is off either way.
  }
}

/** "2h", "5m", "3d". Long enough ago and the date is more use than the gap. */
export function relativeTime(ts: number, now = Date.now()): string {
  const mins = Math.round((now - ts) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days}d`;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
