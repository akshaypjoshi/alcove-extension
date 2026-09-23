import { storage } from "#imports";
import { BROWSER_ENGINE, hasBrowserSearch } from "@/lib/search";
import { useCallback, useEffect, useState } from "react";
import type { Units, WeatherLocation } from "./weather";
import type { RecentSource } from "./recents";
import type { NewsTopic } from "./news";

/**
 * Everything the user can configure lives in one object in `sync` storage,
 * so a fresh browser profile signed into the same account picks up the
 * exact same new tab. Wallpaper bitmaps deliberately stay out of it, in
 * IndexedDB (see lib/wallpapers.ts): `sync` caps a single item at 8KB, and
 * one photo is three orders of magnitude past that.
 */

export type ThemeMode = "system" | "light" | "dark";
export type ClockFormat = "12h" | "24h";
export type Layout = "center" | "left";

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  /** Optional emoji; falls back to a favicon, then to the first letter. */
  icon?: string;
}

export interface WallpaperSettings {
  kind: "gradient" | "image" | "solid";
  /** Id from GRADIENTS, when kind === "gradient". */
  gradientId: string;
  /** Key into the IndexedDB wallpaper store, when kind === "image". */
  imageId: string | null;
  /** CSS color, when kind === "solid". */
  color: string;
  /** 0-20px of blur over the wallpaper, keeps foreground text readable. */
  blur: number;
  /** 0-80% black scrim. */
  dim: number;
  /** Rotate through every uploaded image, one per new tab. */
  shuffle: boolean;
}

/**
 * Widget sizes follow the iOS convention - a square unit and a double-wide
 * one - rather than free resizing. Two fixed shapes are what let a row of
 * unrelated widgets line up instead of looking like floating boxes.
 */
export type WidgetSize = "sm" | "md";

/**
 * Six anchor zones rather than free x/y. Absolute coordinates would need
 * collision handling against the rails, the dock and the music button, and
 * would land somewhere different on every window size. Anchors survive a
 * resize and can't overlap the furniture.
 */
export type WidgetPlacement =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export const WIDGET_PLACEMENTS: { id: WidgetPlacement; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-center", label: "Top centre" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-center", label: "Bottom centre" },
  { id: "bottom-right", label: "Bottom right" },
];

export interface WidgetInstance {
  /** Stable across reorders; also the React key. */
  id: string;
  /** Key into the registry in lib/widgets.tsx. */
  type: string;
  size: WidgetSize;
  placement: WidgetPlacement;
  /**
   * Widgets sharing a stack id in the same zone occupy one slot and show
   * one at a time, the way iOS stacks do. Absent means its own slot, so
   * every widget saved before stacks existed keeps its place.
   */
  stack?: string;
  /**
   * Per-instance choices declared by the widget itself (see `options` in
   * lib/widgets.tsx) - the clock's analogue/digital style and time zone,
   * for instance. Kept as loose strings so the registry owns the meaning
   * and settings can render the controls generically.
   */
  config?: Record<string, string>;
}

export type DockPosition = "bottom" | "left" | "right";

export type DockLayout = "dock" | "grid";

export interface DockSettings {
  position: DockPosition;
  /**
   * Whether the tools sit on screen as a dock, or behind one button that
   * opens a labelled grid. The grid trades always-visible icons for names
   * and an uncluttered page; the dock trades the names for one less click.
   */
  layout: DockLayout;
  /** Base icon box in px, before any magnification. */
  size: number;
  magnify: boolean;
  /** Peak scale directly under the pointer. */
  magnification: number;
}

export interface WeatherSettings {
  location: WeatherLocation | null;
  units: Units;
}

export interface NewsSettings {
  /**
   * Empty on a fresh install, deliberately. Nothing is fetched and no
   * permission is asked for until the user picks a topic, so the feature
   * costs an uninterested user nothing.
   */
  topics: NewsTopic[];
  /** Scrolling strip along the bottom edge, the way a news channel does it. */
  ticker: boolean;
}

export interface ImageSettings {
  /** Remembered from the last export, so the tool opens where you left it. */
  format: string;
  quality: number;
}

export interface Settings {
  version: 1;
  theme: ThemeMode;
  layout: Layout;
  displayName: string;
  showGreeting: boolean;
  showClock: boolean;
  showSeconds: boolean;
  clockFormat: ClockFormat;
  showSearch: boolean;
  searchEngine: string;
  /** Shortcut tiles under the search bar. Needs an optional permission. */
  showRecent: boolean;
  recentSource: RecentSource;
  recentCount: number;
  showQuickLinks: boolean;
  /**
   * Fetch real site favicons over the network (cached forever after the
   * first hit). Off falls back to Chrome's local favicon cache, which only
   * knows sites you've already visited.
   */
  fetchLinkIcons: boolean;
  showTools: boolean;
  dock: DockSettings;
  /** Ids from lib/tools registry, in dock order. */
  enabledTools: string[];
  /**
   * Every tool id this profile has been offered, switched on or not.
   *
   * Without it there is no way to tell "turned this off" from "has never
   * seen it", and a stored enabledTools array beats the defaults on read -
   * so a tool added in a later version would stay invisible forever to
   * everyone who already had Alcove installed. See hydrate().
   */
  knownTools: string[];
  /** Set once the welcome pass has been seen or skipped. */
  onboarded: boolean;
  showWidgets: boolean;
  widgets: WidgetInstance[];
  /** Seconds between stack rotations. 0 turns rotation off. */
  widgetRotate: number;
  weather: WeatherSettings;
  news: NewsSettings;
  images: ImageSettings;
  quickLinks: QuickLink[];
  /** IANA zones shown by the World Clock tool. */
  worldClocks: string[];
  wallpaper: WallpaperSettings;
}

/**
 * Ceilings on the lists that live in the settings object.
 *
 * `storage.sync` refuses any single item over 8KB, and the whole of
 * settings is one item. Measured, a profile with 25 links, 8 widgets and
 * 15 clocks comes to about 8,050 bytes - so the cliff is reachable by
 * someone just using the thing, and going over it fails silently: the
 * write is rejected, the watcher never fires, and every later save fails
 * the same way.
 *
 * Sized from the real costs: roughly 1,960 bytes before any list, then
 * 147 per link, 217 per widget and 33 per zone. At these caps the worst
 * case anyone can reach - longest names, every widget stacked and
 * configured - is about 6,700 bytes, or 82% of the limit.
 */
export const LIMITS = {
  quickLinks: 18,
  widgets: 8,
  worldClocks: 12,
} as const;

export const SEARCH_ENGINES: Record<
  string,
  // label reads inside "Search %s, or type a URL"; menuLabel is what the
  // settings dropdown needs instead, where "the web" says nothing about
  // which engine you'd actually get.
  { label: string; url: string; menuLabel?: string }
> = {
  // Handed to browser.search rather than navigated to, so the request is
  // the one the address bar would have made - see lib/search.ts. The url
  // is only the fallback for a browser without the API.
  browser: {
    label: "the web",
    menuLabel: "Browser default",
    url: "https://duckduckgo.com/?q=%s",
  },
  google: { label: "Google", url: "https://www.google.com/search?q=%s" },
  duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  bing: { label: "Bing", url: "https://www.bing.com/search?q=%s" },
  brave: { label: "Brave", url: "https://search.brave.com/search?q=%s" },
  perplexity: { label: "Perplexity", url: "https://www.perplexity.ai/?q=%s" },
};

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: "system",
  layout: "center",
  displayName: "",
  showGreeting: true,
  showClock: true,
  showSeconds: false,
  clockFormat: "12h",
  showSearch: true,
  searchEngine: "browser",
  showRecent: false,
  recentSource: "history",
  recentCount: 5,
  showQuickLinks: true,
  fetchLinkIcons: true,
  showTools: true,
  dock: {
    position: "bottom",
    layout: "dock",
    size: 44,
    magnify: true,
    magnification: 1.65,
  },
  enabledTools: [
    "world-clock",
    "calculator",
    "units",
    "currency",
    "timer",
    "reminders",
    "todos",
    "notes",
    "json",
    "lorem",
    "color",
    "text",
    "news",
    "images",
    "ip",
  ],
  knownTools: [],
  onboarded: false,
  showWidgets: true,
  widgetRotate: 20,
  // Enabled out of the box with no location set: the card's own "pick a
  // city" state is better onboarding than an empty page plus a settings
  // panel the user has to go find.
  widgets: [
    { id: "weather", type: "weather", size: "md", placement: "top-right" },
  ],
  weather: { location: null, units: "metric" },
  news: { topics: [], ticker: false },
  images: { format: "image/jpeg", quality: 0.85 },
  quickLinks: [
    { id: "gh", title: "GitHub", url: "https://github.com" },
    { id: "gm", title: "Gmail", url: "https://mail.google.com" },
    { id: "cal", title: "Calendar", url: "https://calendar.google.com" },
    { id: "yt", title: "YouTube", url: "https://youtube.com" },
    { id: "cl", title: "Claude", url: "https://claude.ai" },
  ],
  worldClocks: ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Kolkata"],
  wallpaper: {
    kind: "gradient",
    gradientId: "dusk",
    imageId: null,
    color: "#111827",
    blur: 0,
    dim: 20,
    shuffle: false,
  },
};

export const settingsStore = storage.defineItem<Settings>("sync:settings", {
  fallback: DEFAULT_SETTINGS,
  version: 1,
});

/**
 * Erases what the removed AI chat left on the machine.
 *
 * Deleting a feature does not delete what it stored, and what this one
 * stored is the worse half: an API key the user pasted in, and the full
 * text of every conversation they had with it. Neither has any UI left
 * that could reach them, so nothing but this will ever clear them.
 *
 * The launcher is the other half. It registered a content script for
 * `<all_urls>` that persists across sessions, so the grant and possibly
 * the registration outlive the code that used them. Both are handed back
 * here rather than left to Chrome to tidy up.
 */
export async function forgetRemovedChat(): Promise<void> {
  const keys = [
    "local:apiKeys",
    "local:companionEnabled",
    // One transcript per surface the chat could open in.
    "local:chat:newtab",
    "local:chat:sidepanel",
    "local:chat:floating",
  ] as const;

  for (const key of keys) {
    try {
      await storage.removeItem(key);
    } catch {
      // A key that was never written is not a failure; neither is one
      // browser disagreeing about removing it.
    }
  }

  try {
    await browser.scripting?.unregisterContentScripts({
      ids: ["alcove-companion"],
    });
  } catch {
    // Already gone, or the permission went with the manifest entry.
  }

  try {
    await browser.permissions.remove({ origins: ["<all_urls>"] });
  } catch {
    // Never granted, or Firefox refusing to drop it. Either way the
    // feature it belonged to no longer exists.
  }
}

/**
 * A stored object written by an older build is missing whatever keys were
 * added since. Merging against the defaults on read means new fields just
 * appear, instead of rendering `undefined` and crashing a toFixed() call
 * three components down.
 */
/**
 * The tool ids that shipped before `knownTools` existed.
 *
 * A profile written by one of those builds cannot say which tools it was
 * offered, so it is taken to have seen exactly these. Anything switched
 * off back then stays off; anything added since is genuinely new and gets
 * switched on once. This list never grows - later additions are covered
 * by `knownTools` itself.
 */
const TOOLS_BEFORE_KNOWN = [
  "world-clock",
  "calculator",
  "units",
  "currency",
  "timer",
  "reminders",
  "todos",
  "notes",
  "json",
  "lorem",
  "color",
  "text",
];

/**
 * Which tools a profile has already been offered.
 *
 * `knownTools` answers this outright, but a profile written before it
 * existed has to be read from its own shape. The twelve above shipped in
 * the first release; News and Images arrived later, each alongside its own
 * settings object, so the presence of `news` or `images` is what says this
 * profile met that tool and chose.
 *
 * Listing News among the originals - as this did at first - is not a
 * harmless guess. It tells every upgrading profile that News was already
 * offered and declined, so the tool never appears for anyone, and the
 * result is written into `knownTools` on the next save, where no later
 * release can tell it apart from a real decision.
 */
function toolsOffered(value: Settings): string[] {
  if (value.knownTools?.length) return value.knownTools;

  const seen = [...(value.enabledTools ?? []), ...TOOLS_BEFORE_KNOWN];
  if (value.news) seen.push("news");
  if (value.images) seen.push("images");
  return seen;
}

function hydrate(value: Settings | null): Settings {
  if (!value) return DEFAULT_SETTINGS;

  const seen = toolsOffered(value);
  const enabled = value.enabledTools ?? DEFAULT_SETTINGS.enabledTools;
  const fresh = DEFAULT_SETTINGS.enabledTools.filter((id) => !seen.includes(id));

  // `ai` belonged to the removed chat. Left in the spread it would be
  // written back to sync storage forever, costing ~260 bytes of an
  // 8KB per-item cap for a feature that no longer exists.
  const { ai: _removed, ...carried } = value as Settings & { ai?: unknown };

  return {
    ...DEFAULT_SETTINGS,
    ...carried,
    // New tools join the end of the user's own order rather than jumping
    // into the middle of it.
    enabledTools: [...new Set([...enabled, ...fresh])],
    knownTools: [...new Set([...seen, ...DEFAULT_SETTINGS.enabledTools])],
    wallpaper: { ...DEFAULT_SETTINGS.wallpaper, ...value.wallpaper },
    weather: { ...DEFAULT_SETTINGS.weather, ...value.weather },
    news: { ...DEFAULT_SETTINGS.news, ...value.news },
    images: { ...DEFAULT_SETTINGS.images, ...value.images },
    dock: { ...DEFAULT_SETTINGS.dock, ...value.dock },
    // Instances stored before placements existed have no zone; anchor them
    // top-right rather than dropping them off the page.
    widgets: (value.widgets ?? DEFAULT_SETTINGS.widgets).map((w) => ({
      ...w,
      placement: w.placement ?? "top-right",
    })),

    // Hard-wired Google was the setting that produced the captcha: a
    // refererless cross-site jump to /search from an extension origin.
    // Moved to the browser's own search, which for anyone who had picked
    // Google is still Google. Settings can put it back.
    searchEngine:
      value.searchEngine === "google" && hasBrowserSearch()
        ? BROWSER_ENGINE
        : (value.searchEngine ?? DEFAULT_SETTINGS.searchEngine),
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    settingsStore.getValue().then((v) => alive && setSettings(hydrate(v)));
    const unwatch = settingsStore.watch((v) => setSettings(hydrate(v)));
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  /**
   * Patch-style update. Writes straight to storage and lets the watcher
   * push the new value back into state - one source of truth, and every
   * open tab updates at the same time.
   */
  /**
   * Patch-style update.
   *
   * The patch may be a function of the current settings, which is the
   * only safe form when the new value is derived from the old one: two
   * plain-object patches built from the same React render - adding two
   * quick links quickly, or switching on two tools from the grid - both
   * carry the same stale array, and the second silently drops the first.
   *
   * Sync storage caps one item at 8KB and rate-limits writes, and a
   * rejection here is otherwise invisible: the watcher never fires, the
   * control snaps back, and every later save fails the same way.
   */
  const update = useCallback(
    async (patch: Partial<Settings> | ((current: Settings) => Partial<Settings>)) => {
      try {
        const current = hydrate(await settingsStore.getValue());
        const next = typeof patch === "function" ? patch(current) : patch;
        await settingsStore.setValue({ ...current, ...next });
      } catch (err) {
        console.error("[alcove] could not save settings:", err);
        throw err;
      }
    },
    [],
  );

  const reset = useCallback(() => settingsStore.setValue(DEFAULT_SETTINGS), []);

  return { settings, update, reset, loading: settings === null };
}

