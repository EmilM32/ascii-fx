import type { RGB } from './color';
import { clamp01 } from './math';

/** Rec. 709 relative luminance. Channels are 0–1. */
export function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export interface AdjustedRGB extends RGB {
  luma: number;
}

/**
 * Contrast pivots around mid gray, then brightness is added.
 * Invert runs first so contrast still has a picture to push.
 */
export function adjustRgb(
  r: number,
  g: number,
  b: number,
  contrast: number,
  brightness: number,
  invert: boolean,
): AdjustedRGB {
  let rr = r;
  let gg = g;
  let bb = b;
  if (invert) {
    rr = 1 - rr;
    gg = 1 - gg;
    bb = 1 - bb;
  }
  const l = luminance(rr, gg, bb);
  const l2 = clamp01((l - 0.5) * contrast + 0.5 + brightness);
  if (l <= 1e-4) return { r: l2, g: l2, b: l2, luma: l2 };
  const scale = l2 / l;
  return {
    r: clamp01(rr * scale),
    g: clamp01(gg * scale),
    b: clamp01(bb * scale),
    luma: l2,
  };
}

export function adjustLuma(luma: number, contrast: number, brightness: number, invert: boolean): number {
  const v = invert ? 1 - luma : luma;
  return clamp01((v - 0.5) * contrast + 0.5 + brightness);
}
