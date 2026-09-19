import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  boundsOf,
  hitTest,
  imageTransform,
  moveLayer,
  outputSize,
  render,
  toImageSpace,
  type EditState,
  type Layer,
  type Rect,
  type ShapeLayer,
  type StrokeLayer,
  type TextLayer,
  type Tool,
} from "@/lib/editor";

export interface DrawStyle {
  color: string;
  width: number;
  fontSize: number;
}

/**
 * Two stacked canvases: the image and its layers on one, selection handles
 * and the in-progress shape on another.
 *
 * Keeping the handles off the image canvas is not tidiness. Export re-runs
 * the very same render call at full scale, so anything painted onto that
 * canvas would be baked into the saved file. The overlay cannot leak.
 */
export default function Canvas({
  bitmap,
  state,
  tool,
  style,
  selectedId,
  onSelect,
  onPreview,
  onCommit,
}: {
  bitmap: ImageBitmap;
  state: EditState;
  tool: Tool;
  style: DrawStyle;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Continuous updates while dragging. Not undoable. */
  onPreview: (state: EditState) => void;
  /** End of a gesture. This is what lands in the undo stack. */
  onCommit: (state: EditState) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<Layer | null>(null);
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);

  const out = outputSize(bitmap, state);
  // Never upscale: a small image blown up to fill the page just looks
  // broken, and the export is unaffected either way.
  const fitScale = Math.min(1, box.width / out.width || 1, box.height / out.height || 1);
  const cssWidth = Math.max(1, Math.round(out.width * fitScale));
  const cssHeight = Math.max(1, Math.round(out.height * fitScale));
  const dpr = window.devicePixelRatio || 1;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Text measurement needs a context, so it is borrowed from the live one
  // rather than kept in the model where it would go stale on a font change.
  const measure = (layer: TextLayer) => {
    const ctx = baseRef.current?.getContext("2d");
    if (!ctx) return layer.text.length * layer.size * 0.5;
    ctx.save();
    ctx.font = `${layer.weight} ${layer.size}px ui-sans-serif, system-ui, sans-serif`;
    const width = ctx.measureText(layer.text).width;
    ctx.restore();
    return width;
  };

  // The image and its layers.
  useEffect(() => {
    const canvas = baseRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    const shown: EditState = draft
      ? { ...state, layers: [...state.layers, draft] }
      : state;
    render(ctx, bitmap, shown, fitScale * dpr);
  }, [bitmap, state, draft, cssWidth, cssHeight, fitScale, dpr]);

  // Handles, and the crop rectangle while it is being dragged.
  useEffect(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const m = imageTransform(bitmap, state, fitScale * dpr);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    // Handles should stay one pixel wide however far the image is zoomed.
    const hair = 1 / (fitScale * dpr);

    const active = state.layers.find((l) => l.id === selectedId);
    if (active) {
      const b = boundsOf(active, measure);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = hair * 2;
      ctx.setLineDash([hair * 6, hair * 4]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
    }

    const crop = cropDraft;
    if (crop) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.rect(0, 0, bitmap.width, bitmap.height);
      ctx.rect(crop.x, crop.y, crop.w, crop.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = hair * 2;
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
    }
  }, [bitmap, state, selectedId, cropDraft, cssWidth, cssHeight, fitScale, dpr]);

  const pointInImage = (e: React.PointerEvent) => {
    const rect = baseRef.current!.getBoundingClientRect();
    return toImageSpace(
      { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr },
      bitmap,
      state,
      fitScale * dpr,
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Throws if the pointer was released between the event and here.
      // Capture is a nicety; losing it must not abort the whole gesture,
      // which is what an uncaught throw here would do.
    }
    const start = pointInImage(e);

    if (tool === "crop") {
      let rect: Rect = { x: start.x, y: start.y, w: 0, h: 0 };
      const move = (ev: PointerEvent) => {
        const p = toImageSpace(
          {
            x: (ev.clientX - baseRef.current!.getBoundingClientRect().left) * dpr,
            y: (ev.clientY - baseRef.current!.getBoundingClientRect().top) * dpr,
          },
          bitmap,
          state,
          fitScale * dpr,
        );
        rect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
        setCropDraft(rect);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setCropDraft(null);
        // A stray click should not crop the image down to nothing.
        if (rect.w > 8 && rect.h > 8) {
          onCommit({
            ...state,
            crop: {
              x: Math.max(0, Math.round(rect.x)),
              y: Math.max(0, Math.round(rect.y)),
              w: Math.min(bitmap.width, Math.round(rect.w)),
              h: Math.min(bitmap.height, Math.round(rect.h)),
            },
          });
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (tool === "select") {
      const hit = hitTest(state, start, measure);
      onSelect(hit?.id ?? null);
      if (!hit) return;

      let last = start;
      let moved = false;
      let current = state;
      const move = (ev: PointerEvent) => {
        const rect = baseRef.current!.getBoundingClientRect();
        const p = toImageSpace(
          { x: (ev.clientX - rect.left) * dpr, y: (ev.clientY - rect.top) * dpr },
          bitmap,
          state,
          fitScale * dpr,
        );
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (!moved && Math.hypot(dx, dy) < 1) return;
        moved = true;
        last = p;
        current = {
          ...current,
          layers: current.layers.map((l) => (l.id === hit.id ? moveLayer(l, dx, dy) : l)),
        };
        onPreview(current);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        // Only a real move is worth an undo step.
        if (moved) onCommit(current);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }

    if (tool === "text") {
      const layer: TextLayer = {
        id: crypto.randomUUID(),
        kind: "text",
        x: start.x,
        y: start.y,
        text: "Double-click to edit",
        size: style.fontSize,
        color: style.color,
        weight: 600,
        plate: true,
      };
      onCommit({ ...state, layers: [...state.layers, layer] });
      onSelect(layer.id);
      return;
    }

    const id = crypto.randomUUID();
    // Narrowed deliberately: the select, text and crop tools have all
    // returned by here, so what is left can only be a stroke or a shape.
    let working: StrokeLayer | ShapeLayer =
      tool === "pen"
        ? { id, kind: "stroke", points: [[start.x, start.y]], color: style.color, width: style.width }
        : {
            id,
            kind: tool as ShapeLayer["kind"],
            x: start.x,
            y: start.y,
            w: 0,
            h: 0,
            color: style.color,
            width: style.width,
          };

    const move = (ev: PointerEvent) => {
      const rect = baseRef.current!.getBoundingClientRect();
      const p = toImageSpace(
        { x: (ev.clientX - rect.left) * dpr, y: (ev.clientY - rect.top) * dpr },
        bitmap,
        state,
        fitScale * dpr,
      );
      working =
        working.kind === "stroke"
          ? { ...working, points: [...working.points, [p.x, p.y]] }
          : { ...working, w: p.x - start.x, h: p.y - start.y };
      setDraft(working);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDraft(null);
      const meaningful =
        working.kind === "stroke"
          ? working.points.length > 1
          : Math.hypot(working.w, working.h) > 4;
      if (meaningful) {
        onCommit({ ...state, layers: [...state.layers, working] });
        onSelect(id);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={wrapRef}
      className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
    >
      <div className="relative shadow-2xl" style={{ width: cssWidth, height: cssHeight }}>
        <canvas
          ref={baseRef}
          style={{ width: cssWidth, height: cssHeight }}
          className="absolute inset-0 rounded-sm"
        />
        <canvas
          ref={overlayRef}
          onPointerDown={onPointerDown}
          style={{ width: cssWidth, height: cssHeight }}
          className="absolute inset-0 touch-none"
        />
      </div>
    </div>
  );
}
