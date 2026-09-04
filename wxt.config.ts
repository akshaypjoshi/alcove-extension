import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],

  vite: () => ({
    plugins: [tailwindcss()],
  }),

  manifest: ({ browser }) => ({
    name: "Alcove",
    description: "A quiet corner of your browser.",

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
      // sees a name it doesn't know — so gate them rather than trusting
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
    optional_permissions: ["history", "topSites"],

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

      "http://localhost/*", // Ollama; see note below
    ],

    /**
     * YouTube is deliberately absent from frame-src: it refuses to play in
     * an extension page at all (no Referer header, error 153), so playback
     * goes through a relay page the user hosts — hence the static-host
     * wildcards. Scripts stay 'self'; no remote code, which is both an MV3
     * requirement and a store policy.
     */
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; frame-src 'self' https://*.github.io https://*.pages.dev https://*.netlify.app https://*.vercel.app;",
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
