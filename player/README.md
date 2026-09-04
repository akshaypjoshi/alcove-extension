# Alcove player relay

One static file. Alcove frames this page, and this page frames YouTube.

## Why it exists

Chrome sends no `Referer` header from extension pages. YouTube uses that
header to identify who is embedding it, and without it the player answers
**error 153** (`embedder.identity.missing.referrer`) and plays nothing. No
setting inside the extension can add that header - `declarativeNetRequest`
cannot append `Referer`.

An ordinary web page does send it. So the extension frames this page instead
of YouTube directly, and relays play/pause/next/shuffle/volume through it.

## Hosting it

Any static host works. GitHub Pages is free:

1. Create a repo, put `player.html` in it.
2. Settings → Pages → deploy from `main`, root.
3. Copy the URL, e.g. `https://you.github.io/alcove-player/player.html`.
4. Put it in `lib/music/config.ts` as `PLAYER_URL`, then rebuild.

The deployed instance is `https://player-html-ashy.vercel.app/player.html`.

The extension's manifest allows framing `*.github.io`, `*.pages.dev`,
`*.netlify.app` and `*.vercel.app`. Hosting anywhere else means adding that
host to `frame-src` in `wxt.config.ts` and rebuilding.

## What it can and can't see

It receives only a playlist id and your extension's origin, and it only
accepts messages from that origin. It stores nothing and has no analytics.
