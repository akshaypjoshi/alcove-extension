import { useMemo, useState } from "react";
import { Copy, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evaluate, formatResult } from "@/lib/calc";

const KEYS = [
  "7", "8", "9", "/",
  "4", "5", "6", "*",
  "1", "2", "3", "-",
  "0", ".", "(", ")",
];

interface Entry {
  expression: string;
  result: string;
}

export default function Calculator() {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);

  // Evaluate as you type; an in-progress expression is an expected state,
  // so a parse failure is silence rather than an error message.
  const preview = useMemo(() => {
    if (!input.trim()) return null;
    try {
      return formatResult(evaluate(input));
    } catch {
      return null;
    }
  }, [input]);

  const commit = () => {
    if (!input.trim()) return;
    try {
      const result = formatResult(evaluate(input));
      setHistory((h) => [{ expression: input, result }, ...h].slice(0, 20));
      setInput(result.replace(/,/g, ""));
    } catch {
      /* leave the expression in place so it can be fixed */
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          value={input}
          autoFocus
          spellCheck={false}
          placeholder="12 * (3 + 4) / sqrt(2)"
          className="pr-20 font-mono"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit()}
        />
        <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-sm">
          {preview}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((k) => (
          <Button
            key={k}
            variant="secondary"
            className="font-mono"
            onClick={() => setInput((v) => v + k)}
          >
            {k}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => setInput((v) => v.slice(0, -1))}>
          <Delete className="size-4" />
        </Button>
        <Button variant="secondary" onClick={() => setInput("")}>
          C
        </Button>
        <Button className="col-span-2" onClick={commit}>
          =
        </Button>
      </div>

      {history.length > 0 && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
          {history.map((entry, i) => (
            <li key={i} className="group flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-accent/60">
              <button
                className="text-muted-foreground min-w-0 flex-1 truncate text-left font-mono text-xs"
                onClick={() => setInput(entry.expression)}
                title="Restore this expression"
              >
                {entry.expression}
              </button>
              <span className="font-mono">{entry.result}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 opacity-0 group-hover:opacity-100"
                onClick={() => navigator.clipboard.writeText(entry.result.replace(/,/g, ""))}
                aria-label="Copy result"
              >
                <Copy className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        Functions: sin, cos, tan, sqrt, ln, log, abs, round · constants: pi, e
      </p>
    </div>
  );
}
