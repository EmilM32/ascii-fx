import type { RGB } from './color';
import { mix } from './color';
import { bayerThreshold, floydSteinberg, quantizeLuma } from './dither';
import { adjustRgb } from './luminance';
import { radialFalloff } from './math';
import type { ColorMode, DitherMode, InteractionMode } from './types';

/** Unicode braille dot order: left column top-to-bottom, then right, then the bottom pair. */
export const BRAILLE_DOTS = [
  { bit: 0, x: 0.25, y: 0.125, col: 0, row: 0 },
  { bit: 1, x: 0.25, y: 0.375, col: 0, row: 1 },
  { bit: 2, x: 0.25, y: 0.625, col: 0, row: 2 },
  { bit: 3, x: 0.75, y: 0.125, col: 1, row: 0 },
  { bit: 4, x: 0.75, y: 0.375, col: 1, row: 1 },
  { bit: 5, x: 0.75, y: 0.625, col: 1, row: 2 },
  { bit: 6, x: 0.25, y: 0.875, col: 0, row: 3 },
  { bit: 7, x: 0.75, y: 0.875, col: 1, row: 3 },
] as const;

export function sampleRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  v: number,
): RGB {
  if (width <= 0 || height <= 0) return { r: 0, g: 0, b: 0 };
  const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
  const i = (y * width + x) * 4;
  return { r: (rgba[i] ?? 0) / 255, g: (rgba[i + 1] ?? 0) / 255, b: (rgba[i + 2] ?? 0) / 255 };
}

export function inkColor(mode: ColorMode, luma: number, src: RGB, fg: RGB, bg: RGB): RGB {
  if (mode === 'color') return src;
  if (mode === 'duotone') return mix(mix(bg, fg, 0.28), fg, luma);
  return fg;
}

export interface CellField {
  /** Row-major glyph index or braille mask, after brighten / swap. */
  indices: Uint8Array;
  /** 6 floats per cell: destX, destY, index, r, g, b. Destination is in cell units. */
  instances: Float32Array;
}

export interface BuildCellsInput {
  rgba: Uint8ClampedArray;
  sampleWidth: number;
  sampleHeight: number;
  cols: number;
  rows: number;
  kind: 'glyphs' | 'braille';
  levels: number;
  dither: DitherMode;
  contrast: number;
  brightness: number;
  invert: boolean;
  colorMode: ColorMode;
  fg: RGB;
  bg: RGB;
  interaction: InteractionMode;
  /** Pointer in CSS pixels, origin at the canvas top-left. */
  pointerX: number;
  pointerY: number;
  cellCssW: number;
  cellCssH: number;
  /** Radius in CSS pixels. */
  radius: number;
  strength: number;
  influence: number;
  /** Precomputed Floyd–Steinberg indices or braille masks, without pointer effects. */
  floydBase: Uint8Array | null;
}

export function glyphLumaField(input: {
  rgba: Uint8ClampedArray;
  sampleWidth: number;
  sampleHeight: number;
  cols: number;
  rows: number;
  contrast: number;
  brightness: number;
  invert: boolean;
}): Float32Array {
  const { cols, rows } = input;
  const out = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const sample = sampleRgba(input.rgba, input.sampleWidth, input.sampleHeight, (x + 0.5) / cols, (y + 0.5) / rows);
      out[y * cols + x] = adjustRgb(
        sample.r,
        sample.g,
        sample.b,
        input.contrast,
        input.brightness,
        input.invert,
      ).luma;
    }
  }
  return out;
}

export function glyphFloydIndices(luma: Float32Array, cols: number, rows: number, levels: number): Uint8Array {
  return floydSteinberg(luma, cols, rows, levels);
}

export function brailleFloydMasks(input: {
  rgba: Uint8ClampedArray;
  sampleWidth: number;
  sampleHeight: number;
  cols: number;
  rows: number;
  contrast: number;
  brightness: number;
  invert: boolean;
}): Uint8Array {
  const w = input.cols * 2;
  const h = input.rows * 4;
  const luma = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sample = sampleRgba(input.rgba, input.sampleWidth, input.sampleHeight, (x + 0.5) / w, (y + 0.5) / h);
      luma[y * w + x] = adjustRgb(sample.r, sample.g, sample.b, input.contrast, input.brightness, input.invert).luma;
    }
  }
  const bits = floydSteinberg(luma, w, h, 2);
  const masks = new Uint8Array(input.cols * input.rows);
  for (let cy = 0; cy < input.rows; cy++) {
    for (let cx = 0; cx < input.cols; cx++) {
      let mask = 0;
      for (const dot of BRAILLE_DOTS) {
        const px = cx * 2 + dot.col;
        const py = cy * 4 + dot.row;
        if (bits[py * w + px]) mask |= 1 << dot.bit;
      }
      masks[cy * input.cols + cx] = mask;
    }
  }
  return masks;
}

function falloffAt(
  x: number,
  y: number,
  pointerX: number,
  pointerY: number,
  cellCssW: number,
  cellCssH: number,
  radius: number,
  influence: number,
): number {
  if (influence <= 0 || cellCssW <= 0 || cellCssH <= 0) return 0;
  const dist = Math.hypot((x + 0.5) * cellCssW - pointerX, (y + 0.5) * cellCssH - pointerY);
  return influence * radialFalloff(dist, radius);
}

export function buildCells(input: BuildCellsInput): CellField {
  const { cols, rows } = input;
  const count = Math.max(0, cols * rows);
  const indices = new Uint8Array(count);
  const instances = new Float32Array(count * 6);
  const levels = Math.max(1, input.levels);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const fall = falloffAt(
        x,
        y,
        input.pointerX,
        input.pointerY,
        input.cellCssW,
        input.cellCssH,
        input.radius,
        input.influence,
      );
      let luma = 0;
      let rgb: RGB = { r: 0, g: 0, b: 0 };
      let index = 0;

      if (input.kind === 'braille') {
        const useFloyd = input.dither === 'floyd-steinberg' && input.floydBase && fall < 0.02;
        if (useFloyd && input.floydBase) {
          index = input.floydBase[i] ?? 0;
          const sample = sampleRgba(input.rgba, input.sampleWidth, input.sampleHeight, (x + 0.5) / cols, (y + 0.5) / rows);
          const adjusted = adjustRgb(sample.r, sample.g, sample.b, input.contrast, input.brightness, input.invert);
          luma = adjusted.luma;
          rgb = adjusted;
        } else {
          let mask = 0;
          let lumaSum = 0;
          let r = 0;
          let g = 0;
          let b = 0;
          for (const dot of BRAILLE_DOTS) {
            const sample = sampleRgba(
              input.rgba,
              input.sampleWidth,
              input.sampleHeight,
              (x + dot.x) / cols,
              (y + dot.y) / rows,
            );
            const adjusted = adjustRgb(sample.r, sample.g, sample.b, input.contrast, input.brightness, input.invert);
            lumaSum += adjusted.luma;
            r += adjusted.r;
            g += adjusted.g;
            b += adjusted.b;
            let threshold = 0.5;
            if (input.dither === 'bayer') {
              threshold = bayerThreshold(
                Math.floor(((x + dot.x) / cols) * input.sampleWidth),
                Math.floor(((y + dot.y) / rows) * input.sampleHeight),
              );
            }
            if (input.interaction === 'brighten') threshold -= fall * input.strength * 0.55;
            if (adjusted.luma > threshold) mask |= 1 << dot.bit;
          }
          luma = lumaSum / 8;
          rgb = { r: r / 8, g: g / 8, b: b / 8 };
          index = mask;
        }
        if (input.interaction === 'swap') {
          index ^= Math.floor(fall * input.strength * 255) & 255;
        }
      } else {
        const sample = sampleRgba(input.rgba, input.sampleWidth, input.sampleHeight, (x + 0.5) / cols, (y + 0.5) / rows);
        const adjusted = adjustRgb(sample.r, sample.g, sample.b, input.contrast, input.brightness, input.invert);
        luma = adjusted.luma;
        rgb = adjusted;
        if (input.dither === 'floyd-steinberg' && input.floydBase && input.floydBase.length === count) {
          index = input.floydBase[i] ?? 0;
        } else {
          const threshold = input.dither === 'bayer' ? bayerThreshold(x, y) : 0.5;
          index = quantizeLuma(luma, levels, threshold);
        }
        if (input.interaction === 'brighten') {
          index = Math.min(levels - 1, Math.round(index + fall * input.strength * (levels - 1) * 0.7));
        } else if (input.interaction === 'swap' && levels > 0) {
          const shift = fall * input.strength * (levels - 1);
          index = Math.floor(index + shift + 0.5) % levels;
          if (index < 0) index += levels;
        }
      }

      let dx = 0;
      let dy = 0;
      if (input.interaction === 'repel' && fall > 0 && input.cellCssW > 0 && input.cellCssH > 0) {
        const cx = (x + 0.5) * input.cellCssW - input.pointerX;
        const cy = (y + 0.5) * input.cellCssH - input.pointerY;
        const dist = Math.hypot(cx, cy) || 0.0001;
        const mag = fall * input.strength * 1.85 * input.cellCssH;
        const dirx = cx / dist;
        const diry = cy / dist;
        const swirl = 0.42;
        dx = ((dirx + diry * swirl) * mag) / input.cellCssW;
        dy = ((diry - dirx * swirl) * mag) / input.cellCssH;
      }

      const ink = inkColor(input.colorMode, luma, rgb, input.fg, input.bg);
      const o = i * 6;
      instances[o] = x + dx;
      instances[o + 1] = y + dy;
      instances[o + 2] = index;
      instances[o + 3] = ink.r;
      instances[o + 4] = ink.g;
      instances[o + 5] = ink.b;
      indices[i] = index;
    }
  }

  return { indices, instances };
}

export function indicesToText(indices: Uint8Array, cols: number, rows: number, chars: readonly string[]): string {
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    const row = y * cols;
    for (let x = 0; x < cols; x++) {
      line += chars[indices[row + x] ?? 0] ?? ' ';
    }
    lines.push(line);
  }
  return lines.join('\n');
}
