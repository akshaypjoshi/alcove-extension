import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Globe, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { LIMITS, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Chrome exposes the full IANA list; older engines get a small fallback. */
function allZones(): string[] {
  const supported = (Intl as any).supportedValuesOf;
  if (typeof supported === "function") {
    try {
      return supported.call(Intl, "timeZone") as string[];
    } catch {
      /* fall through */
    }
  }
  return ["UTC", "America/New_York", "Europe/London", "Asia/Tokyo"];
}


const HOME = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Legacy zone names browsers still report, mapped to the modern spelling.
 *
 * Chrome answers `resolvedOptions()` with `Asia/Calcutta` while the zone
 * list it hands out says `Asia/Kolkata` - the same place, two spellings,
 * and without this the viewer's own city appears twice.
 *
 * It has to be a table. Aliases are identical in behaviour to each other
 * *and* to unrelated zones that happen to share rules, so no amount of
 * probing offsets can tell `Asia/Calcutta` from `Asia/Kolkata` without
 * also collapsing Paris into Berlin.
 */
const ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
};

const canonical = (zone: string) => ALIASES[zone] ?? zone;
const sameZone = (a: string, b: string) => canonical(a) === canonical(b);

function zoneLabel(zone: string) {
  // Through the alias map first, so the row reads Kolkata rather than the
  // legacy Calcutta the browser reports for the same place.
  return canonical(zone).split("/").pop()!.replace(/_/g, " ");
}

/** Columns in the strip, and how far back it starts from the current hour. */
const COLUMNS = 24;
const LOOKBEHIND = 6;
const HOUR = 3600_000;

/**
 * The hour of the day in a zone, 0-23.
 *
 * Read back through Intl rather than by adding an offset: an offset is not
 * a constant, and doing the arithmetic by hand is how a comparison ends up
 * an hour out for the fortnight around a DST change.
 */
function hourIn(zone: string, at: Date): number {
  return Number(
    at.toLocaleString("en-GB", { timeZone: zone, hour: "2-digit", hour12: false }).slice(0, 2),
  );
}

function timeIn(zone: string, at: Date, hour12: boolean): string {
  return at.toLocaleTimeString(undefined, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hour12,
  });
}

function dayIn(zone: string, at: Date): string {
  return at.toLocaleDateString(undefined, {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Just the day of the month, for the column where the date turns over. */
function monthDay(zone: string, at: Date): string {
  return at.toLocaleDateString(undefined, { timeZone: zone, day: "numeric" });
}

/** A sortable YYYYMMDD in a zone, for telling calendar days apart. */
function dayKey(zone: string, at: Date): string {
  return at.toLocaleDateString("en-CA", { timeZone: zone });
}

/** Signed hour offset from the viewer's own zone, e.g. "+5.5h". */
function offsetFromHome(zone: string, at: Date): string {
  const there = new Date(at.toLocaleString("en-US", { timeZone: zone }));
  const here = new Date(at.toLocaleString("en-US", { timeZone: HOME }));
  // Quarter hours, not halves: Kathmandu is +5:45 and Chatham +12:45, and
  // snapping those to the nearest half hour reports them 15 minutes wrong.
  const hours = Math.round(((there.getTime() - here.getTime()) / HOUR) * 4) / 4;
  if (hours === 0) return "same time";
  return `${hours > 0 ? "+" : ""}${hours}h`;
}

/** Night, the edges of the day, and the hours someone is likely at a desk. */
function band(hour: number): string {
  if (hour >= 9 && hour < 18) return "bg-primary/25 text-foreground";
  if (hour >= 7 && hour < 22) return "bg-muted text-muted-foreground";
  return "bg-foreground/[0.06] text-muted-foreground/60";
}

export default function WorldClock() {
  const { settings, update } = useSettings();
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  /** null follows the clock; a date holds the instant being compared. */
  const [picked, setPicked] = useState<Date | null>(null);
  const [dayShift, setDayShift] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const format = settings?.clockFormat ?? "12h";
  const hour12 = format === "12h";

  const saved = useMemo(() => settings?.worldClocks ?? [], [settings?.worldClocks]);

  /**
   * The comparison reads every row against the viewer's own zone, so that
   * zone is always its first row - whether or not it is one of the saved
   * cities, and without appearing twice when it is.
   */
  const zones = useMemo(
    () => [HOME, ...saved.filter((z) => !sameZone(z, HOME))],
    [saved],
  );

  /**
   * Every column is `start + n hours` of plain arithmetic on instants.
   *
   * Anchoring the strip to a local midnight instead would mean converting
   * a wall-clock time back to an instant, which is ambiguous twice a year
   * and the usual source of off-by-an-hour bugs. Only the starting point
   * is read back through the calendar, once.
   */
  const start = useMemo(() => {
    // Snapped to a whole hour *in the viewer's own zone*, not to a whole
    // UTC hour. On a half-hour offset like India the latter would leave
    // the reference row reading 3:30, 4:30, 5:30 - every column landing
    // between the hours of the one person reading them.
    const minute = Number(
      now.toLocaleString("en-GB", { timeZone: HOME, minute: "2-digit" }),
    );
    const onTheHour =
      Math.floor(now.getTime() / 60_000) * 60_000 - minute * 60_000;
    return onTheHour - LOOKBEHIND * HOUR + dayShift * 24 * HOUR;
  }, [Math.floor(now.getTime() / HOUR), dayShift]);

  const columns = useMemo(
    () => Array.from({ length: COLUMNS }, (_, i) => new Date(start + i * HOUR)),
    [start],
  );

  const instant = picked ?? now;
  const activeColumn = Math.floor((instant.getTime() - start) / HOUR);

  // Dragging across the strip scrubs rather than picking once, so you can
  // sweep a meeting across the day and watch every row move with it.
  const scrubTo = (clientX: number) => {
    const el = stripRef.current;
    if (!el) return;
    const { left, width } = el.getBoundingClientRect();
    const ratio = (clientX - left) / width;
    const index = Math.min(COLUMNS - 1, Math.max(0, Math.floor(ratio * COLUMNS)));
    setPicked(new Date(start + index * HOUR));
  };

  const onScrub = (e: React.PointerEvent) => {
    scrubTo(e.clientX);
    const move = (ev: PointerEvent) => scrubTo(ev.clientX);
    // pointercancel as well as pointerup: the drawer can be closed with
    // Escape mid-drag, and a move listener with no end left behind is one
    // that outlives the panel it was scrubbing.
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().replace(/\s/g, "_");
    return allZones()
      .filter(
        (z) =>
          z.toLowerCase().includes(q) &&
          // Compared canonically, like the rows are. Matching on the exact
          // string let Asia/Kolkata be offered to someone whose browser
          // calls the same place Asia/Calcutta - and adding it produced two
          // rows sharing a React key, where removing either removed both.
          !zones.some((existing) => sameZone(existing, z)) &&
          !saved.some((existing) => sameZone(existing, z)),
      )
      .slice(0, 6);
  }, [query, zones, saved]);

  const add = (zone: string) => {
    update((current) => ({
      // Read from storage rather than this render, and guard the alias
      // case so the same place cannot be added under two spellings.
      worldClocks: current.worldClocks.some((z) => sameZone(z, zone))
        ? current.worldClocks
        : [...current.worldClocks, zone],
    }));
    setQuery("");
    setAdding(false);
  };

  const remove = (zone: string) =>
    update((current) => ({
      worldClocks: current.worldClocks.filter((z) => !sameZone(z, zone)),
    }));

  const live = picked === null;
  const homeDay = dayKey(HOME, instant);

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {saved.map((zone) => (
          <li
            key={zone}
            className="group hover:bg-accent/60 flex items-center justify-between rounded-lg px-2.5 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{zoneLabel(zone)}</div>
              <div className="text-muted-foreground text-xs">
                {dayIn(zone, now)} · {offsetFromHome(zone, now)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm tabular-nums">
                {timeIn(zone, now, hour12)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 opacity-0 transition group-hover:opacity-100"
                onClick={() => remove(zone)}
                aria-label={`Remove ${zoneLabel(zone)}`}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </li>
        ))}
        {saved.length === 0 && (
          <li className="text-muted-foreground flex items-center gap-2 px-2.5 py-6 text-sm">
            <Globe className="size-4" /> No cities yet.
          </li>
        )}
      </ul>

      {adding ? (
        <div className="space-y-1.5">
          <Input
            autoFocus
            value={query}
            placeholder="Search a city or zone…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
              if (e.key === "Enter" && matches[0]) add(matches[0]);
            }}
          />
          {matches.map((zone) => (
            <button
              key={zone}
              onClick={() => add(zone)}
              className="hover:bg-accent w-full rounded-md px-2.5 py-1.5 text-left text-sm"
            >
              {zoneLabel(zone)}
              <span className="text-muted-foreground ml-1.5 text-xs">{zone}</span>
            </button>
          ))}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={saved.length >= LIMITS.worldClocks}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" />
          {saved.length >= LIMITS.worldClocks ? "That is all that fits" : "Add city"}
        </Button>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-[11px] tracking-wide uppercase">
          Compare
        </span>
        <Separator className="flex-1" />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => setDayShift((d) => d - 1)}
          aria-label="Previous day"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">
            {timeIn(HOME, instant, hour12)} · {dayIn(HOME, instant)}
          </div>
          <div className="text-muted-foreground text-xs">
            {live ? "Following the clock" : "Comparing a chosen time"}
          </div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => setDayShift((d) => d + 1)}
          aria-label="Next day"
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          size="sm"
          variant={live ? "ghost" : "outline"}
          className="h-7 shrink-0"
          disabled={live && dayShift === 0}
          onClick={() => {
            setPicked(null);
            setDayShift(0);
          }}
        >
          Now
        </Button>
      </div>

      <div ref={stripRef} className="space-y-2" onPointerDown={onScrub}>
        {zones.map((zone) => {
          const here = zone === HOME;
          const dayGap = dayKey(zone, instant) === homeDay;
          return (
            <div key={zone} className="group touch-none select-none">
              <div className="flex items-baseline gap-2 px-0.5">
                <span className="truncate text-sm font-medium">
                  {zoneLabel(zone)}
                  {here && <span className="text-muted-foreground ml-1 text-xs">you</span>}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {offsetFromHome(zone, instant)}
                </span>
                <span className="flex-1" />
                <span className="shrink-0 font-mono text-sm tabular-nums">
                  {timeIn(zone, instant, hour12)}
                </span>
                {/* Only worth saying when it disagrees with your own day -
                    that disagreement is the thing people get wrong. */}
                {!dayGap && (
                  <span className="text-primary shrink-0 text-[11px] font-medium">
                    {dayIn(zone, instant).split(",")[0] || dayIn(zone, instant)}
                  </span>
                )}
                {!here && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-5 shrink-0 opacity-0 transition group-hover:opacity-100"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => remove(zone)}
                    aria-label={`Remove ${zoneLabel(zone)}`}
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </div>

              {/* One column is one instant, straight across every row: the
                  whole point of the layout is that a vertical line means
                  "the same moment, everywhere". */}
              <div className="mt-1 flex gap-px">
                {columns.map((at, i) => {
                  const h = hourIn(zone, at);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 rounded-[3px] py-1 text-center text-[9px] leading-none tabular-nums",
                        band(h),
                        i === activeColumn && "ring-primary ring-2",
                        // Midnight carries the date rather than an hour,
                        // marked off so it reads as the day turning over
                        // and not as an hour called 24.
                        h === 0 && "text-primary border-primary/70 border-l font-semibold",
                      )}
                      title={`${timeIn(zone, at, hour12)} · ${dayIn(zone, at)}`}
                    >
                      {h === 0 ? monthDay(zone, at) : h}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {zones.length === 1 && (
          <p className="text-muted-foreground flex items-center gap-2 px-0.5 py-3 text-xs">
            <Globe className="size-3.5" /> Add a city to compare against.
          </p>
        )}
      </div>

    </div>
  );
}
