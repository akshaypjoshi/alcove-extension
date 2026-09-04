import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePlaylists } from "./store";
import { PLAYER_URL } from "./config";


import { IDLE, type MusicController, type PlaybackState, type Playlist } from "./types";

/**
 * Playback state lives here, above every surface that shows it.
 *
 * There is no YouTube player in this extension, and there cannot be one.
 * Chrome sends no Referer header from an extension page, YouTube uses it
 * to identify the embedder, and the player answers error 153 and plays
 * nothing. So the extension frames an ordinary web page the user hosts
 * (player/player.html), and that page frames YouTube — an ordinary page
 * does send the header.
 *
 * Keeping the state here rather than in the drawer is what lets the drawer
 * close while the widget carries on showing and controlling what's playing.
 */

/** Laid out at a legal size and scaled down; YouTube won't play below 200x200. */
const BASE_W = 400;
const BASE_H = 225;

/** Documented YouTube IFrame API error codes, relayed by the player page. */
const YOUTUBE_ERRORS: Record<number, string> = {
  2: "That playlist or video id isn't valid.",
  5: "The player couldn't play this one.",
  100: "That video has been removed or made private.",
  101: "The owner doesn't allow this to play in embedded players.",
  150: "The owner doesn't allow this to play in embedded players.",
  153: "The player page couldn't verify itself with YouTube. Check PLAYER_URL in lib/music/config.ts.",
};

function post(frame: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  if (!frame?.src) return;
  frame.contentWindow?.postMessage(
    { __alcove: "cmd", func, args },
    // Only ever addressed to the relay's own origin.
    new URL(frame.src).origin,
  );
}

export interface QueueItem {
  videoId: string;
  title?: string;
  author?: string;
}

interface MusicValue {
  playlists: Playlist[];
  selected: Playlist | null;
  select: (id: string) => void;
  add: (input: string) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  state: PlaybackState;
  controller: MusicController | null;
  queue: QueueItem[];
  currentIndex: number;
  playAt: (index: number) => void;
  /** Thumbnail for whatever is playing. */
  artwork: string | null;
  error: string | null;
}

const NOOP = async () => {};
const MusicContext = createContext<MusicValue>({
  playlists: [],
  selected: null,
  select: () => {},
  add: NOOP,
  remove: NOOP,
  state: IDLE,
  controller: null,
  queue: [],
  currentIndex: -1,
  playAt: () => {},
  artwork: null,
  error: null,
});

export const useMusic = () => useContext(MusicContext);


export function MusicProvider({ children }: { children: React.ReactNode }) {
  const { playlists, selected, add, remove, select } = usePlaylists();
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const [ytState, setYtState] = useState<PlaybackState>(IDLE);
  const [videoIds, setVideoIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [titles, setTitles] = useState<Record<string, QueueItem>>({});
  const [error, setError] = useState<string | null>(null);
  const shuffleRef = useRef(false);


  const playerUrl = PLAYER_URL.trim();

  const playerOrigin = useMemo(() => {
    try {
      return playerUrl ? new URL(playerUrl).origin : "";
    } catch {
      return "";
    }
  }, [playerUrl]);

  const playerSrc = useMemo(() => {
    if (!playerUrl || !selected) return "";
    try {
      const url = new URL(playerUrl);
      url.searchParams.set("list", selected.externalId);
      // The relay only accepts commands from, and only reports back to,
      // this origin.
      url.searchParams.set("parent", window.location.origin);
      return url.toString();
    } catch {
      return "";
    }
  }, [playerUrl, selected]);

  // Reset per playlist, not per render.
  useEffect(() => {
    setVideoIds([]);
    setCurrentIndex(-1);
    requestedRef.current.clear();
    setError(null);
    setYtState((prev) => ({ ...prev, playing: false, shuffle: shuffleRef.current }));
  }, [selected?.externalId]);


  // Titles for the queue. oEmbed is public and keyless; one request per
  // video, capped and de-duplicated.
  const requestedRef = useRef(new Set<string>());
  useEffect(() => {
    // `titles` is deliberately not a dependency: the effect writes to it,
    // so depending on it re-enters the effect once per resolved title and
    // restarts the whole queue each time. A ref of what's already been
    // asked for is the thing that actually needs remembering.
    // No cap: a 200-track playlist showing "Loading…" from #41 onwards
    // reads as broken. Fetched a few at a time so the queue fills in
    // steadily rather than firing 200 requests at once.
    const missing = videoIds.filter((id) => !requestedRef.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requestedRef.current.add(id));

    let alive = true;
    const CONCURRENCY = 4;
    const queueOfIds = [...missing];

    const worker = async () => {
      while (alive) {
        const id = queueOfIds.shift();
        if (!id) return;
        try {
          const res = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(
              `https://www.youtube.com/watch?v=${id}`,
            )}&format=json`,
          );
          if (!res.ok) continue;
          const json = await res.json();
          if (!alive) return;
          setTitles((prev) => ({
            ...prev,
            [id]: { videoId: id, title: json.title, author: json.author_name },
          }));
        } catch {
          /* a missing title just shows as the track number */
        }
      }
    };
    Array.from({ length: CONCURRENCY }, worker);

    return () => {
      alive = false;
    };
  }, [videoIds]);

  /**
   * State arrives from the relay page, which forwards what the real
   * YouTube player reports. Only messages from our configured player URL
   * are trusted.
   */
  useEffect(() => {
    if (!playerOrigin) return;

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== playerOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;

      const message = event.data;
      if (message?.__alcove === "error") {
        setError(YOUTUBE_ERRORS[message.payload] ?? `Playback error (${message.payload}).`);
        return;
      }
      if (message?.__alcove !== "state" || !message.payload) return;

      const p = message.payload;
      setError(null);
      setYtState({
        playing: Boolean(p.playing),
        // The relay doesn't report shuffle back, so keep what we asked for.
        shuffle: shuffleRef.current,
        volume: p.volume ?? 100,
        muted: Boolean(p.muted),
        track: p.track,
        artist: p.artist,
      });
      setVideoIds((prev) =>
        prev.length === (p.videoIds?.length ?? 0) &&
        prev.every((id, i) => id === p.videoIds[i])
          ? prev
          : (p.videoIds ?? []),
      );
      setCurrentIndex(p.index ?? -1);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playerOrigin]);

  const controller: MusicController | null = useMemo(() => {
    if (!selected) return null;
    return {
      play: () => post(frameRef.current, "play"),
      pause: () => post(frameRef.current, "pause"),
      next: () => post(frameRef.current, "next"),
      previous: () => post(frameRef.current, "previous"),
      setShuffle: (on: boolean) => {
        shuffleRef.current = on;
        setYtState((prev) => ({ ...prev, shuffle: on }));
        post(frameRef.current, "shuffle", [on]);
      },
      setVolume: (percent: number) => post(frameRef.current, "volume", [Math.round(percent)]),
      setMuted: (muted: boolean) => post(frameRef.current, "muted", [muted]),
    };
  }, [selected]);

  const queue: QueueItem[] = useMemo(
    () => videoIds.map((id) => titles[id] ?? { videoId: id }),
    [videoIds, titles],
  );

  const playAt = useCallback((index: number) => {
    post(frameRef.current, "playAt", [index]);
  }, []);

  const state: PlaybackState =
    selected && !playerUrl
      ? {
          ...ytState,
          unavailable:
            "YouTube playback isn't set up. Host player/player.html and set PLAYER_URL in lib/music/config.ts.",
        }
      : ytState;
  const currentVideo = currentIndex >= 0 ? videoIds[currentIndex] : videoIds[0];
  const artwork = currentVideo
    ? `https://i.ytimg.com/vi/${currentVideo}/mqdefault.jpg`
    : null;

  return (
    <MusicContext.Provider
      value={{
        playlists,
        selected,
        select,
        add,
        remove,
        state,
        controller,
        queue,
        currentIndex,
        playAt,
        artwork,
        error,
      }}
    >
      {children}

      {/*
        A few pixels in a corner. It must exist and be technically visible
        — Chrome won't start media in a frame that's off-screen, occluded
        or display:none, all of which I measured — but nothing says it has
        to be big. Laid out at 400x225 because YouTube won't play smaller,
        then scaled down. What you see everywhere else is cover art.
      */}
      {playerSrc && (
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-0 left-0 z-0 size-[6px] overflow-hidden opacity-60"
        >
          <iframe
            ref={frameRef}
            key={playerSrc}
            title="Music player"
            src={playerSrc}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            className="absolute top-0 left-0 border-0"
            style={{
              width: BASE_W,
              height: BASE_H,
              transformOrigin: "top left",
              transform: `scale(${6 / BASE_W})`,
            }}
          />
        </div>
      )}
    </MusicContext.Provider>
  );
}
