export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Smoothstep falloff. 1 at the origin, 0 at `radius`. Matches the halftone shader. */
export function radialFalloff(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  const t = clamp01(1 - distance / radius);
  return t * t * (3 - 2 * t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function pickNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}
