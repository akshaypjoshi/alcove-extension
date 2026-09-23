import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],

  vite: () => ({
    plugins: [tailwindcss()],
  }),

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

      // Chrome-only, and Firefox rejects the whole permission list if it
      // sees a name it doesn't know - so gate it rather than trusting the
      // packer to strip it.
      ...(browser === "chrome"
        ? [
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
     *
     * MV2 has no optional_host_permissions: Firefox takes match patterns
     * in optional_permissions alongside the API names, and silently drops
     * the whole key if it sees one it doesn't know.
     */
    optional_permissions:
      browser === "firefox"
        ? ["history", "topSites", "https://news.google.com/*"]
        : ["history", "topSites"],

    /**
     * news.google.com is optional rather than a required host, and asked
     * for when the user picks their first topic.
     *
     * A required host added in an update trips Chrome's permission-increase
     * flow, which disables the extension for everyone already running it
     * until they accept a fresh prompt. Not a price worth charging existing
     * users for a feature they may never open.
     */
    ...(browser === "firefox"
      ? {}
      : {
          optional_host_permissions: ["https://news.google.com/*"],
        }),

    // Required for direct fetch from extension-origin pages.
    host_permissions: [
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
     * goes through a relay page, named here as one literal origin. It must
     * be kept in step with PLAYER_URL in lib/music/config.ts. Scripts stay
     * 'self'; no remote code, which is both an MV3 requirement and a store
     * policy.
     */
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; frame-src 'self' https://player-html-ashy.vercel.app;",
    },

    /**
     * No web_accessible_resources at all.
     *
     * The only entry was `wallpapers/*` for the injected chat iframe, and
     * both are gone: uploaded wallpapers are blobs out of IndexedDB, and
     * nothing on the open web embeds a page of ours any more. Extension
     * pages opening each other never needed it. Dropping the key takes
     * the last `<all_urls>` out of the manifest.
     */

    action: { default_title: "Open Alcove" },
  }),
});
