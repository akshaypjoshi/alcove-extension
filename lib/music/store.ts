import { storage } from "#imports";
import { useCallback, useEffect, useState } from "react";
import { embedBlockedReason, parsePlaylist } from "./parse";
import type { Playlist } from "./types";

/**
 * Playlists sync (they're a handful of short strings and you want them on
 * every machine); the current selection stays local, because "what I'm
 * listening to on this laptop" shouldn't follow you to another one.
 */
export const playlistsStore = storage.defineItem<Playlist[]>("sync:playlists", {
  fallback: [],
});

export const selectedStore = storage.defineItem<string | null>(
  "local:selectedPlaylist",
  { fallback: null },
);

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // Spotify playlists saved by an earlier version have no transport
    // behind them any more; drop them on read rather than listing rows
    // whose play button does nothing.
    const keep = (v: Playlist[] | null) =>
      (v ?? []).filter((p) => p.provider === "youtube");

    playlistsStore.getValue().then((v) => setPlaylists(keep(v)));
    selectedStore.getValue().then(setSelectedId);
    const off = [
      playlistsStore.watch((v) => setPlaylists(keep(v))),
      selectedStore.watch(setSelectedId),
    ];
    return () => off.forEach((fn) => fn());
  }, []);

  const add = useCallback(async (input: string, title?: string) => {
    const parsed = parsePlaylist(input);
    if (!parsed) throw new Error("That doesn't look like a YouTube playlist link.");

    const blocked = embedBlockedReason(parsed);
    if (blocked) throw new Error(blocked);

    const current = (await playlistsStore.getValue()) ?? [];
    const existing = current.find(
      (p) => p.provider === parsed.provider && p.externalId === parsed.externalId,
    );
    // Re-adding something you already have selects it rather than
    // silently creating a duplicate row.
    if (existing) {
      await selectedStore.setValue(existing.id);
      return existing;
    }

    const playlist: Playlist = {
      id: crypto.randomUUID(),
      provider: parsed.provider,
      externalId: parsed.externalId,
      title: title?.trim() || `YouTube playlist ${current.length + 1}`,
      url: parsed.url,
      addedAt: Date.now(),
    };
    await playlistsStore.setValue([...current, playlist]);
    await selectedStore.setValue(playlist.id);
    return playlist;
  }, []);

  const remove = useCallback(async (id: string) => {
    const current = (await playlistsStore.getValue()) ?? [];
    const next = current.filter((p) => p.id !== id);
    await playlistsStore.setValue(next);
    if ((await selectedStore.getValue()) === id) {
      await selectedStore.setValue(next[0]?.id ?? null);
    }
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    const current = (await playlistsStore.getValue()) ?? [];
    await playlistsStore.setValue(
      current.map((p) => (p.id === id ? { ...p, title } : p)),
    );
  }, []);

  const select = useCallback((id: string) => selectedStore.setValue(id), []);

  const selected =
    playlists.find((p) => p.id === selectedId) ?? playlists[0] ?? null;

  return { playlists, selected, add, remove, rename, select };
}
