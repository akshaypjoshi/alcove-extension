/**
 * The editor's model and its one render function.
 *
 * Preview and export call the same `render` at different scales rather
 * than having a display path and a save path that drift apart. That is the
 * whole reason layer coordinates are stored in *image* space: the transform
 * below maps image units onto the canvas, so "draw it bigger" is a
 * different scale argument and nothing else.
 */

export type Tool = "select" | "pen" | "arrow" | "rect" | "ellipse" | "text" | "crop";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface TextLayer {
  id: string;
  kind: "text";
  /** Top-left of the first line of glyphs, before rotation. */
  x: number;
  y: number;
  /** May contain newlines. */
  text: string;
  size: number;
  color: string;
  weight: number;
  /** A filled plate behind the words, for labels over a busy photo. */
  plate: boolean;
  /** Degrees clockwise, about the centre of the layer's frame. */
  rotation: number;
}

export interface StrokeLayer {
  id: string;
  kind: "stroke";
  /** Unrotated. Rotation is applied about the centre of their bounds. */
  points: [number, number][];
  color: string;
  width: number;
  rotation: number;
}

export interface ShapeLayer {
  id: string;
  kind: "rect" | "ellipse" | "arrow";
  /** For an arrow, the tail; x+w, y+h is the head. */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  width: number;
  /** Ignored for arrows: their two ends already say which way they point. */
  rotation: number;
}

export type Layer = TextLayer | StrokeLayer | ShapeLayer;

export interface Grade {
  brightness: number;
  contrast: number;
  saturate: number;
  /** -100 cool to 100 warm. */
  warmth: number;
}

export interface EditState {
  crop: Rect | null;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  grade: Grade;
  layers: Layer[];
}

export const NEUTRAL_GRADE: Grade = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  warmth: 0,
};

export const INITIAL_STATE: EditState = {
  crop: null,
  rotate: 0,
  flipH: false,
  flipV: false,
  grade: NEUTRAL_GRADE,
  layers: [],
};

export function isNeutral(grade: Grade): boolean {
  return (
    grade.brightness === 100 &&
    grade.contrast === 100 &&
    grade.saturate === 100 &&
    grade.warmth === 0
  );
}

/**
 * Warmth is not a CSS filter primitive, so it is composed: sepia pushes
 * the image towards amber, and a hue rotation swings that either side of
 * neutral. Kept in one place so the slider and the exported file cannot
 * disagree about what warmth means.
 */
export function gradeFilter(grade: Grade): string {
  if (isNeutral(grade)) return "none";

  const parts = [
    `brightness(${grade.brightness}%)`,
    `contrast(${grade.contrast}%)`,
    `saturate(${grade.saturate}%)`,
  ];

  if (grade.warmth !== 0) {
    const amount = Math.min(Math.abs(grade.warmth), 100) / 100;
    parts.push(`sepia(${(amount * 0.6).toFixed(3)})`);
    parts.push(`hue-rotate(${grade.warmth > 0 ? -12 * amount : 175 * amount}deg)`);
  }

  return parts.join(" ");
}

export const GRADE_PRESETS: { id: string; label: string; grade: Grade }[] = [
  { id: "none", label: "Original", grade: NEUTRAL_GRADE },
  { id: "punch", label: "Punch", grade: { brightness: 104, contrast: 118, saturate: 125, warmth: 8 } },
  { id: "soft", label: "Soft", grade: { brightness: 106, contrast: 92, saturate: 92, warmth: 12 } },
  { id: "cool", label: "Cool", grade: { brightness: 100, contrast: 106, saturate: 105, warmth: -35 } },
  { id: "mono", label: "Mono", grade: { brightness: 102, contrast: 112, saturate: 0, warmth: 0 } },
];

export function cropRect(bitmap: { width: number; height: number }, state: EditState): Rect {
  return state.crop ?? { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
}

/** The exported pixel dimensions. Quarter turns swap the axes. */
export function outputSize(
  bitmap: { width: number; height: number },
  state: EditState,
) {
  const crop = cropRect(bitmap, state);
  const turned = state.rotate === 90 || state.rotate === 270;
  return {
    width: Math.max(1, Math.round(turned ? crop.h : crop.w)),
    height: Math.max(1, Math.round(turned ? crop.w : crop.h)),
  };
}

/**
 * Image coordinates to canvas coordinates.
 *
 * Built as a matrix rather than a sequence of ctx calls so the same thing
 * can be inverted to turn a pointer position back into image space. One
 * definition, used in both directions, which is what keeps clicks landing
 * where they look like they land after a crop or a rotation.
 */
export function imageTransform(
  bitmap: { width: number; height: number },
  state: EditState,
  scale: number,
): DOMMatrix {
  const crop = cropRect(bitmap, state);
  const out = outputSize(bitmap, state);

  const m = new DOMMatrix();
  m.translateSelf((out.width * scale) / 2, (out.height * scale) / 2);
  m.rotateSelf(state.rotate);
  m.scaleSelf(state.flipH ? -1 : 1, state.flipV ? -1 : 1);
  m.translateSelf((-crop.w * scale) / 2, (-crop.h * scale) / 2);
  m.scaleSelf(scale, scale);
  m.translateSelf(-crop.x, -crop.y);
  return m;
}

export function toImageSpace(
  point: Point,
  bitmap: { width: number; height: number },
  state: EditState,
  scale: number,
): Point {
  const p = imageTransform(bitmap, state, scale)
    .inverse()
    .transformPoint(new DOMPoint(point.x, point.y));
  return { x: p.x, y: p.y };
}

// ---------------------------------------------------------------- text

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const LINE_HEIGHT = 1.25;

export function textFont(layer: TextLayer): string {
  return `${layer.weight} ${layer.size}px ui-sans-serif, system-ui, sans-serif`;
}

export function textPad(size: number): number {
  return size * 0.28;
}

/** Width of a text layer's widest line, in image units. */
export type Measure = (layer: TextLayer) => number;

export function measureWith(ctx: Ctx2D): Measure {
  return (layer) => {
    ctx.save();
    ctx.font = textFont(layer);
    let widest = 0;
    for (const line of layer.text.split("\n")) {
      widest = Math.max(widest, ctx.measureText(line).width);
    }
    ctx.restore();
    return widest;
  };
}

let shared: Measure | null = null;

/**
 * A measurer that needs no visible canvas, so hit testing, handles and the
 * side panel can all size a label the same way the renderer does.
 */
export function sharedMeasure(): Measure {
  if (!shared) {
    const ctx = new OffscreenCanvas(1, 1).getContext("2d");
    shared = ctx
      ? measureWith(ctx)
      : (layer) =>
          Math.max(...layer.text.split("\n").map((l) => l.length)) * layer.size * 0.55;
  }
  return shared;
}

// ------------------------------------------------------------ geometry

const rad = (deg: number) => (deg * Math.PI) / 180;

function turn(v: Point, deg: number): Point {
  if (!deg) return v;
  const r = rad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function centerOf(frame: Rect): Point {
  return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
}

/**
 * The layer's box before rotation, in image space. Everything a user can
 * grab (the dashed outline, the handles, the rotation pivot) is defined
 * relative to this one rectangle.
 */
export function frameOf(layer: Layer, measure: Measure): Rect {
  if (layer.kind === "text") {
    const pad = textPad(layer.size);
    const lines = layer.text.split("\n").length;
    return {
      x: layer.x - pad,
      y: layer.y - pad * 0.7,
      w: measure(layer) + pad * 2,
      h: lines * layer.size * LINE_HEIGHT + pad * 1.4,
    };
  }

  if (layer.kind === "stroke") {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of layer.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  // Shapes can be drawn right-to-left, so normalise before using them.
  return {
    x: Math.min(layer.x, layer.x + layer.w),
    y: Math.min(layer.y, layer.y + layer.h),
    w: Math.abs(layer.w),
    h: Math.abs(layer.h),
  };
}

export function rotationOf(layer: Layer): number {
  return layer.kind === "arrow" ? 0 : layer.rotation || 0;
}

/** A point given relative to a frame's top-left corner, out into image space. */
function toWorld(frame: Rect, deg: number, lx: number, ly: number): Point {
  const c = centerOf(frame);
  const v = turn({ x: lx - frame.w / 2, y: ly - frame.h / 2 }, deg);
  return { x: c.x + v.x, y: c.y + v.y };
}

/** The inverse: an image-space point back into the frame's unrotated space. */
function unrotate(frame: Rect, deg: number, p: Point): Point {
  if (!deg) return p;
  const c = centerOf(frame);
  const v = turn({ x: p.x - c.x, y: p.y - c.y }, -deg);
  return { x: c.x + v.x, y: c.y + v.y };
}

/** Rotation about the frame's centre, as a matrix for a ctx or a CSS transform. */
export function layerMatrix(layer: Layer, measure: Measure): DOMMatrix {
  const deg = rotationOf(layer);
  const m = new DOMMatrix();
  if (!deg) return m;
  const c = centerOf(frameOf(layer, measure));
  return m.translate(c.x, c.y).rotate(deg).translate(-c.x, -c.y);
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function insideFrame(layer: Layer, p: Point, measure: Measure, slack = 0): boolean {
  const f = frameOf(layer, measure);
  const q = unrotate(f, rotationOf(layer), p);
  return (
    q.x >= f.x - slack &&
    q.x <= f.x + f.w + slack &&
    q.y >= f.y - slack &&
    q.y <= f.y + f.h + slack
  );
}

/**
 * Topmost first: what you see on top is what you expect to grab.
 *
 * Lines are hit along their length rather than by their bounding box. A
 * diagonal arrow's box covers half the image, and treating all of it as
 * the arrow makes everything underneath impossible to click.
 */
export function hitTest(
  state: EditState,
  p: Point,
  measure: Measure,
  slack: number,
): Layer | null {
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];

    if (layer.kind === "arrow") {
      const reach = layer.width / 2 + slack;
      const tail = { x: layer.x, y: layer.y };
      const head = { x: layer.x + layer.w, y: layer.y + layer.h };
      if (segmentDistance(p, tail, head) <= reach) return layer;
      continue;
    }

    if (layer.kind === "stroke") {
      const f = frameOf(layer, measure);
      const q = unrotate(f, rotationOf(layer), p);
      const reach = layer.width / 2 + slack;
      const pts = layer.points;
      if (pts.length === 1) {
        if (Math.hypot(q.x - pts[0][0], q.y - pts[0][1]) <= reach) return layer;
        continue;
      }
      for (let j = 1; j < pts.length; j++) {
        const a = { x: pts[j - 1][0], y: pts[j - 1][1] };
        const b = { x: pts[j][0], y: pts[j][1] };
        if (segmentDistance(q, a, b) <= reach) return layer;
      }
      continue;
    }

    if (insideFrame(layer, p, measure, slack)) return layer;
  }
  return null;
}

// ------------------------------------------------------------- handles

export type HandleId =
  | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"
  | "rotate"
  | "start" | "end";

const BOX: Partial<Record<HandleId, [number, number]>> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

/** How far above its frame the rotation knob sits, in screen pixels. */
export const ROTATE_KNOB = 26;

export function handlesFor(layer: Layer): HandleId[] {
  if (layer.kind === "arrow") return ["start", "end"];
  // Text only scales in proportion, so edge handles would promise a
  // stretch they cannot deliver.
  if (layer.kind === "text") return ["nw", "ne", "se", "sw", "rotate"];
  return ["nw", "n", "ne", "e", "se", "s", "sw", "w", "rotate"];
}

export function boxHandle(id: HandleId): [number, number] | undefined {
  return BOX[id];
}

/**
 * Where a handle is, in image space.
 * `unit` is image units per screen pixel, so the rotation knob sits the
 * same distance above an object however far the image is zoomed out.
 */
export function handlePoint(layer: Layer, id: HandleId, measure: Measure, unit: number): Point {
  if (layer.kind === "arrow") {
    return id === "start"
      ? { x: layer.x, y: layer.y }
      : { x: layer.x + layer.w, y: layer.y + layer.h };
  }
  const f = frameOf(layer, measure);
  const deg = rotationOf(layer);
  if (id === "rotate") return toWorld(f, deg, f.w / 2, -ROTATE_KNOB * unit);
  const [u, v] = BOX[id] ?? [0.5, 0.5];
  return toWorld(f, deg, u * f.w, v * f.h);
}

export function handleAt(layer: Layer, p: Point, measure: Measure, unit: number): HandleId | null {
  const reach = 9 * unit;
  for (const id of handlesFor(layer)) {
    const h = handlePoint(layer, id, measure, unit);
    if (Math.hypot(p.x - h.x, p.y - h.y) <= reach) return id;
  }
  return null;
}

const HANDLE_ANGLE: Partial<Record<HandleId, number>> = {
  e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315,
};
const RESIZE_CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];

/**
 * The resize cursor has to follow the object round. On a label turned 90
 * degrees, the handle on its "right" edge is at the bottom of the screen,
 * and a sideways arrow over it would be pointing the wrong way.
 */
export function cursorFor(id: HandleId, layer: Layer, state: EditState): string {
  if (id === "rotate") return "grab";
  if (id === "start" || id === "end") return "move";
  let angle = (HANDLE_ANGLE[id] ?? 0) + rotationOf(layer);
  // A single mirror reverses which way a handle faces; two cancel out.
  if (state.flipH !== state.flipV) angle = -angle;
  angle += state.rotate;
  return RESIZE_CURSORS[((Math.round(angle / 45) % 4) + 4) % 4];
}

// ---------------------------------------------------------- transforms

/**
 * Resize a rotated box by one handle, keeping the opposite handle pinned
 * where it is on screen.
 *
 * The drag is measured in the box's own rotated axes, so pulling the
 * right-hand edge of a tilted rectangle makes it longer along its tilt
 * rather than skewing it towards the screen's horizontal.
 */
function resizeFrame(
  frame: Rect,
  deg: number,
  handle: HandleId,
  p: Point,
  uniform: boolean,
  min: number,
): Rect {
  const [hu, hv] = BOX[handle] ?? [1, 1];
  const au = 1 - hu;
  const av = 1 - hv;
  const anchor = toWorld(frame, deg, au * frame.w, av * frame.h);
  const d = turn({ x: p.x - anchor.x, y: p.y - anchor.y }, -deg);

  const sx = hu - au;
  const sy = hv - av;
  let w = sx ? Math.max(min, d.x * sx) : frame.w;
  let h = sy ? Math.max(min, d.y * sy) : frame.h;

  if (uniform && frame.w > 0 && frame.h > 0) {
    const k = sx && sy ? Math.max(w / frame.w, h / frame.h) : sx ? w / frame.w : h / frame.h;
    w = Math.max(min, frame.w * k);
    h = Math.max(min, frame.h * k);
  }

  const offset = turn({ x: sx ? (sx * w) / 2 : 0, y: sy ? (sy * h) / 2 : 0 }, deg);
  const c = { x: anchor.x + offset.x, y: anchor.y + offset.y };
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

function applyFrame(layer: Layer, from: Rect, to: Rect): Layer {
  switch (layer.kind) {
    case "rect":
    case "ellipse":
      return { ...layer, x: to.x, y: to.y, w: to.w, h: to.h };

    case "stroke": {
      const sx = from.w > 0 ? to.w / from.w : 1;
      const sy = from.h > 0 ? to.h / from.h : 1;
      return {
        ...layer,
        points: layer.points.map(
          ([x, y]) => [to.x + (x - from.x) * sx, to.y + (y - from.y) * sy] as [number, number],
        ),
      };
    }

    case "text": {
      // Resizing text means a new font size. Glyph widths scale with it,
      // so the frame that results matches the one the drag asked for.
      const size = Math.max(6, layer.size * (to.h / from.h));
      const pad = textPad(size);
      return { ...layer, size, x: to.x + pad, y: to.y + pad * 0.7 };
    }

    default:
      return layer;
  }
}

export function resizeLayer(
  layer: Layer,
  handle: HandleId,
  p: Point,
  measure: Measure,
  opts: { uniform: boolean; min: number },
): Layer {
  if (layer.kind === "arrow") {
    if (handle === "start") {
      const hx = layer.x + layer.w;
      const hy = layer.y + layer.h;
      return { ...layer, x: p.x, y: p.y, w: hx - p.x, h: hy - p.y };
    }
    return { ...layer, w: p.x - layer.x, h: p.y - layer.y };
  }

  const from = frameOf(layer, measure);
  const to = resizeFrame(
    from,
    rotationOf(layer),
    handle,
    p,
    opts.uniform || layer.kind === "text",
    opts.min,
  );
  return applyFrame(layer, from, to);
}

/**
 * Turn by however far the pointer has swung around the centre since the
 * drag began, rather than pointing the object at the cursor. That way
 * grabbing the knob does not make the object jump.
 */
export function rotateLayer(
  layer: Layer,
  from: Point,
  to: Point,
  measure: Measure,
  snap: boolean,
): Layer {
  if (layer.kind === "arrow") return layer;
  const c = centerOf(frameOf(layer, measure));
  const a0 = Math.atan2(from.y - c.y, from.x - c.x);
  const a1 = Math.atan2(to.y - c.y, to.x - c.x);
  let deg = layer.rotation + ((a1 - a0) * 180) / Math.PI;
  if (snap) deg = Math.round(deg / 15) * 15;
  deg = (((deg % 360) + 540) % 360) - 180;
  return { ...layer, rotation: deg };
}

export function moveLayer(layer: Layer, dx: number, dy: number): Layer {
  if (layer.kind === "stroke") {
    return {
      ...layer,
      points: layer.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
    };
  }
  return { ...layer, x: layer.x + dx, y: layer.y + dy };
}

/**
 * Apply a change that alters a layer's size, such as new words or a new
 * font size, without the layer sliding across the image. Its frame's
 * top-left corner stays exactly where it was on screen.
 *
 * Without this a rotated label drifts as you type into it, because it
 * turns about a centre that moves with every letter.
 */
export function keepCorner(before: Layer, after: Layer, measure: Measure): Layer {
  const a0 = toWorld(frameOf(before, measure), rotationOf(before), 0, 0);
  const a1 = toWorld(frameOf(after, measure), rotationOf(after), 0, 0);
  return moveLayer(after, a0.x - a1.x, a0.y - a1.y);
}

/** Rectangles and ellipses drawn right-to-left are stored left-to-right. */
export function normalizeShape(layer: Layer): Layer {
  if (layer.kind !== "rect" && layer.kind !== "ellipse") return layer;
  return {
    ...layer,
    x: Math.min(layer.x, layer.x + layer.w),
    y: Math.min(layer.y, layer.y + layer.h),
    w: Math.abs(layer.w),
    h: Math.abs(layer.h),
  };
}

// -------------------------------------------------------------- render

function drawArrow(ctx: Ctx2D, layer: ShapeLayer) {
  const x2 = layer.x + layer.w;
  const y2 = layer.y + layer.h;
  const angle = Math.atan2(layer.h, layer.w);
  // Scales with the stroke so a thick arrow does not get a pin head.
  const head = Math.max(layer.width * 3.5, 10);

  ctx.beginPath();
  ctx.moveTo(layer.x, layer.y);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function drawLayer(ctx: Ctx2D, layer: Layer, measure: Measure) {
  ctx.save();
  const m = layerMatrix(layer, measure);
  ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (layer.kind === "text") {
    if (layer.text) {
      if (layer.plate) {
        const f = frameOf(layer, measure);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.roundRect(f.x, f.y, f.w, f.h, layer.size * 0.22);
        ctx.fill();
      }
      ctx.font = textFont(layer);
      ctx.textBaseline = "top";
      ctx.fillStyle = layer.color;
      layer.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, layer.x, layer.y + i * layer.size * LINE_HEIGHT);
      });
    }
    ctx.restore();
    return;
  }

  ctx.strokeStyle = layer.color;
  ctx.fillStyle = layer.color;
  ctx.lineWidth = layer.width;

  if (layer.kind === "stroke") {
    if (layer.points.length === 1) {
      // A tap should leave a dot rather than nothing at all.
      const [x, y] = layer.points[0];
      ctx.beginPath();
      ctx.arc(x, y, layer.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(layer.points[0][0], layer.points[0][1]);
      for (const [x, y] of layer.points.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
  } else if (layer.kind === "arrow") {
    drawArrow(ctx, layer);
  } else if (layer.kind === "rect") {
    ctx.strokeRect(layer.x, layer.y, layer.w, layer.h);
  } else {
    ctx.beginPath();
    ctx.ellipse(
      layer.x + layer.w / 2,
      layer.y + layer.h / 2,
      Math.abs(layer.w / 2),
      Math.abs(layer.h / 2),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw everything at the given scale. Nothing here knows whether it is
 * painting a preview or the file that gets saved.
 *
 * `hide` leaves one layer out: the label being typed into is drawn by the
 * text box over the canvas, and drawing it twice would show a ghost.
 */
export function render(
  ctx: Ctx2D,
  bitmap: ImageBitmap,
  state: EditState,
  scale: number,
  hide: string | null = null,
) {
  const out = outputSize(bitmap, state);
  const measure = measureWith(ctx);

  ctx.clearRect(0, 0, out.width * scale, out.height * scale);
  ctx.save();

  const m = imageTransform(bitmap, state, scale);
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

  ctx.filter = gradeFilter(state.grade);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0);
  // Grading is the image's alone; a label tinted by the warmth slider
  // would be a surprise every time.
  ctx.filter = "none";

  for (const layer of state.layers) {
    if (layer.id !== hide) drawLayer(ctx, layer, measure);
  }

  ctx.restore();
}
