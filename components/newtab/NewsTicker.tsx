import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getNews, hasNewsPermission, type NewsItem } from "@/lib/news";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Pixels per second. Slow enough to read a headline as it passes. */
const SPEED = 45;

/**
 * A chyron along the bottom edge.
 *
 * The crawl is one CSS animation on a transform, not a per-frame JS loop:
 * it composites on the GPU and costs nothing while it runs, which matters
 * for something that is on screen the whole time a tab is open.
 *
 * It renders nothing at all unless it has headlines to show. An empty
 * strip, a spinner or a "grant access" prompt pinned across the bottom of
 * the page would be worse than no ticker, so every one of those states is
 * simply absent.
 */
export default function NewsTicker({ shifted }: { shifted: boolean }) {
  const { settings } = useSettings();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [granted, setGranted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [index, setIndex] = useState(0);

  const trackRef = useRef<HTMLDivElement>(null);

  const on = Boolean(settings?.news.ticker);
  const topics = settings?.news.topics ?? [];
  const topicKey = topics.map((t) => t.id).join(",");

  // A crawl is exactly the kind of motion this setting exists to stop, so
  // the whole presentation changes rather than the animation just being
  // switched off: one headline at a time, swapped on a timer.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!on) return;
    hasNewsPermission().then(setGranted);
  }, [on]);

  useEffect(() => {
    if (!on || !granted || !topics.length) {
      setItems(null);
      return;
    }

    let alive = true;
    getNews(topics, (fresh) => alive && setItems(fresh))
      .then((data) => alive && data && setItems(data))
      .catch(() => alive && setItems(null));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, granted, topicKey]);

  // Measured after paint: the duration has to come from the real rendered
  // width, or the speed would change with the number of headlines.
  useLayoutEffect(() => {
    if (!items?.length || reduceMotion) return;
    const width = trackRef.current?.scrollWidth ?? 0;
    if (width > 0) setDuration(width / 2 / SPEED);
  }, [items, reduceMotion]);

  // A background tab should not be animating. Chrome throttles hidden
  // tabs but does not stop compositor work, and there is nothing to see.
  useEffect(() => {
    const sync = () => setHidden(document.visibilityState === "hidden");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const headlines = items?.slice(0, 25) ?? [];

  useEffect(() => {
    if (!reduceMotion || headlines.length < 2) return;
    const id = setInterval(() => setIndex((i) => i + 1), 8000);
    return () => clearInterval(id);
  }, [reduceMotion, headlines.length]);

  const visible = on && headlines.length > 0;

  /**
   * The strip owns the space it takes, rather than App guessing from the
   * setting. It hides itself whenever it has nothing to show, so a
   * setting-derived variable would lift the dock over an empty gap.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ticker-h", visible ? "2.25rem" : "0px");
    return () => root.style.setProperty("--ticker-h", "0px");
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "glass text-on-wallpaper group fixed bottom-0 left-0 z-30 flex h-9 items-center overflow-hidden rounded-none border-t border-[var(--glass-line)] transition-[right] duration-300 ease-out",
      )}
      // Stops under the drawer rather than running beneath it, the same
      // way the dock and the action button step aside.
      style={{ right: shifted ? "var(--drawer-w)" : 0 }}
      // Hover pause is CSS, not a React handler: it cannot miss an event,
      // and it keeps working while the crawl is mid-flight.
      data-paused={hidden || undefined}
    >
      <span className="bg-primary text-primary-foreground flex h-full shrink-0 items-center px-3 text-[11px] font-semibold tracking-wider uppercase">
        News
      </span>

      {reduceMotion ? (
        <div className="min-w-0 flex-1 px-3">
          <Headline item={headlines[index % headlines.length]} />
        </div>
      ) : (
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            ref={trackRef}
            className={cn(
              "flex w-max items-center",
              duration > 0 &&
                "ticker-track group-hover:[--ticker-play:paused] group-data-[paused]:[--ticker-play:paused]",
            )}
            style={{ "--ticker-dur": `${duration}s` } as React.CSSProperties}
          >
            {/* Twice, so the loop point is seamless. The copy is hidden
                from assistive tech and from tab order. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
                {headlines.map((item) => (
                  <Headline
                    key={`${copy}-${item.link}`}
                    item={item}
                    tabbable={copy === 0}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Headline({
  item,
  tabbable = true,
}: {
  item: NewsItem;
  tabbable?: boolean;
}) {
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer noopener"
      tabIndex={tabbable ? 0 : -1}
      className="flex shrink-0 items-center gap-2 px-4 text-[13px] whitespace-nowrap hover:underline"
    >
      <span className="bg-primary/70 size-1 shrink-0 rounded-full" />
      {item.title}
      <span className="opacity-55">{item.source}</span>
    </a>
  );
}
