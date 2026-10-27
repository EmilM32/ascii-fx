export type CharsetPreset =
  | 'classic'
  | 'standard'
  | 'blocks'
  | 'shades'
  | 'minimal'
  | 'binary'
  | 'braille';

export type ColorMode = 'mono' | 'color' | 'duotone';

export type DitherMode = 'none' | 'bayer' | 'floyd-steinberg' | 'halftone';

export type InteractionMode = 'none' | 'repel' | 'brighten' | 'swap';

export type FitMode = 'cover' | 'contain';

export type ReducedMotion = 'auto' | 'allow' | 'reduce';

export type AsciiFxSource =
  | string
  | HTMLImageElement
  | HTMLVideoElement
  | HTMLCanvasElement
  | MediaStream;

export interface AsciiFxOptions {
  /** Image, video, canvas, camera stream, or URL (`.mp4` / `.webm` / `.ogg` load as video). */
  source?: AsciiFxSource;
  /** Preset name or a custom ramp, darkest character first. `braille` uses 2×4 dot patterns. */
  charset?: CharsetPreset | string;
  /** Cell height in CSS pixels. Width follows the font's aspect. */
  cellSize?: number;
  fontFamily?: string;
  /** `mono` is flat ink, `color` keeps the source color, `duotone` blends background into foreground. */
  color?: ColorMode;
  foreground?: string;
  background?: string;
  dither?: DitherMode;
  /** 1 is unchanged. */
  contrast?: number;
  /** Added after contrast. 0 is unchanged. */
  brightness?: number;
  invert?: boolean;
  /** Frame cap. `0` draws every animation frame. */
  fps?: number;
  interaction?: InteractionMode;
  /** Pointer radius in CSS pixels. */
  radius?: number;
  /** 0–3. `1` is a full scatter of about two cells at the cursor. */
  strength?: number;
  fit?: FitMode;
  paused?: boolean;
  /** `auto` follows `prefers-reduced-motion`. */
  reducedMotion?: ReducedMotion;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export interface ResolvedAsciiFxOptions {
  source?: AsciiFxSource;
  charset: string;
  cellSize: number;
  fontFamily: string;
  color: ColorMode;
  foreground: string;
  background: string;
  dither: DitherMode;
  contrast: number;
  brightness: number;
  invert: boolean;
  fps: number;
  interaction: InteractionMode;
  radius: number;
  strength: number;
  fit: FitMode;
  paused: boolean;
  reducedMotion: ReducedMotion;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

export const ASCII_FX_DEFAULTS: ResolvedAsciiFxOptions = {
  charset: 'classic',
  cellSize: 8,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  color: 'mono',
  foreground: '#f4f1ea',
  background: '#090909',
  dither: 'none',
  contrast: 1,
  brightness: 0,
  invert: false,
  fps: 60,
  interaction: 'none',
  radius: 140,
  strength: 1,
  fit: 'cover',
  paused: false,
  reducedMotion: 'auto',
};

export interface AsciiFxSnapshot {
  options: ResolvedAsciiFxOptions;
  cols: number;
  rows: number;
  renderer: 'webgl2' | 'canvas2d';
  /** Rolling frames per second while the loop is drawing. */
  fps: number;
  active: boolean;
  /** Dither actually used. Floyd–Steinberg falls back to Bayer on video. */
  dither: DitherMode;
  charset: string;
}

export interface AsciiFx {
  readonly canvas: HTMLCanvasElement;
  update(options: Partial<AsciiFxOptions>): void;
  play(): void;
  pause(): void;
  destroy(): void;
  toPNG(): Promise<Blob>;
  /** Glyph reading of the current frame. Halftone exports the underlying ramp. */
  toText(): string;
  getSnapshot(): AsciiFxSnapshot;
}
