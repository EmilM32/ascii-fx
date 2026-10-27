import type { CharsetPreset } from './types';

export const CHARSET_PRESETS: Record<Exclude<CharsetPreset, 'braille'>, string> = {
  classic: ' .:-=+*#%@',
  standard: " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  shades: ' ▁▂▃▄▅▆▇█',
  minimal: ' .:█',
  binary: '01',
};

const PRESET_NAMES = new Set<string>([...Object.keys(CHARSET_PRESETS), 'braille']);

export interface ResolvedCharset {
  kind: 'glyphs' | 'braille';
  /** Code points, darkest first. Braille is U+2800 through U+28FF. */
  chars: string[];
  label: string;
}

export function splitChars(value: string): string[] {
  return Array.from(value).slice(0, 256);
}

export function brailleCharacters(): string[] {
  const chars: string[] = [];
  for (let i = 0; i < 256; i++) chars.push(String.fromCodePoint(0x2800 + i));
  return chars;
}

function glyphPreset(name: Exclude<CharsetPreset, 'braille'>): ResolvedCharset {
  return { kind: 'glyphs', chars: splitChars(CHARSET_PRESETS[name]), label: name };
}

export function resolveCharset(input: string | undefined): ResolvedCharset {
  if (!input || !input.trim()) return glyphPreset('classic');
  const name = input.trim();
  if (name === 'braille') return { kind: 'braille', chars: brailleCharacters(), label: 'braille' };
  if (Object.prototype.hasOwnProperty.call(CHARSET_PRESETS, name)) return glyphPreset(name as Exclude<CharsetPreset, 'braille'>);
  const chars = splitChars(input);
  if (chars.length === 0) return glyphPreset('classic');
  return { kind: 'glyphs', chars, label: input };
}

export function isPresetName(value: string): value is CharsetPreset {
  return PRESET_NAMES.has(value);
}
