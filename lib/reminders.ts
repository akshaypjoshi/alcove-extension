import { storage } from "#imports";
import { useEffect, useState } from "react";

/**
 * Reminders are one `chrome.alarms` alarm each, named `reminder:<id>`.
 * Alarms are the only timer that survives the MV3 service worker being
 * torn down - a setTimeout in the background dies within seconds of the
 * worker idling out, and one in a page dies when the tab closes.
 */

export interface Reminder {
  id: string;
  text: string;
  /** Epoch ms. */
  dueAt: number;
  createdAt: number;
  /** Set by the background script once the alarm has fired. */
  firedAt?: number;
  /**
   * Why the notification didn't appear, if it didn't. A reminder with a
   * firedAt but no visible notification is the exact case that's otherwise
   * impossible to tell apart from the alarm never running.
   */
  notifyError?: string;
  /** Cleared when the user has seen it, which also clears the badge. */
  acknowledged?: boolean;
}

export const ALARM_PREFIX = "reminder:";

export const remindersStore = storage.defineItem<Reminder[]>("local:reminders", {
  fallback: [],
});

const UNITS: Record<string, number> = {
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000,
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
  d: 86_400_000, day: 86_400_000, days: 86_400_000,
};

const UNIT_PATTERN = Object.keys(UNITS).sort((a, b) => b.length - a.length).join("|");

/** "in 5m", "5 minutes", "1h 30m" - anchored to the end of the string. */
const RELATIVE = new RegExp(
  `(?:^|\\s)(?:in\\s+)?(\\d+)\\s*(${UNIT_PATTERN})(?:\\s*(\\d+)\\s*(${UNIT_PATTERN}))?\\s*$`,
  "i",
);

/**
 * "at 6pm", "at 18:30", "6:30 pm". Requires an `at`, a colon, or a
 * meridiem - without one of those, "call mom 5" would read the 5 as a
 * time and silently schedule something for five o'clock.
 */
const ABSOLUTE = /(?:^|\s)(?:(at)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;

export interface ParsedReminder {
  text: string;
  dueAt: number;
}

export function parseReminder(input: string, now = new Date()): ParsedReminder | null {
  let working = input.trim();
  if (!working) return null;

  // A leading "remind me to" is noise once the reminder exists.
  working = working.replace(/^remind\s+me\s+(to|about|that)?\s*/i, "").trim();

  let tomorrow = false;
  const dayMatch = /(?:^|\s)(tomorrow|tmr|tmrw)(?=\s|$)/i.exec(working);
  if (dayMatch) {
    tomorrow = true;
    working = (working.slice(0, dayMatch.index) + " " + working.slice(dayMatch.index + dayMatch[0].length)).trim();
  }

  const relative = RELATIVE.exec(working);
  if (relative && !tomorrow) {
    const ms =
      Number(relative[1]) * UNITS[relative[2].toLowerCase()] +
      (relative[3] ? Number(relative[3]) * UNITS[relative[4].toLowerCase()] : 0);
    const text = working.slice(0, relative.index).trim();
    return { text, dueAt: now.getTime() + ms };
  }

  const absolute = ABSOLUTE.exec(working);
  if (absolute && (absolute[1] || absolute[3] || absolute[4])) {
    let hour = Number(absolute[2]);
    const minute = absolute[3] ? Number(absolute[3]) : 0;
    const meridiem = absolute[4]?.toLowerCase();

    if (hour > 23 || minute > 59) return null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;

    const due = new Date(now);
    due.setHours(hour, minute, 0, 0);
    // A time that has already passed today means tomorrow - nobody sets a
    // reminder for the past.
    if (tomorrow || due.getTime() <= now.getTime()) {
      due.setDate(due.getDate() + 1);
    }

    return { text: working.slice(0, absolute.index).trim(), dueAt: due.getTime() };
  }

  return null;
}

/**
 * Chrome won't fire an alarm sooner than ~30s out, so anything nearer is
 * clamped rather than stored as requested - otherwise the list would show
 * a time that has already passed while the notification is still pending.
 */
const MIN_LEAD_MS = 30_000;

export async function addReminder(text: string, requestedAt: number): Promise<Reminder> {
  const dueAt = Math.max(requestedAt, Date.now() + MIN_LEAD_MS);

  const reminder: Reminder = {
    id: crypto.randomUUID(),
    text: text || "Reminder",
    dueAt,
    createdAt: Date.now(),
  };

  const current = (await remindersStore.getValue()) ?? [];
  await remindersStore.setValue([...current, reminder]);
  await browser.alarms.create(ALARM_PREFIX + reminder.id, { when: dueAt });
  return reminder;
}

export async function removeReminder(id: string) {
  const current = (await remindersStore.getValue()) ?? [];
  await remindersStore.setValue(current.filter((r) => r.id !== id));
  await browser.alarms.clear(ALARM_PREFIX + id);
}

export async function clearFired() {
  const current = (await remindersStore.getValue()) ?? [];
  await remindersStore.setValue(current.filter((r) => !r.firedAt));
}

/** Marks one fired reminder as seen. */
export async function acknowledgeReminder(id: string) {
  const current = (await remindersStore.getValue()) ?? [];
  await remindersStore.setValue(
    current.map((r) => (r.id === id ? { ...r, acknowledged: true } : r)),
  );
}

/** Marks fired reminders as seen, which is what drops the toolbar badge. */
export async function acknowledgeFired() {
  const current = (await remindersStore.getValue()) ?? [];
  if (!current.some((r) => r.firedAt && !r.acknowledged)) return;
  await remindersStore.setValue(
    current.map((r) => (r.firedAt ? { ...r, acknowledged: true } : r)),
  );
}

/**
 * Rebuild every alarm from storage. Chrome drops an extension's alarms
 * when it's reloaded or updated, so without this a reminder set before an
 * update would sit in the list and never fire.
 */
export async function syncAlarms() {
  const reminders = (await remindersStore.getValue()) ?? [];
  const existing = await browser.alarms.getAll();
  const names = new Set(existing.map((a) => a.name));

  for (const reminder of reminders) {
    if (reminder.firedAt) continue;
    const name = ALARM_PREFIX + reminder.id;
    if (names.has(name)) continue;
    // Anything already overdue fires on the next tick rather than never.
    await browser.alarms.create(name, { when: Math.max(reminder.dueAt, Date.now() + 1000) });
  }
}

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    remindersStore.getValue().then((v) => setReminders(v ?? []));
    return remindersStore.watch((v) => setReminders(v ?? []));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  return { reminders, now };
}

/** "in 4 min", "in 2 h 10 min", "now". */
export function formatRelative(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "in under a minute";
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 24) return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function formatDue(dueAt: number): string {
  const due = new Date(dueAt);
  const today = new Date();
  const sameDay = due.toDateString() === today.toDateString();
  const time = due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${due.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}
