import { ALARM_NAME, timerStore } from "@/lib/timer";
import { ALARM_PREFIX, remindersStore, syncAlarms } from "@/lib/reminders";
import { notify, setBadge } from "@/lib/notify";

export default defineBackground(() => {
  /**
   * MV3 service workers are torn down between events, so nothing here may
   * rely on module state surviving. Every handler re-reads from storage.
   */

  // Clicking the toolbar icon opens the side panel. Chrome-only API, and
  // it has to be registered at top level — inside an onInstalled callback
  // it silently never applies after the worker restarts.
  browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});

  browser.commands?.onCommand.addListener(async (command) => {
    if (command !== "open-chat") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: "tabby:toggle" });
    } catch {
      // No content script on this tab (chrome:// pages, the web store).
      // The side panel works everywhere, so fall back to it.
      if (tab.windowId != null) {
        await browser.sidePanel?.open({ windowId: tab.windowId });
      }
    }
  });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith(ALARM_PREFIX)) {
      const id = alarm.name.slice(ALARM_PREFIX.length);
      const reminders = (await remindersStore.getValue()) ?? [];
      const reminder = reminders.find((r) => r.id === id);
      if (!reminder) return;

      const result = await notify(alarm.name, "Reminder", reminder.text);
      if (!result.ok) {
        console.error("[alcove] notification failed:", result.error);
      }

      // Kept in the list rather than deleted, so a reminder that fired
      // while you were away is still there when you come back. notifyError
      // is what lets the tool say *why* nothing appeared.
      const updated = reminders.map((r) =>
        r.id === id
          ? { ...r, firedAt: Date.now(), notifyError: result.ok ? undefined : result.error }
          : r,
      );
      await remindersStore.setValue(updated);

      // Second channel, in case the OS swallowed the notification.
      await setBadge(updated.filter((r) => r.firedAt && !r.acknowledged).length);
      return;
    }

    if (alarm.name !== ALARM_NAME) return;
    const timer = await timerStore.getValue();

    const result = await notify(undefined, "Time's up", timer?.label ?? "Your timer has finished.");
    if (!result.ok) console.error("[alcove] notification failed:", result.error);

    // Leave the finished timer on screen at 0:00 rather than clearing it,
    // so a new tab opened a minute later still shows what just fired.
    if (timer) {
      await timerStore.setValue({ ...timer, endsAt: Date.now(), remainingMs: 0 });
    }
  });

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") browser.runtime.openOptionsPage();
    // Chrome drops an extension's alarms on reload/update, so pending
    // reminders have to be re-armed from storage.
    syncAlarms();
  });

  browser.runtime.onStartup.addListener(() => {
    syncAlarms();
  });

  // Clicking a reminder notification just dismisses it.
  browser.notifications.onClicked.addListener((id) => {
    browser.notifications.clear(id);
  });
});
