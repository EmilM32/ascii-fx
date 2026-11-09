import {
  createAsciiFx,
  defineAsciiFx,
  type AsciiFx,
  type ColorMode,
  type DitherMode,
  type FitMode,
  type HalftonePalette,
  type HalftoneShape,
  type InteractionMode,
  type RenderMode,
} from '../src/index';

defineAsciiFx();
import './style.css';

function must<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`Demo markup is missing ${label}`);
  return value;
}

interface State {
  mode: RenderMode;
  charset: string;
  custom: string;
  cellSize: number;
  color: ColorMode;
  foreground: string;
  background: string;
  dither: DitherMode;
  angle: number;
  shape: HalftoneShape;
  palette: HalftonePalette;
  ink: string;
  paper: string;
  contrast: number;
  brightness: number;
  invert: boolean;
  interaction: InteractionMode;
  radius: number;
  strength: number;
  fit: FitMode;
  animated: boolean;
}

const state: State = {
  mode: 'ascii',
  charset: 'classic',
  custom: ' .:-=+*#%@',
  cellSize: 9,
  color: 'duotone',
  foreground: '#e2ff3d',
  background: '#070708',
  dither: 'bayer',
  angle: 45,
  shape: 'dot',
  palette: 'mono',
  ink: '#1c1a17',
  paper: '#f3ecdb',
  contrast: 1.35,
  brightness: 0,
  invert: false,
  interaction: 'repel',
  radius: 160,
  strength: 1,
  fit: 'cover',
  animated: false,
};

const stage = must(document.querySelector<HTMLElement>('#stage'), 'stage');
const stats = must(document.querySelector<HTMLElement>('#stats'), 'stats');
const status = must(document.querySelector<HTMLElement>('#status'), 'status');
const snippet = must(document.querySelector<HTMLElement>('#snippet-code'), 'snippet');
const floydNote = must(document.querySelector<HTMLElement>('#floyd-note'), 'floyd note');
const customWrap = must(document.querySelector<HTMLElement>('#custom-wrap'), 'custom charset');
const asciiControls = must(document.querySelector<HTMLElement>('#ascii-controls'), 'ascii controls');
const glyphControls = must(document.querySelector<HTMLElement>('#glyph-controls'), 'glyph controls');
const halftoneControls = must(document.querySelector<HTMLElement>('#halftone-controls'), 'halftone controls');
const fileInput = must(document.querySelector<HTMLInputElement>('#file'), 'file input');

const fx: AsciiFx = createAsciiFx(stage, {
  source: 'samples/aldrin.jpg',
  ...optionsFrom(state),
});

let objectUrl: string | null = null;
let camera: MediaStream | null = null;
let activeVideo: HTMLVideoElement | null = null;

function optionsFrom(current: State) {
  return {
    mode: current.mode,
    charset: current.charset === 'custom' ? current.custom : current.charset,
    cellSize: current.cellSize,
    color: current.color,
    foreground: current.foreground,
    background: current.background,
    dither: current.dither,
    angle: current.angle,
    shape: current.shape,
    palette: current.palette,
    ink: current.ink,
    paper: current.paper,
    contrast: current.contrast,
    brightness: current.brightness,
    invert: current.invert,
    interaction: current.interaction,
    radius: current.radius,
    strength: current.strength,
    fit: current.fit,
    fps: 60,
  };
}

function sync() {
  fx.update(optionsFrom(state));
  paintControls();
  snippet.textContent = buildSnippet();
  floydNote.hidden = !(state.dither === 'floyd-steinberg' && state.animated);
  const halftone = state.mode === 'halftone';
  asciiControls.hidden = halftone;
  glyphControls.hidden = halftone;
  halftoneControls.hidden = !halftone;
  stage.style.background = halftone ? state.paper : state.background;
}

function paintControls() {
  const charset = document.querySelector<HTMLSelectElement>('#charset');
  const custom = document.querySelector<HTMLInputElement>('#custom');
  if (charset) charset.value = state.charset;
  if (custom && document.activeElement !== custom) custom.value = state.custom;
  customWrap.hidden = state.charset !== 'custom';
  setRange('#cell', '#cell-out', state.cellSize, String(state.cellSize));
  setRange('#angle', '#angle-out', state.angle, `${state.angle}°`);
  setRange('#contrast', '#contrast-out', state.contrast, state.contrast.toFixed(2));
  setRange('#bright', '#bright-out', state.brightness, state.brightness.toFixed(2));
  setRange('#radius', '#radius-out', state.radius, String(state.radius));
  setRange('#strength', '#strength-out', state.strength, state.strength.toFixed(2));
  const fg = document.querySelector<HTMLInputElement>('#fg');
  const bg = document.querySelector<HTMLInputElement>('#bg');
  const invert = document.querySelector<HTMLInputElement>('#invert');
  if (fg) fg.value = state.foreground;
  if (bg) bg.value = state.background;
  if (invert) invert.checked = state.invert;
  const ink = document.querySelector<HTMLInputElement>('#ink');
  const paper = document.querySelector<HTMLInputElement>('#paper');
  if (ink) ink.value = state.ink;
  if (paper) paper.value = state.paper;
  press('#mode', state.mode);
  press('#shape', state.shape);
  press('#palette', state.palette);
  press('#color', state.color);
  press('#dither', state.dither);
  press('#interaction', state.interaction);
  press('#fit', state.fit);
}

function setRange(input: string, output: string, value: number, label: string) {
  const field = document.querySelector<HTMLInputElement>(input);
  const out = document.querySelector<HTMLOutputElement>(output);
  if (field) field.value = String(value);
  if (out) out.textContent = label;
}

function press(group: string, value: string) {
  document.querySelectorAll<HTMLButtonElement>(`${group} button`).forEach((button) => {
    button.setAttribute('aria-pressed', button.dataset.value === value ? 'true' : 'false');
  });
}

function buildSnippet(): string {
  const charset = state.charset === 'custom' ? state.custom : state.charset;
  const lines = state.mode === 'halftone' ? halftoneLines() : [
    `  charset="${escapeAttr(charset)}"`,
    `  cell-size="${state.cellSize}"`,
    `  color="${state.color}"`,
    `  foreground="${state.foreground}"`,
    `  background="${state.background}"`,
    `  dither="${state.dither}"`,
  ];
  lines.push(
    `  contrast="${state.contrast}"`,
    `  brightness="${state.brightness}"`,
    `  interaction="${state.interaction}"`,
    `  radius="${state.radius}"`,
    `  strength="${state.strength}"`,
    `  fit="${state.fit}"`,
  );
  if (state.invert) lines.push('  invert');
  return `<script type="module">\n  import 'ascii-fx/element';\n</script>\n<ascii-fx\n  src="photo.jpg"\n${lines.join('\n')}\n></ascii-fx>`;
}

function halftoneLines(): string[] {
  const lines = [
    '  mode="halftone"',
    `  cell-size="${state.cellSize}"`,
    `  angle="${state.angle}"`,
    `  shape="${state.shape}"`,
    `  palette="${state.palette}"`,
  ];
  if (state.palette !== 'source') lines.push(`  ink="${state.ink}"`);
  lines.push(`  paper="${state.paper}"`);
  return lines;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function say(message: string) {
  status.textContent = message;
}

document.querySelector('#charset')?.addEventListener('change', (event) => {
  state.charset = (event.target as HTMLSelectElement).value;
  sync();
});
document.querySelector('#custom')?.addEventListener('input', (event) => {
  state.custom = (event.target as HTMLInputElement).value || ' ';
  state.charset = 'custom';
  sync();
});
document.querySelector('#cell')?.addEventListener('input', (event) => {
  state.cellSize = Number((event.target as HTMLInputElement).value);
  sync();
});
document.querySelector('#contrast')?.addEventListener('input', (event) => {
  state.contrast = Number((event.target as HTMLInputElement).value);
  sync();
});
document.querySelector('#bright')?.addEventListener('input', (event) => {
  state.brightness = Number((event.target as HTMLInputElement).value);
  sync();
});
document.querySelector('#radius')?.addEventListener('input', (event) => {
  state.radius = Number((event.target as HTMLInputElement).value);
  sync();
});
document.querySelector('#strength')?.addEventListener('input', (event) => {
  state.strength = Number((event.target as HTMLInputElement).value);
  sync();
});
document.querySelector('#angle')?.addEventListener('input', (event) => {
  state.angle = Number((event.target as HTMLInputElement).value);
  sync();
});
document.querySelector('#ink')?.addEventListener('input', (event) => {
  state.ink = (event.target as HTMLInputElement).value;
  sync();
});
document.querySelector('#paper')?.addEventListener('input', (event) => {
  state.paper = (event.target as HTMLInputElement).value;
  sync();
});
document.querySelector('#fg')?.addEventListener('input', (event) => {
  state.foreground = (event.target as HTMLInputElement).value;
  sync();
});
document.querySelector('#bg')?.addEventListener('input', (event) => {
  state.background = (event.target as HTMLInputElement).value;
  sync();
});
document.querySelector('#invert')?.addEventListener('change', (event) => {
  state.invert = (event.target as HTMLInputElement).checked;
  sync();
});
document.querySelector('#cam')?.addEventListener('change', (event) => {
  void setCamera((event.target as HTMLInputElement).checked);
});

for (const id of ['#mode', '#shape', '#palette', '#color', '#dither', '#interaction', '#fit']) {
  document.querySelector(id)?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest('button');
    const value = button?.dataset.value;
    if (!value) return;
    if (id === '#mode') state.mode = value as RenderMode;
    if (id === '#shape') state.shape = value as HalftoneShape;
    if (id === '#palette') state.palette = value as HalftonePalette;
    if (id === '#color') state.color = value as ColorMode;
    if (id === '#dither') state.dither = value as DitherMode;
    if (id === '#interaction') state.interaction = value as InteractionMode;
    if (id === '#fit') state.fit = value as FitMode;
    sync();
  });
}

function stopCamera() {
  camera?.getTracks().forEach((track) => track.stop());
  camera = null;
  const cam = document.querySelector<HTMLInputElement>('#cam');
  if (cam) cam.checked = false;
}

async function setCamera(on: boolean) {
  if (!on) {
    stopCamera();
    state.animated = false;
    fx.update({ source: 'samples/aldrin.jpg' });
    say('');
    sync();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    say('This browser has no camera API.');
    stopCamera();
    return;
  }
  try {
    stopPlayback();
    camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    state.animated = true;
    fx.update({ source: camera });
    say('Camera is local. Nothing is uploaded.');
    sync();
  } catch {
    say('Camera unavailable.');
    stopCamera();
  }
}

function stopPlayback() {
  activeVideo?.pause();
  activeVideo = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function useFile(file: File) {
  stopCamera();
  stopPlayback();
  objectUrl = URL.createObjectURL(file);
  if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    void video.play();
    activeVideo = video;
    state.animated = true;
    fx.update({ source: video });
  } else {
    const image = new Image();
    image.onload = () => fx.update({ source: image });
    image.src = objectUrl;
    state.animated = false;
  }
  say(file.name);
  sync();
}

function useUrl(url: string) {
  stopCamera();
  stopPlayback();
  state.animated = /\.(mp4|webm|ogg|mov)(?:[?#].*)?$/i.test(url);
  fx.update({ source: url });
  say('');
  sync();
}

stage.addEventListener('dragover', (event) => {
  event.preventDefault();
  stage.classList.add('hot');
});
stage.addEventListener('dragleave', () => stage.classList.remove('hot'));
stage.addEventListener('drop', (event) => {
  event.preventDefault();
  stage.classList.remove('hot');
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    useFile(file);
    return;
  }
  const uri = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain');
  if (uri) useUrl(new URL(uri, location.href).href);
});

document.querySelectorAll<HTMLButtonElement>('.sample[data-src]').forEach((button) => {
  button.addEventListener('click', () => {
    const src = button.dataset.src;
    if (src) useUrl(src);
  });
  button.addEventListener('dragstart', (event) => {
    const src = button.dataset.src;
    if (!src || !event.dataTransfer) return;
    const absolute = new URL(src, location.href).href;
    event.dataTransfer.setData('text/uri-list', absolute);
    event.dataTransfer.setData('text/plain', absolute);
    event.dataTransfer.effectAllowed = 'copy';
  });
});

document.querySelector('#browse')?.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) useFile(file);
  fileInput.value = '';
});

document.addEventListener('dragover', (event) => event.preventDefault());
document.addEventListener('drop', (event) => {
  if (event.target instanceof Node && stage.contains(event.target)) return;
  event.preventDefault();
});

async function copyText(value: string, ok: string) {
  try {
    await navigator.clipboard.writeText(value);
    say(ok);
  } catch {
    say('Clipboard blocked.');
  }
}

document.querySelector('#copy')?.addEventListener('click', () => {
  void copyText(snippet.textContent ?? '', 'Snippet copied.');
});
document.querySelector('#copy-npm')?.addEventListener('click', () => {
  void copyText('npm i ascii-fx', 'Install command copied.');
});
document.querySelector('#png')?.addEventListener('click', async () => {
  const blob = await fx.toPNG();
  download(blob, 'ascii-fx.png');
  say('PNG downloaded.');
});
document.querySelector('#txt')?.addEventListener('click', () => {
  download(new Blob([fx.toText(), '\n'], { type: 'text/plain' }), 'ascii-fx.txt');
  say('Text downloaded.');
});

function download(blob: Blob, name: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

window.setInterval(() => {
  const snap = fx.getSnapshot();
  const motion = snap.active ? `${snap.fps} fps` : 'still';
  const reading = snap.mode === 'halftone' ? `halftone ${snap.options.shape} · ${snap.options.palette}` : snap.dither;
  stats.textContent = `${snap.cols} × ${snap.rows} · ${snap.renderer} · ${motion} · ${reading}`;
}, 500);

sync();
