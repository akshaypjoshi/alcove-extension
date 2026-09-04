import { ProviderError, type ErrorKind } from "./types";

export interface SSEMessage {
  event?: string;
  data: string;
}

/**
 * Minimal but correct SSE reader.
 *
 * The naive version of this - split each chunk on "\n" and parse - works
 * in dev and then breaks in the wild, because a network chunk can end
 * mid-line or even mid-UTF-8-character. So: buffer across chunks, decode
 * with { stream: true }, and dispatch only on a blank line.
 */
export async function* readSSE(
  res: Response,
): AsyncGenerator<SSEMessage> {
  if (!res.body) throw new Error("Response has no body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let eventName: string | undefined;
  let dataLines: string[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);

        // Blank line = dispatch whatever we've accumulated.
        if (line === "") {
          if (dataLines.length) {
            yield { event: eventName, data: dataLines.join("\n") };
          }
          eventName = undefined;
          dataLines = [];
          continue;
        }

        // Comment / heartbeat.
        if (line.startsWith(":")) continue;

        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value_ = colon === -1 ? "" : line.slice(colon + 1);
        if (value_.startsWith(" ")) value_ = value_.slice(1);

        if (field === "event") eventName = value_;
        else if (field === "data") dataLines.push(value_);
        // "id" and "retry" are unused here.
      }
    }

    // Some servers close without a trailing blank line.
    if (dataLines.length) {
      yield { event: eventName, data: dataLines.join("\n") };
    }
  } finally {
    // If the consumer breaks out of the for-await early (user hit stop),
    // this is what actually tears down the socket.
    reader.cancel().catch(() => {});
  }
}

/** Map HTTP status onto our error taxonomy. */
export function kindFromStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 413) return "context_length";
  if (status >= 500) return "network";
  return "unknown";
}

/** Turn a non-2xx Response into a ProviderError with the server's message. */
export async function errorFromResponse(
  res: Response,
  providerId: string,
): Promise<ProviderError> {
  let detail = res.statusText;
  try {
    const body = await res.text();
    const parsed = JSON.parse(body);
    detail = parsed?.error?.message ?? parsed?.message ?? body.slice(0, 300);
  } catch {
    /* keep statusText */
  }
  return new ProviderError(detail, kindFromStatus(res.status), providerId, res.status);
}

/** Normalize fetch rejections (including aborts) into ProviderError. */
export function wrapNetworkError(err: unknown, providerId: string): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ProviderError("Aborted", "aborted", providerId);
  }
  return new ProviderError(
    err instanceof Error ? err.message : String(err),
    "network",
    providerId,
  );
}
