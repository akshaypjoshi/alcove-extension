import { storage } from "#imports";
import { BROWSER_ENGINE, hasBrowserSearch } from "@/lib/search";
import { useCallback, useEffect, useState } from "react";
import type { Units, WeatherLocation } from "./weather";
import type { RecentSource } from "./recents";

/**
 * Everything the user can configure lives in one object in `sync` storage,
 * so a fresh browser profile signed into the same account picks up the
 * exact same new tab. Two things deliberately stay out of it:
 *
 *   - API keys, which go in `local` (sync storage is not encrypted, and a
 *     key silently replicating to every machine you sign into is not a
 *     property anyone asked for).
 *   - Wallpaper bitmaps, which go in IndexedDB (see lib/wallpapers.ts).
 *     `sync` caps a single item at 8KB; one photo is three orders of
 *     magnitude past that.
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
 * Widget sizes follow the iOS convention — a square unit and a double-wide
 * one — rather than free resizing. Two fixed shapes are what let a row of
 * unrelated widgets line up instead of looking like floating boxes.
 */
export type WidgetSize = "sm" | "md";

/**
 * Six anchor zones rather than free x/y. Absolute coordinates would need
 * collision handling against the rails, the dock and the chat button, and
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
   * Per-instance choices declared by the widget itself (see `options` in
   * lib/widgets.tsx) — the clock's analogue/digital style and time zone,
   * for instance. Kept as loose strings so the registry owns the meaning
   * and settings can render the controls generically.
   */
  config?: Record<string, string>;
}

export type DockPosition = "bottom" | "left" | "right";

export interface DockSettings {
  position: DockPosition;
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

export interface AiSettings {
  providerId: string;
  model: string;
  systemPrompt: string;
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
  showWidgets: boolean;
  widgets: WidgetInstance[];
  weather: WeatherSettings;
  quickLinks: QuickLink[];
  /** IANA zones shown by the World Clock tool. */
  worldClocks: string[];
  wallpaper: WallpaperSettings;
  ai: AiSettings;
}

export const SEARCH_ENGINES: Record<
  string,
  // label reads inside "Search %s, or type a URL"; menuLabel is what the
  // settings dropdown needs instead, where "the web" says nothing about
  // which engine you'd actually get.
  { label: string; url: string; menuLabel?: string }
> = {
  // Handed to browser.search rather than navigated to, so the request is
  // the one the address bar would have made — see lib/search.ts. The url
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
  dock: { position: "bottom", size: 44, magnify: true, magnification: 1.65 },
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
  ],
  showWidgets: true,
  // Enabled out of the box with no location set: the card's own "pick a
  // city" state is better onboarding than an empty page plus a settings
  // panel the user has to go find.
  widgets: [
    { id: "weather", type: "weather", size: "md", placement: "top-right" },
  ],
  weather: { location: null, units: "metric" },
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
  ai: {
    providerId: "anthropic",
    model: "claude-opus-5",
    systemPrompt:
      "You are Alcove, a concise assistant living in a browser new tab. Answer directly, skip preamble, and prefer short paragraphs or tight lists.",
  },
};

export const settingsStore = storage.defineItem<Settings>("sync:settings", {
  fallback: DEFAULT_SETTINGS,
  version: 1,
});

/** Keyed by provider id. Local-only, never synced. */
export const apiKeysStore = storage.defineItem<Record<string, string>>(
  "local:apiKeys",
  { fallback: {} },
);

/**
 * A stored object written by an older build is missing whatever keys were
 * added since. Merging against the defaults on read means new fields just
 * appear, instead of rendering `undefined` and crashing a toFixed() call
 * three components down.
 */
function hydrate(value: Settings | null): Settings {
  if (!value) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    wallpaper: { ...DEFAULT_SETTINGS.wallpaper, ...value.wallpaper },
    weather: { ...DEFAULT_SETTINGS.weather, ...value.weather },
    dock: { ...DEFAULT_SETTINGS.dock, ...value.dock },
    // Instances stored before placements existed have no zone; anchor them
    // top-right rather than dropping them off the page.
    widgets: (value.widgets ?? DEFAULT_SETTINGS.widgets).map((w) => ({
      ...w,
      placement: w.placement ?? "top-right",
    })),
    ai: { ...DEFAULT_SETTINGS.ai, ...value.ai },

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
   * push the new value back into state — one source of truth, and every
   * open tab updates at the same time.
   */
  const update = useCallback(async (patch: Partial<Settings>) => {
    const current = hydrate(await settingsStore.getValue());
    await settingsStore.setValue({ ...current, ...patch });
  }, []);

  const reset = useCallback(() => settingsStore.setValue(DEFAULT_SETTINGS), []);

  return { settings, update, reset, loading: settings === null };
}

export function useApiKeys() {
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    apiKeysStore.getValue().then(setKeys);
    return apiKeysStore.watch((v) => setKeys(v ?? {}));
  }, []);

  const setKey = useCallback(async (providerId: string, key: string) => {
    const current = (await apiKeysStore.getValue()) ?? {};
    await apiKeysStore.setValue({ ...current, [providerId]: key });
  }, []);

  return { keys, setKey };
}
