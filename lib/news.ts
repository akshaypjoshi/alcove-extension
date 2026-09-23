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
  // Parsed rather than split on "-": a tag like zh-Hans-CN has a script
  // subtag in the middle, and taking the second part as the region asked
  // Google for edition "HANS", which is baked into the topic id below.
  let lang = "en";
  let country = "US";
  try {
    const parsed = new Intl.Locale(tag);
    lang = parsed.language || lang;
    country = (parsed.region || country).toUpperCase();
  } catch {
    const [a = "en", b = "US"] = tag.split("-");
    lang = a;
    country = b.toUpperCase();
  }
  return { hl: `${lang}-${country}`, gl: country, ceid: `${country}:${lang}` };
}

/**
 * Google's own entity id for each section, which is what the opaque topic
 * ids are built from. Language-independent: the locale goes in separately.
 */
const SECTION_TOPIC: Record<string, string> = {
  WORLD: "/m/09nm_",
  NATION: "/m/09c7w0",
  BUSINESS: "/m/09s1f",
  TECHNOLOGY: "/m/07c1v",
  SCIENCE: "/m/06mq7",
  HEALTH: "/m/0kt51",
  SPORTS: "/m/06ntj",
  ENTERTAINMENT: "/m/02jjt",
};

/** One length-delimited protobuf field. ASCII only, so length is bytes. */
function field(tag: number, text: string): string {
  return String.fromCharCode(tag, text.length) + text;
}

/**
 * The id in a /rss/topics/<id> URL.
 *
 * It is base64 protobuf wrapping a second base64 protobuf, holding the
 * section's entity id with the language and region. Reconstructing it
 * rather than shipping a table matters because the id differs per locale:
 * a hardcoded set would give every user Indian or American editions.
 *
 * Reverse-engineered by decoding what Google's own redirects hand back,
 * then checked against them byte for byte across four locales. Every
 * string here is short, so each length fits the single-byte varint case.
 */
function topicId(path: string, hl: string, gl: string): string {
  const body = field(0x0a, path) + field(0x12, hl) + field(0x1a, gl);
  const inner = String.fromCharCode(0x08, 0x10, 0x12, body.length) + body + String.fromCharCode(0x28, 0x00);
  const nested = btoa(inner).replace(/=+$/, "");
  const mid = String.fromCharCode(0x08, 0x0a) + field(0x22, nested) + String.fromCharCode(0x50, 0x01);
  const outer = String.fromCharCode(0x08, 0x00, 0x2a, mid.length) + mid;
  return btoa(outer).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * `/rss/headlines/section/topic/<SECTION>` is a retired alias. It now
 * answers a browser's request with a 403 and everything else with a
 * redirect to the canonical URL below, which is why the built-in sections
 * stopped loading while free-text topics carried on working.
 */
function feedUrl(topic: NewsTopic): string {
  const { hl, gl, ceid } = locale();
  const params = new URLSearchParams({ hl, gl, ceid });

  if (topic.kind === "query") {
    params.set("q", topic.value);
    return `${BASE}/search?${params}`;
  }

  const path = SECTION_TOPIC[topic.value];
  // A section this build does not know about is still worth a try as a
  // search for its own name, rather than a guaranteed 404.
  if (!path) {
    params.set("q", topic.label || topic.value);
    return `${BASE}/search?${params}`;
  }
  return `${BASE}/topics/${topicId(path, hl, gl)}?${params}`;
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

/** Thrown for a 403 so the caller can back off rather than hammer on. */
export class NewsBlocked extends Error {
  constructor() {
    super("Google News is turning requests away right now. Headlines will return on their own.");
    this.name = "NewsBlocked";
  }
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

  // Google answers this way when it has decided the caller is asking too
  // often, and it clears by itself. Treated as "wait", not "broken".
  if (res.status === 403 || res.status === 429) throw new NewsBlocked();
  if (!res.ok) throw new Error(`News request failed (${res.status})`);
  return parseFeed(await res.text(), topic);
}

const MAX_ITEMS = 60;

/** Between topic requests. Six at once is what trips the block. */
const SPACING = 400;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Fetched {
  items: NewsItem[];
  /** Google turned at least one request away, so back off even if some landed. */
  blocked: boolean;
}

async function request(topics: NewsTopic[]): Promise<Fetched> {
  /**
   * One at a time, spaced out.
   *
   * Six simultaneous requests is exactly the shape that gets a client
   * turned away, and six topics staggered still fill in inside a couple
   * of seconds behind a cache that paints immediately. Settled per topic,
   * not all-or-nothing: one topic with a typo should thin the list rather
   * than blank it.
   */
  const results: PromiseSettledResult<NewsItem[]>[] = [];
  for (const [i, topic] of topics.entries()) {
    if (i > 0) await pause(SPACING);
    try {
      results.push({ status: "fulfilled", value: await fetchTopic(topic) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
      // Once Google is refusing, the rest of the list will be refused
      // too. Stopping keeps a bad minute from becoming six requests that
      // dig the hole deeper.
      if (reason instanceof NewsBlocked) break;
    }
  }

  const merged = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  const blocked = results.some(
    (r) => r.status === "rejected" && r.reason instanceof NewsBlocked,
  );

  if (!merged.length) {
    const reason = results.find((r) => r.status === "rejected");
    if (reason && reason.status === "rejected") {
      throw reason.reason instanceof Error
        ? reason.reason
        : new Error("Could not load the news.");
    }
    return { items: [], blocked };
  }

  // The same story surfaces under several topics; first one wins so it
  // keeps the topic it was found under.
  const seen = new Set<string>();
  return {
    items: merged
      .filter((item) => !seen.has(item.link) && seen.add(item.link))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, MAX_ITEMS),
    blocked,
  };
}

interface Cached {
  key: string;
  items: NewsItem[];
  fetchedAt: number;
  /** Set when Google turned us away; no refresh is attempted until then. */
  blockedUntil?: number;
}

/**
 * How long to leave Google alone after a refusal.
 *
 * Every new tab reads the news, so without this a blocked user would send
 * a fresh request every time they opened one - which is the behaviour
 * that gets a client blocked in the first place.
 */
const BACKOFF = 15 * 60_000;

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
 * Refreshes already running, keyed by topic set.
 *
 * Three things read the news on one page - the ticker, the widget and the
 * tool - and each calls getNews independently. On a cold cache that was
 * three separate runs of the same six requests, which is the very pile-up
 * the sequential spacing was added to avoid. They share one now.
 */
const inFlight = new Map<string, Promise<NewsItem[] | null>>();

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

  const now = Date.now();
  const backedOff = hit?.blockedUntil != null && now < hit.blockedUntil;
  const stale = !hit || now - hit.fetchedAt > TTL;

  if (stale && !backedOff) {
    const running = inFlight.get(key);
    if (running) {
      // Somebody else is already asking for exactly this. Wait on theirs
      // if we have nothing to show, otherwise paint the cache now and let
      // their result arrive through onFresh.
      if (!hit) return running;
      running.then((items) => items && onFresh?.(items)).catch(() => {});
      return hit.items;
    }

    const pending = request(topics)
      .then(async ({ items, blocked }) => {
        await cacheStore.setValue({
          key,
          items,
          fetchedAt: Date.now(),
          // A run where one topic landed and the next was refused still
          // means Google is turning us away. Without this the refusal was
          // forgotten and the next tab walked straight back into it.
          blockedUntil: blocked ? Date.now() + BACKOFF : undefined,
        });
        return items;
      })
      .catch(async (err) => {
        // Remember a refusal so the next new tab waits rather than asking
        // again. The headlines already in hand are kept either way.
        if (err instanceof NewsBlocked) {
          await cacheStore.setValue({
            key,
            items: hit?.items ?? [],
            // Kept stale on purpose: this is not a successful refresh, so
            // the moment the backoff lapses it should try again.
            fetchedAt: hit?.fetchedAt ?? 0,
            blockedUntil: Date.now() + BACKOFF,
          });
        }
        // A failed refresh with usable headlines on hand is not an error
        // the user needs to see; a failed *first* load is.
        if (hit) return null;
        throw err;
      });

    const shared = pending.finally(() => inFlight.delete(key));
    inFlight.set(key, shared);

    if (!hit) return shared;
    shared.then((items) => items && onFresh?.(items)).catch(() => {});
  }

  // Backed off with nothing to show is not the same as "no news": the
  // panel has to say why it is empty, or it silently shows a blank feed
  // for the whole backoff and the ticker just disappears.
  if (backedOff && !hit?.items.length) throw new NewsBlocked();

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
 * user wants, so it is requested the moment the first topic is picked.
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
