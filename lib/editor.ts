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

export interface TextLayer {
  id: string;
  kind: "text";
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  weight: number;
  /** A filled plate behind the words, for labels over a busy photo. */
  plate: boolean;
}

export interface StrokeLayer {
  id: string;
  kind: "stroke";
  points: [number, number][];
  color: string;
  width: number;
}

export interface ShapeLayer {
  id: string;
  kind: "rect" | "ellipse" | "arrow";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  width: number;
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
  point: { x: number; y: number },
  bitmap: { width: number; height: number },
  state: EditState,
  scale: number,
): { x: number; y: number } {
  const p = imageTransform(bitmap, state, scale)
    .inverse()
    .transformPoint(new DOMPoint(point.x, point.y));
  return { x: p.x, y: p.y };
}

function drawArrow(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, layer: ShapeLayer) {
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

function drawLayer(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  layer: Layer,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (layer.kind === "text") {
    ctx.font = `${layer.weight} ${layer.size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    if (layer.plate) {
      const pad = layer.size * 0.28;
      const width = ctx.measureText(layer.text).width;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.roundRect(
        layer.x - pad,
        layer.y - pad * 0.7,
        width + pad * 2,
        layer.size * 1.25 + pad * 1.4,
        layer.size * 0.22,
      );
      ctx.fill();
    }
    ctx.fillStyle = layer.color;
    ctx.fillText(layer.text, layer.x, layer.y);
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
 */
export function render(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  state: EditState,
  scale: number,
) {
  const crop = cropRect(bitmap, state);
  const out = outputSize(bitmap, state);

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

  for (const layer of state.layers) drawLayer(ctx, layer);

  ctx.restore();
  void crop;
}

/** Bounding box in image space, used for selection and hit testing. */
export function boundsOf(layer: Layer, measure: (l: TextLayer) => number): Rect {
  if (layer.kind === "text") {
    const w = measure(layer);
    const pad = layer.size * 0.28;
    return {
      x: layer.x - pad,
      y: layer.y - pad * 0.7,
      w: w + pad * 2,
      h: layer.size * 1.25 + pad * 1.4,
    };
  }
  if (layer.kind === "stroke") {
    const xs = layer.points.map((p) => p[0]);
    const ys = layer.points.map((p) => p[1]);
    const pad = layer.width;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    return { x: minX, y: minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
  }
  // Shapes can be drawn right-to-left, so normalise before using them.
  return {
    x: Math.min(layer.x, layer.x + layer.w),
    y: Math.min(layer.y, layer.y + layer.h),
    w: Math.abs(layer.w),
    h: Math.abs(layer.h),
  };
}

export function hitTest(
  state: EditState,
  point: { x: number; y: number },
  measure: (l: TextLayer) => number,
): Layer | null {
  // Topmost first: what you see on top is what you expect to grab.
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];
    const b = boundsOf(layer, measure);
    const slack = layer.kind === "text" ? 0 : Math.max(8, ("width" in layer ? layer.width : 0));
    if (
      point.x >= b.x - slack &&
      point.x <= b.x + b.w + slack &&
      point.y >= b.y - slack &&
      point.y <= b.y + b.h + slack
    ) {
      return layer;
    }
  }
  return null;
}

export function moveLayer(layer: Layer, dx: number, dy: number): Layer {
  if (layer.kind === "stroke") {
    return { ...layer, points: layer.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
  }
  return { ...layer, x: layer.x + dx, y: layer.y + dy };
}
