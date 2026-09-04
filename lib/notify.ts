/**
 * A checked wrapper around chrome.notifications.
 *
 * The raw API fails silently in the two ways that matter most: it resolves
 * normally when the OS has notifications turned off for Chrome, and on
 * older Chrome builds it uses a callback and reports problems through
 * runtime.lastError rather than rejecting. Either way the reminder simply
 * never appears and nothing anywhere says why.
 */

export interface NotifyResult {
  ok: boolean;
  error?: string;
}

/**
 * Chrome only started returning a promise from notifications.create in
 * 116; before that it's callback-style and reports problems through
 * runtime.lastError, which has to be read *inside* the callback. Passing a
 * callback works on every Chrome version, so that's the path used there.
 * Firefox is promise-only and rejects an extra callback argument.
 */
function createNotification(
  id: string | undefined,
  options: Record<string, unknown>,
): Promise<NotifyResult> {
  if (import.meta.env.BROWSER !== "chrome") {
    return (browser.notifications.create as any)(id ?? "", options)
      .then(() => ({ ok: true }))
      .catch((err: unknown) => ({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }));
  }

  return new Promise<NotifyResult>((resolve) => {
    const done = (created?: string) => {
      const lastError = browser.runtime.lastError;
      if (lastError) return resolve({ ok: false, error: lastError.message });
      // An empty id means the request was dropped without an error.
      if (created === "") return resolve({ ok: false, error: "The browser dropped it." });
      resolve({ ok: true });
    };

    try {
      const create = browser.notifications.create as any;
      if (id) create(id, options, done);
      else create(options, done);
    } catch (err) {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}

export async function notify(
  id: string | undefined,
  title: string,
  message: string,
): Promise<NotifyResult> {
  const options: Record<string, unknown> = {
    type: "basic",
    iconUrl: browser.runtime.getURL("/icon/128.png"),
    title,
    message,
    // Only Chrome accepts this; Firefox rejects unknown keys outright.
    ...(import.meta.env.BROWSER === "chrome" ? { requireInteraction: true } : {}),
  };

  return createNotification(id, options);
}

/**
 * "granted" / "denied" from Chrome. Firefox has no equivalent, so it's
 * reported as unknown rather than guessed at.
 */
export async function permissionLevel(): Promise<"granted" | "denied" | "unknown"> {
  try {
    const getLevel = (browser.notifications as any)?.getPermissionLevel;
    if (typeof getLevel !== "function") return "unknown";
    const level = await new Promise<string>((resolve) => {
      // Callback on Chrome, promise on Firefox - accept whichever answers.
      const maybe = getLevel.call(browser.notifications, resolve);
      if (maybe && typeof maybe.then === "function") maybe.then(resolve, () => resolve(""));
    });
    return level === "granted" || level === "denied" ? level : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * A toolbar badge as a second channel. If the OS is swallowing Chrome's
 * notifications - Focus mode, or notifications turned off for Chrome -
 * this is the only signal the user still gets.
 */
export async function setBadge(count: number) {
  const action = (browser as any).action ?? (browser as any).browserAction;
  if (!action) return;
  try {
    await action.setBadgeText({ text: count > 0 ? String(count) : "" });
    await action.setBadgeBackgroundColor?.({ color: "#e11d48" });
  } catch {
    // Badges are a nicety; never let one break the notification path.
  }
}
