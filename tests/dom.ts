/**
 * Minimal DOM for renderer tests. Node has no canvas, and this file stays
 * dependency-free: just enough of document, canvas 2D, and rAF to draw one frame.
 */

let sampleReads = 0;
const rafQueue = new Map<number, FrameRequestCallback>();
let nextRaf = 1;

class FakeElement {
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  attributes = new Map<string, string>();
  clientWidth = 64;
  clientHeight = 48;
  id = '';
  textContent = '';
  shadowRoot: FakeElement | null = null;
  isConnected = true;

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string) {
    return this.attributes.has(name) ? (this.attributes.get(name) ?? '') : null;
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  append(...nodes: FakeElement[]) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild<T extends FakeElement>(child: T) {
    this.children.push(child);
    return child;
  }

  remove() {
    this.isConnected = false;
  }

  replaceChildren() {
    this.children.length = 0;
  }

  attachShadow() {
    this.shadowRoot = new FakeElement();
    return this.shadowRoot;
  }

  addEventListener() {}

  removeEventListener() {}

  dispatchEvent() {
    return true;
  }

  getBoundingClientRect() {
    const width = this.clientWidth;
    const height = this.clientHeight;
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() { return { width, height }; } };
  }
}

class FakeCanvas extends FakeElement {
  pixels: Uint8ClampedArray;
  #width = 300;
  #height = 150;
  #ctx: FakeContext | null = null;

  constructor() {
    super();
    this.pixels = new Uint8ClampedArray(this.#width * this.#height * 4);
  }

  get width() {
    return this.#width;
  }

  set width(value: number) {
    this.#width = Math.max(0, value | 0);
    this.pixels = new Uint8ClampedArray(this.#width * this.#height * 4);
  }

  get height() {
    return this.#height;
  }

  set height(value: number) {
    this.#height = Math.max(0, value | 0);
    this.pixels = new Uint8ClampedArray(this.#width * this.#height * 4);
  }

  getContext(type: string, options?: { willReadFrequently?: boolean }) {
    if (type !== '2d') return null;
    this.#ctx ??= new FakeContext(this, options?.willReadFrequently === true);
    return this.#ctx;
  }
}

class FakeContext {
  font = '';
  fillStyle = '#000000';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  imageSmoothingEnabled = true;
  imageSmoothingQuality: 'low' | 'medium' | 'high' = 'low';

  constructor(
    private readonly canvas: FakeCanvas,
    private readonly sampling: boolean,
  ) {}

  measureText(text: string) {
    const match = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const px = match ? Number(match[1]) : 16;
    return { width: px * 0.55 * text.length };
  }

  clearRect(x: number, y: number, w: number, h: number) {
    this.splat(x, y, w, h, 0, 0, 0, 0);
  }

  fillRect() {}

  fillText() {}

  beginPath() {}

  arc() {}

  fill() {}

  save() {}

  restore() {}

  clip() {}

  rect() {}

  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    if (!(image instanceof FakeCanvas)) return;
    const cx = Math.min(image.width - 1, Math.max(0, Math.floor(sx + sw / 2)));
    const cy = Math.min(image.height - 1, Math.max(0, Math.floor(sy + sh / 2)));
    const i = (cy * image.width + cx) * 4;
    this.splat(dx, dy, dw, dh, image.pixels[i] ?? 0, image.pixels[i + 1] ?? 0, image.pixels[i + 2] ?? 0, image.pixels[i + 3] ?? 0);
  }

  getImageData(x: number, y: number, w: number, h: number) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const width = Math.floor(w);
    const height = Math.floor(h);
    const data = new Uint8ClampedArray(Math.max(0, width * height * 4));
    const stride = this.canvas.width;
    const buf = this.canvas.pixels;
    for (let yy = 0; yy < height; yy++) {
      for (let xx = 0; xx < width; xx++) {
        const si = ((y0 + yy) * stride + (x0 + xx)) * 4;
        const di = (yy * width + xx) * 4;
        data[di] = buf[si] ?? 0;
        data[di + 1] = buf[si + 1] ?? 0;
        data[di + 2] = buf[si + 2] ?? 0;
        data[di + 3] = buf[si + 3] ?? 0;
      }
    }
    if (this.sampling && width > 1 && height > 1) sampleReads += 1;
    return { data, width, height, colorSpace: 'srgb' as const };
  }

  private splat(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a: number) {
    const x0 = clamp(Math.floor(x), 0, this.canvas.width);
    const y0 = clamp(Math.floor(y), 0, this.canvas.height);
    const x1 = clamp(Math.ceil(x + w), 0, this.canvas.width);
    const y1 = clamp(Math.ceil(y + h), 0, this.canvas.height);
    const stride = this.canvas.width;
    const buf = this.canvas.pixels;
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * stride + xx) * 4;
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = a;
      }
    }
  }
}

class FakeResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}

  observe(target: FakeElement) {
    const width = target.clientWidth || 64;
    const height = target.clientHeight || 48;
    const contentRect = { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON() { return { width, height }; } };
    this.cb([{ target, contentRect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve() {}

  disconnect() {}
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const documentStub = {
  hidden: false,
  createElement(tag: string) {
    if (tag === 'canvas') return new FakeCanvas();
    return new FakeElement();
  },
  addEventListener() {},
  removeEventListener() {},
};

function matchMedia() {
  return {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  };
}

const globals = globalThis as unknown as Record<string, unknown>;
globals.HTMLElement = FakeElement;
globals.HTMLCanvasElement = FakeCanvas;
globals.HTMLVideoElement = class FakeVideo extends FakeElement {};
globals.HTMLImageElement = class FakeImage extends FakeElement {};
globals.window = globalThis;
globals.devicePixelRatio = 1;
globals.matchMedia = matchMedia;
globals.ResizeObserver = FakeResizeObserver;
globals.requestAnimationFrame = (cb: FrameRequestCallback) => {
  const id = nextRaf++;
  rafQueue.set(id, cb);
  return id;
};
globals.cancelAnimationFrame = (id: number) => {
  rafQueue.delete(id);
};
globals.document = documentStub;

export function fillCanvas(canvas: HTMLCanvasElement, r: number, g: number, b: number, a = 255) {
  if (!(canvas instanceof FakeCanvas)) throw new Error('expected a test canvas');
  const pixels = canvas.pixels;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
}

export function sampleReadsCount() {
  return sampleReads;
}

export function resetSampleReads() {
  sampleReads = 0;
}

export async function settleFrames() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await Promise.resolve();
    if (rafQueue.size === 0) return;
    const jobs = [...rafQueue.values()];
    rafQueue.clear();
    const now = performance.now();
    for (const job of jobs) job(now);
  }
  if (rafQueue.size > 0) throw new Error(`draw loop still scheduled (${rafQueue.size})`);
}
