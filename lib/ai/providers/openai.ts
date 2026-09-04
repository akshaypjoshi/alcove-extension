import { readSSE, errorFromResponse, wrapNetworkError } from "../sse";
import { ProviderError } from "../types";
import type {
  ModelInfo,
  Provider,
  StreamEvent,
  StreamRequest,
} from "../types";

const ID = "openai";
const DEFAULT_BASE = "https://api.openai.com/v1";

/**
 * Built as a factory rather than a singleton, because the same wire format
 * covers OpenRouter, Groq, Together, and a local Ollama or LM Studio server.
 * One adapter, several entries in the registry — good value for a hobby repo.
 */
export function createOpenAICompatible(opts: {
  id: string;
  label: string;
  baseUrl?: string;
  defaultModel: string;
  fallbackModels: ModelInfo[];
  keyUrl: string;
  /** Local servers usually don't need a key. */
  keyOptional?: boolean;
}): Provider {
  const base = opts.baseUrl ?? DEFAULT_BASE;

  const headers = (apiKey: string): HeadersInit => ({
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  });

  return {
    id: opts.id,
    label: opts.label,
    models: opts.fallbackModels,
    defaultModel: opts.defaultModel,
    keyUrl: opts.keyUrl,

    async validateKey(apiKey, signal) {
      if (!apiKey && opts.keyOptional) return true;
      try {
        const res = await fetch(`${base}/models`, {
          headers: headers(apiKey),
          signal,
        });
        return res.ok;
      } catch {
        return false;
      }
    },

    async listModels(apiKey, signal) {
      const res = await fetch(`${base}/models`, {
        headers: headers(apiKey),
        signal,
      });
      if (!res.ok) throw await errorFromResponse(res, opts.id);
      const json = await res.json();
      return (json.data ?? [])
        .map((m: { id: string }): ModelInfo => ({ id: m.id, label: m.id }))
        .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));
    },

    async *stream(apiKey, req: StreamRequest): AsyncGenerator<StreamEvent> {
      // Unlike Anthropic, the system prompt is just the first message.
      const messages = req.system
        ? [{ role: "system", content: req.system }, ...req.messages]
        : req.messages;

      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: headers(apiKey),
          signal: req.signal,
          body: JSON.stringify({
            model: req.model,
            messages,
            max_tokens: req.maxTokens ?? 4096,
            temperature: req.temperature,
            stream: true,
            // Without this you get no usage numbers on a streamed response.
            stream_options: { include_usage: true },
          }),
        });
      } catch (err) {
        throw wrapNetworkError(err, opts.id);
      }

      if (!res.ok) throw await errorFromResponse(res, opts.id);

      try {
        for await (const msg of readSSE(res)) {
          if (msg.data === "[DONE]") break;

          let payload: any;
          try {
            payload = JSON.parse(msg.data);
          } catch {
            continue;
          }

          if (payload.error) {
            throw new ProviderError(
              payload.error.message ?? "Stream error",
              "unknown",
              opts.id,
            );
          }

          const delta = payload.choices?.[0]?.delta?.content;
          if (delta) yield { type: "text", delta };

          // The usage chunk arrives last and has an empty choices array.
          if (payload.usage) {
            yield {
              type: "usage",
              usage: {
                inputTokens: payload.usage.prompt_tokens,
                outputTokens: payload.usage.completion_tokens,
              },
            };
          }
        }
        yield { type: "done" };
      } catch (err) {
        throw wrapNetworkError(err, opts.id);
      }
    },
  };
}

export const openai = createOpenAICompatible({
  id: ID,
  label: "OpenAI",
  defaultModel: "gpt-4o-mini",
  // Deliberately thin: listModels() hits /v1/models and replaces this at
  // runtime, so the repo doesn't need a PR every time a model ships.
  fallbackModels: [
    { id: "gpt-4o", label: "gpt-4o" },
    { id: "gpt-4o-mini", label: "gpt-4o-mini" },
  ],
  keyUrl: "https://platform.openai.com/api-keys",
});
