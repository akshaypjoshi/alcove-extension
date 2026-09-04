import { useCallback, useEffect, useState } from "react";

/**
 * The shortcut row under the search bar.
 *
 * Reading history is a heavyweight permission — the install prompt says
 * "Read your browsing history" — so it isn't in `permissions`. It's
 * optional and requested the moment you switch the row on, which also
 * keeps it off the list a store reviewer has to be convinced about for
 * everyone who never turns it on.
 */

export type RecentSource = "history" | "topSites";

export interface RecentSite {
  url: string;
  title: string;
  host: string;
}

// Typed against the browser's own permission union so a typo is a compile
// error rather than a silently-never-granted request.
type Permission = Parameters<typeof browser.permissions.contains>[0]["permissions"];
const PERMISSIONS: Record<RecentSource, NonNullable<Permission>> = {
  history: ["history"],
  topSites: ["topSites"],
};

export async function hasPermission(source: RecentSource): Promise<boolean> {
  try {
    return Boolean(await browser.permissions.contains({ permissions: PERMISSIONS[source] }));
  } catch {
    return false;
  }
}

/** Must be called from a user gesture or Chrome rejects it outright. */
export async function requestPermission(source: RecentSource): Promise<boolean> {
  try {
    return Boolean(await browser.permissions.request({ permissions: PERMISSIONS[source] }));
  } catch {
    return false;
  }
}

/** Pages worth showing: not the browser's own furniture, not this tab. */
function isUsable(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * "YouTube - Home" and "Cricbuzz | Live Scores" both want to render as one
 * short word under a 56px tile, so take the part before the first
 * separator and fall back to the bare domain.
 */
function shortLabel(title: string | undefined, host: string): string {
  const head = (title ?? "").split(/\s+[|–—·:-]\s+/)[0].trim();
  if (head && head.length <= 18) return head;

  const bare = host.replace(/^www\./, "").split(".")[0];
  return head ? head.slice(0, 18) : bare.charAt(0).toUpperCase() + bare.slice(1);
}

export async function getRecentSites(
  source: RecentSource,
  limit: number,
): Promise<RecentSite[]> {
  const seen = new Set<string>();
  const out: RecentSite[] = [];

  const push = (url: string, title?: string) => {
    if (!isUsable(url) || out.length >= limit) return;
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return;
    }
    // One tile per site: revisiting the same place ten times shouldn't
    // fill the whole row with it.
    if (seen.has(host)) return;
    seen.add(host);
    out.push({ url, title: shortLabel(title, host), host });
  };

  try {
    if (source === "topSites") {
      const sites = await browser.topSites.get();
      sites.forEach((s) => push(s.url, s.title));
      return out;
    }

    const items = await browser.history.search({
      text: "",
      // Over-fetch: most of these collapse into one tile per site.
      maxResults: 200,
      startTime: Date.now() - 14 * 24 * 60 * 60 * 1000,
    });
    items
      .sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))
      .forEach((item) => item.url && push(item.url, item.title));
  } catch {
    /* permission revoked between the check and the call */
  }

  return out;
}

export function useRecentSites(source: RecentSource, limit: number, enabled: boolean) {
  const [sites, setSites] = useState<RecentSite[]>([]);
  const [granted, setGranted] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const ok = await hasPermission(source);
    setGranted(ok);
    setSites(ok ? await getRecentSites(source, limit) : []);
  }, [source, limit, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const grant = useCallback(async () => {
    if (await requestPermission(source)) await load();
  }, [source, load]);

  return { sites, granted, grant, reload: load };
}
