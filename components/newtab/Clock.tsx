import { useEffect, useState } from "react";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

export default function Clock({ settings }: { settings: Settings }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // Tick every second only when seconds are visible; otherwise once a
    // minute is plenty and keeps an idle new tab off the CPU.
    const period = settings.showSeconds ? 1000 : 15_000;
    const id = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(id);
  }, [settings.showSeconds]);

  /**
   * formatToParts rather than toLocaleTimeString, so "pm" can be split off
   * and set at a fraction of the size. Rendering it at the same weight and
   * size as the digits is the single most dated thing a clock can do.
   */
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(settings.showSeconds ? { second: "2-digit" as const } : {}),
    hour12: settings.clockFormat === "12h",
  }).formatToParts(now);

  const time = parts
    .filter((p) => p.type !== "dayPeriod")
    .map((p) => p.value)
    .join("")
    .trim();
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value;

  const date = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const name = settings.displayName.trim();
  const centred = settings.layout === "center";

  return (
    <div className="text-on-wallpaper rise select-none" style={{ animationDelay: "60ms" }}>
      {settings.showGreeting && (
        <p className="text-[0.7rem] font-semibold tracking-[0.3em] uppercase opacity-65">
          {greeting(now.getHours())}
          {name ? `, ${name}` : ""}
        </p>
      )}

      {settings.showClock && (
        <div
          className={cn(
            "mt-3 flex items-baseline gap-3",
            centred ? "justify-center" : "justify-start",
          )}
        >
          <span className="text-[clamp(3.5rem,10vw,8.5rem)] leading-[0.86] font-extralight tracking-[-0.045em] tabular-nums">
            {time}
          </span>
          {dayPeriod && (
            <span className="text-[clamp(0.85rem,1.5vw,1.35rem)] font-medium tracking-[0.06em] uppercase opacity-50">
              {dayPeriod}
            </span>
          )}
        </div>
      )}

      <p className="mt-5 text-[0.9rem] font-medium opacity-65">{date}</p>
    </div>
  );
}
