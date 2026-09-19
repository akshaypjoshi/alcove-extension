import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Circle,
  Crop,
  Download,
  FlipHorizontal,
  FlipVertical,
  ImagePlus,
  MousePointer2,
  Pen,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Canvas, { type DrawStyle } from "@/components/editor/Canvas";
import {
  FORMATS,
  FORMAT_LABEL,
  decode,
  download,
  formatBytes,
  renameFor,
  supportsQuality,
  takeStaged,
  type Format,
} from "@/lib/images";
import {
  GRADE_PRESETS,
  INITIAL_STATE,
  NEUTRAL_GRADE,
  outputSize,
  render,
  type EditState,
  type Grade,
  type TextLayer,
  type Tool,
} from "@/lib/editor";
import { cn } from "@/lib/utils";

const TOOLS: { id: Tool; label: string; icon: typeof Pen }[] = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "pen", label: "Pen", icon: Pen },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "text", label: "Text", icon: Type },
  { id: "crop", label: "Crop", icon: Crop },
];

const SWATCHES = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ffffff", "#111827"];

export default function Editor() {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [name, setName] = useState("image.png");
  const [state, setState] = useState<EditState>(INITIAL_STATE);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [style, setStyle] = useState<DrawStyle>({ color: "#ef4444", width: 6, fontSize: 48 });
  const [format, setFormat] = useState<Format>("image/png");
  const [quality, setQuality] = useState(0.92);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Undo holds whole states, which is affordable only because a state is
  // plain JSON. Snapshotting pixels instead would be hundreds of megabytes
  // on a large photo.
  const past = useRef<EditState[]>([]);
  const future = useRef<EditState[]>([]);
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  const commit = useCallback((next: EditState) => {
    setState((current) => {
      past.current = [...past.current.slice(-49), current];
      future.current = [];
      setDepth({ past: past.current.length, future: 0 });
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      const previous = past.current.pop();
      if (!previous) return current;
      future.current = [...future.current, current];
      setDepth({ past: past.current.length, future: future.current.length });
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      const next = future.current.pop();
      if (!next) return current;
      past.current = [...past.current, current];
      setDepth({ past: past.current.length, future: future.current.length });
      return next;
    });
  }, []);

  const load = useCallback(async (blob: Blob, label: string) => {
    try {
      const file = blob instanceof File ? blob : new File([blob], label, { type: blob.type });
      const decoded = await decode(file);
      setBitmap((old) => {
        old?.close();
        return decoded;
      });
      setName(label);
      setState(INITIAL_STATE);
      past.current = [];
      future.current = [];
      setDepth({ past: 0, future: 0 });
      setSelectedId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image could not be opened.");
    }
  }, []);

  // Opened from the Images tool: the blob came through IndexedDB and the
  // id rode in the URL, because two documents cannot share a File.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("from");
    if (!id) return;
    takeStaged(id).then((staged) => {
      if (staged) load(staged.blob, staged.name);
    });
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        commit({ ...state, layers: state.layers.filter((l) => l.id !== selectedId) });
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, commit, state, selectedId]);

  const selected = state.layers.find((l) => l.id === selectedId) ?? null;

  const patchSelected = (patch: Record<string, unknown>) =>
    selected &&
    commit({
      ...state,
      layers: state.layers.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)),
    });

  const setGrade = (patch: Partial<Grade>) =>
    setState((current) => ({ ...current, grade: { ...current.grade, ...patch } }));

  const save = async () => {
    if (!bitmap) return;
    setExporting(true);
    setError(null);
    try {
      // The very same render call the preview uses, at scale 1. There is no
      // separate export path that could drift from what is on screen.
      const out = outputSize(bitmap, state);
      const canvas = new OffscreenCanvas(out.width, out.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser would not give us a canvas.");
      render(ctx, bitmap, state, 1);
      const blob = await canvas.convertToBlob({
        type: format,
        quality: supportsQuality(format) ? quality : undefined,
      });
      download(blob, renameFor(name, format));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  };

  const out = bitmap ? outputSize(bitmap, state) : null;

  return (
    <div className="bg-background text-foreground flex h-screen flex-col">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) load(file, file.name);
        }}
      />

      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">Image editor</span>
        {out && (
          <span className="text-muted-foreground text-xs">
            {name} · {out.width}x{out.height}
          </span>
        )}

        <div className="flex-1" />

        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="size-3.5" /> Open
        </Button>
        <Button size="icon" variant="ghost" className="size-8" disabled={!depth.past} onClick={undo} aria-label="Undo">
          <Undo2 className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8" disabled={!depth.future} onClick={redo} aria-label="Redo">
          <Redo2 className="size-4" />
        </Button>

        <Select value={format} onValueChange={(v) => setFormat(v as Format)}>
          <SelectTrigger size="sm" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMATS.map((type) => (
              <SelectItem key={type} value={type}>
                {FORMAT_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" disabled={!bitmap || exporting} onClick={save}>
          <Download className="size-3.5" /> {exporting ? "Saving…" : "Save"}
        </Button>
      </header>

      {error && (
        <p className="text-destructive shrink-0 border-b px-3 py-2 text-xs">{error}</p>
      )}

      {!bitmap ? (
        <button
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) load(file, file.name);
          }}
          className="hover:bg-accent/40 m-6 flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm transition"
        >
          <ImagePlus className="text-muted-foreground size-6" />
          Drop an image here, or choose one
          <span className="text-muted-foreground text-xs">
            It never leaves this machine
          </span>
        </button>
      ) : (
        <div className="flex min-h-0 flex-1">
          <nav className="flex shrink-0 flex-col gap-1 border-r p-2">
            {TOOLS.map((entry) => (
              <Button
                key={entry.id}
                size="icon"
                variant={tool === entry.id ? "secondary" : "ghost"}
                className="size-9"
                onClick={() => setTool(entry.id)}
                aria-label={entry.label}
                aria-pressed={tool === entry.id}
                title={entry.label}
              >
                <entry.icon className="size-4" />
              </Button>
            ))}
          </nav>

          <Canvas
            bitmap={bitmap}
            state={state}
            tool={tool}
            style={style}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onPreview={setState}
            onCommit={commit}
          />

          <aside className="w-64 shrink-0 space-y-4 overflow-y-auto border-l p-3">
            <Section title="Image">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-8" onClick={() => commit({ ...state, rotate: ((state.rotate + 90) % 360) as EditState["rotate"] })}>
                  <RotateCw className="size-3.5" /> Rotate
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => commit({ ...state, flipH: !state.flipH })} aria-pressed={state.flipH}>
                  <FlipHorizontal className="size-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => commit({ ...state, flipV: !state.flipV })} aria-pressed={state.flipV}>
                  <FlipVertical className="size-3.5" />
                </Button>
                {state.crop && (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => commit({ ...state, crop: null })}>
                    Reset crop
                  </Button>
                )}
              </div>
            </Section>

            <Section title="Colour">
              <div className="flex flex-wrap gap-1">
                {GRADE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => commit({ ...state, grade: preset.grade })}
                    className="hover:bg-accent rounded-full border px-2 py-0.5 text-xs"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <GradeSlider label="Brightness" value={state.grade.brightness} min={20} max={200} onChange={(brightness) => setGrade({ brightness })} onDone={() => commit(state)} />
              <GradeSlider label="Contrast" value={state.grade.contrast} min={20} max={200} onChange={(contrast) => setGrade({ contrast })} onDone={() => commit(state)} />
              <GradeSlider label="Saturation" value={state.grade.saturate} min={0} max={250} onChange={(saturate) => setGrade({ saturate })} onDone={() => commit(state)} />
              <GradeSlider label="Warmth" value={state.grade.warmth} min={-100} max={100} onChange={(warmth) => setGrade({ warmth })} onDone={() => commit(state)} />
              <Button size="sm" variant="ghost" className="h-7 w-full" onClick={() => commit({ ...state, grade: NEUTRAL_GRADE })}>
                Reset colour
              </Button>
            </Section>

            <Section title={selected ? "Selected" : "Drawing"}>
              <div className="flex flex-wrap gap-1">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    onClick={() =>
                      selected ? patchSelected({ color }) : setStyle((s) => ({ ...s, color }))
                    }
                    aria-label={color}
                    style={{ background: color }}
                    className={cn(
                      "size-6 rounded-full border",
                      (selected && "color" in selected ? selected.color : style.color) === color &&
                        "ring-primary ring-2 ring-offset-1",
                    )}
                  />
                ))}
              </div>

              {selected?.kind === "text" ? (
                <>
                  <Input
                    value={selected.text}
                    onChange={(e) => patchSelected({ text: e.target.value })}
                    placeholder="Your label"
                    className="h-8"
                  />
                  <GradeSlider
                    label="Size"
                    value={selected.size}
                    min={10}
                    max={280}
                    onChange={(size) => patchSelected({ size })}
                    onDone={() => {}}
                  />
                  <label className="flex items-center justify-between text-xs">
                    Plate behind text
                    <input
                      type="checkbox"
                      checked={(selected as TextLayer).plate}
                      onChange={(e) => patchSelected({ plate: e.target.checked })}
                    />
                  </label>
                </>
              ) : (
                <GradeSlider
                  label={selected ? "Thickness" : "Thickness"}
                  value={selected && "width" in selected ? selected.width : style.width}
                  min={1}
                  max={60}
                  onChange={(width) =>
                    selected ? patchSelected({ width }) : setStyle((s) => ({ ...s, width }))
                  }
                  onDone={() => {}}
                />
              )}

              {selected && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-full"
                  onClick={() => {
                    commit({ ...state, layers: state.layers.filter((l) => l.id !== selected.id) });
                    setSelectedId(null);
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              )}
            </Section>

            {supportsQuality(format) && (
              <Section title="Export">
                <GradeSlider
                  label={`Quality ${Math.round(quality * 100)}`}
                  value={quality * 100}
                  min={5}
                  max={100}
                  onChange={(v) => setQuality(v / 100)}
                  onDone={() => {}}
                />
              </Section>
            )}

            <p className="text-muted-foreground text-xs">
              {state.layers.length} object{state.layers.length === 1 ? "" : "s"}
              {out ? ` · exports at ${out.width}x${out.height}` : ""}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground text-xs tracking-wide uppercase">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Slider plus label. `onChange` fires continuously for a live preview and
 * `onDone` once on release, so dragging a slider leaves one undo step
 * rather than sixty.
 */
function GradeSlider({
  label,
  value,
  min,
  max,
  onChange,
  onDone,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onDone: () => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground flex justify-between text-xs">
        {label}
        <span className="tabular-nums">{Math.round(value)}</span>
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={onDone}
      />
    </label>
  );
}

export function formatSize(bytes: number) {
  return formatBytes(bytes);
}
