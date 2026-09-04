import type { MusicProvider } from "./types";

export interface ParsedPlaylist {
  provider: MusicProvider;
  externalId: string;
  /** Normalised canonical URL, so duplicates collapse. */
  url: string;
  kind: "playlist" | "album";
}

/**
 * Accepts whatever the user pastes: a full share URL, a music.youtube.com
 * link, or a bare playlist id. Anything with a `list=` parameter is a
 * playlist even if the link points at a single video inside it, which is
 * what you get from "Share" while a track is playing.
 */
export function parsePlaylist(input: string): ParsedPlaylist | null {
  const raw = input.trim();
  if (!raw) return null;

  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    url = null;
  }

  if (url) {
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "music.youtube.com" || host === "youtu.be") {
      const list = url.searchParams.get("list");
      if (list) {
        return {
          provider: "youtube",
          externalId: list,
          kind: "playlist",
          url: `https://www.youtube.com/playlist?list=${list}`,
        };
      }
      return null;
    }
  }

  // Bare ids: YouTube playlist ids start PL/OLAK/RD/UU/LL/FL.
  if (/^(PL|OLAK|RD|UU|LL|FL)[A-Za-z0-9_-]{10,}$/.test(raw)) {
    return {
      provider: "youtube",
      externalId: raw,
      kind: "playlist",
      url: `https://www.youtube.com/playlist?list=${raw}`,
    };
  }
  return null;
}


/**
 * YouTube auto-generates Mix and radio playlists ("LR…", "RD…", "UL…")
 * from whatever you're watching, and blocks all of them from embedded
 * players - the embed loads, fires onReady, then answers onError 150 and
 * plays nothing. Caught at add time so it fails with a reason instead of
 * sitting there silently doing nothing.
 */
export function embedBlockedReason(parsed: ParsedPlaylist): string | null {
  if (/^(RD|LR|UL)/.test(parsed.externalId)) {
    return "YouTube Mixes and radio playlists can't be embedded - YouTube blocks them. Save it as your own playlist, or use one whose link contains list=PL…";
  }
  return null;
}
