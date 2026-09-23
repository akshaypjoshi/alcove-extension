import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Pencil, X } from "lucide-react";
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
import {
  FORMATS,
  FORMAT_LABEL,
  clipboardImages,
  decode,
  download,
  encode,
  fit,
  formatBytes,
  renameFor,
  stageForEditor,
  supportsQuality,
  toTargetBytes,
  type Format,
} from "@/lib/images";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/**
 * Convert, resize and compress, without the file leaving the machine.
 *
 * The editor lives on its own page because 416px of drawer is not enough
 * for a canvas and a toolbar. This is the half that fits: a list, a few
 * numbers, and a download.
 */
type Mode = "keep" | "edge" | "bytes";

interface Item {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  originalBytes: number;
  result?: { blob: Blob; width: number; height: number; warning?: string };
  error?: string;
}

export default function Images() {
  const { settings, update } = useSettings();
  const [items, setItems] = useState<Item[]>([]);
  const [mode, setMode] = useState<Mode>("keep");
  const [edge, setEdge] = useState(1920);
  const [kilobytes, setKilobytes] = useState(200);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const format = (settings?.images.format ?? "image/jpeg") as Format;
  const quality = settings?.images.quality ?? 0.85;
  const lossy = supportsQuality(format);

  // Bitmaps hold real memory, so they go back when the drawer closes.
  useEffect(
    () => () => {
      setItems((current) => {
        current.forEach((item) => item.bitmap.close());
        return [];
      });
    },
    [],
  );

  const addFiles = async (files: ArrayLike<File> | null | undefined) => {
    if (!files?.length) return;
    const added: Item[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          bitmap: await decode(file),
          originalBytes: file.size,
        });
      } catch (err) {
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          bitmap: null as unknown as ImageBitmap,
          originalBytes: file.size,
          error: err instanceof Error ? err.message : "Could not read that file.",
        });
      }
    }
    setItems((current) => [...current, ...added]);
  };

  // Paste. The tool unmounts when the drawer closes, so this is listening
  // only while the panel is actually on screen, and a ref keeps the handler
  // stable while still seeing the current `addFiles`.
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;

      const files = clipboardImages(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      void addRef.current(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const next = await Promise.all(
        items.map(async (item) => {
          if (!item.bitmap) return item;
          try {
            const size =
              mode === "edge" ? fit(item.bitmap, edge) : undefined;

            if (mode === "bytes") {
              const out = await toTargetBytes(item.bitmap, {
                type: format,
                bytes: kilobytes * 1024,
              });
              return {
                ...item,
                error: undefined,
                result: {
                  blob: out.blob,
                  width: item.bitmap.width,
                  height: item.bitmap.height,
                  warning: out.hitTarget
                    ? undefined
                    : `Could not get under ${kilobytes} KB. This is as small as it goes at these dimensions.`,
                },
              };
            }

            const out = await encode(item.bitmap, {
              type: format,
              quality: lossy ? quality : undefined,
              ...size,
            });
            return { ...item, error: undefined, result: out };
          } catch (err) {
            return {
              ...item,
              result: undefined,
              error: err instanceof Error ? err.message : "That one failed.",
            };
          }
        }),
      );
      setItems(next);
    } finally {
      setBusy(false);
    }
  };

  const openEditor = async (item: Item) => {
    const { blob } = await encode(item.bitmap, { type: "image/png" });
    const id = await stageForEditor(blob, item.name);
    window.open(
      `${browser.runtime.getURL("/editor.html")}?from=${id}`,
      "_blank",
      "noopener",
    );
  };

  const remove = (id: string) =>
    setItems((current) => {
      current.find((i) => i.id === id)?.bitmap?.close();
      return current.filter((i) => i.id !== id);
    });

  const ready = items.filter((i) => i.result);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => addFiles(e.target.files)}
      />

      <button
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex h-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm transition",
          dropping ? "border-primary bg-accent/60" : "hover:bg-accent/40",
        )}
      >
        <ImagePlus className="text-muted-foreground size-4" />
        Drop images here, or choose them
        <span className="text-muted-foreground text-xs">
          Screenshots paste straight in
        </span>
      </button>

      {items.length > 0 && (
        <>
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Format</span>
              <Select
                value={format}
                onValueChange={(value) =>
                  settings &&
                  update({ images: { ...settings.images, format: value } })
                }
              >
                <SelectTrigger size="sm" className="w-full">
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
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Resize</span>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep size</SelectItem>
                  <SelectItem value="edge">Longest edge</SelectItem>
                  <SelectItem value="bytes">Target file size</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          {mode === "edge" && (
            <label className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground w-24 text-xs">Longest edge</span>
              <Input
                type="number"
                min={16}
                max={8000}
                value={edge}
                onChange={(e) => setEdge(Number(e.target.value) || 0)}
                className="h-8"
              />
              <span className="text-muted-foreground text-xs">px</span>
            </label>
          )}

          {mode === "bytes" && (
            <div className="flex shrink-0 flex-col gap-1.5">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground w-24 text-xs">Aim for under</span>
                <Input
                  type="number"
                  min={5}
                  max={20000}
                  value={kilobytes}
                  onChange={(e) => setKilobytes(Number(e.target.value) || 0)}
                  className="h-8"
                />
                <span className="text-muted-foreground text-xs">KB</span>
              </label>
              {!lossy && (
                <p className="text-muted-foreground text-xs">
                  PNG is lossless, so only its dimensions can make it smaller.
                  Pick JPEG or WebP to aim for a size.
                </p>
              )}
            </div>
          )}

          {lossy && mode !== "bytes" && (
            <label className="flex shrink-0 items-center gap-3">
              <span className="text-muted-foreground w-24 shrink-0 text-xs">
                Quality {Math.round(quality * 100)}
              </span>
              <Slider
                value={[quality * 100]}
                min={5}
                max={100}
                step={1}
                onValueChange={([v]) =>
                  settings &&
                  update({ images: { ...settings.images, quality: v / 100 } })
                }
              />
            </label>
          )}

          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              className="flex-1"
              disabled={busy || (mode === "bytes" && !lossy)}
              onClick={run}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Convert"}
            </Button>
            {ready.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  ready.forEach((item) =>
                    download(item.result!.blob, renameFor(item.name, format)),
                  )
                }
              >
                <Download className="size-3.5" /> All
              </Button>
            )}
          </div>
        </>
      )}

      <ul className="flex min-h-0 flex-1 flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border p-2.5">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{item.name}</span>
                <span className="text-muted-foreground block text-xs">
                  {item.bitmap
                    ? `${item.bitmap.width}x${item.bitmap.height} · ${formatBytes(item.originalBytes)}`
                    : formatBytes(item.originalBytes)}
                  {item.result && (
                    <>
                      {" → "}
                      <span className="text-foreground">
                        {item.result.width}x{item.result.height} ·{" "}
                        {formatBytes(item.result.blob.size)}
                      </span>{" "}
                      <Saving from={item.originalBytes} to={item.result.blob.size} />
                    </>
                  )}
                </span>
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                {item.bitmap && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => openEditor(item)}
                    aria-label={`Edit ${item.name}`}
                    title="Open in the editor"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                )}
                {item.result && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() =>
                      download(item.result!.blob, renameFor(item.name, format))
                    }
                    aria-label={`Download ${item.name}`}
                  >
                    <Download className="size-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.name}`}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>

            {item.error && (
              <p className="text-destructive mt-1 text-xs">{item.error}</p>
            )}
            {item.result?.warning && (
              <p className="text-muted-foreground mt-1 text-xs">
                {item.result.warning}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Green when it shrank, muted when a conversion made it bigger. */
function Saving({ from, to }: { from: number; to: number }) {
  if (!from) return null;
  const change = Math.round((1 - to / from) * 100);
  if (change <= 0) {
    return <span className="text-muted-foreground">({Math.abs(change)}% bigger)</span>;
  }
  return <span className="text-emerald-500">({change}% smaller)</span>;
}
