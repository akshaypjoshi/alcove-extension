import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * `btoa` only handles Latin-1, so anything with an emoji or an accent
 * throws InvalidCharacterError. Round-trip through UTF-8 bytes instead.
 */
function base64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64Decode(input: string): string {
  const binary = atob(input.trim());
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toTitleCase(s: string) {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function toKebab(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function toCamel(s: string) {
  return toKebab(s).replace(/-(\w)/g, (_, c) => c.toUpperCase());
}

type Mode =
  | "base64-encode"
  | "base64-decode"
  | "url-encode"
  | "url-decode"
  | "case-upper"
  | "case-lower"
  | "case-title"
  | "case-kebab"
  | "case-snake"
  | "case-camel"
  | "lines-sort"
  | "lines-dedupe"
  | "lines-reverse"
  | "sha256"
  | "uuid";

const MODES: { group: string; items: { id: Mode; label: string }[] }[] = [
  {
    group: "Encode",
    items: [
      { id: "base64-encode", label: "Base64 encode" },
      { id: "base64-decode", label: "Base64 decode" },
      { id: "url-encode", label: "URL encode" },
      { id: "url-decode", label: "URL decode" },
      { id: "sha256", label: "SHA-256 hash" },
    ],
  },
  {
    group: "Case",
    items: [
      { id: "case-upper", label: "UPPERCASE" },
      { id: "case-lower", label: "lowercase" },
      { id: "case-title", label: "Title Case" },
      { id: "case-kebab", label: "kebab-case" },
      { id: "case-snake", label: "snake_case" },
      { id: "case-camel", label: "camelCase" },
    ],
  },
  {
    group: "Lines",
    items: [
      { id: "lines-sort", label: "Sort lines" },
      { id: "lines-dedupe", label: "Remove duplicates" },
      { id: "lines-reverse", label: "Reverse lines" },
      { id: "uuid", label: "Generate UUIDs" },
    ],
  },
];

function transform(mode: Mode, input: string): string {
  const lines = () => input.split("\n");
  switch (mode) {
    case "base64-encode": return base64Encode(input);
    case "base64-decode": return base64Decode(input);
    case "url-encode": return encodeURIComponent(input);
    case "url-decode": return decodeURIComponent(input);
    case "case-upper": return input.toUpperCase();
    case "case-lower": return input.toLowerCase();
    case "case-title": return toTitleCase(input);
    case "case-kebab": return toKebab(input);
    case "case-snake": return toKebab(input).replace(/-/g, "_");
    case "case-camel": return toCamel(input);
    case "lines-sort": return lines().sort((a, b) => a.localeCompare(b)).join("\n");
    case "lines-dedupe": return [...new Set(lines())].join("\n");
    case "lines-reverse": return lines().reverse().join("\n");
    case "uuid": return Array.from({ length: 5 }, () => crypto.randomUUID()).join("\n");
    default: return input;
  }
}

export default function TextTools() {
  const [mode, setMode] = useState<Mode>("base64-encode");
  const [input, setInput] = useState("");
  const [hash, setHash] = useState("");
  const [copied, setCopied] = useState(false);

  // SHA-256 is the one async transform; keep it out of the pure path.
  useEffect(() => {
    if (mode !== "sha256") return;
    let alive = true;
    crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(input))
      .then((buf) => {
        if (!alive) return;
        setHash(
          [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""),
        );
      });
    return () => {
      alive = false;
    };
  }, [mode, input]);

  const output = useMemo(() => {
    if (mode === "sha256") return hash;
    if (mode !== "uuid" && !input.trim()) return "";
    try {
      return transform(mode, input);
    } catch (err) {
      return `⚠︎ ${err instanceof Error ? err.message : "Couldn't transform that."}`;
    }
  }, [mode, input, hash]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODES.map((group) => (
            <div key={group.group}>
              <div className="text-muted-foreground px-2 py-1 text-xs font-medium">
                {group.group}
              </div>
              {group.items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>

      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
        placeholder={mode === "uuid" ? "Not needed — just hit generate" : "Paste input…"}
        className="field-sizing-fixed h-32 shrink-0 resize-y overflow-auto font-mono text-xs"
      />

      {mode === "uuid" && (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setInput((v) => v + " ")}>
          <Wand2 className="size-3.5" /> Generate 5 more
        </Button>
      )}

      <div className="relative min-h-32 flex-1">
        <Textarea
          value={output}
          readOnly
          placeholder="Output"
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
    </div>
  );
}
