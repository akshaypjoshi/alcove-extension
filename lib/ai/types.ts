/**
 * Provider-agnostic chat types.
 *
 * The whole point of this file: everything above lib/ai (the sidepanel,
 * the floating chat, the newtab quick-ask box) only ever imports from
 * here. Adding a provider means adding one file under providers/ and
 * registering it - no UI changes.
 */

export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ModelInfo {
  /** Wire identifier sent to the API. */
  id: string;
  /** Human label for the model picker. */
  label: string;
  /** Context window in tokens, for the "you're near the limit" hint. */
  contextWindow?: number;
}

export interface StreamRequest {
  messages: ChatMessage[];
  /** System prompt. Anthropic takes a top-level field, OpenAI takes a message. */
  system?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  /** Wire this to an AbortController so the stop button actually stops. */
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Normalized stream events. Both providers get flattened into this,
 * so the UI never branches on provider.
 */
export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" };

export type ErrorKind =
  | "auth" // bad or missing key
  | "rate_limit"
  | "context_length"
  | "network"
  | "aborted"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly providerId: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Copy shown to the user. Keep it short; the raw message goes to console. */
  get userMessage(): string {
    switch (this.kind) {
      case "auth":
        return "That API key was rejected. Check it in Settings.";
      case "rate_limit":
        return "Rate limited by the provider. Wait a moment and retry.";
      case "context_length":
        return "This conversation is too long for the selected model.";
      case "network":
        return "Couldn't reach the provider. Check your connection.";
      case "aborted":
        return "Stopped.";
      default:
        return this.message || "Something went wrong.";
    }
  }
}

export interface Provider {
  readonly id: string;
  readonly label: string;
  /** Static fallback list, used before/if listModels() fails. */
  readonly models: ModelInfo[];
  readonly defaultModel: string;
  /** Where the user goes to create a key. Link this from Settings. */
  readonly keyUrl: string;
  /** Cheap round-trip to confirm a pasted key works. */
  validateKey(apiKey: string, signal?: AbortSignal): Promise<boolean>;
  /**
   * Live model list. Falls back to `models` on failure so a hobby repo
   * doesn't go stale every time a provider ships something new.
   */
  listModels?(apiKey: string, signal?: AbortSignal): Promise<ModelInfo[]>;
  stream(apiKey: string, req: StreamRequest): AsyncGenerator<StreamEvent>;
}
