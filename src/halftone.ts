import type { RGB } from './color';
import { adjustRgb } from './luminance';
import { clamp01, radialFalloff } from './math';
import { OPAQUE } from './raster';
import type { HalftonePalette, HalftoneShape, InteractionMode } from './types';

/** Process inks for the CMYK screens. Black uses the `ink` option instead. */
export const PROCESS_INKS = {
  c: { r: 0, g: 0.64, b: 0.9 },
  m: { r: 0.9, g: 0.05, b: 0.5 },
  y: { r: 1, g: 0.92, b: 0 },
} as const satisfies Record<string, RGB>;

export type HalftoneChannel = 'k' | 'c' | 'm' | 'y';

export interface HalftoneScreen {
  channel: HalftoneChannel;
  /** Radians. */
  angle: number;
}

const DEG = Math.PI / 180;
const DOT_TOUCH = Math.PI / 4;
const HALF_DIAGONAL = Math.SQRT2 / 2;

/**
 * Screens to draw, in paint order. Mono and source draw one screen at `angle`.
 * CMYK keeps the classic 30° spacing around black: with the default 45°, C 15°, M 75°, Y 0°, K 45°.
 */
export function halftoneScreens(palette: HalftonePalette, angleDeg: number): HalftoneScreen[] {
  const a = angleDeg * DEG;
  if (palette !== 'cmyk') return [{ channel: 'k', angle: a }];
  return [
    { channel: 'y', angle: a - 45 * DEG },
    { channel: 'c', angle: a - 30 * DEG },
    { channel: 'm', angle: a + 30 * DEG },
    { channel: 'k', angle: a },
  ];
}

/** Share of the common gray that moves to the black screen. Below 1, grays keep some color ink and show the rosette. */
export const BLACK_GENERATION = 0.5;

/** RGB → CMYK, all in 0–1, with partial black generation (see `BLACK_GENERATION`). */
export function rgbToCmyk(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
  const c0 = 1 - r;
  const m0 = 1 - g;
  const y0 = 1 - b;
  const k = clamp01(Math.min(c0, m0, y0) * BLACK_GENERATION);
  const w = 1 - k;
  return { c: clamp01((c0 - k) / w), m: clamp01((m0 - k) / w), y: clamp01((y0 - k) / w), k };
}

/**
 * Size of the mark for an ink coverage `darkness` (0–1), in cell units.
 * Dot: radius. Square: half-side. Diamond: L1 radius. Line: half-thickness.
 * Below the point where neighbors touch, the area matches the coverage. Past it, the mark
 * grows until the cell is solid at `darkness` 1.
 */
export function halftoneExtent(shape: HalftoneShape, darkness: number): number {
  const d = clamp01(darkness);
  if (shape === 'square') return Math.sqrt(d) / 2;
  if (shape === 'line') return d / 2;
  if (shape === 'diamond') return d <= 0.5 ? Math.sqrt(d / 2) : 1 - Math.sqrt((1 - d) / 2);
  if (d <= DOT_TOUCH) return Math.sqrt(d / Math.PI);
  return 0.5 + (HALF_DIAGONAL - 0.5) * ((d - DOT_TOUCH) / (1 - DOT_TOUCH));
}

/** Distance from the cell center in the metric of `shape`. `x`, `y` are in cell units. */
export function shapeDistance(shape: HalftoneShape, x: number, y: number): number {
  if (shape === 'square') return Math.max(Math.abs(x), Math.abs(y));
  if (shape === 'diamond') return Math.abs(x) + Math.abs(y);
  if (shape === 'line') return Math.abs(y);
  return Math.hypot(x, y);
}

/** 1 inside the mark of one cell, 0 outside. Hard edge; the renderers antialias. */
export function halftoneCoverage(shape: HalftoneShape, x: number, y: number, darkness: number): number {
  if (darkness <= 0) return 0;
  return shapeDistance(shape, x, y) <= halftoneExtent(shape, darkness) ? 1 : 0;
}

/** Ink amount for one screen. */
export function channelDarkness(channel: HalftoneChannel, palette: HalftonePalette, r: number, g: number, b: number, luma: number): number {
  if (palette !== 'cmyk') return 1 - luma;
  return rgbToCmyk(r, g, b)[channel];
}

export interface Halftone2DInput {
  rgba: Uint8ClampedArray;
  sampleWidth: number;
  sampleHeight: number;
  /** Canvas size in device pixels. The sample covers the whole canvas. */
  width: number;
  height: number;
  /** Cell size in device pixels. */
  pitch: number;
  angle: number;
  shape: HalftoneShape;
  palette: HalftonePalette;
  ink: RGB;
  paper: RGB;
  contrast: number;
  brightness: number;
  invert: boolean;
  interaction: InteractionMode;
  /** Pointer in device pixels. */
  pointerX: number;
  pointerY: number;
  radius: number;
  strength: number;
  influence: number;
}

interface CellSample {
  r: number;
  g: number;
  b: number;
  luma: number;
}

/** Mean color of the 2×2 texels around (u, v), or null outside the picture. */
function sampleCell(rgba: Uint8ClampedArray, w: number, h: number, u: number, v: number): RGB & { a: number } {
  const fx = u * w - 0.5;
  const fy = v * h - 0.5;
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]] as const) {
    const i = (y * w + x) * 4;
    const alpha = (rgba[i + 3] ?? 0) / 255;
    r += ((rgba[i] ?? 0) / 255) * alpha;
    g += ((rgba[i + 1] ?? 0) / 255) * alpha;
    b += ((rgba[i + 2] ?? 0) / 255) * alpha;
    a += alpha;
  }
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: r / a, g: g / a, b: b / a, a: a / 4 };
}

function cssRgb(c: RGB): string {
  const n = (v: number) => Math.round(clamp01(v) * 255);
  return `rgb(${n(c.r)}, ${n(c.g)}, ${n(c.b)})`;
}

function addMark(ctx: CanvasRenderingContext2D, shape: HalftoneShape, cx: number, cy: number, size: number, pitch: number) {
  if (shape === 'dot') {
    ctx.moveTo(cx + size, cy);
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
  } else if (shape === 'square') {
    ctx.rect(cx - size, cy - size, size * 2, size * 2);
  } else if (shape === 'line') {
    ctx.rect(cx - pitch / 2, cy - size, pitch, size * 2);
  } else {
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size, cy);
    ctx.lineTo(cx, cy + size);
    ctx.lineTo(cx - size, cy);
    ctx.closePath();
  }
}

/**
 * Canvas2D halftone for contexts without WebGL2. Same screen geometry as the shader, drawn
 * as one path per screen. Repel moves dots away from the pointer, brighten lifts the tone,
 * swap trades ink for paper.
 */
export function paintHalftone2D(ctx: CanvasRenderingContext2D, input: Halftone2DInput): void {
  const { width, height, shape, palette } = input;
  const pitch = Math.max(2, input.pitch);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = cssRgb(input.paper);
  ctx.fillRect(0, 0, width, height);
  if (input.sampleWidth < 1 || input.sampleHeight < 1) return;
  const half = Math.ceil(Math.hypot(width, height) / 2 / pitch) + 1;
  const cache = new Map<number, CellSample | null>();
  const screens = halftoneScreens(palette, input.angle / DEG);
  const hasPointer = input.interaction !== 'none' && input.influence > 0;
  if (palette === 'cmyk') ctx.globalCompositeOperation = 'multiply';

  for (const screen of screens) {
    const co = Math.cos(screen.angle);
    const si = Math.sin(screen.angle);
    cache.clear();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(screen.angle);
    const ink = screen.channel === 'k' ? input.ink : PROCESS_INKS[screen.channel];
    if (palette !== 'source') {
      ctx.fillStyle = cssRgb(ink);
      ctx.beginPath();
    }
    for (let j = -half; j < half; j++) {
      for (let i = -half; i < half; i++) {
        const lx = (i + 0.5) * pitch;
        const ly = (j + 0.5) * pitch;
        const sx = width / 2 + co * lx - si * ly;
        const sy = height / 2 + si * lx + co * ly;
        if (sx < -pitch || sy < -pitch || sx > width + pitch || sy > height + pitch) continue;
        const key = (j + half) * (half * 2) + (i + half);
        let cell = cache.get(key);
        if (cell === undefined) {
          const raw = sampleCell(input.rgba, input.sampleWidth, input.sampleHeight, sx / width, sy / height);
          cell = raw.a < OPAQUE ? null : { ...adjustRgb(raw.r, raw.g, raw.b, input.contrast, input.brightness, input.invert) };
          cache.set(key, cell);
        }
        if (!cell) continue;
        let fall = 0;
        let dx = 0;
        let dy = 0;
        let grow = 1;
        if (hasPointer) {
          const px = sx - input.pointerX;
          const py = sy - input.pointerY;
          const dist = Math.hypot(px, py);
          fall = input.influence * radialFalloff(dist, input.radius);
          if (input.interaction === 'repel' && fall > 0 && dist > 0.001) {
            // The shader shows the screen at pointer + d · shrink(|d|). Invert that radially so
            // each mark lands where the shader would draw it, scaled by the local zoom.
            const shrink = (r: number) =>
              Math.max(0.25, 1 - input.influence * radialFalloff(r, input.radius) * input.strength * 0.45);
            let lo = dist;
            let hi = dist * 4;
            for (let k = 0; k < 18; k++) {
              const mid = (lo + hi) / 2;
              if (mid * shrink(mid) < dist) lo = mid;
              else hi = mid;
            }
            const screenDist = (lo + hi) / 2;
            // The shader stretches marks less along the radius than around it. Circles take the
            // radial scale, or neighbors along the radius would overlap.
            const g = (r: number) => r * shrink(r);
            const h = 0.5;
            grow = Math.min(1 / shrink(screenDist), (2 * h) / Math.max(1e-3, g(screenDist + h) - g(Math.max(0, screenDist - h))));
            const zoom = screenDist / dist;
            const ox = px * (zoom - 1);
            const oy = py * (zoom - 1);
            // Screen-space offset, rotated into the screen's frame.
            dx = co * ox + si * oy;
            dy = -si * ox + co * oy;
          }
        }
        let { r, g, b, luma } = cell;
        if (input.interaction === 'brighten' && fall > 0) {
          const lift = fall * input.strength * 0.85;
          r = clamp01(r + lift);
          g = clamp01(g + lift);
          b = clamp01(b + lift);
          luma = clamp01(luma + lift);
        }
        let darkness = channelDarkness(screen.channel, palette, r, g, b, luma);
        if (input.interaction === 'swap' && fall > 0) {
          const t = clamp01(fall * input.strength);
          darkness += (1 - 2 * darkness) * t;
        }
        const size = halftoneExtent(shape, darkness) * pitch * grow;
        if (size <= 0.05) continue;
        if (palette === 'source') {
          ctx.fillStyle = cssRgb({ r, g, b });
          ctx.beginPath();
          addMark(ctx, shape, lx + dx, ly + dy, size, pitch * grow);
          ctx.fill();
        } else {
          addMark(ctx, shape, lx + dx, ly + dy, size, pitch * grow);
        }
      }
    }
    if (palette !== 'source') ctx.fill();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}
