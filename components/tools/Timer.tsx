import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  cancelTimer,
  formatDuration,
  pauseTimer,
  resumeTimer,
  startTimer,
  useTimer,
} from "@/lib/timer";

const PRESETS: [string, number][] = [
  ["5 min", 5],
  ["15 min", 15],
  ["25 min", 25],
  ["45 min", 45],
];

function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now() - elapsed;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 50);
    return () => clearInterval(id);
    // `elapsed` is intentionally omitted: including it restarts the
    // interval on every tick and the stopwatch drifts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const cs = Math.floor((elapsed % 1000) / 10);

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <span className="font-mono text-lg tabular-nums">
        {formatDuration(elapsed)}
        <span className="text-muted-foreground text-sm">
          .{String(cs).padStart(2, "0")}
        </span>
      </span>
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => {
            setRunning(false);
            setElapsed(0);
          }}
        >
          <RotateCcw className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function Timer() {
  const { state, remainingMs } = useTimer();
  const [minutes, setMinutes] = useState("10");

  const progress = state ? 1 - remainingMs / state.durationMs : 0;

  return (
    <div className="space-y-3">
      {state ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="text-center">
            <div className="font-mono text-4xl tabular-nums">
              {formatDuration(remainingMs)}
            </div>
            <div className="text-muted-foreground mt-0.5 text-xs">
              {remainingMs === 0 ? "Done" : state.paused ? "Paused" : state.label}
            </div>
          </div>
          <div className="bg-muted h-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-[width] duration-300"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => (state.paused ? resumeTimer() : pauseTimer())}
              disabled={remainingMs === 0}
            >
              {state.paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {state.paused ? "Resume" : "Pause"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => cancelTimer()}>
              <Square className="size-4" /> Stop
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map(([label, mins]) => (
              <Button
                key={label}
                variant="secondary"
                size="sm"
                onClick={() => startTimer(mins * 60_000, `${mins} minute timer`)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={minutes}
              inputMode="numeric"
              className="flex-1"
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="Minutes"
            />
            <Button
              onClick={() => {
                const mins = Number(minutes);
                if (mins > 0) startTimer(mins * 60_000, `${mins} minute timer`);
              }}
            >
              Start
            </Button>
          </div>
        </>
      )}

      <Stopwatch />
      <p className="text-muted-foreground text-xs">
        The timer keeps running with this tab closed and fires a system
        notification when it's up.
      </p>
    </div>
  );
}
