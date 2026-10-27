import { pickNumber } from './math';
import { ASCII_FX_DEFAULTS, type AsciiFxOptions, type ColorMode, type DitherMode, type FitMode, type InteractionMode, type ReducedMotion, type ResolvedAsciiFxOptions } from './types';

export const ATTRIBUTE_NAMES = [
  'src',
  'charset',
  'cell-size',
  'color',
  'foreground',
  'background',
  'dither',
  'contrast',
  'brightness',
  'invert',
  'interaction',
  'radius',
  'strength',
  'fps',
  'fit',
  'font',
  'webcam',
  'paused',
] as const;

/** Option each attribute sets. `src` and `webcam` are handled by the element itself. */
const ATTRIBUTE_OPTIONS = {
  charset: 'charset',
  'cell-size': 'cellSize',
  color: 'color',
  foreground: 'foreground',
  background: 'background',
  dither: 'dither',
  contrast: 'contrast',
  brightness: 'brightness',
  invert: 'invert',
  interaction: 'interaction',
  radius: 'radius',
  strength: 'strength',
  fps: 'fps',
  fit: 'fit',
  font: 'fontFamily',
  paused: 'paused',
} as const satisfies Partial<Record<(typeof ATTRIBUTE_NAMES)[number], keyof ResolvedAsciiFxOptions>>;

/** Options that undo a removed attribute: its default, or no source for `src`. */
export function removedAttributeOptions(name: string): Partial<AsciiFxOptions> {
  if (name === 'src') return { source: undefined };
  if (!(name in ATTRIBUTE_OPTIONS)) return {};
  const key = ATTRIBUTE_OPTIONS[name as keyof typeof ATTRIBUTE_OPTIONS];
  return { [key]: ASCII_FX_DEFAULTS[key] };
}

export function parseColorMode(value: string | null | undefined): ColorMode | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'mono') return 'mono';
  if (v === 'color' || v === 'original') return 'color';
  if (v === 'duotone' || v === 'tint') return 'duotone';
  return undefined;
}

export function parseDitherMode(value: string | null | undefined): DitherMode | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'none') return 'none';
  if (v === 'bayer' || v === 'ordered') return 'bayer';
  if (v === 'floyd' || v === 'floyd-steinberg') return 'floyd-steinberg';
  if (v === 'halftone') return 'halftone';
  return undefined;
}

export function parseInteraction(value: string | null | undefined): InteractionMode | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'none') return 'none';
  if (v === 'repel' || v === 'scatter') return 'repel';
  if (v === 'brighten') return 'brighten';
  if (v === 'swap') return 'swap';
  return undefined;
}

export function parseFit(value: string | null | undefined): FitMode | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'cover' || v === 'contain') return v;
  return undefined;
}

export function parseBool(value: string | null): boolean {
  return value !== null && value !== 'false' && value !== '0';
}

export function sanitizeOptions(input: Partial<AsciiFxOptions>, base: ResolvedAsciiFxOptions = ASCII_FX_DEFAULTS): ResolvedAsciiFxOptions {
  const color = parseColorMode(input.color) ?? base.color;
  const dither = parseDitherMode(input.dither) ?? base.dither;
  const interaction = parseInteraction(input.interaction) ?? base.interaction;
  const fit = parseFit(input.fit) ?? base.fit;
  let reducedMotion: ReducedMotion = base.reducedMotion;
  if (input.reducedMotion === 'auto' || input.reducedMotion === 'allow' || input.reducedMotion === 'reduce') {
    reducedMotion = input.reducedMotion;
  }
  const charset = input.charset === undefined ? base.charset : input.charset.trim() || base.charset;
  return {
    source: input.source === undefined ? base.source : input.source,
    charset,
    cellSize: pickNumber(input.cellSize, base.cellSize, 2, 64),
    fontFamily: input.fontFamily?.trim() || base.fontFamily,
    color,
    foreground: input.foreground?.trim() || base.foreground,
    background: input.background?.trim() || base.background,
    dither,
    contrast: pickNumber(input.contrast, base.contrast, 0, 3),
    brightness: pickNumber(input.brightness, base.brightness, -1, 1),
    invert: input.invert ?? base.invert,
    fps: pickNumber(input.fps, base.fps, 0, 120),
    interaction,
    radius: pickNumber(input.radius, base.radius, 1, 2000),
    strength: pickNumber(input.strength, base.strength, 0, 3),
    fit,
    paused: input.paused ?? base.paused,
    reducedMotion,
    onError: input.onError === undefined ? base.onError : input.onError,
    onReady: input.onReady === undefined ? base.onReady : input.onReady,
  };
}

export function attributesToOptions(get: (name: string) => string | null): Partial<AsciiFxOptions> {
  const out: Partial<AsciiFxOptions> = {};
  const src = get('src');
  if (src) out.source = src;
  const charset = get('charset');
  if (charset) out.charset = charset;
  const cell = get('cell-size');
  if (cell != null && cell !== '') out.cellSize = Number(cell);
  const color = parseColorMode(get('color'));
  if (color) out.color = color;
  const foreground = get('foreground');
  if (foreground) out.foreground = foreground;
  const background = get('background');
  if (background) out.background = background;
  const dither = parseDitherMode(get('dither'));
  if (dither) out.dither = dither;
  const contrast = get('contrast');
  if (contrast != null && contrast !== '') out.contrast = Number(contrast);
  const brightness = get('brightness');
  if (brightness != null && brightness !== '') out.brightness = Number(brightness);
  if (get('invert') !== null) out.invert = parseBool(get('invert'));
  const interaction = parseInteraction(get('interaction'));
  if (interaction) out.interaction = interaction;
  const radius = get('radius');
  if (radius != null && radius !== '') out.radius = Number(radius);
  const strength = get('strength');
  if (strength != null && strength !== '') out.strength = Number(strength);
  const fps = get('fps');
  if (fps != null && fps !== '') out.fps = Number(fps);
  const fit = parseFit(get('fit'));
  if (fit) out.fit = fit;
  const font = get('font');
  if (font) out.fontFamily = font;
  if (get('paused') !== null) out.paused = parseBool(get('paused'));
  return out;
}
