import { storage } from "#imports";

/**
 * Open-Meteo: free, no key, no attribution requirement, and it exposes a
 * geocoder on the same terms — which is what makes a hobby extension able
 * to ship weather without asking anyone for a token.
 */

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";

export interface WeatherLocation {
  name: string;
  /** Region/state, when the geocoder gives one — "Pune, Maharashtra". */
  admin?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export type Units = "metric" | "imperial";

export interface HourPoint {
  /** Local hour at the location, 0-23. */
  hour: number;
  temp: number;
  code: number;
  isDay: boolean;
}

export interface Weather {
  temp: number;
  feelsLike: number;
  humidity: number;
  wind: number;
  code: number;
  isDay: boolean;
  high: number;
  low: number;
  hours: HourPoint[];
  tempUnit: string;
  windUnit: string;
  fetchedAt: number;
}

/**
 * WMO code table, collapsed to the eight conditions worth drawing an icon
 * for. The full table separates e.g. "slight" from "moderate" drizzle,
 * which is more precision than a 168px card can express.
 */
const CONDITIONS: [number[], string, string][] = [
  [[0], "clear", "Clear"],
  [[1], "clear", "Mainly clear"],
  [[2], "partly", "Partly cloudy"],
  [[3], "cloudy", "Overcast"],
  [[45, 48], "fog", "Fog"],
  [[51, 53, 55], "drizzle", "Drizzle"],
  [[56, 57], "drizzle", "Freezing drizzle"],
  [[61, 63, 65], "rain", "Rain"],
  [[66, 67], "rain", "Freezing rain"],
  [[71, 73, 75], "snow", "Snow"],
  [[77], "snow", "Snow grains"],
  [[80, 81, 82], "rain", "Showers"],
  [[85, 86], "snow", "Snow showers"],
  [[95], "thunder", "Thunderstorm"],
  [[96, 99], "thunder", "Thunderstorm, hail"],
];

export function describe(code: number): { icon: string; label: string } {
  for (const [codes, icon, label] of CONDITIONS) {
    if (codes.includes(code)) return { icon, label };
  }
  return { icon: "cloudy", label: "—" };
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<WeatherLocation[]> {
  const url = `${GEOCODE}?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Couldn't search for that place.");
  const json = await res.json();

  return (json.results ?? []).map(
    (r: any): WeatherLocation => ({
      name: r.name,
      admin: r.admin1,
      country: r.country,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
    }),
  );
}

interface Cached {
  key: string;
  data: Weather;
}

const cacheStore = storage.defineItem<Cached | null>("local:weather", {
  fallback: null,
});

const TTL = 15 * 60_000;

function cacheKey(location: WeatherLocation, units: Units) {
  return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)},${units}`;
}

async function request(location: WeatherLocation, units: Units): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    daily: "temperature_2m_max,temperature_2m_min",
    hourly: "temperature_2m,weather_code,is_day",
    forecast_days: "2",
    timezone: "auto",
    ...(units === "imperial"
      ? { temperature_unit: "fahrenheit", wind_speed_unit: "mph" }
      : {}),
  });

  const res = await fetch(`${FORECAST}?${params}`);
  if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
  const json = await res.json();

  /**
   * Every timestamp here is local to the *location*, serialised without an
   * offset ("2026-09-03T16:15"). Passing that to `new Date()` would
   * reinterpret it in the viewer's own zone and shift the forecast by
   * however many hours apart they are. So: compare the ISO strings
   * directly (lexicographic order is chronological for this format) and
   * read the hour off characters 11-13 rather than converting at all.
   */
  const now: string = json.current.time;
  const times: string[] = json.hourly.time;
  let start = times.findIndex((t) => t >= now);
  if (start < 0) start = 0;

  const hours: HourPoint[] = times.slice(start, start + 6).map((t, i) => ({
    hour: Number(t.slice(11, 13)),
    temp: Math.round(json.hourly.temperature_2m[start + i]),
    code: json.hourly.weather_code[start + i],
    isDay: json.hourly.is_day[start + i] === 1,
  }));

  return {
    temp: Math.round(json.current.temperature_2m),
    feelsLike: Math.round(json.current.apparent_temperature),
    humidity: json.current.relative_humidity_2m,
    wind: Math.round(json.current.wind_speed_10m),
    code: json.current.weather_code,
    isDay: json.current.is_day === 1,
    high: Math.round(json.daily.temperature_2m_max[0]),
    low: Math.round(json.daily.temperature_2m_min[0]),
    hours,
    tempUnit: json.current_units.temperature_2m,
    windUnit: json.current_units.wind_speed_10m,
    fetchedAt: Date.now(),
  };
}

/**
 * Stale-while-revalidate. A new tab must never wait on the network to
 * paint, so cached data comes back immediately and `onFresh` fires later
 * if a refresh actually changed anything.
 */
export async function getWeather(
  location: WeatherLocation,
  units: Units,
  onFresh?: (weather: Weather) => void,
): Promise<Weather | null> {
  const key = cacheKey(location, units);
  const cached = await cacheStore.getValue();
  const hit = cached?.key === key ? cached.data : null;

  const stale = !hit || Date.now() - hit.fetchedAt > TTL;

  if (stale) {
    const pending = request(location, units)
      .then(async (data) => {
        await cacheStore.setValue({ key, data });
        return data;
      })
      .catch((err) => {
        // A failed refresh with usable cache on hand is not an error the
        // user needs to see; a failed *first* load is.
        if (hit) return null;
        throw err;
      });

    if (!hit) return pending;
    pending.then((data) => data && onFresh?.(data)).catch(() => {});
  }

  return hit;
}

export function formatHour(hour: number, clockFormat: "12h" | "24h"): string {
  if (clockFormat === "24h") return String(hour).padStart(2, "0");
  const h = hour % 12 || 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
}
