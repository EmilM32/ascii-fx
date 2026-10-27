import { clamp01 } from './math';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i;

export function parseHexOrRgb(input: string): RGB | null {
  const hex = HEX.exec(input.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = Number.parseInt(h, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }
  const rgb = RGB_FN.exec(input.trim());
  if (rgb) {
    return { r: Number(rgb[1]) / 255, g: Number(rgb[2]) / 255, b: Number(rgb[3]) / 255 };
  }
  return null;
}

let namedCanvas: HTMLCanvasElement | null = null;

/** Parse any CSS color. Named colors resolve in the browser and fall back to white elsewhere. */
export function parseColor(input: string): RGB {
  const direct = parseHexOrRgb(input);
  if (direct) return direct;
  if (typeof document !== 'undefined') {
    namedCanvas ??= document.createElement('canvas');
    const ctx = namedCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillStyle = input;
      const resolved = parseHexOrRgb(String(ctx.fillStyle));
      if (resolved) return resolved;
    }
  }
  return { r: 1, g: 1, b: 1 };
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function cssColor(color: RGB): string {
  const c = (n: number) => Math.round(clamp01(n) * 255);
  return `rgb(${c(color.r)}, ${c(color.g)}, ${c(color.b)})`;
}
