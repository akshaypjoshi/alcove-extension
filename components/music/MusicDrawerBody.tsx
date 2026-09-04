import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  ListMusic,
  Music,
  Pause,
  Play,
  Plus,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMusic } from "@/lib/music/context";
import { cn } from "@/lib/utils";

/**
 * A view onto the player, not the player itself - closing this unmounts
 * nothing that makes sound.
 *
 * No video: the frame is parked off-screen by MusicProvider, and what
 * belongs on screen is what's playing and what's next.
 */
export default function MusicDrawerBody() {
  const {
    playlists, selected, select, add, remove,
    state, controller, queue, currentIndex, playAt, artwork, error,
  } = useMusic();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [volumeOpen, setVolumeOpen] = useState(false);

  /**
   * A short grace period on close as well, so a fast diagonal flick that
   * clips the corner of the popup doesn't dismiss it mid-reach.
   */
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openVolume = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setVolumeOpen(true);
  };
  const closeVolumeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setVolumeOpen(false), 180);
  };
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);


  const submit = async () => {
    setAddError(null);
    try {
      await add(draft);
      setDraft("");
      setAdding(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Couldn't add that.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 gap-2">
        <Select value={selected?.id ?? ""} onValueChange={select}>
          <SelectTrigger size="sm" className="min-w-0 flex-1">
            <SelectValue placeholder="No playlists yet" />
          </SelectTrigger>
          <SelectContent>
            {playlists.map((playlist) => (
              <SelectItem key={playlist.id} value={playlist.id}>
                {playlist.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="secondary"
          className="shrink-0"
          onClick={() => setAdding((v) => !v)}
          aria-label="Add a playlist"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {adding && (
        <div className="shrink-0 space-y-1.5">
          <div className="flex gap-2">
            <Input
              autoFocus
              value={draft}
              placeholder="Paste a YouTube playlist link"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button onClick={submit} disabled={!draft.trim()}>
              Add
            </Button>
          </div>
          {addError && <p className="text-destructive text-xs">{addError}</p>}
        </div>
      )}

      {!selected ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <ListMusic className="text-muted-foreground size-6" />
          <p className="text-sm font-medium">No playlists yet</p>
          <Button size="sm" onClick={() => setAdding(true)}>
            Add one
          </Button>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3">
            <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
              {artwork ? (
                <img src={artwork} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <Music className="text-muted-foreground size-5" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {state.track ?? selected.title}
              </div>
              <div className="text-muted-foreground truncate text-xs">
                {state.artist ?? "YouTube"}
              </div>
            </div>
          </div>

          {state.unavailable && (
            <div className="text-muted-foreground shrink-0 rounded-lg border p-2.5 text-xs">
              {state.unavailable}
            </div>
          )}

          {/* Up next. The current track is highlighted rather than removed,
              so the list reads as a playlist and not a countdown. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {queue.length > 0 ? (
              <ul className="space-y-0.5">
                {queue.map((item, index) => (
                  <li key={`${item.videoId}-${index}`}>
                    <button
                      onClick={() => playAt(index)}
                      className={cn(
                        "hover:bg-accent/60 flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                        index === currentIndex && "bg-accent/70",
                      )}
                    >
                      <span
                        className={cn(
                          "w-5 shrink-0 text-right text-[11px] tabular-nums",
                          index === currentIndex
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {index === currentIndex && state.playing ? "▶" : index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {item.title ?? `Track ${index + 1}`}
                        {item.author && (
                          <span className="text-muted-foreground"> · {item.author}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground px-1 py-4 text-center text-xs">
                Press play to load this playlist.
              </p>
            )}
          </div>
        </>
      )}

      {error && <p className="text-destructive shrink-0 text-xs">{error}</p>}

      <div className="shrink-0 border-t pt-2.5">
        <div className="flex items-center justify-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className={cn("size-8", state.shuffle && "text-primary")}
            onClick={() => controller?.setShuffle(!state.shuffle)}
            disabled={!controller}
            aria-label="Shuffle"
            aria-pressed={state.shuffle}
          >
            <Shuffle className="size-4" />
          </Button>
          <Button
            size="icon" variant="ghost" className="size-9"
            onClick={() => controller?.previous()} disabled={!controller}
            aria-label="Previous"
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            size="icon" className="size-10 rounded-full"
            onClick={() => (state.playing ? controller?.pause() : controller?.play())}
            disabled={!controller}
            aria-label={state.playing ? "Pause" : "Play"}
          >
            {state.playing ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 fill-current" />
            )}
          </Button>
          <Button
            size="icon" variant="ghost" className="size-9"
            onClick={() => controller?.next()} disabled={!controller}
            aria-label="Next"
          >
            <SkipForward className="size-4" />
          </Button>

          {/*
            Vertical, and only while you're pointing at it. A horizontal
            slider needed its own full-width row; this costs one slot in a
            row that already exists. Click still mutes - the slider is the
            hover affordance, which is how every desktop volume control
            behaves.
          */}
          <div
            className="relative"
            onPointerEnter={openVolume}
            onPointerLeave={closeVolumeSoon}
          >
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => controller?.setMuted(!state.muted)}
              disabled={!controller}
              aria-label={state.muted ? "Unmute" : "Mute"}
            >
              {state.muted || state.volume === 0 ? (
                <VolumeX className="size-4" />
              ) : state.volume < 50 ? (
                <Volume1 className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </Button>

            {volumeOpen && controller && (
              /*
                The gap between button and popup was made with a margin,
                which left a strip where the pointer was over neither -
                pointerleave fired and the popup vanished before you could
                reach it. Padding on the wrapper makes the same visual gap
                part of the hover area, so the two are contiguous.
              */
              <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2 pb-1.5">
                <div className="glass-strong flex flex-col items-center gap-2 rounded-xl px-2.5 py-3">
                <span className="text-[10px] tabular-nums opacity-70">
                  {state.muted ? 0 : state.volume}
                </span>
                <Slider
                  orientation="vertical"
                  value={[state.muted ? 0 : state.volume]}
                  max={100}
                  step={1}
                  aria-label="Volume"
                  // Inline: the shadcn slider sets min-h-44 for vertical
                  // via a data-attribute variant, which outranks any
                  // utility class we could pass here.
                  style={{ height: 96, minHeight: 96 }}
                  onValueChange={([v]) => controller.setVolume(v)}
                />
                </div>
              </div>
            )}
          </div>
          <Button size="icon" variant="ghost" className="size-8" asChild>
            <a href={selected?.url ?? "#"} target="_blank" rel="noreferrer noopener" aria-label="Open on YouTube">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      {playlists.length > 0 && (
        <details className="shrink-0 border-t pt-1">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer py-1 text-xs">
            Manage playlists ({playlists.length})
          </summary>
          <ul className="max-h-28 space-y-0.5 overflow-y-auto pb-1">
            {playlists.map((playlist) => (
              <li key={playlist.id} className="hover:bg-accent/50 flex items-center gap-2 rounded-md px-2 py-1.5">
                <span className="flex-1 truncate text-xs">{playlist.title}</span>
                <Button
                  size="icon" variant="ghost" className="size-6 shrink-0"
                  onClick={() => remove(playlist.id)}
                  aria-label={`Remove ${playlist.title}`}
                >
                  <Trash2 className="size-3" />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
