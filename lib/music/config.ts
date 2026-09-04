/**
 * Where the YouTube relay page is hosted.
 *
 * YouTube refuses to play inside an extension page: Chrome sends no
 * Referer header from one, YouTube uses that header to identify the
 * embedder, and the player answers error 153 and plays nothing. An
 * ordinary web page does send it — so Alcove frames that page, and the
 * page frames YouTube.
 *
 * ── This is the one line to change. ──
 * Host `player/player.html` from this repo anywhere static (GitHub Pages
 * is free) and put its URL here. Leave it empty and the music panel says
 * YouTube isn't configured rather than failing silently.
 *
 * The host must also be allowed by `frame-src` in wxt.config.ts. The
 * wildcards there already cover github.io, pages.dev, netlify.app and
 * vercel.app.
 */
export const PLAYER_URL = "https://player-html-ashy.vercel.app/player.html";
