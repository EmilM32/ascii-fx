import { describe, expect, it } from 'vitest';
import { parseColor } from '../src/color';
import { sanitizeOptions } from '../src/attributes';
import { CHARSET_PRESETS, resolveCharset } from '../src/charset';
import { adjustLuma, adjustRgb, luminance } from '../src/luminance';
import { quantizeLuma } from '../src/dither';
import { buildCells, indicesToText } from '../src/raster';

describe('luminance', () => {
  it('treats white as 1 and black as 0', () => {
    expect(luminance(1, 1, 1)).toBeCloseTo(1);
    expect(luminance(0, 0, 0)).toBe(0);
  });

  it('weights green above red and blue', () => {
    expect(luminance(0, 1, 0)).toBeGreaterThan(luminance(1, 0, 0));
    expect(luminance(1, 0, 0)).toBeGreaterThan(luminance(0, 0, 1));
  });
});

describe('adjustRgb', () => {
  it('raises black when brightness is added', () => {
    const color = adjustRgb(0, 0, 0, 1, 0.25, false);
    expect(color.luma).toBeCloseTo(0.25);
    expect(color.r).toBeCloseTo(0.25);
  });

  it('inverts before contrast', () => {
    const color = adjustRgb(1, 1, 1, 1, 0, true);
    expect(color.luma).toBeCloseTo(0);
  });

  it('pushes mid gray apart with contrast', () => {
    expect(adjustLuma(0.75, 2, 0, false)).toBeCloseTo(1);
    expect(adjustLuma(0.25, 2, 0, false)).toBeCloseTo(0);
  });
});

describe('glyph mapping', () => {
  const charset = CHARSET_PRESETS.classic;

  it('sends the ends of the ramp to the first and last characters', () => {
    expect(charset[quantizeLuma(0, charset.length, 0.5)]).toBe(' ');
    expect(charset[quantizeLuma(1, charset.length, 0.5)]).toBe('@');
  });

  it('picks a middle character for mid gray', () => {
    const index = quantizeLuma(0.5, charset.length, 0.5);
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(charset.length - 1);
  });

  it('renders a black and white pair as space and the brightest glyph', () => {
    const chars = [' ', '#'];
    const field = buildCells({
      rgba: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
      sampleWidth: 2,
      sampleHeight: 1,
      cols: 2,
      rows: 1,
      kind: 'glyphs',
      levels: chars.length,
      dither: 'none',
      contrast: 1,
      brightness: 0,
      invert: false,
      colorMode: 'mono',
      fg: { r: 1, g: 1, b: 1 },
      bg: { r: 0, g: 0, b: 0 },
      interaction: 'none',
      pointerX: 0,
      pointerY: 0,
      cellCssW: 10,
      cellCssH: 10,
      radius: 40,
      strength: 1,
      influence: 0,
      floydBase: null,
    });
    expect(indicesToText(field.indices, 2, 1, chars)).toBe(' #');
  });

  it('scatters a cell away from the pointer without changing its character', () => {
    const chars = [' ', '#'];
    const base = {
      rgba: new Uint8ClampedArray([255, 255, 255, 255]),
      sampleWidth: 1,
      sampleHeight: 1,
      cols: 1,
      rows: 1,
      kind: 'glyphs' as const,
      levels: chars.length,
      dither: 'none' as const,
      contrast: 1,
      brightness: 0,
      invert: false,
      colorMode: 'mono' as const,
      fg: { r: 1, g: 1, b: 1 },
      bg: { r: 0, g: 0, b: 0 },
      pointerX: -30,
      pointerY: -30,
      cellCssW: 10,
      cellCssH: 10,
      radius: 80,
      strength: 1,
      floydBase: null,
    };
    const still = buildCells({ ...base, interaction: 'none', influence: 0 });
    const moved = buildCells({ ...base, interaction: 'repel', influence: 1 });
    expect(moved.indices[0]).toBe(still.indices[0]);
    expect(moved.instances[0]).toBeGreaterThan(0.2);
    expect(moved.instances[1]).toBeGreaterThan(0.2);
  });
});

describe('charset presets', () => {
  it('resolves braille to the 256 pattern block', () => {
    const braille = resolveCharset('braille');
    expect(braille.kind).toBe('braille');
    expect(braille.chars).toHaveLength(256);
    expect(braille.chars[0]).toBe('\u2800');
    expect(braille.chars[255]).toBe('\u28ff');
  });

  it('keeps a custom ramp in order and caps it', () => {
    const custom = resolveCharset(' .#');
    expect(custom.kind).toBe('glyphs');
    expect(custom.chars).toEqual([' ', '.', '#']);
  });

  it('keeps the leading space of a custom ramp through the options', () => {
    const charset = sanitizeOptions({ charset: ' xo' }).charset;
    expect(resolveCharset(charset).chars).toEqual([' ', 'x', 'o']);
    expect(sanitizeOptions({ charset: '   ' }).charset).toBe('classic');
  });

  it('treats a ramp named like an object property as glyphs', () => {
    expect(resolveCharset('constructor').chars).toEqual(Array.from('constructor'));
  });

  it('includes a literal backslash in the standard ramp', () => {
    expect(CHARSET_PRESETS.standard.includes('\\')).toBe(true);
    expect(CHARSET_PRESETS.classic.startsWith(' ')).toBe(true);
  });
});

describe('parseColor', () => {
  it('parses short and long hex', () => {
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(parseColor('#e2ff3d')).toEqual({ r: 0xe2 / 255, g: 1, b: 0x3d / 255 });
  });

  it('parses rgb()', () => {
    expect(parseColor('rgb(0, 128, 255)')).toEqual({ r: 0, g: 128 / 255, b: 1 });
  });
});
