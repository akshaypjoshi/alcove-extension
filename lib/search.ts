/**
 * Running a search from a new-tab page is not the same as running one from
 * an ordinary page, and Google can tell.
 *
 * `window.location.href = "https://www.google.com/search?q=…"` from a
 * chrome-extension:// document produces a cross-site navigation with *no
 * Referer at all* — extension origins are stripped, the same reason
 * YouTube rejects our player frame with error 153 — and none of the client
 * parameters a real omnibox search carries. That combination reads as
 * automated traffic, and Google answers it with the "unusual traffic"
 * captcha instead of results.
 *
 * browser.search hands the query to the browser's own search machinery
 * instead, so the navigation is the one the omnibox would have made. It
 * uses whichever engine the browser is set to, which is why it's a
 * separate choice in settings rather than something applied behind the
 * back of an explicitly picked engine.
 */

/** Chrome and Firefox ship the same permission under different method names. */
interface SearchApi {
  query?: (options: { text: string; disposition?: string }) => void;
  search?: (options: { query: string }) => void;
}

export const BROWSER_ENGINE = "browser";

export function hasBrowserSearch(): boolean {
  const api = (browser as unknown as { search?: SearchApi }).search;
  return Boolean(api?.query || api?.search);
}

/**
 * Anything that looks like a host goes straight there instead of through
 * the search engine — typing "localhost:3000" or "news.ycombinator.com"
 * and getting a results page is the single most annoying new-tab bug.
 */
export function looksLikeUrl(input: string): boolean {
  const value = input.trim();
  if (/\s/.test(value)) return false;
  if (/^[a-z]+:\/\//i.test(value)) return true;
  if (/^localhost(:\d+)?(\/|$)/i.test(value)) return true;
  return /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$|\?)/.test(value);
}

export function runSearch(raw: string, engineUrl: string, engineId: string) {
  const value = raw.trim();
  if (!value) return;

  if (looksLikeUrl(value)) {
    window.location.href = /^[a-z]+:\/\//i.test(value)
      ? value
      : `https://${value}`;
    return;
  }

  if (engineId === BROWSER_ENGINE) {
    const api = (browser as unknown as { search?: SearchApi }).search;
    try {
      if (api?.query) {
        // Chrome. CURRENT_TAB replaces the new tab, matching what typing
        // in the address bar of this tab would have done.
        api.query({ text: value, disposition: "CURRENT_TAB" });
        return;
      }
      if (api?.search) {
        api.search({ query: value }); // Firefox
        return;
      }
    } catch {
      // Permission refused, or an older browser without the API. Falling
      // through to a plain navigation is worse than the captcha it was
      // meant to avoid, but it's better than the search doing nothing.
    }
  }

  window.location.href = engineUrl.replace("%s", encodeURIComponent(value));
}
