import { ALARM_NAME, timerStore } from "@/lib/timer";
import { ALARM_PREFIX, remindersStore, syncAlarms } from "@/lib/reminders";
import { notify, setBadge } from "@/lib/notify";
import { forgetRemovedChat } from "@/lib/settings";
import { ALARM_NAME as TIMER_ALARM, timerStore as timer } from "@/lib/timer";

export default defineBackground(() => {
  /**
   * MV3 service workers are torn down between events, so nothing here may
   * rely on module state surviving. Every handler re-reads from storage.
   */

  // Clicking the toolbar icon opens a new tab, which is Alcove. The
  // badge on that icon still carries the reminder count.
  // MV2 calls this browserAction, and reading only `action` meant no
  // listener was registered at all on Firefox - a toolbar click did
  // nothing. lib/notify.ts already handles the same split.
  const toolbar = browser.action ?? browser.browserAction;
  toolbar?.onClicked.addListener(() => {
    browser.tabs.create({}).catch(() => {});
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

  /**
   * Re-arms everything Chrome drops on an update or a restart.
   *
   * Alarms do not survive either, and a countdown is the case that shows:
   * its end time is still in storage, so the panel keeps counting down to
   * zero while no alarm exists to fire the notification.
   */
  const rearm = async () => {
    await syncAlarms();
    const state = await timer.getValue();
    if (state?.endsAt && state.endsAt > Date.now()) {
      await browser.alarms.create(TIMER_ALARM, { when: state.endsAt });
    }
  };

  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    try {
      // A short guided pass rather than the full settings panel. The panel
      // is every option at once, which is the wrong first thing to hand
      // someone who has not seen the product yet.
      if (reason === "install") {
        await browser.tabs.create({ url: browser.runtime.getURL("/welcome.html") });
      }

      await rearm();
      await forgetRemovedChat();
    } catch (err) {
      // An update handler that throws takes the rest of the update with
      // it, and nothing here is worth losing a re-armed reminder over.
      console.error("[alcove] update tasks failed:", err);
    }
  });

  browser.runtime.onStartup.addListener(() => {
    rearm().catch((err) => console.error("[alcove] alarm sync failed:", err));
  });

  // Clicking a reminder notification just dismisses it.
  browser.notifications.onClicked.addListener((id) => {
    browser.notifications.clear(id);
  });
});
