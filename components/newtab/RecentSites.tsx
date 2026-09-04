import { useState } from "react";
import { History } from "lucide-react";
import { initials } from "@/lib/favicon";
import { useFavicon } from "@/lib/hooks/useFavicon";
import { useRecentSites, type RecentSite, type RecentSource } from "@/lib/recents";
import { cn } from "@/lib/utils";

function Tile({ site, fetchIcons }: { site: RecentSite; fetchIcons: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = useFavicon(site.url, fetchIcons);

  return (
    <a
      href={site.url}
      title={site.url}
      className="group flex w-[4.5rem] flex-col items-center gap-1.5"
    >
      <span className="glass flex size-14 items-center justify-center rounded-2xl transition duration-200 group-hover:scale-105 group-hover:bg-[var(--glass-fill-hover)]">
        {src && !failed ? (
          <img
            src={src}
            alt=""
            className="size-7 rounded object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="text-on-wallpaper text-base font-semibold">
            {initials(site.title)}
          </span>
        )}
      </span>
      <span className="text-on-wallpaper w-full truncate text-center text-[11px] font-medium opacity-85">
        {site.title}
      </span>
    </a>
  );
}

/**
 * Chrome-style shortcut tiles under the search bar.
 *
 * Reading history needs a permission the extension doesn't hold by
 * default, so the row asks for it in place — the request has to come from
 * a click, and doing it here means the rest of the new tab works for
 * anyone who says no.
 */
export default function RecentSites({
  source,
  count,
  fetchIcons,
  centred,
}: {
  source: RecentSource;
  count: number;
  fetchIcons: boolean;
  centred: boolean;
}) {
  const { sites, granted, grant } = useRecentSites(source, count, true);

  if (granted === null) return null;

  if (!granted) {
    return (
      <button
        onClick={grant}
        className="glass text-on-wallpaper rise flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition hover:bg-[var(--glass-fill-hover)]"
        style={{ animationDelay: "320ms" }}
      >
        <History className="size-3.5" />
        {source === "history"
          ? "Allow history access to show recent sites"
          : "Allow access to show your most visited sites"}
      </button>
    );
  }

  if (!sites.length) return null;

  return (
    <div
      className={cn("rise flex flex-wrap gap-3", centred ? "justify-center" : "justify-start")}
      style={{ animationDelay: "320ms" }}
    >
      {sites.map((site) => (
        <Tile key={site.host} site={site} fetchIcons={fetchIcons} />
      ))}
    </div>
  );
}
