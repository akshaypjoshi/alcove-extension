import { anthropic } from "./anthropic";
import { openai, createOpenAICompatible } from "./openai";
import type { Provider } from "../types";

/**
 * Add a provider by adding a line here. Nothing else in the codebase
 * should ever mention a provider by name.
 */
export const PROVIDERS: Record<string, Provider> = {
  anthropic,
  openai,

  // Same wire format, different host. Costs one entry each.
  openrouter: createOpenAICompatible({
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-opus-5",
    fallbackModels: [],
    keyUrl: "https://openrouter.ai/keys",
  }),

  ollama: createOpenAICompatible({
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    fallbackModels: [],
    keyUrl: "https://ollama.com/download",
    keyOptional: true,
  }),
};

export function getProvider(id: string): Provider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export const PROVIDER_LIST = Object.values(PROVIDERS);
