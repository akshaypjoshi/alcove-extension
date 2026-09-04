import { useEffect, useMemo, useState } from "react";
import { Globe, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/lib/settings";

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

function zoneLabel(zone: string) {
  return zone.split("/").pop()!.replace(/_/g, " ");
}

/** Signed hour offset from the viewer's own zone, e.g. "+5.5h". */
function offsetFromLocal(zone: string, now: Date): string {
  const inZone = new Date(now.toLocaleString("en-US", { timeZone: zone }));
  const local = new Date(now.toLocaleString("en-US"));
  const hours = (inZone.getTime() - local.getTime()) / 3600_000;
  const rounded = Math.round(hours * 2) / 2;
  if (rounded === 0) return "same time";
  return `${rounded > 0 ? "+" : ""}${rounded}h`;
}

export default function WorldClock() {
  const { settings, update } = useSettings();
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const zones = settings?.worldClocks ?? [];
  const format = settings?.clockFormat ?? "12h";

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().replace(/\s/g, "_");
    return allZones()
      .filter((z) => z.toLowerCase().includes(q) && !zones.includes(z))
      .slice(0, 6);
  }, [query, zones]);

  const add = (zone: string) => {
    update({ worldClocks: [...zones, zone] });
    setQuery("");
    setAdding(false);
  };

  const remove = (zone: string) =>
    update({ worldClocks: zones.filter((z) => z !== zone) });

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {zones.map((zone) => {
          const time = now.toLocaleTimeString(undefined, {
            timeZone: zone,
            hour: "numeric",
            minute: "2-digit",
            hour12: format === "12h",
          });
          const day = now.toLocaleDateString(undefined, {
            timeZone: zone,
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          return (
            <li
              key={zone}
              className="group flex items-center justify-between rounded-lg px-2.5 py-2 hover:bg-accent/60"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{zoneLabel(zone)}</div>
                <div className="text-muted-foreground text-xs">
                  {day} · {offsetFromLocal(zone, now)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-sm tabular-nums">{time}</span>
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
          );
        })}
        {zones.length === 0 && (
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
        <Button variant="outline" size="sm" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Add city
        </Button>
      )}
    </div>
  );
}
