import { useCallback, useRef, useState } from "react";
import { getProvider } from "./providers";
import { ProviderError, type ChatMessage } from "./types";

/**
 * The payoff for the adapter layer: this hook is provider-blind, and the
 * three UIs (newtab, sidepanel, floating chat iframe) all import it.
 *
 * Note where this runs. Call it from an extension-origin document — the
 * side panel, /chat.html inside the injected iframe, or the newtab page.
 * Do NOT run it in a content script: MV3 content scripts inherit the host
 * page's origin for fetch, so you'd be back to relaying every token
 * through the service worker, which idles out mid-stream.
 */
export function useChat(opts: {
  providerId: string;
  apiKey: string;
  model: string;
  system?: string;
  initial?: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(opts.initial ?? []);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (streaming) return;
      setError(null);

      const history: ChatMessage[] = [
        ...messages,
        { role: "user", content: text },
      ];
      // Push the user turn plus an empty assistant turn we'll fill in.
      setMessages([...history, { role: "assistant", content: "" }]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const provider = getProvider(opts.providerId);
        const stream = provider.stream(opts.apiKey, {
          messages: history,
          system: opts.system,
          model: opts.model,
          signal: controller.signal,
        });

        // Batch tokens into one state update per frame. Setting state on
        // every delta will pin a CPU core on a fast model.
        let pending = "";
        let scheduled = false;
        const flush = () => {
          scheduled = false;
          if (!pending) return;
          const chunk = pending;
          pending = "";
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = {
              ...last,
              content: last.content + chunk,
            };
            return next;
          });
        };

        for await (const ev of stream) {
          if (ev.type === "text") {
            pending += ev.delta;
            if (!scheduled) {
              scheduled = true;
              requestAnimationFrame(flush);
            }
          }
        }
        flush();
      } catch (err) {
        const pe =
          err instanceof ProviderError
            ? err
            : new ProviderError(String(err), "unknown", opts.providerId);
        if (pe.kind !== "aborted") setError(pe.userMessage);
        console.error(pe);
        // Drop the empty assistant bubble if nothing streamed in.
        setMessages((prev) =>
          prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev,
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, opts.providerId, opts.apiKey, opts.model, opts.system],
  );

  return { messages, send, stop, streaming, error, setMessages };
}
