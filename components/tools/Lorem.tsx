import { useMemo, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  countWords,
  generateLorem,
  LOREM_UNITS,
  type LoremUnit,
} from "@/lib/lorem";

export default function Lorem() {
  const [unit, setUnit] = useState<LoremUnit>("paragraphs");
  const [count, setCount] = useState("3");
  const [classicOpening, setClassicOpening] = useState(true);
  const [html, setHtml] = useState(false);
  // Bumped by Regenerate; the generator is seeded from it, so everything
  // else stays stable while you fiddle with the other controls.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [copied, setCopied] = useState(false);

  const n = Number(count) || 1;

  const text = useMemo(
    () => generateLorem({ unit, count: n, classicOpening, html, seed }),
    [unit, n, classicOpening, html, seed],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 gap-2">
        <Input
          value={count}
          inputMode="numeric"
          className="w-16 text-center"
          aria-label="How many"
          onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
        />
        <Select value={unit} onValueChange={(v) => setUnit(v as LoremUnit)}>
          <SelectTrigger className="flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOREM_UNITS.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="secondary"
          className="shrink-0"
          onClick={() => setSeed(Math.floor(Math.random() * 1e9))}
          aria-label="Regenerate"
          title="Regenerate"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4">
        <Label className="flex items-center gap-2 text-xs font-normal">
          <Switch checked={classicOpening} onCheckedChange={setClassicOpening} />
          Start with “Lorem ipsum…”
        </Label>
        <Label className="flex items-center gap-2 text-xs font-normal">
          <Switch checked={html} onCheckedChange={setHtml} />
          HTML tags
        </Label>
      </div>

      <div className="relative min-h-0 flex-1">
        <Textarea
          value={text}
          readOnly
          // field-sizing-fixed for the same reason as the JSON tool: the
          // shadcn default grows the box to fit its value, and 100
          // paragraphs would push everything else out of the drawer.
          className="field-sizing-fixed bg-muted/50 h-full resize-none overflow-auto pr-10 text-xs leading-relaxed"
        />
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-1.5 right-1.5 size-7"
          onClick={() => {
            navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          aria-label="Copy text"
        >
          {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
        </Button>
      </div>

      <p className="text-muted-foreground shrink-0 text-xs">
        {countWords(text)} words · {text.length} characters
      </p>
    </div>
  );
}
