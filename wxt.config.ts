import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],

  vite: () => ({
    plugins: [tailwindcss()],
  }),

  /**
   * `registration: "runtime"` moves a content script out of the manifest,
   * but WXT then adds its `matches` to `host_permissions` - which grants
   * <all_urls> at install and produces exactly the warning the runtime
   * registration was meant to avoid. It belongs in
   * optional_host_permissions, declared above, so strip it here.
   */
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      manifest.host_permissions = (manifest.host_permissions ?? []).filter(
        (origin: string) => origin !== "<all_urls>",
      );
    },
  },

  manifest: ({ browser }) => ({
    /**
     * The store lists an item under its package name, and nobody searches
     * for "Alcove" - the descriptor is what makes it findable under "new
     * tab". Kept to a brand plus a plain descriptor rather than a keyword
     * list, which the store treats as spam.
     */
    name: "Alcove - Custom New Tab",
    // Used wherever Chrome has no room for the full name (the toolbar,
    // the extensions list), so the browser UI stays clean.
    short_name: "Alcove",
    // Deliberately a sentence rather than a feature list: the store
    // rejects metadata that reads as a keyword run, and the summary is
    // indexed the same way the description is.
    description:
      "A calmer new tab page: your own wallpaper, the links you actually use, and small tools that open when you need them.",

    icons: {
      16: "/icon/16.png",
      32: "/icon/32.png",
      48: "/icon/48.png",
      96: "/icon/96.png",
      128: "/icon/128.png",
    },

    permissions: [
      "storage", // settings in sync, wallpapers in IndexedDB
      "unlimitedStorage", // wallpaper library will exceed the 10MB local quota
      "alarms", // the timer has to survive the service worker idling out
      "notifications", // ...and say something when it fires
      // Hands a query to the browser's own search instead of navigating to
      // an engine URL ourselves; see lib/search.ts for why that matters.
      "search",
      // Registers the on-page chat launcher at runtime, once the user has
      // opted in and granted <all_urls>. See lib/companion.ts.
      "scripting",

      // Chrome-only, and Firefox rejects the whole permission list if it
      // sees a name it doesn't know - so gate them rather than trusting
      // the packer to strip them.
      ...(browser === "chrome"
        ? [
            "sidePanel",
            // Reads Chrome's own favicon cache for quick-link icons, so the
            // user's link list never leaks to a favicon CDN.
            "favicon",
          ]
        : []),
    ],

    /**
     * Asked for at the moment the shortcut row is switched on, not at
     * install. "Read your browsing history" is a heavy thing to demand of
     * everyone who never turns the row on.
     */
    /**
     * <all_urls> is what the on-page chat launcher needs, and it is the
     * heaviest thing here - so it is requested at the moment the feature
     * is switched on, never at install. Ollama is the same bargain: only
     * someone running a local model server needs it.
     *
     * MV2 has no optional_host_permissions: Firefox takes match patterns
     * in optional_permissions alongside the API names, and silently drops
     * the whole key if it sees one it doesn't know.
     */
    optional_permissions:
      browser === "firefox"
        ? ["history", "topSites", "<all_urls>", "http://localhost/*"]
        : ["history", "topSites"],

    ...(browser === "firefox"
      ? {}
      : { optional_host_permissions: ["<all_urls>", "http://localhost/*"] }),

    // Required for direct fetch from extension-origin pages. Without these
    // the chat iframe hits CORS even though it's your own document.
    host_permissions: [
      "https://api.anthropic.com/*",
      "https://api.openai.com/*",
      "https://openrouter.ai/*",
      "https://open.er-api.com/*", // currency rates for the converter tool

      // Quick-link favicons. Fetched once per hostname, then cached in
      // IndexedDB; Settings → Links turns this off entirely.
      "https://icons.duckduckgo.com/*",
      "https://www.google.com/s2/favicons*",

      // Weather widget. Open-Meteo needs no key; the second host is its
      // geocoder, used only while searching for a city in settings.
      "https://api.open-meteo.com/*",
      "https://geocoding-api.open-meteo.com/*",

      // Track titles for the music queue come from YouTube's public,
      // keyless oEmbed endpoint; the host permission is what lets an
      // extension page read it cross-origin.
      "https://www.youtube.com/*",

    ],

    /**
     * YouTube is deliberately absent from frame-src: it refuses to play in
     * an extension page at all (no Referer header, error 153), so playback
     * goes through a relay page the user hosts - hence the static-host
     * wildcards. Scripts stay 'self'; no remote code, which is both an MV3
     * requirement and a store policy.
     */
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; frame-src 'self' https://player-html-ashy.vercel.app;",
    },

    // Content script only injects the launcher. The chat UI lives in an
    // iframe pointed at this page, so it must be web-accessible.
    web_accessible_resources: [
      {
        resources: ["chat.html", "wallpapers/*"],
        matches: ["<all_urls>"],
      },
    ],

    ...(browser === "chrome"
      ? {
          side_panel: { default_path: "sidepanel.html" },
          action: { default_title: "Open Alcove chat" },
          commands: {
            "open-chat": {
              suggested_key: { default: "Ctrl+Shift+Y", mac: "Command+Shift+Y" },
              description: "Toggle the Alcove chat panel",
            },
          },
        }
      : {}),
  }),
});

/**
 * Ollama note: a local server rejects requests from unknown origins by
 * default. Users need OLLAMA_ORIGINS to include chrome-extension://*
 * before the local provider will work. Worth putting in the README rather
 * than letting people file it as a bug.
 */
