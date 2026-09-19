import { useEffect, useState } from "react";
import { Loader2, Newspaper, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFavicon } from "@/lib/hooks/useFavicon";
import { useSettings } from "@/lib/settings";
import {
  MAX_TOPICS,
  NEWS_SECTIONS,
  clearNewsCache,
  getNews,
  hasNewsPermission,
  relativeTime,
  requestNewsPermission,
  revokeNewsPermission,
  type NewsItem,
  type NewsTopic,
} from "@/lib/news";
import { cn } from "@/lib/utils";

/**
 * The tool owns the topic list, the way WorldClock owns its zones. It has
 * the room for chips and a text box; the widget does not, and asking
 * someone to go to Settings to change what they read is a trip too far.
 */
export default function News() {
  const { settings, update } = useSettings();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [nonce, setNonce] = useState(0);

  const topics = settings?.news.topics ?? [];
  const allowRemoteIcons = settings?.fetchLinkIcons ?? true;
  // The topic set is the real dependency, not the array identity, which
  // changes on every unrelated settings write.
  const topicKey = topics.map((t) => t.id).join(",");

  useEffect(() => {
    hasNewsPermission().then(setGranted);
  }, []);

  useEffect(() => {
    if (!settings || granted !== true || !topics.length) {
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    getNews(topics, (fresh) => alive && setItems(fresh))
      .then((data) => alive && data && setItems(data))
      .catch((err) =>
        alive &&
        setError(err instanceof Error ? err.message : "Could not load the news."),
      )
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, granted, nonce, Boolean(settings)]);

  const setTopics = (next: NewsTopic[]) =>
    settings && update({ news: { ...settings.news, topics: next } });

  const addTopic = async (topic: Omit<NewsTopic, "id">) => {
    if (topics.length >= MAX_TOPICS) return;

    // Asked for inside the click that added the topic, because Chrome only
    // grants a permission from a user gesture. A refusal still keeps the
    // topic, so the list is there the moment access is allowed.
    if (granted !== true) setGranted(await requestNewsPermission());

    setTopics([...topics, { ...topic, id: crypto.randomUUID() }]);
  };

  const removeTopic = async (id: string) => {
    const next = topics.filter((t) => t.id !== id);
    setTopics(next);
    setItems(null);
    // No topics is the off state, so the host permission goes back rather
    // than sitting granted for something switched off. Re-granting is one
    // click the next time a topic is added.
    if (!next.length) {
      await revokeNewsPermission();
      setGranted(false);
    }
  };

  const refresh = async () => {
    await clearNewsCache();
    setNonce((n) => n + 1);
  };

  const submitQuery = () => {
    const value = draft.trim();
    if (!value) return;
    addTopic({ kind: "query", value, label: value });
    setDraft("");
  };

  const chosen = new Set(topics.map((t) => `${t.kind}:${t.value}`));
  const atLimit = topics.length >= MAX_TOPICS;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {NEWS_SECTIONS.map((section) => {
            const active = chosen.has(`section:${section.value}`);
            return (
              <button
                key={section.value}
                disabled={!active && atLimit}
                onClick={() => {
                  const existing = topics.find(
                    (t) => t.kind === "section" && t.value === section.value,
                  );
                  if (existing) removeTopic(existing.id);
                  else addTopic({ kind: "section", ...section });
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  active
                    ? "bg-primary text-primary-foreground border-transparent"
                    : "hover:bg-accent disabled:opacity-40",
                )}
              >
                {section.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1.5">
          <Input
            value={draft}
            disabled={atLimit}
            placeholder={atLimit ? `${MAX_TOPICS} topics is the limit` : "Follow a subject…"}
            className="h-8"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitQuery()}
          />
          <Button
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            disabled={!draft.trim() || atLimit}
            onClick={submitQuery}
            aria-label="Add topic"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {topics.some((t) => t.kind === "query") && (
          <div className="flex flex-wrap gap-1.5">
            {topics
              .filter((t) => t.kind === "query")
              .map((topic) => (
                <span
                  key={topic.id}
                  className="bg-muted/60 flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-xs"
                >
                  {topic.label}
                  <button
                    onClick={() => removeTopic(topic.id)}
                    className="hover:bg-accent rounded-full p-0.5"
                    aria-label={`Remove ${topic.label}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
          </div>
        )}
      </div>

      {topics.length > 0 && (
        <label className="flex items-center justify-between gap-4 border-t pt-3">
          <span className="min-w-0">
            <span className="block text-sm">Ticker</span>
            <span className="text-muted-foreground block text-xs">
              Scrolls headlines along the bottom of the page, the way a news
              channel does. Off means they stay in here.
            </span>
          </span>
          <Switch
            checked={Boolean(settings?.news.ticker)}
            onCheckedChange={(ticker) =>
              settings && update({ news: { ...settings.news, ticker } })
            }
          />
        </label>
      )}

      {topics.length === 0 ? (
        <Empty>
          <Newspaper className="size-4" /> Pick a topic to start.
        </Empty>
      ) : granted === false ? (
        <div className="text-muted-foreground rounded-lg border p-3 text-xs">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0" />
            Alcove needs access to news.google.com to load headlines.
          </p>
          <p className="mt-1">
            Only the topic name is sent, and access is handed back when you
            remove your last topic.
          </p>
          <Button
            size="sm"
            className="mt-2 h-7"
            onClick={async () => setGranted(await requestNewsPermission())}
          >
            Allow
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {items?.length ? `${items.length} stories` : ""}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={refresh}
              aria-label="Refresh"
            >
              {loading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>
          </div>

          {error && !items?.length ? (
            <p className="text-destructive rounded-lg border border-current/20 px-3 py-2 text-xs">
              {error}
            </p>
          ) : items?.length ? (
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.link}>
                  <Headline item={item} allowRemoteIcons={allowRemoteIcons} />
                </li>
              ))}
            </ul>
          ) : loading ? (
            <Empty>
              <Loader2 className="size-4 animate-spin" /> Loading headlines…
            </Empty>
          ) : (
            <Empty>Nothing came back for those topics.</Empty>
          )}
        </>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-center justify-center gap-2 px-2.5 py-8 text-sm">
      {children}
    </p>
  );
}

/**
 * Its own component so the favicon hook is called once per row rather than
 * in a loop. The icon comes from the feed's `source url`, not the link,
 * which is a news.google.com redirect and would give every story the same
 * one.
 */
function Headline({
  item,
  allowRemoteIcons,
}: {
  item: NewsItem;
  allowRemoteIcons: boolean;
}) {
  const icon = useFavicon(item.sourceUrl, allowRemoteIcons);

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noreferrer noopener"
      className="hover:bg-accent/60 flex gap-2.5 rounded-md px-2 py-2 transition"
    >
      <span className="mt-0.5 size-4 shrink-0 overflow-hidden rounded-sm">
        {icon ? (
          <img src={icon} alt="" className="size-4" loading="lazy" />
        ) : (
          <span className="bg-muted block size-4 rounded-sm" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-snug">{item.title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs">
          {item.source}
          {item.source && " · "}
          {relativeTime(item.publishedAt)}
        </span>
      </span>
    </a>
  );
}
