import { useEffect } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acknowledgeReminder, useReminders } from "@/lib/reminders";
import { setBadge } from "@/lib/notify";

/**
 * An in-page alert for reminders that have fired.
 *
 * System notifications are not a channel the extension controls: macOS can
 * refuse to display them with no error, Focus modes swallow them, and
 * Chrome reports success either way. This is the fallback that always
 * works — as long as a new tab is open — and it costs nothing when the
 * real notification did show, because seeing either one dismisses both.
 */
export default function ReminderAlert() {
  const { reminders } = useReminders();
  const unseen = reminders.filter((r) => r.firedAt && !r.acknowledged);

  // Keep the toolbar badge in step with what's still unread here.
  useEffect(() => {
    setBadge(unseen.length);
  }, [unseen.length]);

  if (!unseen.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex flex-col items-center gap-2">
      {unseen.slice(-3).map((reminder) => (
        <div
          key={reminder.id}
          className="glass-strong rise pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 shadow-2xl"
        >
          <BellRing className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <div className="text-sm leading-snug font-medium break-words">
              {reminder.text}
            </div>
            <div className="text-muted-foreground text-xs">
              {new Date(reminder.firedAt!).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
              {reminder.notifyError && " · system notification was blocked"}
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="-mt-0.5 size-7 shrink-0"
            onClick={() => acknowledgeReminder(reminder.id)}
            aria-label="Dismiss reminder"
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
