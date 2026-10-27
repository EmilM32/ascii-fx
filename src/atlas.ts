export interface GlyphAtlas {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
  slotW: number;
  slotH: number;
  cellW: number;
  cellH: number;
}

export function measureCharAspect(fontFamily: string, px: number): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0.6;
  ctx.font = `400 ${px}px ${fontFamily}`;
  const width = ctx.measureText('MW@#').width / 4;
  const aspect = width / px;
  if (!Number.isFinite(aspect) || aspect < 0.35 || aspect > 1.1) return 0.6;
  return aspect;
}

/** White glyphs on a transparent atlas. One pixel of padding keeps NEAREST filtering from bleeding. */
export function buildAtlas(chars: readonly string[], cellW: number, cellH: number, fontFamily: string): GlyphAtlas {
  const n = Math.max(1, chars.length);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const slotW = cellW + 2;
  const slotH = cellH + 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, cols * slotW);
  canvas.height = Math.max(1, rows * slotH);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Could not create the glyph atlas');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `400 ${Math.max(4, Math.floor(cellH * 0.92))}px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!ch || ch === ' ') continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * slotW + 1;
    const top = row * slotH + 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, cellW, cellH);
    ctx.clip();
    ctx.fillText(ch, left + cellW / 2, top + cellH / 2);
    ctx.restore();
  }
  return { canvas, cols, rows, slotW, slotH, cellW, cellH };
}
