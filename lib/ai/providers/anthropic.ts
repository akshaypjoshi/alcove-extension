import { readSSE, errorFromResponse, wrapNetworkError } from "../sse";
import { ProviderError } from "../types";
import type {
  ModelInfo,
  Provider,
  StreamEvent,
  StreamRequest,
} from "../types";

const ID = "anthropic";
const BASE = "https://api.anthropic.com/v1";

/**
 * Without the third header you get a 401 telling you CORS requests must
 * set 'anthropic-dangerous-direct-browser-access'. It is the opt-in for
 * calling the API straight from a browser origin, which is exactly the
 * bring-your-own-key case here.
 */
function headers(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/**
 * Fallback only - listModels() replaces this from /v1/models on first load.
 * Note the bare ids: the Messages API takes `claude-haiku-4-5`, not a
 * date-suffixed snapshot, and a stale suffix here is a 404 at send time.
 */
const FALLBACK_MODELS: ModelInfo[] = [
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
];

export const anthropic: Provider = {
  id: ID,
  label: "Anthropic",
  models: FALLBACK_MODELS,
  defaultModel: "claude-opus-5",
  keyUrl: "https://console.anthropic.com/settings/keys",

  async validateKey(apiKey, signal) {
    try {
      const res = await fetch(`${BASE}/models?limit=1`, {
        headers: headers(apiKey),
        signal,
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(apiKey, signal) {
    const res = await fetch(`${BASE}/models?limit=100`, {
      headers: headers(apiKey),
      signal,
    });
    if (!res.ok) throw await errorFromResponse(res, ID);
    const json = await res.json();
    return (json.data ?? []).map(
      (m: { id: string; display_name?: string }): ModelInfo => ({
        id: m.id,
        label: m.display_name ?? m.id,
      }),
    );
  },

  async *stream(apiKey, req: StreamRequest): AsyncGenerator<StreamEvent> {
    let res: Response;
    try {
      res = await fetch(`${BASE}/messages`, {
        method: "POST",
        headers: headers(apiKey),
        signal: req.signal,
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature,
          // Anthropic takes system as a top-level field, not a message.
          ...(req.system ? { system: req.system } : {}),
          messages: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        }),
      });
    } catch (err) {
      throw wrapNetworkError(err, ID);
    }

    if (!res.ok) throw await errorFromResponse(res, ID);

    try {
      for await (const msg of readSSE(res)) {
        if (msg.data === "[DONE]") break;

        let payload: any;
        try {
          payload = JSON.parse(msg.data);
        } catch {
          continue;
        }

        switch (payload.type) {
          case "content_block_delta":
            // text_delta is what we want. thinking_delta / input_json_delta
            // are ignored here; surface them later if you add tool use.
            if (payload.delta?.type === "text_delta" && payload.delta.text) {
              yield { type: "text", delta: payload.delta.text };
            }
            break;

          case "message_start":
            if (payload.message?.usage) {
              yield {
                type: "usage",
                usage: { inputTokens: payload.message.usage.input_tokens },
              };
            }
            break;

          case "message_delta":
            if (payload.usage?.output_tokens != null) {
              yield {
                type: "usage",
                usage: { outputTokens: payload.usage.output_tokens },
              };
            }
            break;

          case "error":
            throw new ProviderError(
              payload.error?.message ?? "Stream error",
              "unknown",
              ID,
            );

          case "message_stop":
            yield { type: "done" };
            return;
        }
      }
      yield { type: "done" };
    } catch (err) {
      throw wrapNetworkError(err, ID);
    }
  },
};
