import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INDENTS: Record<string, string | number> = {
  "2": 2,
  "4": 4,
  tab: "\t",
  minify: 0,
};

/** Recursively sort object keys; arrays keep their order, which is data. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

function bytes(text: string) {
  const n = new TextEncoder().encode(text).length;
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

export default function JsonTool() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState("2");
  const [sorted, setSorted] = useState(false);
  const [copied, setCopied] = useState(false);

  const { output, error } = useMemo(() => {
    if (!input.trim()) return { output: "", error: null as string | null };
    try {
      const parsed = JSON.parse(input);
      const value = sorted ? sortKeys(parsed) : parsed;
      const space = INDENTS[indent];
      return {
        output: JSON.stringify(value, null, space === 0 ? undefined : space),
        error: null,
      };
    } catch (err) {
      // V8's message already carries the position and, on newer versions,
      // the line and column — more useful than anything we'd re-derive.
      return { output: "", error: err instanceof Error ? err.message : "Invalid JSON" };
    }
  }, [input, indent, sorted]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Select value={indent} onValueChange={setIndent}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 spaces</SelectItem>
            <SelectItem value="4">4 spaces</SelectItem>
            <SelectItem value="tab">Tabs</SelectItem>
            <SelectItem value="minify">Minify</SelectItem>
          </SelectContent>
        </Select>

        <Label className="ml-auto flex items-center gap-2 text-xs">
          Sort keys
          <Switch checked={sorted} onCheckedChange={setSorted} />
        </Label>
      </div>

      {/*
        field-sizing-fixed is doing real work here. The shadcn Textarea sets
        field-sizing-content, so the box grows to fit its value — paste a
        few hundred kB of JSON and it becomes thousands of pixels tall,
        pushing the output pane and the stats line out of the drawer
        entirely instead of scrolling. Fixed sizing makes it scroll inside
        its own box, which is the only thing that works at this scale.
      */}
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder='{"paste":"anything","here":[1,2,3]}'
        className="field-sizing-fixed h-40 min-h-24 shrink-0 resize-y overflow-auto font-mono text-xs"
      />

      {error ? (
        <p className="text-destructive shrink-0 rounded-md border border-current/25 px-2.5 py-2 font-mono text-[11px] leading-relaxed">
          {error}
        </p>
      ) : (
        <div className="relative min-h-0 flex-1">
          <Textarea
            value={output}
            readOnly
            placeholder="Formatted output"
            className="field-sizing-fixed bg-muted/50 h-full resize-none overflow-auto pr-10 font-mono text-xs"
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-1.5 right-1.5 size-7"
            disabled={!output}
            onClick={() => {
              navigator.clipboard.writeText(output);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            aria-label="Copy output"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </Button>
        </div>
      )}

      {input.trim() && !error && (
        <p className="text-muted-foreground shrink-0 text-xs">
          {bytes(input)} in · {bytes(output)} out
        </p>
      )}
    </div>
  );
}
