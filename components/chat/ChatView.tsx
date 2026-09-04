import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { storage } from "#imports";
import {
  ArrowUp,
  KeyRound,
  Loader2,
  MessageSquarePlus,
  Settings2,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import Markdown from "@/components/chat/Markdown";
import ThemeToggle from "@/components/ThemeToggle";
import { useChat } from "@/lib/ai/useChat";
import { getProvider, PROVIDER_LIST } from "@/lib/ai/providers";
import type { ChatMessage, ModelInfo } from "@/lib/ai/types";
import { useApiKeys, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Explain this error message",
  "Summarise the page I was just on",
  "Draft a short reply to this",
  "What should I make for dinner?",
];

/**
 * The one chat surface. It renders identically in the side panel, in the
 * injected iframe, and in the new tab's overlay - the only differences are
 * width and whether the header shows a settings shortcut.
 *
 * `persistKey` scopes the transcript in local storage, so the side panel
 * conversation isn't clobbered by a new tab quick-ask.
 */
export default function ChatView({
  persistKey = "sidepanel",
  onOpenSettings,
  onClose,
  className,
}: {
  persistKey?: string;
  onOpenSettings?: () => void;
  /** Rendered in the header, so it can't collide with a floating one. */
  onClose?: () => void;
  className?: string;
}) {
  const { settings, update } = useSettings();
  const { keys } = useApiKeys();
  const [restored, setRestored] = useState<ChatMessage[] | null>(null);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [input, setInput] = useState("");

  // Memoised: defineItem() on every render would churn a new item object
  // per keystroke, and every effect below depends on its identity.
  const store = useMemo(
    () =>
      storage.defineItem<ChatMessage[]>(`local:chat:${persistKey}`, {
        fallback: [],
      }),
    [persistKey],
  );

  useEffect(() => {
    store.getValue().then((v) => setRestored(v ?? []));
  }, [store]);

  const providerId = settings?.ai.providerId ?? "anthropic";
  const apiKey = keys[providerId] ?? "";
  const provider =
    PROVIDER_LIST.find((p) => p.id === providerId) ?? PROVIDER_LIST[0];
  const needsKey = !apiKey && providerId !== "ollama";

  const chat = useChat({
    providerId,
    apiKey,
    model: settings?.ai.model ?? provider.defaultModel,
    system: settings?.ai.systemPrompt,
    initial: restored ?? [],
  });

  // useChat seeds from `initial` once; push the restored transcript in as
  // soon as storage answers.
  useEffect(() => {
    if (restored?.length) chat.setMessages(restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

  // Persist, but not mid-stream - writing on every token would put a
  // storage round-trip in the render path.
  useEffect(() => {
    if (chat.streaming || restored === null) return;
    store.setValue(chat.messages.slice(-40));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.streaming, chat.messages.length, store]);

  // Live model list, once there's a key to ask with.
  useEffect(() => {
    if (!apiKey && providerId !== "ollama") return;
    let alive = true;
    getProvider(providerId)
      .listModels?.(apiKey)
      .then((list) => alive && setModels(list))
      .catch(() => alive && setModels(null));
    return () => {
      alive = false;
    };
  }, [providerId, apiKey]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Follow the stream only while the user is already at the bottom, so
  // scrolling up to read doesn't yank you back down every token.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  const send = () => {
    const text = input.trim();
    if (!text || chat.streaming || needsKey) return;
    pinned.current = true;
    setInput("");
    chat.send(text);
  };

  const modelOptions = models ?? provider.models;
  const empty = chat.messages.length === 0;

  return (
    // Its own provider: the side panel and the injected iframe render this
    // as their whole app, with no TooltipProvider above it. Nesting one
    // inside the new tab's provider is a no-op.
    <TooltipProvider delayDuration={400}>
      <div className={cn("bg-background flex h-full flex-col", className)}>
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <Select
            value={providerId}
            onValueChange={(id) => {
              if (!settings) return;
              const next = PROVIDER_LIST.find((p) => p.id === id)!;
              update({
                ai: {
                  ...settings.ai,
                  providerId: id,
                  model: next.defaultModel,
                },
              });
              setModels(null);
            }}
          >
            <SelectTrigger size="sm" className="w-auto border-none shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_LIST.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={settings?.ai.model ?? provider.defaultModel}
            onValueChange={(model) =>
              settings && update({ ai: { ...settings.ai, model } })
            }
          >
            <SelectTrigger
              size="sm"
              className="min-w-0 flex-1 border-none shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {modelOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ThemeToggle />

          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => {
              chat.setMessages([]);
              store.setValue([]);
            }}
            aria-label="New chat"
          >
            <MessageSquarePlus className="size-4" />
          </Button>
          {onOpenSettings && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={onOpenSettings}
              aria-label="Settings"
            >
              <Settings2 className="size-4" />
            </Button>
          )}
          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          )}
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
        >
          {needsKey ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <KeyRound className="text-muted-foreground size-6" />
              <div>
                <p className="text-sm font-medium">
                  Add your {provider.label} key to start
                </p>
                <p className="text-muted-foreground mt-1 max-w-64 text-xs">
                  Keys are stored locally on this device and never synced.
                </p>
              </div>
              <div className="flex gap-2">
                {onOpenSettings && (
                  <Button size="sm" onClick={onOpenSettings}>
                    Open settings
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Get a key
                  </a>
                </Button>
              </div>
            </div>
          ) : empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-muted-foreground text-sm">
                What can I help with?
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="hover:bg-accent rounded-full border px-3 py-1 text-xs transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chat.messages.map((message, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3.5 py-2.5",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60",
                  )}
                >
                  {message.content ? (
                    <Markdown content={message.content} />
                  ) : (
                    <Loader2 className="size-4 animate-spin opacity-60" />
                  )}
                </div>
              </div>
            ))
          )}

          {chat.error && (
            <p className="text-destructive rounded-lg border border-current/20 px-3 py-2 text-xs">
              {chat.error}
            </p>
          )}
        </div>

        <div className="border-t p-3">
          <div className="focus-within:ring-ring/50 bg-muted/40 flex items-end gap-2 rounded-2xl border p-1.5 transition focus-within:ring-2">
            <Textarea
              value={input}
              disabled={needsKey}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter is a newline. IME composition has
                // to be excluded or every Japanese/Chinese input sends early.
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Ask anything…"
              className="max-h-40 min-h-9 resize-none border-none bg-transparent py-2 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {chat.streaming ? (
              <Button
                size="icon"
                variant="secondary"
                className="size-8 shrink-0 rounded-xl"
                onClick={chat.stop}
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="size-8 shrink-0 rounded-xl"
                disabled={!input.trim() || needsKey}
                onClick={send}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
