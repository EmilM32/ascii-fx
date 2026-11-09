import { fillCanvas, marksCount, resetMarks, settleFrames } from './dom';
import { afterEach, describe, expect, it } from 'vitest';
import { attributesToOptions, parsePalette, parseRenderMode, parseShape, removedAttributeOptions, sanitizeOptions } from '../src/attributes';
import { halftoneCoverage, halftoneExtent, halftoneScreens, rgbToCmyk } from '../src/halftone';
import { ASCII_FX_DEFAULTS, createAsciiFx, type AsciiFx, type HalftoneShape } from '../src/index';

const SHAPES: HalftoneShape[] = ['dot', 'square', 'line', 'diamond'];

/** Ink share of one cell when every cell has the same tone: the union of the 3×3 neighborhood. */
function cellCoverage(shape: HalftoneShape, darkness: number, steps = 80): number {
  let inside = 0;
  for (let y = 0; y < steps; y++) {
    for (let x = 0; x < steps; x++) {
      const px = (x + 0.5) / steps - 0.5;
      const py = (y + 0.5) / steps - 0.5;
      let hit = 0;
      for (let j = -1; j <= 1 && !hit; j++) {
        for (let i = -1; i <= 1 && !hit; i++) hit = halftoneCoverage(shape, px - i, py - j, darkness);
      }
      inside += hit;
    }
  }
  return inside / (steps * steps);
}

describe('halftone geometry', () => {
  it('draws nothing at zero ink and a solid cell at full ink', () => {
    for (const shape of SHAPES) {
      expect(halftoneExtent(shape, 0)).toBe(0);
      expect(cellCoverage(shape, 0)).toBe(0);
      expect(cellCoverage(shape, 1)).toBe(1);
    }
  });

  it('grows monotonically with darkness', () => {
    for (const shape of SHAPES) {
      let previous = -1;
      for (let d = 0; d <= 1.0001; d += 0.02) {
        const size = halftoneExtent(shape, d);
        expect(size).toBeGreaterThanOrEqual(previous);
        previous = size;
      }
    }
  });

  it('inks the cell in proportion to darkness', () => {
    for (const shape of ['square', 'line', 'diamond'] as const) {
      for (const d of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        expect(cellCoverage(shape, d)).toBeCloseTo(d, 1);
      }
    }
    // Dots are exact until neighbors touch, then close the gaps a little faster.
    for (const d of [0.1, 0.3, 0.5, 0.7]) expect(cellCoverage('dot', d)).toBeCloseTo(d, 1);
    expect(cellCoverage('dot', 0.9)).toBeGreaterThan(0.85);
  });

  it('lets large dots reach into the neighbors, so dark areas nearly merge', () => {
    expect(halftoneExtent('dot', 0.95)).toBeGreaterThan(0.5);
    expect(halftoneExtent('dot', 1)).toBeCloseTo(Math.SQRT2 / 2);
  });
});

describe('cmyk', () => {
  it('separates primaries and keeps white clean', () => {
    expect(rgbToCmyk(1, 1, 1)).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    expect(rgbToCmyk(1, 0, 0)).toEqual({ c: 0, m: 1, y: 1, k: 0 });
    expect(rgbToCmyk(0, 1, 1)).toEqual({ c: 1, m: 0, y: 0, k: 0 });
  });

  it('shares gray between black and the color inks', () => {
    const gray = rgbToCmyk(0.5, 0.5, 0.5);
    expect(gray.k).toBeGreaterThan(0);
    expect(gray.c).toBeGreaterThan(0);
    expect(gray.c).toBeCloseTo(gray.m);
    expect(gray.m).toBeCloseTo(gray.y);
    const black = rgbToCmyk(0, 0, 0);
    expect([black.c, black.m, black.y]).toEqual([1, 1, 1]);
  });

  it('uses the classic screen angles around the black angle', () => {
    const deg = (screens: ReturnType<typeof halftoneScreens>) =>
      Object.fromEntries(screens.map((s) => [s.channel, Math.round((s.angle * 180) / Math.PI)]));
    expect(deg(halftoneScreens('cmyk', 45))).toEqual({ y: 0, c: 15, m: 75, k: 45 });
    expect(deg(halftoneScreens('mono', 30))).toEqual({ k: 30 });
    expect(deg(halftoneScreens('source', 45))).toEqual({ k: 45 });
  });
});

describe('halftone options', () => {
  it('defaults to ascii with a 45° black-on-cream dot screen', () => {
    expect(ASCII_FX_DEFAULTS.mode).toBe('ascii');
    expect(ASCII_FX_DEFAULTS.angle).toBe(45);
    expect(ASCII_FX_DEFAULTS.shape).toBe('dot');
    expect(ASCII_FX_DEFAULTS.palette).toBe('mono');
  });

  it('parses modes, shapes, and palettes with aliases', () => {
    expect(parseRenderMode('HALFTONE')).toBe('halftone');
    expect(parseRenderMode('ascii')).toBe('ascii');
    expect(parseRenderMode('dither')).toBeUndefined();
    expect(parseShape('circle')).toBe('dot');
    expect(parseShape('rhombus')).toBe('diamond');
    expect(parseShape('lines')).toBe('line');
    expect(parsePalette('color')).toBe('source');
    expect(parsePalette('cmyk')).toBe('cmyk');
  });

  it('sanitizes values and keeps the old ones on garbage', () => {
    const base = sanitizeOptions({ mode: 'halftone', angle: 30, shape: 'square', palette: 'cmyk' });
    const next = sanitizeOptions({ mode: 'nope' as never, angle: Number.NaN, shape: 'star' as never, palette: 'rgb' as never, ink: ' ' }, base);
    expect(next.mode).toBe('halftone');
    expect(next.angle).toBe(30);
    expect(next.shape).toBe('square');
    expect(next.palette).toBe('cmyk');
    expect(next.ink).toBe(ASCII_FX_DEFAULTS.ink);
    expect(sanitizeOptions({ angle: 9999 }).angle).toBe(360);
  });

  it('reads and resets halftone attributes', () => {
    const attrs: Record<string, string> = { mode: 'halftone', angle: '15', shape: 'line', palette: 'source', ink: '#123', paper: 'white' };
    expect(attributesToOptions((name) => attrs[name] ?? null)).toEqual({
      mode: 'halftone',
      angle: 15,
      shape: 'line',
      palette: 'source',
      ink: '#123',
      paper: 'white',
    });
    expect(removedAttributeOptions('mode')).toEqual({ mode: 'ascii' });
    expect(removedAttributeOptions('paper')).toEqual({ paper: ASCII_FX_DEFAULTS.paper });
  });
});

describe('halftone renderer (Canvas2D)', () => {
  const live: AsciiFx[] = [];

  afterEach(() => {
    for (const fx of live) fx.destroy();
    live.length = 0;
  });

  async function render(r: number, options: Parameters<typeof createAsciiFx>[1] = {}) {
    const source = document.createElement('canvas');
    source.width = 32;
    source.height = 32;
    fillCanvas(source, r, r, r);
    const fx = createAsciiFx(document.createElement('canvas'), {
      source,
      mode: 'halftone',
      cellSize: 8,
      // Fake frames arrive faster than any cap; draw each one.
      fps: 0,
      interaction: 'none',
      reducedMotion: 'reduce',
      onError: (error) => {
        throw error;
      },
      ...options,
    });
    live.push(fx);
    resetMarks();
    await settleFrames();
    return fx;
  }

  it('draws dots for a dark source and none for white paper', async () => {
    const dark = await render(0);
    expect(dark.getSnapshot().mode).toBe('halftone');
    expect(dark.getSnapshot().renderer).toBe('canvas2d');
    expect(marksCount()).toBeGreaterThan(20);

    await render(255);
    expect(marksCount()).toBe(0);
  });

  it('draws four screens in cmyk', async () => {
    await render(60, { palette: 'mono' });
    const mono = marksCount();
    await render(60, { palette: 'cmyk' });
    expect(marksCount()).toBeGreaterThan(mono * 3);
  });

  it('switches modes without losing the source and still exports text', async () => {
    const fx = await render(0);
    fx.update({ mode: 'ascii' });
    await settleFrames();
    expect(fx.getSnapshot().mode).toBe('ascii');
    fx.update({ mode: 'halftone' });
    resetMarks();
    await settleFrames();
    expect(marksCount()).toBeGreaterThan(20);
    expect(fx.toText().length).toBeGreaterThan(0);
  });
});
