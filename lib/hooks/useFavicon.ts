import { useEffect, useState } from "react";
import { faviconFor, hostOf, localFaviconUrl } from "@/lib/favicon";

/**
 * Returns a src for the link's icon, or null once every source is spent.
 * Resolves asynchronously, so callers render initials until it lands -
 * there's no layout shift, both are the same box.
 */
export function useFavicon(pageUrl: string, allowRemote: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const host = hostOf(pageUrl);
    if (!host) {
      setSrc(null);
      return;
    }

    let alive = true;
    faviconFor(pageUrl, allowRemote).then((url) => {
      if (!alive) return;
      // Chrome's own cache is the consolation prize: it renders a generic
      // globe rather than nothing, which still beats a bare letter for a
      // site the user has actually visited.
      setSrc(url ?? localFaviconUrl(pageUrl));
    });

    return () => {
      alive = false;
    };
  }, [pageUrl, allowRemote]);

  return src;
}
