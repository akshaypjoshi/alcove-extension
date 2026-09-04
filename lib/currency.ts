import { storage } from "#imports";

/**
 * Rates come from open.er-api.com - no key, no signup, and it publishes a
 * `time_next_update_unix` so we don't have to guess a TTL. Results are
 * cached in local storage: the feed updates once a day, and a new tab
 * should never wait on the network to render.
 */

const ENDPOINT = "https://open.er-api.com/v6/latest/USD";

interface RateCache {
  base: string;
  rates: Record<string, number>;
  fetchedAt: number;
  nextUpdate: number;
}

const cacheStore = storage.defineItem<RateCache | null>("local:fxRates", {
  fallback: null,
});

/** Shown in the picker; the API returns ~160, which is an unusable list. */
export const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "JPY", "CNY", "AUD", "CAD", "CHF", "SGD",
  "AED", "HKD", "NZD", "SEK", "NOK", "DKK", "ZAR", "BRL", "MXN", "KRW",
  "THB", "TRY", "PLN", "IDR", "PHP", "MYR", "VND", "ILS", "SAR", "RUB",
];

export async function getRates(force = false): Promise<RateCache> {
  const cached = await cacheStore.getValue();
  const fresh = cached && Date.now() < cached.nextUpdate;
  if (cached && fresh && !force) return cached;

  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) throw new Error(`Rates request failed (${res.status})`);
    const json = await res.json();
    if (json.result !== "success") throw new Error(json["error-type"] ?? "Rates unavailable");

    const value: RateCache = {
      base: json.base_code,
      rates: json.rates,
      fetchedAt: Date.now(),
      // Fall back to 12h if the field is ever missing.
      nextUpdate: (json.time_next_update_unix ?? 0) * 1000 || Date.now() + 12 * 3600_000,
    };
    await cacheStore.setValue(value);
    return value;
  } catch (err) {
    // Stale rates beat no rates for a hobby converter - surface the age
    // in the UI instead of erroring out.
    if (cached) return cached;
    throw err;
  }
}

/** Rates are all quoted against one base, so cross-rates go through it. */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  const f = rates[from];
  const t = rates[to];
  if (!f || !t) return null;
  return (amount / f) * t;
}
