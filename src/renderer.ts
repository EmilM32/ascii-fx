import { sanitizeOptions } from './attributes';
import { buildAtlas, measureCharAspect, type GlyphAtlas } from './atlas';
import { parseColor, cssColor, type RGB } from './color';
import { resolveCharset, type ResolvedCharset } from './charset';
import { resolveDither } from './dither';
import { fitRect } from './fit';
import {
  BRAILLE_DOTS,
  brailleFloydMasks,
  buildCells,
  glyphFloydIndices,
  glyphLumaField,
  indicesToText,
} from './raster';
import { GLYPH_FS, GLYPH_VS, HALFTONE_FS, HALFTONE_VS } from './shaders';
import type { AsciiFx, AsciiFxOptions, AsciiFxSnapshot, AsciiFxSource, DitherMode, InteractionMode, ResolvedAsciiFxOptions } from './types';

const VIDEO_URL = /\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i;

class Spring2 {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  tx = 0;
  ty = 0;

  snap(x: number, y: number) {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.vx = this.vy = 0;
  }

  set(x: number, y: number) {
    this.tx = x;
    this.ty = y;
  }

  step(dt: number, stiffness: number, damping: number) {
    const ax = (this.tx - this.x) * stiffness - this.vx * damping;
    const ay = (this.ty - this.y) * stiffness - this.vy * damping;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  settled(): boolean {
    return Math.hypot(this.vx, this.vy) < 6 && Math.hypot(this.tx - this.x, this.ty - this.y) < 0.8;
  }
}

class Spring1 {
  x = 0;
  v = 0;
  t = 0;

  snap(x: number) {
    this.x = this.t = x;
    this.v = 0;
  }

  set(x: number) {
    this.t = x;
  }

  step(dt: number, stiffness: number, damping: number) {
    const a = (this.t - this.x) * stiffness - this.v * damping;
    this.v += a * dt;
    this.x += this.v * dt;
  }

  settled(): boolean {
    return Math.abs(this.v) < 0.03 && Math.abs(this.t - this.x) < 0.015;
  }
}

interface LoadedSource {
  image: CanvasImageSource;
  animated: boolean;
  ownedVideo?: HTMLVideoElement;
}

function sourceSize(src: CanvasImageSource): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
  if (src instanceof HTMLCanvasElement) return { w: src.width, h: src.height };
  if (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) return { w: src.width, h: src.height };
  const sized = src as { width?: number; height?: number };
  return { w: Number(sized.width) || 0, h: Number(sized.height) || 0 };
}

function withCors(url: string): boolean {
  return /^https?:/i.test(url);
}

function loadImageUrl(url: string): Promise<LoadedSource> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (withCors(url)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ image: img, animated: false });
    img.onerror = () => reject(new Error(`Could not load image ${url}`));
    img.src = url;
  });
}

async function loadVideoUrl(url: string, autoplay: boolean): Promise<LoadedSource> {
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = autoplay;
  video.preload = 'auto';
  if (withCors(url)) video.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error(`Could not load video ${url}`)), { once: true });
    video.src = url;
  });
  try {
    await video.play();
  } catch {
    // Autoplay can be blocked until a gesture. The current frame still draws.
  }
  if (!autoplay) video.pause();
  return { image: video, animated: true, ownedVideo: video };
}

async function resolveSource(source: AsciiFxSource, autoplay: boolean): Promise<LoadedSource> {
  if (typeof source === 'string') {
    return VIDEO_URL.test(source) ? loadVideoUrl(source, autoplay) : loadImageUrl(source);
  }
  if (typeof MediaStream !== 'undefined' && source instanceof MediaStream) {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = source;
    await video.play();
    return { image: video, animated: true, ownedVideo: video };
  }
  if (source instanceof HTMLVideoElement) {
    if (source.readyState < 2) {
      await new Promise<void>((resolve, reject) => {
        const ok = () => resolve();
        const bad = () => reject(new Error('Could not read the video'));
        source.addEventListener('loadeddata', ok, { once: true });
        source.addEventListener('error', bad, { once: true });
      });
    }
    return { image: source, animated: true };
  }
  if (source instanceof HTMLImageElement) {
    if (!source.complete) await source.decode();
    return { image: source, animated: false };
  }
  if (source instanceof HTMLCanvasElement) return { image: source, animated: true };
  throw new Error('Unsupported source');
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create a shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Shader compile failed';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create a program');
  const vert = compile(gl, gl.VERTEX_SHADER, vs);
  const frag = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'Program link failed';
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

class Renderer {
  readonly canvas: HTMLCanvasElement;
  private readonly createdCanvas: boolean;
  private readonly observeTarget: HTMLElement;
  private options: ResolvedAsciiFxOptions;
  private charset: ResolvedCharset;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private glyphProg: WebGLProgram | null = null;
  private halfProg: WebGLProgram | null = null;
  private quadBuf: WebGLBuffer | null = null;
  private clipBuf: WebGLBuffer | null = null;
  private instanceBuf: WebGLBuffer | null = null;
  private atlasTex: WebGLTexture | null = null;
  private sourceTex: WebGLTexture | null = null;
  private atlas: GlyphAtlas | null = null;
  private atlasKey = '';
  private readonly sample: HTMLCanvasElement;
  private readonly sampleCtx: CanvasRenderingContext2D;
  private sampleRGBA: Uint8ClampedArray | null = null;
  private frameSource: CanvasImageSource | null = null;
  private ownedVideo: HTMLVideoElement | null = null;
  private pausedVideo: HTMLVideoElement | null = null;
  private loadToken = 0;
  private cols = 0;
  private rows = 0;
  private cellW = 8;
  private cellH = 12;
  private layoutKey = '';
  private needsCapture = true;
  private floydDirty = true;
  private floydBase: Uint8Array | null = null;
  private lastIndices: Uint8Array | null = null;
  private raf = 0;
  private playing = true;
  private visible = true;
  private pageHidden = false;
  private alive = true;
  private seenPointer = false;
  private readonly pointer = new Spring2();
  private readonly influence = new Spring1();
  private then = 0;
  private lastDraw = 0;
  private frames = 0;
  private fpsT = 0;
  private fps = 0;
  private readyFired = false;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private readonly motionQuery: MediaQueryList | null;

  constructor(target: HTMLElement, options?: Partial<AsciiFxOptions>) {
    this.options = sanitizeOptions(options ?? {});
    this.charset = resolveCharset(this.options.charset);
    if (target instanceof HTMLCanvasElement) {
      this.canvas = target;
      this.createdCanvas = false;
      this.observeTarget = target;
    } else {
      const canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.setAttribute('aria-hidden', 'true');
      target.appendChild(canvas);
      this.canvas = canvas;
      this.createdCanvas = true;
      this.observeTarget = target;
    }
    if (!this.createdCanvas && !this.canvas.getAttribute('aria-label')) {
      this.canvas.setAttribute('role', 'img');
      this.canvas.setAttribute('aria-label', 'ASCII rendering');
    }
    this.sample = document.createElement('canvas');
    const sampleCtx = this.sample.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!sampleCtx) throw new Error('Could not create a sampling canvas');
    this.sampleCtx = sampleCtx;
    this.initContext();
    this.motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.bind();
    this.playing = !this.options.paused;
    this.layout();
    if (this.options.source !== undefined) void this.load(this.options.source);
    this.poke();
  }

  update(partial: Partial<AsciiFxOptions>) {
    if (!this.alive) return;
    const prev = this.options;
    this.options = sanitizeOptions({ ...prev, ...partial });
    if (partial.source !== undefined && partial.source !== prev.source) void this.load(this.options.source);
    if (this.options.cellSize !== prev.cellSize || this.options.fontFamily !== prev.fontFamily) this.layoutKey = '';
    if (
      this.options.charset !== prev.charset ||
      this.options.contrast !== prev.contrast ||
      this.options.brightness !== prev.brightness ||
      this.options.invert !== prev.invert ||
      this.options.dither !== prev.dither ||
      this.options.fit !== prev.fit ||
      this.options.fontFamily !== prev.fontFamily
    ) {
      this.needsCapture = true;
      this.floydDirty = true;
      this.atlasKey = '';
    }
    if (partial.paused === true) this.pause();
    else if (partial.paused === false) this.play();
    else this.syncPlayback();
    this.poke();
  }

  play() {
    if (!this.alive) return;
    this.playing = true;
    this.options = { ...this.options, paused: false };
    this.syncPlayback();
    this.poke();
  }

  pause() {
    if (!this.alive) return;
    this.playing = false;
    this.options = { ...this.options, paused: true };
    this.syncPlayback();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.unbind();
    this.detachOwned();
    if (this.pausedVideo && this.pausedVideo.paused) void this.pausedVideo.play().catch(() => undefined);
    const gl = this.gl;
    if (gl) {
      const lose = gl.getExtension('WEBGL_lose_context');
      lose?.loseContext();
    }
    if (this.createdCanvas) this.canvas.remove();
  }

  async toPNG(): Promise<Blob> {
    this.draw();
    const blob = await new Promise<Blob | null>((resolve) => {
      this.canvas.toBlob((value) => resolve(value), 'image/png');
    });
    if (!blob) throw new Error('Could not encode PNG');
    return blob;
  }

  toText(): string {
    if (!this.lastIndices || this.displayDither() === 'halftone') this.drawText();
    const text = this.lastIndices ? indicesToText(this.lastIndices, this.cols, this.rows, this.charset.chars) : '';
    this.needsCapture = true;
    this.poke();
    return text;
  }

  getSnapshot(): AsciiFxSnapshot {
    return {
      options: { ...this.options },
      cols: this.cols,
      rows: this.rows,
      renderer: this.gl ? 'webgl2' : 'canvas2d',
      fps: Math.round(this.fps),
      active: this.raf !== 0,
      dither: this.displayDither(),
      charset: this.charset.label,
    };
  }

  private initContext() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) {
      this.ctx2d = this.canvas.getContext('2d', { alpha: false });
      if (!this.ctx2d) throw new Error('Could not get a canvas context');
      return;
    }
    this.gl = gl;
    try {
      this.glyphProg = link(gl, GLYPH_VS, GLYPH_FS);
      this.halfProg = link(gl, HALFTONE_VS, HALFTONE_FS);
    } catch (error) {
      console.error(error);
      this.glyphProg = null;
      this.halfProg = null;
    }
    this.quadBuf = gl.createBuffer();
    this.clipBuf = gl.createBuffer();
    this.instanceBuf = gl.createBuffer();
    this.atlasTex = gl.createTexture();
    this.sourceTex = gl.createTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.clipBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]));
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.DITHER);
  }

  private bind() {
    this.resizeObserver = new ResizeObserver(() => {
      this.layoutKey = '';
      this.poke();
    });
    this.resizeObserver.observe(this.observeTarget);
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        this.visible = entries.some((entry) => entry.isIntersecting);
        this.syncPlayback();
        this.poke();
      });
      this.intersectionObserver.observe(this.canvas);
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.motionQuery?.addEventListener('change', this.onMotion);
    void document.fonts?.ready.then(() => {
      if (!this.alive) return;
      this.layoutKey = '';
      this.atlasKey = '';
      this.poke();
    });
  }

  private unbind() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.motionQuery?.removeEventListener('change', this.onMotion);
  }

  private onVisibility = () => {
    this.pageHidden = document.hidden;
    this.syncPlayback();
    this.poke();
  };

  private onMotion = () => {
    this.syncPlayback();
    this.needsCapture = true;
    this.poke();
  };

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') this.canvas.setPointerCapture(event.pointerId);
    this.track(event, true);
  };

  private onPointerMove = (event: PointerEvent) => {
    const hover = event.pointerType === 'mouse' || event.buttons > 0;
    this.track(event, hover);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') this.track(event, false);
  };

  private onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') this.track(event, false);
  };

  private track(event: PointerEvent, inside: boolean) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (!this.seenPointer || this.motionReduced()) this.pointer.snap(x, y);
    else this.pointer.set(x, y);
    this.seenPointer = true;
    if (this.motionReduced()) this.influence.snap(inside ? 1 : 0);
    else this.influence.set(inside ? 1 : 0);
    this.poke();
  }

  private motionReduced(): boolean {
    if (this.options.reducedMotion === 'allow') return false;
    if (this.options.reducedMotion === 'reduce') return true;
    return this.motionQuery?.matches ?? false;
  }

  private currentInteraction(): InteractionMode {
    if (this.motionReduced()) return 'none';
    return this.options.interaction;
  }

  private displayDither(): DitherMode {
    return resolveDither(this.options.dither, this.isLive());
  }

  private isLive(): boolean {
    const src = this.frameSource;
    if (!src || this.motionReduced() || !this.playing || !this.visible || this.pageHidden) return false;
    if (src instanceof HTMLVideoElement) return !src.paused && src.readyState >= 2;
    if (src instanceof HTMLCanvasElement) return true;
    return false;
  }

  private syncPlayback() {
    const video = this.frameSource instanceof HTMLVideoElement ? this.frameSource : null;
    if (!video) return;
    const hold = !this.playing || !this.visible || this.pageHidden || this.motionReduced();
    if (hold) {
      if (!video.paused) {
        video.pause();
        this.pausedVideo = video;
      }
      return;
    }
    if (video.paused && (video === this.ownedVideo || video === this.pausedVideo)) {
      void video.play().catch(() => undefined);
      if (this.pausedVideo === video) this.pausedVideo = null;
    }
  }

  private detachOwned() {
    const video = this.ownedVideo;
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.srcObject = null;
    video.load();
    this.ownedVideo = null;
    if (this.frameSource === video) this.frameSource = null;
  }

  private async load(source: AsciiFxSource | undefined) {
    const token = ++this.loadToken;
    this.detachOwned();
    this.frameSource = null;
    this.sampleRGBA = null;
    this.lastIndices = null;
    this.readyFired = false;
    this.needsCapture = true;
    if (source == null || source === '') {
      this.poke();
      return;
    }
    try {
      const loaded = await resolveSource(source, !this.motionReduced());
      if (!this.alive || token !== this.loadToken) {
        loaded.ownedVideo?.pause();
        return;
      }
      this.frameSource = loaded.image;
      this.ownedVideo = loaded.ownedVideo ?? null;
      this.needsCapture = true;
      this.floydDirty = true;
      this.syncPlayback();
      this.poke();
    } catch (error) {
      if (!this.alive || token !== this.loadToken) return;
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(err);
    }
  }

  private poke() {
    if (!this.alive || this.raf) return;
    this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number) => {
    this.raf = 0;
    if (!this.alive) return;
    const fps = this.options.fps;
    const minDelta = fps > 0 ? 1000 / fps : 0;
    if (this.lastDraw !== 0 && minDelta && now - this.lastDraw < minDelta - 0.5) {
      if (this.shouldContinue()) this.raf = requestAnimationFrame(this.loop);
      return;
    }
    const dt = Math.min(0.05, this.then ? (now - this.then) / 1000 : 0.016);
    this.then = now;
    if (!this.motionReduced()) {
      this.pointer.step(dt, 280, 22);
      this.influence.step(dt, 420, 28);
    }
    this.draw();
    this.lastDraw = now;
    if (this.shouldContinue()) this.raf = requestAnimationFrame(this.loop);
  };

  private shouldContinue(): boolean {
    if (!this.alive || !this.playing || !this.visible || this.pageHidden) return false;
    if (this.isLive() || this.needsCapture) return true;
    if (this.currentInteraction() !== 'none' && (!this.pointer.settled() || !this.influence.settled())) return true;
    return false;
  }

  private aspectFont = '';
  private aspect = 0.6;

  private charAspect(): number {
    if (this.aspectFont !== this.options.fontFamily) {
      this.aspect = measureCharAspect(this.options.fontFamily, 64);
      this.aspectFont = this.options.fontFamily;
    }
    return this.aspect;
  }

  private layout() {
    const cssW = this.observeTarget.clientWidth;
    const cssH = this.observeTarget.clientHeight;
    if (cssW < 2 || cssH < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const aspect = this.charAspect();
    let scale = dpr;
    let cellH = 0;
    let cellW = 0;
    let cols = 0;
    let rows = 0;
    for (let guard = 0; guard < 8; guard++) {
      cellH = Math.max(4, Math.round(this.options.cellSize * scale));
      cellW = Math.max(2, Math.round(cellH * aspect));
      cols = Math.max(1, Math.floor((cssW * scale) / cellW));
      rows = Math.max(1, Math.floor((cssH * scale) / cellH));
      if ((cols * cellW <= 1440 && rows * cellH <= 900) || scale <= 0.75) break;
      scale *= 0.85;
    }
    const key = `${cols}x${rows}:${cellW}x${cellH}:${this.options.fontFamily}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    this.cols = cols;
    this.rows = rows;
    this.cellW = cellW;
    this.cellH = cellH;
    this.canvas.width = Math.max(1, cols * cellW);
    this.canvas.height = Math.max(1, rows * cellH);
    this.needsCapture = true;
    this.floydDirty = true;
    this.atlasKey = '';
  }

  private photoSize(): { w: number; h: number } {
    const cssW = Math.max(2, this.observeTarget.clientWidth || this.canvas.width);
    const cssH = Math.max(2, this.observeTarget.clientHeight || this.canvas.height);
    const limit = 960;
    if (cssW >= cssH) {
      const w = Math.min(limit, Math.round(cssW));
      return { w: Math.max(2, w), h: Math.max(2, Math.round(w * (cssH / cssW))) };
    }
    const h = Math.min(limit, Math.round(cssH));
    return { w: Math.max(2, Math.round(h * (cssW / cssH))), h: Math.max(2, h) };
  }

  private capture(mode: 'grid' | 'photo'): boolean {
    const src = this.frameSource;
    if (!src) return false;
    if (src instanceof HTMLVideoElement && src.readyState < 2) return false;
    const size = sourceSize(src);
    if (size.w < 2 || size.h < 2) return false;
    const target = mode === 'photo' ? this.photoSize() : this.gridSampleSize();
    if (this.sample.width !== target.w || this.sample.height !== target.h) {
      this.sample.width = target.w;
      this.sample.height = target.h;
    }
    const ctx = this.sampleCtx;
    ctx.fillStyle = this.options.background;
    ctx.fillRect(0, 0, target.w, target.h);
    const rect = fitRect(size.w, size.h, target.w, target.h, this.options.fit);
    if (rect.sw <= 0 || rect.sh <= 0) return false;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh);
    if (mode === 'grid') this.sampleRGBA = ctx.getImageData(0, 0, target.w, target.h).data;
    return true;
  }

  private gridSampleSize(): { w: number; h: number } {
    if (this.charset.kind === 'braille') return { w: this.cols * 2, h: this.rows * 4 };
    return { w: this.cols, h: this.rows };
  }

  private rebuildFloyd() {
    if (!this.sampleRGBA) return;
    const common = {
      rgba: this.sampleRGBA,
      sampleWidth: this.sample.width,
      sampleHeight: this.sample.height,
      cols: this.cols,
      rows: this.rows,
      contrast: this.options.contrast,
      brightness: this.options.brightness,
      invert: this.options.invert,
    };
    this.floydBase =
      this.charset.kind === 'braille'
        ? brailleFloydMasks(common)
        : glyphFloydIndices(glyphLumaField(common), this.cols, this.rows, this.charset.chars.length);
  }

  private pointerSpace(): { x: number; y: number; cellW: number; cellH: number; influence: number } {
    const rect = this.canvas.getBoundingClientRect();
    const cellW = rect.width / Math.max(1, this.cols);
    const cellH = rect.height / Math.max(1, this.rows);
    const interaction = this.currentInteraction();
    return {
      x: this.pointer.x,
      y: this.pointer.y,
      cellW,
      cellH,
      influence: interaction === 'none' ? 0 : this.influence.x,
    };
  }

  private draw() {
    if (!this.alive) return;
    this.charset = resolveCharset(this.options.charset);
    this.layout();
    if (this.cols < 1 || this.rows < 1 || this.canvas.width < 2 || this.canvas.height < 2) {
      this.clear();
      return;
    }
    const dither = this.displayDither();
    const halftone = dither === 'halftone' && this.gl !== null && this.halfProg !== null;
    if (this.needsCapture || this.isLive()) {
      const ok = this.capture(halftone ? 'photo' : 'grid');
      if (!ok) {
        this.needsCapture = this.frameSource != null;
        this.clear();
        return;
      }
      this.needsCapture = false;
      if (!this.isLive()) this.floydDirty = true;
    }
    if (halftone) {
      this.drawHalftone();
      this.noteFrame();
      this.maybeReady();
      return;
    }
    if (!this.sampleRGBA) {
      this.clear();
      return;
    }
    if (dither === 'floyd-steinberg' && this.floydDirty) {
      this.rebuildFloyd();
      this.floydDirty = false;
    }
    const space = this.pointerSpace();
    const fg = parseColor(this.options.foreground);
    const bg = parseColor(this.options.background);
    const field = buildCells({
      rgba: this.sampleRGBA,
      sampleWidth: this.sample.width,
      sampleHeight: this.sample.height,
      cols: this.cols,
      rows: this.rows,
      kind: this.charset.kind,
      levels: this.charset.chars.length,
      dither: dither === 'halftone' ? 'none' : dither,
      contrast: this.options.contrast,
      brightness: this.options.brightness,
      invert: this.options.invert,
      colorMode: this.options.color,
      fg,
      bg,
      interaction: this.currentInteraction(),
      pointerX: space.x,
      pointerY: space.y,
      cellCssW: space.cellW,
      cellCssH: space.cellH,
      radius: this.options.radius,
      strength: this.options.strength,
      influence: space.influence,
      floydBase: dither === 'floyd-steinberg' ? this.floydBase : null,
    });
    this.lastIndices = field.indices;
    if (this.gl && this.glyphProg) this.drawGlyphs(field.instances, this.cols * this.rows, bg);
    else if (this.ctx2d) this.paint2D(this.ctx2d, field, bg);
    else this.clear();
    this.noteFrame();
    this.maybeReady();
  }

  private drawText() {
    this.charset = resolveCharset(this.options.charset);
    this.layout();
    if (!this.frameSource || this.cols < 1 || this.rows < 1) return;
    const previous = this.sampleRGBA;
    const ok = this.capture('grid');
    if (!ok || !this.sampleRGBA) {
      this.sampleRGBA = previous;
      return;
    }
    const dither = this.displayDither();
    const textDither = dither === 'halftone' ? 'none' : dither;
    if (textDither === 'floyd-steinberg') this.rebuildFloyd();
    const space = this.pointerSpace();
    const field = buildCells({
      rgba: this.sampleRGBA,
      sampleWidth: this.sample.width,
      sampleHeight: this.sample.height,
      cols: this.cols,
      rows: this.rows,
      kind: this.charset.kind,
      levels: this.charset.chars.length,
      dither: textDither,
      contrast: this.options.contrast,
      brightness: this.options.brightness,
      invert: this.options.invert,
      colorMode: this.options.color,
      fg: parseColor(this.options.foreground),
      bg: parseColor(this.options.background),
      interaction: this.currentInteraction(),
      pointerX: space.x,
      pointerY: space.y,
      cellCssW: space.cellW,
      cellCssH: space.cellH,
      radius: this.options.radius,
      strength: this.options.strength,
      influence: space.influence,
      floydBase: textDither === 'floyd-steinberg' ? this.floydBase : null,
    });
    this.lastIndices = field.indices;
  }

  private clear() {
    const bg = parseColor(this.options.background);
    const gl = this.gl;
    if (gl) {
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.BLEND);
      gl.clearColor(bg.r, bg.g, bg.b, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    if (this.ctx2d) {
      this.ctx2d.fillStyle = cssColor(bg);
      this.ctx2d.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private ensureAtlas() {
    const gl = this.gl;
    if (!gl || !this.atlasTex || this.charset.kind === 'braille') return;
    const key = `${this.cellW}x${this.cellH}:${this.options.fontFamily}:${this.charset.label}:${this.charset.chars.join('')}`;
    if (key === this.atlasKey && this.atlas) return;
    this.atlas = buildAtlas(this.charset.chars, this.cellW, this.cellH, this.options.fontFamily);
    this.atlasKey = key;
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    // Canvas row 0 is the top of each glyph. Leave FLIP_Y off so texture v=0
    // stays that top row; the glyph shader samples v increasing downward.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private drawGlyphs(instances: Float32Array, count: number, bg: RGB) {
    const gl = this.gl;
    const program = this.glyphProg;
    if (!gl || !program || !this.quadBuf || !this.instanceBuf) return;
    this.ensureAtlas();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(bg.r, bg.g, bg.b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, instances.subarray(0, count * 6), gl.DYNAMIC_DRAW);
    const stride = 24;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(3, 1);
    gl.uniform2f(gl.getUniformLocation(program, 'uGrid'), this.cols, this.rows);
    gl.uniform1f(gl.getUniformLocation(program, 'uStyle'), this.charset.kind === 'braille' ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(gl.getUniformLocation(program, 'uAtlas'), 0);
    if (this.atlas && this.charset.kind !== 'braille') {
      gl.uniform2f(gl.getUniformLocation(program, 'uAtlasGrid'), this.atlas.cols, this.atlas.rows);
      gl.uniform2f(gl.getUniformLocation(program, 'uSlotPx'), this.atlas.slotW, this.atlas.slotH);
      gl.uniform2f(gl.getUniformLocation(program, 'uCellPx'), this.atlas.cellW, this.atlas.cellH);
      gl.uniform2f(gl.getUniformLocation(program, 'uAtlasPx'), this.atlas.canvas.width, this.atlas.canvas.height);
    } else {
      gl.uniform2f(gl.getUniformLocation(program, 'uAtlasGrid'), 1, 1);
      gl.uniform2f(gl.getUniformLocation(program, 'uSlotPx'), 1, 1);
      gl.uniform2f(gl.getUniformLocation(program, 'uAtlasPx'), 1, 1);
      gl.uniform2f(gl.getUniformLocation(program, 'uCellPx'), this.cellW, this.cellH);
    }
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
  }

  private drawHalftone() {
    const gl = this.gl;
    const program = this.halfProg;
    if (!gl || !program || !this.clipBuf || !this.sourceTex) return;
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    // The fullscreen triangle samples v=0 at the top of the screen.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sample);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? this.canvas.height / rect.height : 1;
    const fg = parseColor(this.options.foreground);
    const bg = parseColor(this.options.background);
    const interaction = this.currentInteraction();
    const mode = interaction === 'repel' ? 1 : interaction === 'brighten' ? 2 : interaction === 'swap' ? 3 : 0;
    const color = this.options.color === 'color' ? 1 : this.options.color === 'duotone' ? 2 : 0;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.clipBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.disableVertexAttribArray(3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform1i(u('uSource'), 0);
    gl.uniform2f(u('uResolution'), this.canvas.width, this.canvas.height);
    gl.uniform2f(u('uPointer'), this.pointer.x * scaleX, this.pointer.y * scaleY);
    gl.uniform1f(u('uRadius'), this.options.radius * scaleY);
    gl.uniform1f(u('uStrength'), this.options.strength);
    gl.uniform1f(u('uInfluence'), interaction === 'none' ? 0 : this.influence.x);
    gl.uniform1f(u('uInteraction'), mode);
    gl.uniform1f(u('uColorMode'), color);
    gl.uniform1f(u('uContrast'), this.options.contrast);
    gl.uniform1f(u('uBrightness'), this.options.brightness);
    gl.uniform1f(u('uInvert'), this.options.invert ? 1 : 0);
    gl.uniform3f(u('uFg'), fg.r, fg.g, fg.b);
    gl.uniform3f(u('uBg'), bg.r, bg.g, bg.b);
    gl.uniform1f(u('uPitch'), Math.max(5, this.cellH * 0.72));
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private paint2D(ctx: CanvasRenderingContext2D, field: { instances: Float32Array; indices: Uint8Array }, bg: RGB) {
    ctx.fillStyle = cssColor(bg);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const chars = this.charset.chars;
    if (this.charset.kind === 'braille') {
      const rad = Math.min(this.cellW, this.cellH) * 0.16;
      const count = this.cols * this.rows;
      for (let i = 0; i < count; i++) {
        const o = i * 6;
        const destX = field.instances[o] ?? 0;
        const destY = field.instances[o + 1] ?? 0;
        const mask = field.instances[o + 2] ?? 0;
        ctx.fillStyle = cssColor({ r: field.instances[o + 3] ?? 1, g: field.instances[o + 4] ?? 1, b: field.instances[o + 5] ?? 1 });
        for (const dot of BRAILLE_DOTS) {
          if ((mask & (1 << dot.bit)) === 0) continue;
          ctx.beginPath();
          ctx.arc((destX + dot.x) * this.cellW, (destY + dot.y) * this.cellH, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return;
    }
    ctx.font = `400 ${Math.max(4, Math.floor(this.cellH * 0.92))}px ${this.options.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const count = this.cols * this.rows;
    for (let i = 0; i < count; i++) {
      const ch = chars[field.indices[i] ?? 0];
      if (!ch || ch === ' ') continue;
      const o = i * 6;
      ctx.fillStyle = cssColor({ r: field.instances[o + 3] ?? 1, g: field.instances[o + 4] ?? 1, b: field.instances[o + 5] ?? 1 });
      ctx.fillText(ch, ((field.instances[o] ?? 0) + 0.5) * this.cellW, ((field.instances[o + 1] ?? 0) + 0.5) * this.cellH);
    }
  }

  private noteFrame() {
    this.frames += 1;
    const now = performance.now();
    if (this.fpsT === 0) this.fpsT = now;
    if (now - this.fpsT >= 400) {
      this.fps = (this.frames * 1000) / (now - this.fpsT);
      this.frames = 0;
      this.fpsT = now;
    }
  }

  private maybeReady() {
    if (this.readyFired || !this.frameSource) return;
    this.readyFired = true;
    this.options.onReady?.();
  }
}

export function createAsciiFx(target: HTMLElement, options?: Partial<AsciiFxOptions>): AsciiFx {
  const renderer = new Renderer(target, options);
  return {
    canvas: renderer.canvas,
    update: (next) => renderer.update(next),
    play: () => renderer.play(),
    pause: () => renderer.pause(),
    destroy: () => renderer.destroy(),
    toPNG: () => renderer.toPNG(),
    toText: () => renderer.toText(),
    getSnapshot: () => renderer.getSnapshot(),
  };
}
