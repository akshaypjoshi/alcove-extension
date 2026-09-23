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
  Pipette,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
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
  clipboardImages,
  decode,
  download,
  renameFor,
  supportsQuality,
  takeStaged,
  type Format,
} from "@/lib/images";
import {
  GRADE_PRESETS,
  INITIAL_STATE,
  NEUTRAL_GRADE,
  keepCorner,
  outputSize,
  render,
  sharedMeasure,
  type EditState,
  type Grade,
  type Layer,
  type Point,
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
  const [state, setStateRaw] = useState<EditState>(INITIAL_STATE);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [style, setStyle] = useState<DrawStyle>({ color: "#ef4444", width: 6, fontSize: 48 });
  const [format, setFormat] = useState<Format>("image/png");
  const [quality, setQuality] = useState(0.92);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [depth, setDepth] = useState({ past: 0, future: 0 });
  const [leaving, setLeaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * History.
   *
   * Undo holds whole states, which is affordable only because a state is
   * plain JSON; snapshotting pixels would be hundreds of megabytes on a
   * large photo.
   *
   * A drag previews on every frame, so the step that lands in history has
   * to be the state from *before* the drag began, not the one it ended on.
   * Pushing the latest state instead is what used to make undo after a
   * move quietly do nothing. `baseRef` holds that starting point while a
   * gesture is in flight.
   *
   * All of this is kept outside setState updaters on purpose: React runs
   * updaters twice in development, and a history push inside one would
   * record every step twice.
   */
  const stateRef = useRef(state);
  const baseRef = useRef<EditState | null>(null);
  const past = useRef<EditState[]>([]);
  const future = useRef<EditState[]>([]);

  const show = useCallback((next: EditState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  const syncDepth = () => setDepth({ past: past.current.length, future: future.current.length });

  const preview = useCallback(
    (next: EditState) => {
      if (!baseRef.current) baseRef.current = stateRef.current;
      show(next);
    },
    [show],
  );

  const commit = useCallback(
    (next: EditState) => {
      const base = baseRef.current ?? stateRef.current;
      baseRef.current = null;
      if (base !== next) {
        past.current = [...past.current.slice(-49), base];
        future.current = [];
      }
      show(next);
      syncDepth();
    },
    [show],
  );

  /** Close off a gesture that previewed but never formally ended. */
  const settle = useCallback(() => {
    if (baseRef.current) commit(stateRef.current);
  }, [commit]);

  /** Throw away a gesture as though it never happened. */
  const discard = useCallback(() => {
    if (!baseRef.current) return;
    show(baseRef.current);
    baseRef.current = null;
  }, [show]);

  const undo = useCallback(() => {
    settle();
    const previous = past.current.pop();
    if (!previous) return;
    future.current = [...future.current, stateRef.current];
    show(previous);
    syncDepth();
  }, [settle, show]);

  const redo = useCallback(() => {
    settle();
    const next = future.current.pop();
    if (!next) return;
    past.current = [...past.current, stateRef.current];
    show(next);
    syncDepth();
  }, [settle, show]);

  const load = useCallback(
    async (blob: Blob, label: string) => {
      try {
        const file = blob instanceof File ? blob : new File([blob], label, { type: blob.type });
        const decoded = await decode(file);
        setBitmap((old) => {
          old?.close();
          return decoded;
        });
        setName(label);
        baseRef.current = null;
        past.current = [];
        future.current = [];
        show(INITIAL_STATE);
        syncDepth();
        setSelectedId(null);
        setEditingId(null);
        setError(null);
        // Sizes that suit the picture: a 48px label is huge on a small
        // screenshot and invisible on a 6000px photo.
        const short = Math.min(decoded.width, decoded.height);
        setStyle((s) => ({
          ...s,
          fontSize: Math.min(400, Math.max(16, Math.round(short * 0.06))),
          width: Math.min(40, Math.max(2, Math.round(short * 0.006))),
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "That image could not be opened.");
      }
    },
    [show],
  );

  // Opened from the Images tool: the blob came through IndexedDB and the
  // id rode in the URL, because two documents cannot share a File.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("from");
    if (!id) return;
    takeStaged(id).then((staged) => {
      if (staged) load(staged.blob, staged.name);
    });
  }, [load]);

  // ------------------------------------------------------------ text

  const measure = sharedMeasure();
  const editingRef = useRef<string | null>(null);
  // A label created by this click, which should vanish without leaving an
  // undo step if nothing ends up being typed into it.
  const freshRef = useRef<string | null>(null);

  const createText = useCallback(
    (at: Point) => {
      const layer: TextLayer = {
        id: crypto.randomUUID(),
        kind: "text",
        x: at.x,
        y: at.y,
        text: "",
        size: style.fontSize,
        color: style.color,
        weight: 600,
        plate: true,
        rotation: 0,
      };
      preview({ ...stateRef.current, layers: [...stateRef.current.layers, layer] });
      freshRef.current = layer.id;
      editingRef.current = layer.id;
      setEditingId(layer.id);
      setSelectedId(layer.id);
      setTool("select");
    },
    [preview, style],
  );

  const editText = useCallback((id: string) => {
    freshRef.current = null;
    editingRef.current = id;
    setEditingId(id);
    setSelectedId(id);
  }, []);

  const changeText = useCallback(
    (id: string, text: string) => {
      const s = stateRef.current;
      const layer = s.layers.find((l) => l.id === id);
      if (!layer || layer.kind !== "text") return;
      preview({
        ...s,
        layers: s.layers.map((l) => (l.id === id ? keepCorner(layer, { ...layer, text }, measure) : l)),
      });
    },
    [preview, measure],
  );

  /** Idempotent: blur and a click-away can both land here for one edit. */
  const finishEditing = useCallback(() => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    setEditingId(null);

    const s = stateRef.current;
    const layer = s.layers.find((l) => l.id === id);
    const empty = !layer || layer.kind !== "text" || !layer.text.trim();

    if (empty) {
      if (freshRef.current === id) discard();
      else if (layer) commit({ ...s, layers: s.layers.filter((l) => l.id !== id) });
      setSelectedId(null);
    } else {
      settle();
    }
    freshRef.current = null;
  }, [commit, discard, settle]);

  const chooseTool = (next: Tool) => {
    finishEditing();
    setTool(next);
  };

  // Paste, but only while the drop zone is showing. Replacing a loaded
  // image on a stray Cmd+V would throw away whatever was drawn on it, and
  // there is already an Open button for changing your mind.
  useEffect(() => {
    if (bitmap) return;
    const onPaste = (event: ClipboardEvent) => {
      const [file] = clipboardImages(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void load(file, file.name);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [bitmap, load]);

  // ------------------------------------------------------- keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      // Inside a text field, Cmd+Z undoes typing, not the whole editor.
      if (typing) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape") {
        // The way out of the leaving prompt first, the way out of a
        // selection after.
        if (leaving) setLeaving(false);
        else setSelectedId(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        const s = stateRef.current;
        commit({ ...s, layers: s.layers.filter((l) => l.id !== selectedId) });
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, commit, selectedId, leaving]);

  // ---------------------------------------------------------- panel

  const selected = state.layers.find((l) => l.id === selectedId) ?? null;

  const withSelected = (edit: (layer: Layer) => Layer) => {
    const s = stateRef.current;
    const layer = s.layers.find((l) => l.id === selectedId);
    if (!layer) return null;
    return { ...s, layers: s.layers.map((l) => (l.id === layer.id ? edit(layer) : l)) };
  };

  /** A discrete change, one undo step each: a colour, the plate toggle. */
  const patchNow = (edit: (layer: Layer) => Layer) => {
    const next = withSelected(edit);
    if (next) commit(next);
  };

  /** A slider: live while dragging, one undo step when it is let go. */
  const patchLive = (edit: (layer: Layer) => Layer) => {
    const next = withSelected(edit);
    if (next) preview(next);
  };

  const setGrade = (patch: Partial<Grade>) =>
    preview({ ...stateRef.current, grade: { ...stateRef.current.grade, ...patch } });

  /** Returns whether a file actually came out, so callers can close after. */
  const save = async (): Promise<boolean> => {
    if (!bitmap) return false;
    finishEditing();
    setExporting(true);
    setError(null);
    try {
      // The very same render call the preview uses, at scale 1. There is no
      // separate export path that could drift from what is on screen.
      const current = stateRef.current;
      const out = outputSize(bitmap, current);
      const canvas = new OffscreenCanvas(out.width, out.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser would not give us a canvas.");
      render(ctx, bitmap, current, 1);
      const blob = await canvas.convertToBlob({
        type: format,
        quality: supportsQuality(format) ? quality : undefined,
      });
      download(blob, renameFor(name, format));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The export failed.");
      return false;
    } finally {
      setExporting(false);
    }
  };

  /**
   * Leaving.
   *
   * The editor is opened with `noopener`, which severs the opener link and
   * with it `window.close()`. Closing our own tab through the tabs API is
   * the one route that works from here; the fallbacks cover a plain page
   * load during development.
   */
  const close = async () => {
    try {
      const tab = await browser.tabs.getCurrent();
      if (tab?.id != null) {
        await browser.tabs.remove(tab.id);
        return;
      }
    } catch {
      // Not in a tab we are allowed to close. Fall through.
    }
    window.close();
    if (window.history.length > 1) window.history.back();
  };

  const requestClose = () => {
    finishEditing();
    // Only edits that reached history count: an untouched image, or one only
    // panned around, should not nag on the way out.
    if (depth.past > 0) setLeaving(true);
    else void close();
  };

  const out = bitmap ? outputSize(bitmap, state) : null;
  const rotatable = selected && selected.kind !== "arrow";

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

        <Button size="sm" disabled={!bitmap || exporting} onClick={() => void save()}>
          <Download className="size-3.5" /> {exporting ? "Saving…" : "Save"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={requestClose}
          aria-label="Close editor"
          title="Close editor"
        >
          <X className="size-4" />
        </Button>
      </header>

      {leaving && (
        <div className="bg-muted/60 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
          <span>You have edits that were never saved.</span>
          <div className="flex-1" />
          <Button
            size="sm"
            disabled={exporting}
            onClick={async () => {
              if (await save()) void close();
              else setLeaving(false);
            }}
          >
            <Download className="size-3.5" /> {exporting ? "Saving…" : "Save and close"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void close()}>
            Discard
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>
            Keep editing
          </Button>
        </div>
      )}

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
          Drop an image here, paste one, or choose one
          <span className="text-muted-foreground text-xs">It never leaves this machine</span>
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
                onClick={() => chooseTool(entry.id)}
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
            editingId={editingId}
            onSelect={setSelectedId}
            onPreview={preview}
            onCommit={commit}
            onToolChange={setTool}
            onCreateText={createText}
            onEditText={editText}
            onTextChange={changeText}
            onEditDone={finishEditing}
          />

          <aside className="w-64 shrink-0 space-y-4 overflow-y-auto border-l p-3">
            <Section title="Image">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() =>
                    commit({
                      ...stateRef.current,
                      rotate: ((stateRef.current.rotate + 90) % 360) as EditState["rotate"],
                    })
                  }
                >
                  <RotateCw className="size-3.5" /> Rotate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => commit({ ...stateRef.current, flipH: !stateRef.current.flipH })}
                  aria-pressed={state.flipH}
                  aria-label="Flip horizontally"
                >
                  <FlipHorizontal className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => commit({ ...stateRef.current, flipV: !stateRef.current.flipV })}
                  aria-pressed={state.flipV}
                  aria-label="Flip vertically"
                >
                  <FlipVertical className="size-3.5" />
                </Button>
                {state.crop && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => commit({ ...stateRef.current, crop: null })}
                  >
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
                    onClick={() => commit({ ...stateRef.current, grade: preset.grade })}
                    className="hover:bg-accent rounded-full border px-2 py-0.5 text-xs"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <Knob label="Brightness" value={state.grade.brightness} min={20} max={200} onChange={(brightness) => setGrade({ brightness })} onDone={settle} />
              <Knob label="Contrast" value={state.grade.contrast} min={20} max={200} onChange={(contrast) => setGrade({ contrast })} onDone={settle} />
              <Knob label="Saturation" value={state.grade.saturate} min={0} max={250} onChange={(saturate) => setGrade({ saturate })} onDone={settle} />
              <Knob label="Warmth" value={state.grade.warmth} min={-100} max={100} onChange={(warmth) => setGrade({ warmth })} onDone={settle} />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-full"
                onClick={() => commit({ ...stateRef.current, grade: NEUTRAL_GRADE })}
              >
                Reset colour
              </Button>
            </Section>

            <Section title={selected ? `Selected ${labelOf(selected)}` : "Drawing"}>
              <ColorField
                value={selected ? selected.color : style.color}
                presets={SWATCHES}
                onPreview={(color) =>
                  selected
                    ? patchLive((l) => ({ ...l, color }) as Layer)
                    : setStyle((s) => ({ ...s, color }))
                }
                onDone={settle}
              />

              {selected?.kind === "text" ? (
                <>
                  <Input
                    value={selected.text}
                    onChange={(e) => changeText(selected.id, e.target.value)}
                    onBlur={settle}
                    placeholder="Your label"
                    className="h-8"
                  />
                  <Knob
                    label="Size"
                    value={selected.size}
                    min={8}
                    max={Math.max(400, Math.round(selected.size))}
                    onChange={(size) =>
                      patchLive((l) =>
                        l.kind === "text" ? keepCorner(l, { ...l, size }, measure) : l,
                      )
                    }
                    onDone={settle}
                  />
                  <label className="flex items-center justify-between text-xs">
                    Plate behind text
                    <input
                      type="checkbox"
                      checked={selected.plate}
                      onChange={(e) =>
                        patchNow((l) => (l.kind === "text" ? { ...l, plate: e.target.checked } : l))
                      }
                    />
                  </label>
                </>
              ) : (
                <Knob
                  label="Thickness"
                  value={selected ? selected.width : style.width}
                  min={1}
                  max={60}
                  onChange={(width) =>
                    selected
                      ? patchLive((l) => (l.kind === "text" ? l : { ...l, width }))
                      : setStyle((s) => ({ ...s, width }))
                  }
                  onDone={selected ? settle : () => {}}
                />
              )}

              {rotatable && (
                <div className="space-y-1">
                  <Knob
                    label="Rotation"
                    suffix="°"
                    value={selected.kind === "arrow" ? 0 : selected.rotation}
                    min={-180}
                    max={180}
                    onChange={(rotation) =>
                      patchLive((l) => (l.kind === "arrow" ? l : { ...l, rotation }))
                    }
                    onDone={settle}
                  />
                  {selected.kind !== "arrow" && selected.rotation !== 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-full"
                      onClick={() => patchNow((l) => (l.kind === "arrow" ? l : { ...l, rotation: 0 }))}
                    >
                      Straighten
                    </Button>
                  )}
                </div>
              )}

              {selected && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-full"
                  onClick={() => {
                    const s = stateRef.current;
                    commit({ ...s, layers: s.layers.filter((l) => l.id !== selected.id) });
                    setSelectedId(null);
                  }}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              )}

              <p className="text-muted-foreground text-xs leading-relaxed">
                {selected
                  ? selected.kind === "arrow"
                    ? "Drag either end to move it. Drag the line to move the whole arrow."
                    : selected.kind === "text"
                      ? "Double-click to change the words. Corners resize, the knob above turns it. Shift snaps to 15°."
                      : "Handles resize, the knob above turns it. Shift keeps the proportions, or snaps to 15°."
                  : tool === "text"
                    ? "Click where the label should go and start typing."
                    : "Anything you draw is selected straight away, ready to move, resize or turn."}
              </p>
            </Section>

            {supportsQuality(format) && (
              <Section title="Export">
                <Knob
                  label={`Quality ${Math.round(quality * 100)}`}
                  value={quality * 100}
                  min={5}
                  max={100}
                  onChange={(v) => setQuality(v / 100)}
                  onDone={() => {}}
                  hideValue
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

function labelOf(layer: Layer): string {
  switch (layer.kind) {
    case "text":
      return "text";
    case "stroke":
      return "drawing";
    case "rect":
      return "rectangle";
    default:
      return layer.kind;
  }
}

/**
 * Colour control: a few presets for speed, then any colour at all.
 *
 * The native picker fires `input` continuously while you drag inside it and
 * `change` once when it closes, which is exactly the preview/commit split
 * the sliders use - so a trip through the picker leaves one undo step.
 */
function ColorField({
  value,
  presets,
  onPreview,
  onDone,
}: {
  value: string;
  presets: readonly string[];
  onPreview: (color: string) => void;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // While the hex box is being typed in, its own text wins; otherwise it
  // follows the selection.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!typing) setDraft(value);
  }, [value, typing]);

  const commitHex = (text: string) => {
    const hex = text.trim().replace(/^#?/, "#");
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
      setDraft(value);
      return;
    }
    onPreview(hex.toLowerCase());
    doneRef.current();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((color) => (
          <button
            key={color}
            onClick={() => {
              onPreview(color);
              doneRef.current();
            }}
            aria-label={`Colour ${color}`}
            style={{ background: color }}
            className={cn(
              "size-6 rounded-full border",
              value.toLowerCase() === color.toLowerCase() &&
                "ring-primary ring-2 ring-offset-1",
            )}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label
          className="relative size-8 shrink-0 cursor-pointer rounded-full border"
          style={{ background: value }}
          title="Pick any colour"
        >
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
            onChange={(e) => onPreview(e.target.value)}
            ref={(el) => {
              if (!el || el.dataset.bound) return;
              el.dataset.bound = "1";
              el.addEventListener("change", () => doneRef.current());
            }}
            aria-label="Custom colour"
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          {/* Difference blending against pure white keeps the glyph legible
              on any colour the swatch happens to be, black included. */}
          <Pipette className="pointer-events-none absolute inset-0 m-auto size-3.5 text-white mix-blend-difference" />
        </label>
        <Input
          value={draft}
          onChange={(e) => {
            setTyping(true);
            setDraft(e.target.value);
          }}
          onBlur={(e) => {
            setTyping(false);
            commitHex(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            setTyping(false);
            commitHex((e.target as HTMLInputElement).value);
          }}
          spellCheck={false}
          aria-label="Colour hex"
          className="h-8 font-mono text-xs"
        />
      </div>
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
function Knob({
  label,
  value,
  min,
  max,
  onChange,
  onDone,
  suffix = "",
  hideValue = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onDone: () => void;
  suffix?: string;
  hideValue?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground flex justify-between text-xs">
        {label}
        {!hideValue && (
          <span className="tabular-nums">
            {Math.round(value)}
            {suffix}
          </span>
        )}
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
