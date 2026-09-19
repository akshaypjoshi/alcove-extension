import { useEffect, useState } from "react";
import { Loader2, Newspaper, RefreshCw } from "lucide-react";
import WidgetCard from "@/components/widgets/WidgetCard";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import type { WidgetProps } from "@/lib/widgets";
import {
  getNews,
  hasNewsPermission,
  relativeTime,
  type NewsItem,
} from "@/lib/news";

/**
 * A glance at the top headlines. The full list, and everything that edits
 * the topic set, lives in the News tool - a 168px card has room for three
 * lines of text and nothing else, so this reads from the same cache and
 * sends people to the tool for anything more.
 */
export default function NewsWidget({ size, config, onOpenSettings }: WidgetProps) {
  const { settings } = useSettings();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);

  const all = settings?.news.topics ?? [];
  // "all" is the fallback in the registry, so an instance that has never
  // been configured shows everything rather than nothing.
  const topics =
    config.topic && config.topic !== "all"
      ? all.filter((t) => t.id === config.topic)
      : all;

  const topicKey = topics.map((t) => t.id).join(",");

  useEffect(() => {
    hasNewsPermission().then(setGranted);
  }, []);

  useEffect(() => {
    if (!settings || granted !== true || !topics.length) return;

    let alive = true;
    getNews(topics, (fresh) => alive && setItems(fresh))
      .then((data) => alive && data && setItems(data))
      .catch((err) =>
        alive && setError(err instanceof Error ? err.message : "Unavailable"),
      );

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, granted, Boolean(settings)]);

  // Measured, not guessed: the wide card leaves 110px under its header,
  // and a two-line headline plus its source line is about 50px. Three
  // rows need 179px, so the third was rendering invisibly and cutting the
  // second in half.
  const limit = size === "md" ? 2 : 1;

  if (!topics.length || granted === false) {
    return (
      <WidgetCard size={size} className="items-center justify-center gap-2">
        <Newspaper className="size-5 opacity-70" />
        <span className="text-sm font-medium">News</span>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 rounded-full px-3 text-xs"
          onClick={onOpenSettings}
        >
          {topics.length ? "Allow access" : "Pick a topic"}
        </Button>
      </WidgetCard>
    );
  }

  if (!items) {
    return (
      <WidgetCard size={size} className="items-center justify-center gap-2">
        {error ? (
          <>
            <RefreshCw className="size-4 opacity-70" />
            <span className="text-center text-xs opacity-75">{error}</span>
          </>
        ) : (
          <Loader2 className="size-4 animate-spin opacity-70" />
        )}
      </WidgetCard>
    );
  }

  return (
    <WidgetCard size={size} className="gap-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase opacity-60">
        <Newspaper className="size-3" /> News
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        {items.slice(0, limit).map((item) => (
          <li key={item.link} className="min-w-0">
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer noopener"
              className="block hover:opacity-80"
            >
              <span
                className="block text-[13px] leading-snug"
                // Two lines on the wide card, four on the small one, so a
                // long headline truncates instead of pushing the card's
                // other rows out of a fixed-height box.
                style={{
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: size === "md" ? 2 : 4,
                  overflow: "hidden",
                }}
              >
                {item.title}
              </span>
              <span className="block truncate text-[10px] opacity-60">
                {item.source}
                {item.source && " · "}
                {relativeTime(item.publishedAt)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
