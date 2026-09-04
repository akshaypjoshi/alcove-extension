import { useEffect, useRef, useState } from "react";
import { storage } from "#imports";
import { Textarea } from "@/components/ui/textarea";

const notesStore = storage.defineItem<string>("local:scratchpad", { fallback: "" });

export default function Notes() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(true);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    notesStore.getValue().then((v) => setText(v ?? ""));
  }, []);

  // Debounced write: a keystroke-per-write hammers the storage quota and
  // shows up as jank once the note is a few thousand characters.
  const onChange = (value: string) => {
    setText(value);
    setSaved(false);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      notesStore.setValue(value).then(() => setSaved(true));
    }, 400);
  };

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Anything you need to not forget…"
        className="field-sizing-fixed min-h-56 flex-1 resize-none overflow-auto font-[inherit] text-sm leading-relaxed"
      />
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>
          {words} {words === 1 ? "word" : "words"} · {text.length} chars
        </span>
        <span>{saved ? "Saved" : "Saving…"}</span>
      </div>
    </div>
  );
}
