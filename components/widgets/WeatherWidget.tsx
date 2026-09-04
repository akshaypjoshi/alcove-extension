import { useEffect, useState } from "react";
import { Loader2, MapPin, RefreshCw } from "lucide-react";
import WeatherIcon from "@/components/widgets/WeatherIcon";
import WidgetCard from "@/components/widgets/WidgetCard";
import { describe, formatHour, getWeather, type Weather } from "@/lib/weather";
import { useSettings, type WidgetSize } from "@/lib/settings";

function Placeholder({
  size,
  children,
}: {
  size: WidgetSize;
  children: React.ReactNode;
}) {
  return (
    <WidgetCard size={size}>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        {children}
      </div>
    </WidgetCard>
  );
}

export default function WeatherWidget({
  size,
  onOpenSettings,
}: {
  size: WidgetSize;
  onOpenSettings?: () => void;
}) {
  const { settings } = useSettings();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const location = settings?.weather.location ?? null;
  const units = settings?.weather.units ?? "metric";
  const clockFormat = settings?.clockFormat ?? "12h";

  useEffect(() => {
    if (!location) return;
    let alive = true;

    setLoading(true);
    setError(null);
    // onFresh fires only when a revalidation actually returns new data, so
    // the card paints from cache immediately and quietly updates after.
    getWeather(location, units, (fresh) => alive && setWeather(fresh))
      .then((data) => alive && data && setWeather(data))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Unavailable"))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [location?.latitude, location?.longitude, units]);

  if (!location) {
    return (
      <Placeholder size={size}>
        <MapPin className="size-5 opacity-60" />
        <p className="text-sm font-medium">Weather</p>
        <button
          onClick={onOpenSettings}
          className="rounded-full border border-[var(--glass-line)] px-3 py-1 text-xs transition hover:bg-[var(--glass-fill-hover)]"
        >
          Choose a city
        </button>
      </Placeholder>
    );
  }

  if (!weather) {
    return (
      <Placeholder size={size}>
        {error ? (
          <>
            <p className="max-w-40 text-xs opacity-70">{error}</p>
            <RefreshCw className="size-4 opacity-50" />
          </>
        ) : (
          <Loader2 className="size-5 animate-spin opacity-50" />
        )}
      </Placeholder>
    );
  }

  const { label } = describe(weather.code);
  const place = location.name;

  return (
    <WidgetCard size={size}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold">{place}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[2.6rem] leading-none font-extralight tabular-nums">
              {weather.temp}°
            </span>
            {loading && <Loader2 className="size-3 animate-spin opacity-40" />}
          </div>
        </div>
        <WeatherIcon code={weather.code} isDay={weather.isDay} className="size-8 opacity-90" />
      </div>

      {/* Both lines truncate: the square card has ~136px of content width,
          and conditions run as long as "Thunderstorm, hail". */}
      <div className="mt-1 truncate text-xs opacity-70">
        {size === "md" ? `${label} · H ${weather.high}° L ${weather.low}°` : label}
      </div>

      {size === "md" ? (
        <div className="mt-auto flex justify-between gap-1 border-t border-[var(--glass-line)] pt-2.5">
          {weather.hours.map((point, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-medium opacity-55">
                {i === 0 ? "Now" : formatHour(point.hour, clockFormat)}
              </span>
              <WeatherIcon code={point.code} isDay={point.isDay} className="size-3.5 opacity-80" />
              <span className="text-[11px] tabular-nums">{point.temp}°</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-auto truncate text-[11px] opacity-55">
          H {weather.high}° L {weather.low}° · feels {weather.feelsLike}°
        </div>
      )}
    </WidgetCard>
  );
}
