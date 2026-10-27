import { describe, expect, it } from 'vitest';
import { attributesToOptions, parseDitherMode } from '../src/attributes';
import { BAYER_4, bayerThreshold, floydSteinberg, halftoneDot, quantizeLuma, resolveDither } from '../src/dither';
import { fitRect } from '../src/fit';
import { buildCells, indicesToText } from '../src/raster';

describe('ordered dither', () => {
  it('matches the Bayer matrix corners', () => {
    expect(BAYER_4[0][0]).toBe(0);
    expect(BAYER_4[1][1]).toBe(4);
    expect(bayerThreshold(0, 0)).toBeCloseTo(0.5 / 16);
    expect(bayerThreshold(4, 5)).toBeCloseTo(bayerThreshold(0, 1));
  });

  it('can promote a dark gray that plain quantization leaves in the first bucket', () => {
    const plain = quantizeLuma(0.05, 10, 0.5);
    const ordered = quantizeLuma(0.05, 10, bayerThreshold(0, 0));
    expect(plain).toBe(0);
    expect(ordered).toBe(1);
  });
});

describe('floyd-steinberg', () => {
  it('preserves flat black and white', () => {
    expect(Array.from(floydSteinberg(new Float32Array(6).fill(0), 3, 2, 2))).toEqual([0, 0, 0, 0, 0, 0]);
    expect(Array.from(floydSteinberg(new Float32Array(4).fill(1), 2, 2, 8))).toEqual([7, 7, 7, 7]);
  });

  it('spreads a mid gray across both levels', () => {
    const out = floydSteinberg(new Float32Array(16).fill(0.5), 4, 4, 2);
    const zeros = Array.from(out).filter((value) => value === 0).length;
    const ones = Array.from(out).filter((value) => value === 1).length;
    expect(zeros).toBeGreaterThan(0);
    expect(ones).toBeGreaterThan(0);
    expect(out.every((value) => value === 0 || value === 1)).toBe(true);
  });

  it('does not mutate the source samples', () => {
    const luma = new Float32Array([0.2, 0.8, 0.4, 0.6]);
    const copy = luma.slice();
    floydSteinberg(luma, 2, 2, 4);
    expect(Array.from(luma)).toEqual(Array.from(copy));
  });

  it('uses Bayer for moving pictures and keeps Floyd for stills', () => {
    expect(resolveDither('floyd-steinberg', true)).toBe('bayer');
    expect(resolveDither('floyd-steinberg', false)).toBe('floyd-steinberg');
    expect(resolveDither('halftone', true)).toBe('halftone');
  });
});

describe('halftone dots', () => {
  it('fills the center of a bright dot and leaves the corner of an empty one', () => {
    expect(halftoneDot(5, 5, 0, 1, 10)).toBeCloseTo(1);
    expect(halftoneDot(0, 0, 0, 0, 10)).toBeCloseTo(0);
    expect(halftoneDot(0, 0, 0, 1, 10)).toBeCloseTo(0);
  });
});

describe('braille masks', () => {
  it('turns every dot on for white and off for black', () => {
    const white = new Uint8ClampedArray(2 * 4 * 4).fill(255);
    const black = new Uint8ClampedArray(2 * 4 * 4).fill(0);
    const common = {
      sampleWidth: 2,
      sampleHeight: 4,
      cols: 1,
      rows: 1,
      kind: 'braille' as const,
      levels: 256,
      dither: 'none' as const,
      contrast: 1,
      brightness: 0,
      invert: false,
      colorMode: 'mono' as const,
      fg: { r: 1, g: 1, b: 1 },
      bg: { r: 0, g: 0, b: 0 },
      interaction: 'none' as const,
      pointerX: 0,
      pointerY: 0,
      cellCssW: 8,
      cellCssH: 16,
      radius: 20,
      strength: 1,
      influence: 0,
      floydBase: null,
    };
    const chars = Array.from({ length: 256 }, (_, i) => String.fromCodePoint(0x2800 + i));
    const on = buildCells({ ...common, rgba: white });
    const off = buildCells({ ...common, rgba: black });
    expect(on.indices[0]).toBe(255);
    expect(off.indices[0]).toBe(0);
    expect(indicesToText(on.indices, 1, 1, chars)).toBe('\u28ff');
    expect(indicesToText(off.indices, 1, 1, chars)).toBe('\u2800');
  });
});

describe('fitRect', () => {
  it('crops a square source to fill a wide frame', () => {
    const rect = fitRect(100, 100, 200, 100, 'cover');
    expect(rect.dx).toBe(0);
    expect(rect.dw).toBe(200);
    expect(rect.sw).toBeCloseTo(100);
    expect(rect.sh).toBeCloseTo(50);
    expect(rect.sy).toBeCloseTo(25);
  });

  it('letterboxes a wide source inside a square', () => {
    const rect = fitRect(200, 100, 100, 100, 'contain');
    expect(rect.sx).toBe(0);
    expect(rect.sw).toBe(200);
    expect(rect.dw).toBeCloseTo(100);
    expect(rect.dh).toBeCloseTo(50);
    expect(rect.dy).toBeCloseTo(25);
  });
});

describe('attributes', () => {
  it('reads the custom element attributes', () => {
    const values: Record<string, string | null> = {
      src: 'portrait.jpg',
      charset: 'blocks',
      'cell-size': '12',
      color: 'original',
      dither: 'floyd',
      interaction: 'scatter',
      invert: '',
      paused: 'false',
      fit: 'contain',
      font: 'monospace',
    };
    expect(attributesToOptions((name) => values[name] ?? null)).toMatchObject({
      source: 'portrait.jpg',
      charset: 'blocks',
      cellSize: 12,
      color: 'color',
      dither: 'floyd-steinberg',
      interaction: 'repel',
      invert: true,
      paused: false,
      fit: 'contain',
      fontFamily: 'monospace',
    });
    expect(parseDitherMode('ordered')).toBe('bayer');
  });
});
