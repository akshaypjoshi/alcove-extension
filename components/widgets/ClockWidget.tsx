import { useEffect, useState } from "react";
import AnalogueClock from "@/components/widgets/AnalogueClock";
import WidgetCard from "@/components/widgets/WidgetCard";
import { useSettings, type WidgetSize } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * Reading the clock through Intl rather than Date getters is what lets a
 * single widget render any zone: getHours() only ever answers for the
 * machine's own zone, and hand-rolling an offset breaks twice a year on
 * every zone that observes DST.
 */
function partsInZone(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    ...(timeZone ? { timeZone } : {}),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // en-GB renders midnight as "24" in some engines; fold it back to 0.
  return { hour: read("hour") % 24, minute: read("minute"), second: read("second") };
}

/**
 * Split "4:49 pm" into digits and meridiem. At card sizes the joined
 * string is what pushed the small variant onto two lines — and setting the
 * meridiem at full size is the same dated look the hero clock avoids.
 */
function splitTime(
  date: Date,
  timeZone: string | undefined,
  hour12: boolean,
): { digits: string; period?: string } {
  const parts = new Intl.DateTimeFormat(undefined, {
    ...(timeZone ? { timeZone } : {}),
    hour: "numeric",
    minute: "2-digit",
    hour12,
  }).formatToParts(date);

  return {
    digits: parts
      .filter((p) => p.type !== "dayPeriod")
      .map((p) => p.value)
      .join("")
      .trim(),
    period: parts.find((p) => p.type === "dayPeriod")?.value,
  };
}

function zoneLabel(timeZone?: string) {
  return timeZone ? timeZone.split("/").pop()!.replace(/_/g, " ") : "";
}

export default function ClockWidget({
  size,
  config,
}: {
  size: WidgetSize;
  config: Record<string, string>;
}) {
  const { settings } = useSettings();
  const [now, setNow] = useState(() => new Date());

  const variant = config.variant ?? "analogue";
  const timeZone = config.timezone && config.timezone !== "local" ? config.timezone : undefined;
  const clockFormat = settings?.clockFormat ?? "12h";

  useEffect(() => {
    // The analogue face has a second hand, so it needs a per-second tick;
    // the digital one only changes once a minute.
    const period = variant === "analogue" ? 1000 : 10_000;
    const id = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(id);
  }, [variant]);

  const { hour, minute, second } = partsInZone(now, timeZone);
  const label = zoneLabel(timeZone);

  const { digits, period } = splitTime(now, timeZone, clockFormat === "12h");

  const date = new Intl.DateTimeFormat(undefined, {
    ...(timeZone ? { timeZone } : {}),
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);

  if (variant === "digital") {
    // With no zone label there's nothing to anchor to the top, so centre
    // the block instead of leaving a gap where the label would have been.
    return (
      <WidgetCard size={size} className={label ? undefined : "justify-center"}>
        {label && <div className="text-xs font-semibold opacity-70">{label}</div>}
        <div className={label ? "mt-auto" : undefined}>
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              className={cn(
                "leading-none font-extralight tracking-tight tabular-nums",
                size === "md" ? "text-[2.9rem]" : "text-[2.2rem]",
              )}
            >
              {digits}
            </span>
            {period && (
              <span
                className={cn(
                  "font-medium tracking-[0.06em] uppercase opacity-50",
                  size === "md" ? "text-base" : "text-xs",
                )}
              >
                {period}
              </span>
            )}
          </div>
          <div className="mt-1.5 text-xs opacity-60">{date}</div>
        </div>
      </WidgetCard>
    );
  }

  if (size === "md") {
    return (
      <WidgetCard size={size} className="flex-row items-center gap-4">
        <AnalogueClock
          hour={hour}
          minute={minute}
          second={second}
          className="h-full w-auto shrink-0"
        />
        <div className="min-w-0">
          {label && <div className="truncate text-xs font-semibold opacity-70">{label}</div>}
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[2rem] leading-none font-extralight tabular-nums">
              {digits}
            </span>
            {period && (
              <span className="text-xs font-medium tracking-[0.06em] uppercase opacity-50">
                {period}
              </span>
            )}
          </div>
          <div className="mt-1.5 text-xs opacity-60">{date}</div>
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard size={size} className="items-center justify-center">
      <AnalogueClock
        hour={hour}
        minute={minute}
        second={second}
        className="h-full w-auto"
      />
      {label && (
        <div className="mt-1 w-full truncate text-center text-[11px] font-medium opacity-65">
          {label}
        </div>
      )}
    </WidgetCard>
  );
}
