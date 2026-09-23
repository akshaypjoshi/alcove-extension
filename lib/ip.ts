/**
 * Public IP lookup.
 *
 * There is no way to do this locally: the address a site sees belongs to
 * whatever NAT and carrier sit between this machine and the internet, so
 * something out there has to report it back. That makes this the one tool
 * in Alcove that cannot keep to the machine, and the panel says so.
 *
 * Both endpoints answer with `Access-Control-Allow-Origin: *`, so this
 * needs no host permission and the manifest is untouched. Checked against
 * the live services rather than assumed.
 */

export interface IpInfo {
  ip: string;
  family: "IPv4" | "IPv6";
  /** Only filled when the connection came over IPv6 and a v4 also exists. */
  ipv4?: string;
  city?: string;
  region?: string;
  country?: string;
  flag?: string;
  postal?: string;
  isp?: string;
  asn?: number;
  timezone?: string;
  utcOffset?: string;
}

const DETAILS = "https://ipwho.is/";
/** v4-only hostname, which is the whole point of asking it. */
const V4_ONLY = "https://api.ipify.org?format=json";

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    signal: signal ?? AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`The lookup service answered ${res.status}.`);
  return res.json();
}

export async function lookupIp(signal?: AbortSignal): Promise<IpInfo> {
  let data: Record<string, any>;
  try {
    data = (await getJson(DETAILS, signal)) as Record<string, any>;
  } catch (err) {
    // The caller aborts with a TimeoutError when its own clock runs out,
    // so check the signal's reason as well as the thrown error.
    const reason = (signal as AbortSignal | undefined)?.reason;
    const timedOut =
      (err instanceof Error && err.name === "TimeoutError") ||
      (reason instanceof Error && reason.name === "TimeoutError");
    if (timedOut) {
      throw new Error("The lookup timed out. Check the connection and retry.");
    }
    throw new Error("Could not reach the lookup service.");
  }

  if (data.success === false) {
    throw new Error(typeof data.message === "string" ? data.message : "The lookup failed.");
  }
  if (typeof data.ip !== "string") throw new Error("The lookup service sent something unexpected.");

  const family: IpInfo["family"] = data.ip.includes(":") ? "IPv6" : "IPv4";

  const info: IpInfo = {
    ip: data.ip,
    family,
    city: data.city || undefined,
    region: data.region || undefined,
    country: data.country || undefined,
    flag: data.flag?.emoji || undefined,
    postal: data.postal || undefined,
    isp: data.connection?.isp || data.connection?.org || undefined,
    asn: typeof data.connection?.asn === "number" ? data.connection.asn : undefined,
    timezone: data.timezone?.id || undefined,
    utcOffset: data.timezone?.utc || undefined,
  };

  // Only worth a second request when the browser reached us over IPv6: a
  // v4 answer already means there was no v6 route to prefer. A failure
  // here is ordinary - plenty of networks have no v4 address at all - so
  // it costs the user nothing but the missing line.
  if (family === "IPv6") {
    try {
      const v4 = (await getJson(V4_ONLY, signal)) as { ip?: string };
      if (typeof v4.ip === "string" && !v4.ip.includes(":")) info.ipv4 = v4.ip;
    } catch {
      // No IPv4 route, or the service is down. Neither is an error here.
    }
  }

  return info;
}

/** "Jaipur, Rajasthan, India", skipping whichever parts are missing. */
export function placeOf(info: IpInfo): string {
  return [info.city, info.region, info.country].filter(Boolean).join(", ");
}
