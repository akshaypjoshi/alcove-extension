# Alcove

A quiet corner of your browser.

Your own wallpapers, the links you actually use, a dock of small tools, and a
bring-your-own-key AI chat available on the new tab, in the side panel, and as
a floating panel on any page.

Built with [WXT](https://wxt.dev) + React + Tailwind v4 + shadcn/ui.

## Quick start

```bash
pnpm install
pnpm dev          # launches Chrome with the extension loaded, hot reload on
pnpm build        # production build → .output/chrome-mv3
pnpm zip          # packaged for the Chrome Web Store
```

To load a production build by hand: `chrome://extensions` → enable Developer
mode → **Load unpacked** → pick `.output/chrome-mv3`.

Firefox: `pnpm dev:firefox` / `pnpm build:firefox`. Everything works except the
side panel and new-tab override, neither of which Firefox supports the same way
— the floating chat and the tools are unaffected.

## What's in it

| Surface | Where |
|---|---|
| New tab | clock, greeting, search, quick-link rail, tool dock, chat |
| Side panel | the same chat, docked (toolbar icon, or `⌘⇧Y` / `Ctrl+Shift+Y`) |
| Any page | a launcher button that opens the chat in a floating panel |

**The dock** sits along the bottom by default and behaves like the macOS one:
icons swell under the pointer with a gaussian falloff, neighbours slide out of
the way, and the name floats above. Settings → Look mirrors what macOS exposes
— position (bottom / left / right), icon size, and magnification on/off plus
amount. It runs on refs and `requestAnimationFrame` rather than React state; a
pointermove fires far more often than 60Hz, and re-rendering ten icons on each
one drops frames on exactly the interaction that has to feel liquid. Distances
are measured against each icon's *base* centre, computed from its index rather
than read back from the DOM — measuring geometry while animating it feeds the
output into the input and the icons judder. Neighbour displacement is driven by
`(1 - influence)`, so it is zero directly under the pointer: driving it by
`influence` instead makes the icon you are aiming at the one that moves
furthest, so it slides out from under the cursor and can never be clicked. Put the dock on the left and the
quick links rail moves across, since they'd otherwise occupy the same strip.
| Options page | all settings, also reachable from the new tab |

The theme button (in the left rail, and in every chat header) cycles
**system → light → dark**, rather than a two-state switch that would have to
throw away "follow the OS".

**Look.** Mesh gradients (overlapping soft radials, not a linear ramp) under a
vignette and a 3.5% film-grain layer that kills gradient banding. Panels are
real glass — blur, saturation boost, a bright inset top edge, and a drop
shadow — and the glass tint follows the *wallpaper's* measured luminance, not
the UI theme, so it lightens over a dark photo and darkens over a light one.

Drawers and dialogs use the same treatment at a heavier blur (44px). They host
dense UI, so legibility comes from flattening what's behind into a wash of
colour rather than from opacity — which is what lets them stay genuinely
transparent instead of reading as flat slabs.
Everything rises into place on load, staggered, and collapses to a plain fade
under `prefers-reduced-motion`.

**Wallpapers.** Upload your own (drag and drop, multiple at once), pick a
built-in gradient, or a solid colour. Uploads are downscaled to 2560px and
re-encoded as WebP on the way in, then stored as blobs in IndexedDB. Blur and
dim sliders keep foreground text readable over a busy photo; shuffle rotates
through the library on every new tab.

**Shortcut tiles.** A Chrome-style row of recently-visited sites under the
search bar, one tile per site so revisiting the same place ten times doesn't
fill the row with it. Reading history is a heavyweight permission — the
install prompt reads "Read your browsing history" — so it isn't in
`permissions` at all: it's optional, and the row asks for it in place the
first time you switch it on. Say no and everything else still works. Settings
→ Look also offers *most visited* (`topSites`) instead, and 4–10 tiles.

**Widgets.** iOS-style cards in two fixed shapes — small (square) and wide.
Fixed shapes rather than free resizing is what lets a mixed set line up as one
system.

Hovering a widget reveals two controls on its corner: **resize** (square ↔
wide) and **remove**. Resizing lived only in settings at first, which is a long
trip for a widget that is simply the wrong shape where it sits.

**Drag a widget to move it.** It snaps to one of six anchor zones (three
across the top, three across the bottom); the zone is chosen from where the
pointer is, and the outline that lights up is the widget's real footprint.
Anchors rather than free x/y coordinates: absolute positions would need
collision handling against the rails, the dock and the chat button, and would
land somewhere different on every window size. Each zone is a horizontal band,
so a second widget grows along the screen edge — the rails and the tool dock
are vertically centred, and a stacked column in any corner runs straight into
them. Right-anchored widgets slide
clear when a drawer opens. Settings → Widgets has the same thing as a
dropdown, since dragging isn't keyboard-reachable.

Add a widget in one place:

```
components/widgets/MyWidget.tsx   +   one entry in lib/widgets.tsx
```

*Clock* comes in **analogue** or **digital**, in any of your World Clock time
zones — which is what stops it duplicating the hero clock. The analogue face is
inline SVG with no dependency; hands are rotated with SVG transforms rather
than CSS transitions, because a transition on a hand wrapping 354° → 0°
animates the long way round once a minute. Zones are read through `Intl`
rather than `Date` getters: `getHours()` only ever answers for the machine's
own zone, and a hand-rolled offset breaks twice a year on DST. Off by default —
the hero clock is already there.

*Weather* is the second one. Open-Meteo — free, keyless, and it publishes a
geocoder on the same terms, which is what makes shipping weather possible
without asking anyone for a token. Pick a city in Settings → Widgets; °C/km/h
or °F/mph. Cached for 15 minutes and served stale-while-revalidate, so a new
tab never waits on the network to paint.

**Tools.** World Clock, Calculator, Units, Currency, Timer + stopwatch,
Reminders, To-Do List, Notepad, JSON (format, minify, sort keys, validate),
Lorem Ipsum, Colour, and a Text & Dev toolbox (Base64, URL, SHA-256, case
conversion, UUIDs). Toggle any of them in Settings → Tools.

*Music* plays YouTube playlists in the drawer,
behind one transport. Both providers implement the same `MusicController`, so
the play/pause/next/shuffle bar never branches on which source is selected.

YouTube is driven by posting commands straight to its embed — the same
protocol YouTube's own iframe-api script speaks, so nothing remote is loaded
(MV3 forbids remote code and the store rejects it). The listener checks
`event.source`, not just the origin: every YouTube frame on the page posts to
the same window, so a second embed anywhere would otherwise drive the
transport with the wrong track.

**YouTube playback needs a one-off hosted page.** Chrome sends no `Referer`
header from extension pages; YouTube uses it to identify the embedder and
answers **error 153** (`embedder.identity.missing.referrer`) without it. No
setting fixes this — `origin`, `widget_referrer`, `referrerpolicy` and
`youtube-nocookie.com` were all tried, and `declarativeNetRequest` cannot
append `Referer`. So `player/player.html` in this repo is hosted as an
ordinary web page (GitHub Pages is free), and the extension frames that
instead; being a normal page, it can even load YouTube's official IFrame API.
Set its URL in `lib/music/config.ts` (`PLAYER_URL`) — one line — and rebuild. See `player/README.md`.

The relay frame is laid out at 400x225 — YouTube won't play smaller — then
CSS-scaled to six pixels in a corner. It has to be *technically* visible:
Chrome refuses to start media in a frame that is off-screen, occluded, or
`display:none`, all three of which were measured. What you see is cover art.

**YouTube Mixes and radio playlists can't be used.** Anything whose id starts
`LR…`, `RD…` or `UL…` is auto-generated by YouTube from what you're watching,
and YouTube blocks all of them from embedded players — the embed loads, fires
`onReady`, then answers `onError 150` and plays nothing. Those are rejected
when you add them, with the reason; every other player error is surfaced too,
rather than the player sitting silent.

Volume is a vertical slider that appears above the volume button on hover,
rather than its own row — it costs one slot in a row that already exists, and
the reclaimed height goes to the queue. Clicking the button mutes; moving the
slider unmutes, because a slider that does nothing on a muted player is how
you end up stuck with no sound and no way back.

**No video is ever shown**, but the player still has to exist. Three measured
constraints shape how: Chrome refuses to start media in a frame that is
off-screen *or* merely occluded, and YouTube refuses to play at all below
200x200. So the frame is laid out at 400x225, CSS-scaled to six pixels in a
corner, and what you see is a still cover image. It lives in `MusicProvider`
above every surface, which is why closing the drawer doesn't stop the music —
the drawer and the widget are only views onto a player neither owns.

Because it lives in a drawer on the new tab, playback stops when you navigate
away from that tab — inherent to the surface, not something the component can
work around.

*Lorem Ipsum* generates paragraphs, sentences, words or list items, with the
canonical opening line optional and `<p>`/`<li>` wrapping on demand. The
generator is seeded rather than calling `Math.random()` directly: the text is
derived in a `useMemo`, so an unseeded one would reshuffle the passage on
every unrelated re-render while you were reading it. Regenerate bumps the
seed.

The JSON, Text & Dev and Notepad tools override the shadcn `Textarea`'s
`field-sizing-content` with `field-sizing-fixed`. Content-sizing grows the box
to fit its value, which is right for the chat composer and catastrophic for a
few hundred kB of pasted JSON — the textarea becomes thousands of pixels tall
and pushes everything below it out of the panel instead of scrolling. Fixed
sizing keeps each pane in its box and scrolls inside it.

*Reminders* fire a real system notification. Type them the way you'd say them —
`call mom in 5m`, `standup at 9am`, `gym tomorrow at 6am` — and the time
expression is parsed out of the text, with a live preview of what will be
scheduled before you commit. Each reminder is one `chrome.alarms` alarm, the
only timer that survives the MV3 service worker being torn down; a `setTimeout`
in the background dies when the worker idles out, and one in a page dies with
the tab. Alarms are re-armed from storage on startup and after an update,
because Chrome drops them on extension reload. Chrome won't fire an alarm
sooner than ~30s out, so nearer times are clamped rather than stored as
requested.

**Reminders don't depend on the OS letting them through.** A fired reminder
also raises an in-page alert on any open new tab and puts a count on the
toolbar icon; dismissing either clears both. System notifications are not a
channel an extension controls — macOS can refuse to display one with no error
at all, Focus modes swallow them, and Chrome reports success either way — so
they're the nice-to-have, not the mechanism.

**If a reminder doesn't appear,** the tool tells you which half broke. A
reminder that reached "Reminded at …" means the alarm fired and the
notification was suppressed — by the OS, not by the extension; the reason is
printed under the item, and Settings-level blocking shows as a banner. One
still listed as *overdue* means the alarm itself never ran. There's a **Test
notification** button for an immediate check, and every fired reminder also
puts a count on the toolbar icon, which is the one signal that survives an OS
that's swallowing notifications entirely.

Tools and chat share one drawer on the right — same width, same slide, one at
a time. The dock and the Ask button slide left to sit beside it, so switching
between a tool and the chat is a single click and never stacks two panels on
the same strip of screen. `Esc` closes whatever is open.

**Chat.** Anthropic, OpenAI, OpenRouter, or a local Ollama. Streaming, stop
button, per-surface transcripts, and a model list fetched live from whichever
provider you picked.

## Bring your own key

Settings → AI. Keys go in `chrome.storage.local` — **not** `sync`, because sync
storage isn't encrypted and a key silently replicating to every machine you're
signed into isn't a property anyone asked for. They're sent to your chosen
provider and nowhere else.

Requests go directly from an extension-origin page to the provider. For
Anthropic that needs the `anthropic-dangerous-direct-browser-access` header,
which is the documented opt-in for exactly this bring-your-own-key case.

### Ollama

A local Ollama server rejects requests from unknown origins by default. Before
the local provider works:

```bash
OLLAMA_ORIGINS='chrome-extension://*' ollama serve
```

## Where things live

```
entrypoints/
  newtab/      the new tab page
  sidepanel/   docked chat (Chrome)
  chat/        chat.html — the document the injected iframe points at
  options/     settings on its own page
  content.ts   injects only the launcher button
  background.ts  side panel behaviour, keyboard command, timer alarms
lib/
  ai/          provider-agnostic chat layer (see below)
  settings.ts  the settings schema + sync-storage hooks
  wallpapers.ts  IndexedDB blob store, downscaling, gradients
  tools.tsx    the tool registry
  calc.ts      expression parser (no eval — MV3's CSP forbids it)
components/
  ui/          shadcn primitives
  newtab/ tools/ chat/ settings/
```

**Why the chat lives in an iframe.** A content script's `fetch` inherits the
*host page's* origin, so calling an API host from one is a CORS failure no
header can fix. `chat.html` runs on the extension origin, where the manifest's
`host_permissions` actually apply — so the chat streams directly instead of
relaying every token through a service worker that idles out mid-response. The
iframe also keeps Tailwind's reset from repainting whatever site you're on.

### Adding a provider

One file under `lib/ai/providers/` implementing the `Provider` interface, plus
one line in `lib/ai/providers/index.ts`. Nothing in the UI mentions a provider
by name. Anything OpenAI-shaped is a single call to
`createOpenAICompatible({...})` — that's all OpenRouter and Ollama are.

### Adding a tool

One component under `components/tools/`, one entry in `lib/tools.tsx`. It shows
up in the dock and in Settings → Tools automatically.

## Data, and where it goes

| What | Where | Synced? |
|---|---|---|
| Settings, quick links, world clocks | `storage.sync` | yes |
| API keys | `storage.local` | **no** |
| Wallpapers | IndexedDB (`tabby-wallpapers`) | no |
| Scratchpad, chat transcripts, FX rates | `storage.local` | no |

Outbound requests: the AI provider you configured, `open.er-api.com` for
exchange rates (only while the Currency tool is open, cached for a day), and a
favicon lookup per quick-link hostname.

Quick-link icons are fetched **once per hostname** and then cached as blobs in
IndexedDB, so a link never hits the network twice. Only the origin is sent —
never the path or query. Google's `s2/favicons` is asked first because it
resolves per-subdomain (Gmail gets the envelope, Calendar gets the tile;
DuckDuckGo returns one generic Google "G" for every `*.google.com`), with
DuckDuckGo as the fallback and Chrome's own on-disk cache after that.

Settings → Links turns the network lookup off entirely, which falls back to
Chrome's local favicon cache — that one is free and offline, but only knows
sites you have already visited.

## A note on the name

The product is **Alcove**. A handful of internal identifiers still read
`tabby` — the two IndexedDB database names and the timer's alarm name. Those
address data already on a user's disk, so renaming them would orphan every
uploaded wallpaper and any scheduled timer. They stay.

## Icons

`node scripts/make-icons.mjs` regenerates `public/icon/*.png` — edit the two
colours at the top of the script.
