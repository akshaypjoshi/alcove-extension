import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  LINE_HEIGHT,
  ROTATE_KNOB,
  boxHandle,
  cursorFor,
  frameOf,
  handleAt,
  handlesFor,
  hitTest,
  imageTransform,
  insideFrame,
  layerMatrix,
  moveLayer,
  normalizeShape,
  outputSize,
  render,
  resizeLayer,
  rotateLayer,
  sharedMeasure,
  textFont,
  textPad,
  toImageSpace,
  type EditState,
  type HandleId,
  type Layer,
  type Point,
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

const ACCENT = "#3b82f6";

/**
 * Two stacked canvases: the image and its layers on one, selection handles
 * and the crop rectangle on another.
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
  editingId,
  onSelect,
  onPreview,
  onCommit,
  onToolChange,
  onCreateText,
  onEditText,
  onTextChange,
  onEditDone,
}: {
  bitmap: ImageBitmap;
  state: EditState;
  tool: Tool;
  style: DrawStyle;
  selectedId: string | null;
  editingId: string | null;
  onSelect: (id: string | null) => void;
  /** Continuous updates while dragging. */
  onPreview: (state: EditState) => void;
  /** End of a gesture: one undo step. */
  onCommit: (state: EditState) => void;
  onToolChange: (tool: Tool) => void;
  onCreateText: (at: Point) => void;
  onEditText: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onEditDone: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [draft, setDraft] = useState<Layer | null>(null);
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [cursor, setCursor] = useState("default");
  /**
   * Where a Text-tool press landed, waiting for the click to complete.
   *
   * The text box is opened on click rather than on pointer-down for one
   * reason: pressing the mouse makes the browser move focus to whatever
   * was pressed, and that focus change lands *after* pointer-down. A box
   * opened and focused during pointer-down is blurred a moment later,
   * which finishes the edit while the label is still empty, so it is
   * thrown away and clicking appears to do nothing.
   *
   * By click time the browser has already moved focus, so focusing the
   * box afterwards is uncontested. No race to win.
   */
  const pendingText = useRef<Point | null>(null);

  const measure = sharedMeasure();
  const out = outputSize(bitmap, state);
  /**
   * The wrapper has not been measured yet.
   *
   * `box` starts at zero, and `0 / out.width` is falsy, so the `|| 1`
   * fallbacks below would read that as "fits at full size" - allocating a
   * backing store the size of the whole photo for the one frame before
   * the ResizeObserver reports. On a 4032x3024 phone picture at dpr 2
   * that is around 195MB, painted once and thrown away.
   */
  const measured = box.width > 0 && box.height > 0;
  // Never upscale: a small image blown up to fill the page just looks
  // broken, and the export is unaffected either way.
  const fitScale = Math.min(1, box.width / out.width || 1, box.height / out.height || 1);
  const cssWidth = Math.max(1, Math.round(out.width * fitScale));
  const cssHeight = Math.max(1, Math.round(out.height * fitScale));
  const dpr = window.devicePixelRatio || 1;
  // Image units per screen pixel. Handle sizes and hit slack are set in
  // screen pixels, so they stay grabbable on a 6000px photo.
  const unit = 1 / fitScale;

  const selected = state.layers.find((l) => l.id === selectedId) ?? null;
  const editing =
    (state.layers.find((l) => l.id === editingId && l.kind === "text") as TextLayer | undefined) ??
    null;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The image and its layers.
  useEffect(() => {
    const canvas = baseRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !measured) return;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const shown: EditState = draft ? { ...state, layers: [...state.layers, draft] } : state;
    render(ctx, bitmap, shown, fitScale * dpr, editingId);
  }, [bitmap, state, draft, editingId, cssWidth, cssHeight, fitScale, dpr, measured]);

  // Outline, handles, and the crop rectangle while it is being dragged.
  useEffect(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !measured) return;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const m = imageTransform(bitmap, state, fitScale * dpr);
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
    const px = 1 / fitScale;

    if (selected && !editing) {
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.fillStyle = "#fff";
      ctx.lineWidth = 1.5 * px;

      if (selected.kind === "arrow") {
        for (const [x, y] of [
          [selected.x, selected.y],
          [selected.x + selected.w, selected.y + selected.h],
        ]) {
          ctx.beginPath();
          ctx.arc(x, y, 6 * px, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        const lm = layerMatrix(selected, measure);
        ctx.transform(lm.a, lm.b, lm.c, lm.d, lm.e, lm.f);
        const f = frameOf(selected, measure);

        ctx.setLineDash([5 * px, 3 * px]);
        ctx.strokeRect(f.x, f.y, f.w, f.h);
        ctx.setLineDash([]);

        const handles = handlesFor(selected);
        if (handles.includes("rotate")) {
          const top = { x: f.x + f.w / 2, y: f.y };
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(top.x, top.y - ROTATE_KNOB * px);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(top.x, top.y - ROTATE_KNOB * px, 5.5 * px, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        const side = 8 * px;
        for (const id of handles) {
          const pos = boxHandle(id);
          if (!pos) continue;
          const hx = f.x + pos[0] * f.w;
          const hy = f.y + pos[1] * f.h;
          ctx.fillRect(hx - side / 2, hy - side / 2, side, side);
          ctx.strokeRect(hx - side / 2, hy - side / 2, side, side);
        }
      }
      ctx.restore();
    }

    if (cropDraft) {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.rect(0, 0, bitmap.width, bitmap.height);
      ctx.rect(cropDraft.x, cropDraft.y, cropDraft.w, cropDraft.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 * px;
      ctx.strokeRect(cropDraft.x, cropDraft.y, cropDraft.w, cropDraft.h);
    }
  }, [bitmap, state, selected, editing, cropDraft, cssWidth, cssHeight, fitScale, dpr, measure, measured]);

  // A label opened for editing takes the keyboard at once, caret at the end.
  useEffect(() => {
    if (!editingId) return;
    const el = areaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editingId]);

  const toPoint = (clientX: number, clientY: number): Point => {
    const r = baseRef.current!.getBoundingClientRect();
    return toImageSpace(
      { x: (clientX - r.left) * dpr, y: (clientY - r.top) * dpr },
      bitmap,
      state,
      fitScale * dpr,
    );
  };

  /**
   * Follows a drag on the window, so it keeps working past the canvas.
   *
   * `pointercancel` ends it too. Without that, a gesture the browser takes
   * away - a touch turning into a scroll, a window losing the pointer -
   * left the move listener attached with no pointerup ever coming, and it
   * then measured a canvas that may no longer be there.
   */
  const track = (
    onMove: (p: Point, ev: PointerEvent) => void,
    onUp: () => void,
  ) => {
    const move = (ev: PointerEvent) => {
      if (!baseRef.current) return stop();
      onMove(toPoint(ev.clientX, ev.clientY), ev);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      onUp();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return stop;
  };

  const replace = (layers: Layer[], layer: Layer) =>
    layers.map((l) => (l.id === layer.id ? layer : l));

  /** Resize or rotate. Shift keeps proportions, or snaps to 15 degrees. */
  const transform = (layer: Layer, handle: HandleId, start: Point) => {
    let current = state;
    let changed = false;
    track(
      (p, ev) => {
        const next =
          handle === "rotate"
            ? rotateLayer(layer, start, p, measure, ev.shiftKey)
            : resizeLayer(layer, handle, p, measure, { uniform: ev.shiftKey, min: 4 * unit });
        changed = true;
        current = { ...state, layers: replace(state.layers, next) };
        onPreview(current);
      },
      () => {
        if (changed) onCommit(current);
      },
    );
  };

  const drag = (layer: Layer, start: Point) => {
    let last = start;
    let moved = false;
    let current = state;
    track(
      (p) => {
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        // A couple of pixels of slop, so a click to select stays a click.
        if (!moved && Math.hypot(dx, dy) < 2 * unit) return;
        moved = true;
        last = p;
        const now = current.layers.find((l) => l.id === layer.id);
        if (!now) return;
        current = { ...current, layers: replace(current.layers, moveLayer(now, dx, dy)) };
        onPreview(current);
      },
      () => {
        if (moved) onCommit(current);
      },
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Throws if the pointer was released between the event and here.
      // Capture is a nicety; losing it must not abort the gesture.
    }

    // The first click away from a label finishes it, as in any editor,
    // rather than also starting whatever that click would otherwise do.
    if (editingId) {
      pendingText.current = null;
      onEditDone();
      return;
    }

    const start = toPoint(e.clientX, e.clientY);

    // Handles answer whatever tool is active, so a shape can be resized
    // or turned the moment it has been drawn.
    if (selected && tool !== "crop") {
      const handle = handleAt(selected, start, measure, unit);
      if (handle) {
        transform(selected, handle, start);
        return;
      }
    }

    if (tool === "crop") {
      let rect: Rect = { x: start.x, y: start.y, w: 0, h: 0 };
      track(
        (p) => {
          rect = {
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            w: Math.abs(p.x - start.x),
            h: Math.abs(p.y - start.y),
          };
          setCropDraft(rect);
        },
        () => {
          setCropDraft(null);
          /**
           * Intersected with the image, not clamped against it.
           *
           * The drag is tracked on the window, so it readily runs past
           * the edge. Clamping each side on its own moved the rectangle
           * instead of trimming it: a drag starting off the left edge
           * committed a crop shifted right of the one just drawn, and one
           * running off the right committed a box wider than what was
           * left of the image, which exports as a transparent band.
           */
          const span = (from: number, size: number, limit: number) => {
            const lo = Math.min(Math.max(0, Math.round(from)), limit);
            const hi = Math.min(Math.max(0, Math.round(from + size)), limit);
            return { at: lo, size: hi - lo };
          };
          const x = span(rect.x, rect.w, bitmap.width);
          const y = span(rect.y, rect.h, bitmap.height);
          const crop = { x: x.at, y: y.at, w: x.size, h: y.size };

          // A stray click, or a drag that ended up almost entirely off the
          // image, should not crop it down to nothing. Measured on screen
          // so the threshold means the same on a phone photo as a thumbnail.
          if (crop.w > 8 * unit && crop.h > 8 * unit) {
            onCommit({ ...state, crop });
          }
        },
      );
      return;
    }

    if (tool === "select") {
      // Anywhere inside the selected object's frame drags it. A thin pen
      // stroke is otherwise very hard to pick up a second time.
      const target =
        selected && insideFrame(selected, start, measure, 4 * unit)
          ? selected
          : hitTest(state, start, measure, 6 * unit);
      onSelect(target?.id ?? null);
      if (target) drag(target, start);
      return;
    }

    if (tool === "text") {
      // Opened by the click handler below, once focus has settled.
      pendingText.current = start;
      return;
    }

    // Pen, arrow, rectangle, ellipse.
    const id = crypto.randomUUID();
    let working: StrokeLayer | ShapeLayer =
      tool === "pen"
        ? {
            id,
            kind: "stroke",
            points: [[start.x, start.y]],
            color: style.color,
            width: style.width,
            rotation: 0,
          }
        : {
            id,
            kind: tool as ShapeLayer["kind"],
            x: start.x,
            y: start.y,
            w: 0,
            h: 0,
            color: style.color,
            width: style.width,
            rotation: 0,
          };

    track(
      (p) => {
        working =
          working.kind === "stroke"
            ? { ...working, points: [...working.points, [p.x, p.y]] }
            : { ...working, w: p.x - start.x, h: p.y - start.y };
        setDraft(working);
      },
      () => {
        setDraft(null);
        const meaningful =
          working.kind === "stroke"
            ? working.points.length > 1
            : Math.hypot(working.w, working.h) > 4 * unit;
        if (!meaningful) return;
        const layer = normalizeShape(working);
        onCommit({ ...state, layers: [...state.layers, layer] });
        onSelect(layer.id);
        // A shape hands straight over to Select so it can be moved,
        // resized or turned at once. The pen stays a pen: strokes come in
        // runs, and its handles still work while it is active.
        if (tool !== "pen") onToolChange("select");
      },
    );
  };

  const onClick = () => {
    const at = pendingText.current;
    pendingText.current = null;
    if (!at) return;
    const hit = hitTest(state, at, measure, 4 * unit);
    if (hit?.kind === "text") {
      onSelect(hit.id);
      onEditText(hit.id);
      return;
    }
    onCreateText(at);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const hit = hitTest(state, toPoint(e.clientX, e.clientY), measure, 4 * unit);
    if (hit?.kind === "text") {
      onSelect(hit.id);
      onEditText(hit.id);
    }
  };

  const onHover = (e: React.PointerEvent) => {
    if (e.buttons) return;
    const p = toPoint(e.clientX, e.clientY);
    let next = tool === "text" ? "text" : tool === "select" ? "default" : "crosshair";

    if (!editing && selected && tool !== "crop") {
      const handle = handleAt(selected, p, measure, unit);
      if (handle) next = cursorFor(handle, selected, state);
      else if (tool === "select" && insideFrame(selected, p, measure, 4 * unit)) next = "move";
    }
    if (next === "default" && tool === "select" && hitTest(state, p, measure, 6 * unit)) {
      next = "move";
    }
    setCursor(next);
  };

  // The text box sits exactly over the label it edits, built from the same
  // matrices the renderer uses, so it follows a crop, a rotation of the
  // image, and the label's own rotation without separate positioning code.
  let editor: React.CSSProperties | null = null;
  if (editing) {
    const f = frameOf(editing, measure);
    const m = imageTransform(bitmap, state, fitScale)
      .multiply(layerMatrix(editing, measure))
      .translate(f.x, f.y);
    const pad = textPad(editing.size);
    editor = {
      position: "absolute",
      left: 0,
      top: 0,
      transformOrigin: "0 0",
      transform: `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`,
      boxSizing: "border-box",
      // A little spare room so the next letter never wraps before the
      // box has been re-measured around it.
      width: f.w + editing.size * 0.6,
      height: f.h,
      margin: 0,
      border: 0,
      resize: "none",
      overflow: "hidden",
      whiteSpace: "pre",
      font: textFont(editing),
      lineHeight: LINE_HEIGHT,
      color: editing.color,
      caretColor: editing.color,
      background: editing.plate ? "rgba(0,0,0,0.55)" : "transparent",
      borderRadius: editing.size * 0.22,
      // CSS centres a line inside its line-height; the canvas draws glyphs
      // from the top of the em box. Nudging the top padding by the
      // half-leading lines the two up.
      padding: `${pad * 0.7 - editing.size * 0.125}px ${pad}px 0 ${pad}px`,
      outline: `${1.5 * unit}px dashed ${ACCENT}`,
      outlineOffset: `${3 * unit}px`,
    };
  }

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
          onClick={onClick}
          onPointerMove={onHover}
          onDoubleClick={onDoubleClick}
          style={{ width: cssWidth, height: cssHeight, cursor }}
          className="absolute inset-0 touch-none"
        />
        {editing && editor && (
          <textarea
            ref={areaRef}
            value={editing.text}
            spellCheck={false}
            aria-label="Label text"
            placeholder="Type…"
            onChange={(e) => onTextChange(editing.id, e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
                e.preventDefault();
                onEditDone();
              }
            }}
            onBlur={onEditDone}
            onPointerDown={(e) => e.stopPropagation()}
            style={editor}
          />
        )}
      </div>
    </div>
  );
}
