import { storage } from "#imports";
import { useEffect, useState } from "react";

/**
 * The timer lives in storage rather than component state, for two reasons:
 * a new tab is closed the moment you navigate away, and the notification
 * has to come from the background script (`chrome.alarms` survives the
 * service worker being torn down; a setTimeout does not).
 */

export interface TimerState {
  label: string;
  /** Epoch ms when it fires. */
  endsAt: number;
  /** Original duration, for the progress ring. */
  durationMs: number;
  paused: boolean;
  /** Remaining at the moment of pausing. */
  remainingMs: number;
}

/** Unchanged by the rename: it addresses an alarm that may already be scheduled. */
export const ALARM_NAME = "tabby-timer";

export const timerStore = storage.defineItem<TimerState | null>("local:timer", {
  fallback: null,
});

export function useTimer() {
  const [state, setState] = useState<TimerState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    timerStore.getValue().then(setState);
    return timerStore.watch(setState);
  }, []);

  useEffect(() => {
    if (!state || state.paused) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state]);

  const remainingMs = state
    ? state.paused
      ? state.remainingMs
      : Math.max(0, state.endsAt - now)
    : 0;

  return { state, remainingMs };
}

export async function startTimer(durationMs: number, label: string) {
  const state: TimerState = {
    label,
    endsAt: Date.now() + durationMs,
    durationMs,
    paused: false,
    remainingMs: durationMs,
  };
  await timerStore.setValue(state);
  await browser.alarms.create(ALARM_NAME, { when: state.endsAt });
}

export async function pauseTimer() {
  const state = await timerStore.getValue();
  if (!state || state.paused) return;
  await timerStore.setValue({
    ...state,
    paused: true,
    remainingMs: Math.max(0, state.endsAt - Date.now()),
  });
  await browser.alarms.clear(ALARM_NAME);
}

export async function resumeTimer() {
  const state = await timerStore.getValue();
  if (!state || !state.paused) return;
  const endsAt = Date.now() + state.remainingMs;
  await timerStore.setValue({ ...state, paused: false, endsAt });
  await browser.alarms.create(ALARM_NAME, { when: endsAt });
}

export async function cancelTimer() {
  await timerStore.setValue(null);
  await browser.alarms.clear(ALARM_NAME);
}

export function formatDuration(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
