import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, BellRing, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify, permissionLevel, setBadge } from "@/lib/notify";
import {
  acknowledgeFired,
  addReminder,
  clearFired,
  formatDue,
  formatRelative,
  parseReminder,
  removeReminder,
  useReminders,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

/** Only used to tailor the "where to unblock this" instructions. */
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

const PRESETS: [string, number][] = [
  ["5m", 5],
  ["15m", 15],
  ["30m", 30],
  ["1h", 60],
];

export default function Reminders() {
  const { reminders, now } = useReminders();
  const [draft, setDraft] = useState("");
  const [permission, setPermission] = useState<"granted" | "denied" | "unknown">("unknown");
  const [testResult, setTestResult] = useState<string | null>(null);

  // Opening the tool counts as seeing what fired, which drops the badge.
  useEffect(() => {
    permissionLevel().then(setPermission);
    acknowledgeFired();
    setBadge(0);
  }, []);

  // Parsed live so the hint under the field shows what will actually be
  // scheduled before you commit to it.
  const parsed = useMemo(() => parseReminder(draft), [draft]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (parsed) {
      await addReminder(parsed.text, parsed.dueAt);
    } else {
      // No time in the text: default to 10 minutes rather than refusing.
      await addReminder(text, Date.now() + 10 * 60_000);
    }
    setDraft("");
  };

  const quick = (minutes: number) => {
    const text = parsed?.text || draft.trim();
    if (!text) return;
    addReminder(text, Date.now() + minutes * 60_000);
    setDraft("");
  };

  const pending = reminders.filter((r) => !r.firedAt).sort((a, b) => a.dueAt - b.dueAt);
  const fired = reminders.filter((r) => r.firedAt).sort((a, b) => b.firedAt! - a.firedAt!);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {permission === "denied" && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
          <span>
            <strong className="font-medium">Chrome is blocking notifications.</strong>{" "}
            Open <span className="font-mono">chrome://settings/content/notifications</span>{" "}
            and allow them. Reminders still appear on this page and on the
            toolbar icon.
          </span>
        </div>
      )}

      <div>
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder="Stretch in 20m"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <Button size="icon" className="shrink-0" onClick={submit} disabled={!draft.trim()}>
            <Plus className="size-4" />
          </Button>
        </div>

        <p className="text-muted-foreground mt-1.5 text-xs">
          {draft.trim() ? (
            parsed ? (
              <>
                <span className="text-foreground">{parsed.text || "Reminder"}</span> ·{" "}
                {formatDue(parsed.dueAt)} ({formatRelative(parsed.dueAt - now)})
              </>
            ) : (
              "No time found - will remind you in 10 minutes"
            )
          ) : (
            'Try "call mom in 5m", "standup at 9am", "gym tomorrow at 6am"'
          )}
        </p>
      </div>

      <div className="flex gap-1.5">
        {PRESETS.map(([label, minutes]) => (
          <Button
            key={label}
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={!draft.trim()}
            onClick={() => quick(minutes)}
          >
            {label}
          </Button>
        ))}
      </div>

      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {pending.map((reminder) => (
          <li
            key={reminder.id}
            className="group hover:bg-accent/50 flex items-start gap-2.5 rounded-lg px-2 py-1.5"
          >
            <Bell className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug break-words">{reminder.text}</div>
              <div className="text-muted-foreground text-xs">
                {formatDue(reminder.dueAt)} ·{" "}
                {/* More than a minute past due with no firedAt means the
                    alarm itself never ran - worth saying out loud, since it
                    looks identical to a notification that was suppressed. */}
                {reminder.dueAt < now - 60_000 ? (
                  <span className="text-amber-500">overdue - alarm hasn't fired</span>
                ) : (
                  formatRelative(reminder.dueAt - now)
                )}
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0 opacity-0 transition group-hover:opacity-100"
              onClick={() => removeReminder(reminder.id)}
              aria-label={`Cancel ${reminder.text}`}
            >
              <X className="size-3" />
            </Button>
          </li>
        ))}

        {fired.map((reminder) => (
          <li
            key={reminder.id}
            className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 opacity-55"
          >
            <BellRing className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug break-words">{reminder.text}</div>
              <div className="text-muted-foreground text-xs">
                Reminded at {formatDue(reminder.firedAt!)}
              </div>
              {reminder.notifyError && (
                <div className="text-xs text-amber-500">
                  Notification blocked: {reminder.notifyError}
                </div>
              )}
            </div>
          </li>
        ))}

        {reminders.length === 0 && (
          <li className="text-muted-foreground px-2 py-6 text-center text-sm">
            Nothing scheduled.
          </li>
        )}
      </ul>

      <div className="text-muted-foreground space-y-1 border-t pt-2 text-xs">
        <div className="flex items-center justify-between">
          <span className={cn(pending.length === 0 && "opacity-60")}>
            {pending.length} scheduled
          </span>
          <div className="flex gap-3">
            <button
              className="hover:text-foreground transition"
              onClick={async () => {
                const result = await notify(
                  undefined,
                  "Alcove",
                  "Notifications are working.",
                );
                setTestResult(
                  result.ok
                    ? // Chrome accepted it, so anything still missing was
                      // dropped below Chrome - which Chrome cannot report.
                      IS_MAC
                      ? "Chrome accepted it. If nothing appeared, macOS is blocking Chrome: System Settings → Notifications → Google Chrome → Allow notifications, and check Focus isn't on."
                      : "Chrome accepted it. If nothing appeared, your OS notification settings are blocking Chrome."
                    : (result.error ?? "Failed"),
                );
              }}
            >
              Test notification
            </button>
            {fired.length > 0 && (
              <button className="hover:text-foreground transition" onClick={() => clearFired()}>
                Clear past
              </button>
            )}
          </div>
        </div>
        {testResult && <p className="text-amber-500">{testResult}</p>}
        <p className="opacity-60">
          Browser notifications:{" "}
          {permission === "unknown" ? "not reported" : permission} · reminders
          also appear on this page and on the toolbar icon.
        </p>
      </div>
    </div>
  );
}
