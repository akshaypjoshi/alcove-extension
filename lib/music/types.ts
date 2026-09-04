/**
 * YouTube plays *in* our panel: an embedded iframe we drive by postMessage,
 * which is the only way to control it without loading YouTube's remote
 * iframe-api script - MV3 forbids remote code, and the Chrome Web Store
 * rejects it.
 *
 * Kept as a named union of one. Playlists already on disk carry a
 * `provider` field, and a source added later has somewhere to go.
 */

export type MusicProvider = "youtube";

export interface Playlist {
  id: string;
  provider: MusicProvider;
  /** Provider-side playlist id. */
  externalId: string;
  title: string;
  url: string;
  addedAt: number;
}

export interface PlaybackState {
  playing: boolean;
  shuffle: boolean;
  /** Present once the source reports what's playing. */
  track?: string;
  artist?: string;
  /** 0-100. */
  volume: number;
  muted: boolean;
  /** Why the transport can't act right now, in the user's words. */
  unavailable?: string;
}

export const IDLE: PlaybackState = { playing: false, shuffle: false, volume: 100, muted: false };

/** The transport bar drives this and never touches the player directly. */
export interface MusicController {
  play(): Promise<void> | void;
  pause(): Promise<void> | void;
  next(): Promise<void> | void;
  previous(): Promise<void> | void;
  setShuffle(on: boolean): Promise<void> | void;
  setVolume(percent: number): Promise<void> | void;
  setMuted(muted: boolean): Promise<void> | void;
}
