import { Music, Pause, Play, SkipForward } from "lucide-react";
import WidgetCard from "@/components/widgets/WidgetCard";
import { useMusic } from "@/lib/music/context";
import type { WidgetSize } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * A second view onto the same player the drawer shows. It controls
 * playback without opening anything, which is the point - pausing
 * shouldn't cost two clicks and a panel.
 */
export default function MusicWidget({
  size,
  onOpenSettings,
}: {
  size: WidgetSize;
  onOpenSettings?: () => void;
}) {
  const { selected, state, controller, artwork } = useMusic();

  if (!selected) {
    return (
      <WidgetCard size={size}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Music className="size-5 opacity-60" />
          <p className="text-sm font-medium">Music</p>
          <button
            onClick={onOpenSettings}
            className="rounded-full border border-[var(--glass-line)] px-3 py-1 text-xs transition hover:bg-[var(--glass-fill-hover)]"
          >
            Add a playlist
          </button>
        </div>
      </WidgetCard>
    );
  }

  const title = state.track ?? selected.title;
  const subtitle = state.artist ?? "YouTube";

  const transport = (large: boolean) => (
    <div className={cn("flex items-center gap-1", large ? "gap-1.5" : "")}>
      <button
        onClick={() => (state.playing ? controller?.pause() : controller?.play())}
        disabled={!controller}
        aria-label={state.playing ? "Pause" : "Play"}
        className={cn(
          "flex items-center justify-center rounded-full bg-[var(--glass-fill-hover)] transition hover:scale-105 disabled:opacity-40",
          large ? "size-9" : "size-8",
        )}
      >
        {state.playing ? (
          <Pause className="size-3.5 fill-current" />
        ) : (
          <Play className="size-3.5 fill-current" />
        )}
      </button>
      <button
        onClick={() => controller?.next()}
        disabled={!controller}
        aria-label="Next"
        className={cn(
          "flex items-center justify-center rounded-full transition hover:bg-[var(--glass-fill-hover)] disabled:opacity-40",
          large ? "size-9" : "size-8",
        )}
      >
        <SkipForward className="size-3.5" />
      </button>
    </div>
  );

  // Square: artwork fills the card, everything sits on a scrim over it.
  if (size === "sm") {
    return (
      <WidgetCard size={size} className="relative justify-end p-0">
        <div className="absolute inset-0 overflow-hidden">
          {artwork && <img src={artwork} alt="" className="size-full object-cover" />}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
        <div className="relative flex flex-col gap-2 p-3.5 text-white">
          <div className="min-w-0">
            <div className="truncate text-[13px] leading-tight font-semibold">{title}</div>
            <div className="truncate text-[11px] opacity-75">{subtitle}</div>
          </div>
          {transport(false)}
        </div>
      </WidgetCard>
    );
  }

  // Wide: artwork as a square tile, details and transport beside it.
  return (
    <WidgetCard size={size} className="flex-row items-center gap-3.5">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-[var(--glass-fill-hover)]">
        {artwork ? (
          <img src={artwork} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Music className="size-6 opacity-60" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm leading-tight font-semibold">{title}</div>
          <div className="truncate text-xs opacity-70">{subtitle}</div>
        </div>
        {transport(true)}
      </div>
    </WidgetCard>
  );
}
