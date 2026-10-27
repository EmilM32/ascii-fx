import { clamp01, smoothstep } from './math';
import type { DitherMode } from './types';

/** 4×4 Bayer matrix, values 0–15. */
export const BAYER_4: readonly [readonly [number, number, number, number], ...readonly [number, number, number, number][]] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Threshold in (0, 1). `(matrix + 0.5) / 16`. */
export function bayerThreshold(x: number, y: number): number {
  const xi = Math.abs(Math.floor(x)) % 4;
  const yi = Math.abs(Math.floor(y)) % 4;
  return (BAYER_4[yi][xi] + 0.5) / 16;
}

/**
 * Map luminance to a glyph index.
 * `threshold` is 0.5 for plain quantization and a Bayer value for ordered dither.
 * `luma` 0 selects the first character and `luma` 1 selects the last.
 */
export function quantizeLuma(luma: number, levels: number, threshold: number): number {
  if (levels <= 1) return 0;
  const x = clamp01(luma) * levels;
  let idx = Math.floor(x);
  const frac = x - idx;
  if (frac > threshold) idx += 1;
  if (idx < 0) return 0;
  if (idx > levels - 1) return levels - 1;
  return idx;
}

/**
 * Floyd–Steinberg error diffusion. `levels` includes both ends, so 2 is black and white.
 * The input is copied. Returns one index per pixel, row-major.
 */
export function floydSteinberg(luma: ArrayLike<number>, width: number, height: number, levels: number): Uint8Array {
  const n = width * height;
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = luma[i] ?? 0;
  const out = new Uint8Array(n);
  if (width <= 0 || height <= 0 || levels <= 1) return out;
  const max = levels - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const sample = buf[i];
      const old = sample < 0 ? 0 : sample > 1 ? 1 : sample;
      let idx = Math.round(old * max);
      if (idx < 0) idx = 0;
      else if (idx > max) idx = max;
      out[i] = idx;
      const err = old - idx / max;
      if (x + 1 < width) buf[i + 1] += err * (7 / 16);
      if (y + 1 < height) {
        if (x > 0) buf[i + width - 1] += err * (3 / 16);
        buf[i + width] += err * (5 / 16);
        if (x + 1 < width) buf[i + width + 1] += err * (1 / 16);
      }
    }
  }
  return out;
}

/** Video crawls under error diffusion, so moving sources use ordered dither instead. */
export function resolveDither(mode: DitherMode, animated: boolean): DitherMode {
  if (mode === 'floyd-steinberg' && animated) return 'bayer';
  return mode;
}

/**
 * Clustered-dot screen. Returns 1 inside a dot and 0 outside.
 * `px` / `py` are in the same pixel space as `pitch`.
 */
export function halftoneDot(px: number, py: number, angle: number, value: number, pitch: number): number {
  const co = Math.cos(angle);
  const si = Math.sin(angle);
  const rx = co * px - si * py;
  const ry = si * px + co * py;
  const step = pitch || 1;
  const fx = rx / step;
  const fy = ry / step;
  const dx = fx - Math.floor(fx) - 0.5;
  const dy = fy - Math.floor(fy) - 0.5;
  const dist = Math.hypot(dx, dy);
  const radius = Math.sqrt(clamp01(value)) * 0.48;
  return 1 - smoothstep(radius - 0.03, radius + 0.03, dist);
}
