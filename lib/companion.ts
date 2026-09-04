import { storage } from "#imports";

/**
 * The chat launcher that appears on ordinary web pages.
 *
 * It needs `<all_urls>`, which is the heaviest thing this extension could
 * ask for - so it is never granted at install. The content script is
 * declared with `registration: "runtime"` (see entrypoints/content.ts),
 * excluded from the manifest, and registered here only once the user has
 * switched the feature on and Chrome has granted the host permission.
 *
 * That keeps the default install a pure new-tab replacement, which is both
 * the honest description of what it does and what keeps the install prompt
 * free of "read and change all your data on every website".
 */

const SCRIPT_ID = "alcove-companion";
const MATCHES = ["<all_urls>"];

/** Mirrors the registration so settings can render without an async probe. */
export const companionEnabled = storage.defineItem<boolean>(
  "local:companionEnabled",
  { fallback: false },
);

/** Chrome and Firefox disagree on whether these return promises. */
function hasPermission(): Promise<boolean> {
  return Promise.resolve(
    browser.permissions.contains({ origins: MATCHES }),
  ).catch(() => false);
}

async function register(): Promise<void> {
  // Re-registering an existing id throws rather than replacing, and a stale
  // registration survives an extension reload, so clear it first.
  await unregister();
  await browser.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches: MATCHES,
      js: ["content-scripts/content.js"],
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
}

async function unregister(): Promise<void> {
  try {
    await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  } catch {
    // Not registered. Unregistering something absent is the normal path
    // here, not an error worth surfacing.
  }
}

/**
 * Turn the launcher on. Must be called from a user gesture - Chrome
 * rejects `permissions.request` outside one, and the rejection looks
 * exactly like the user declining.
 *
 * Returns false if the permission prompt was declined, so the caller can
 * leave the toggle off rather than showing it on with nothing behind it.
 */
export async function enableCompanion(): Promise<boolean> {
  const granted = await Promise.resolve(
    browser.permissions.request({ origins: MATCHES }),
  ).catch(() => false);

  if (!granted) return false;

  await register();
  await companionEnabled.setValue(true);
  return true;
}

export async function disableCompanion(): Promise<void> {
  await unregister();
  await companionEnabled.setValue(false);
  // Hand the host permission back. Leaving it granted would keep the
  // scary entry on the extension's permissions page for a feature that is
  // switched off.
  try {
    await browser.permissions.remove({ origins: MATCHES });
  } catch {
    // Firefox can refuse to drop an origin permission; the script is
    // already unregistered, so the feature is off either way.
  }
}

/**
 * Reconcile stored intent against reality. Registrations persist across
 * sessions, but the user can revoke the host permission from Chrome's own
 * UI at any time, which silently leaves the toggle claiming to be on.
 *
 * Called from the background on startup and after an update.
 */
export async function syncCompanion(): Promise<void> {
  const wanted = (await companionEnabled.getValue()) ?? false;
  const permitted = await hasPermission();

  if (wanted && permitted) {
    await register();
    return;
  }

  if (wanted && !permitted) {
    // Revoked behind our back.
    await unregister();
    await companionEnabled.setValue(false);
    return;
  }

  await unregister();
}
