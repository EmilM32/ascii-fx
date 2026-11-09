export const GLYPH_VS = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aDest;
layout(location = 2) in float aIndex;
layout(location = 3) in vec3 aInk;

// Cell size, grid origin, and canvas size in device pixels. The origin centers
// the grid when the canvas is not a whole number of cells.
uniform vec2 uCellPx;
uniform vec2 uOrigin;
uniform vec2 uCanvasPx;
out vec2 vLocal;
flat out float vIndex;
flat out vec3 vInk;

void main() {
  vec2 pos = uOrigin + (aDest + aCorner) * uCellPx;
  vec2 ndc = vec2(pos.x / uCanvasPx.x * 2.0 - 1.0, 1.0 - pos.y / uCanvasPx.y * 2.0);
  gl_Position = vec4(ndc, 0.0, 1.0);
  vLocal = aCorner;
  vIndex = aIndex;
  vInk = aInk;
}
`;

export const GLYPH_FS = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
uniform vec2 uAtlasGrid;
uniform vec2 uSlotPx;
uniform vec2 uCellPx;
uniform vec2 uAtlasPx;
uniform float uStyle;

in vec2 vLocal;
flat in float vIndex;
flat in vec3 vInk;
out vec4 oColor;

vec2 brailleCenter(int bit) {
  float x = 0.25;
  float y = 0.125;
  if (bit == 1) y = 0.375;
  else if (bit == 2) y = 0.625;
  else if (bit == 3) { x = 0.75; y = 0.125; }
  else if (bit == 4) { x = 0.75; y = 0.375; }
  else if (bit == 5) { x = 0.75; y = 0.625; }
  else if (bit == 6) y = 0.875;
  else if (bit == 7) { x = 0.75; y = 0.875; }
  return vec2(x, y);
}

float brailleAlpha(float mask) {
  float alpha = 0.0;
  float rad = min(uCellPx.x, uCellPx.y) * 0.16;
  for (int i = 0; i < 8; i++) {
    float on = mod(floor((mask + 0.5) / exp2(float(i))), 2.0);
    if (on < 0.5) continue;
    vec2 delta = (vLocal - brailleCenter(i)) * uCellPx;
    float d = length(delta);
    alpha = max(alpha, 1.0 - smoothstep(rad - 0.6, rad + 0.35, d));
  }
  return alpha;
}

void main() {
  // Index -1 marks a cell outside the picture.
  if (vIndex < -0.5) discard;
  float alpha;
  if (uStyle > 0.5) {
    alpha = brailleAlpha(vIndex);
  } else {
    float col = mod(vIndex, uAtlasGrid.x);
    float row = floor(vIndex / uAtlasGrid.x);
    vec2 origin = vec2(col, row) * uSlotPx + vec2(1.0);
    vec2 glyph = clamp(vLocal * uCellPx, vec2(0.0), uCellPx - vec2(0.01));
    vec2 uv = (floor(origin + glyph) + 0.5) / uAtlasPx;
    alpha = texture(uAtlas, uv).a;
  }
  oColor = vec4(vInk * alpha, alpha);
}
`;

export const HALFTONE_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const HALFTONE_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 oColor;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uRadius;
uniform float uStrength;
uniform float uInfluence;
uniform float uInteraction;
uniform float uColorMode;
uniform float uContrast;
uniform float uBrightness;
uniform float uInvert;
uniform vec3 uFg;
uniform vec3 uBg;
uniform float uPitch;

float clamp01(float v) { return clamp(v, 0.0, 1.0); }

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 adjust(vec3 c) {
  if (uInvert > 0.5) c = vec3(1.0) - c;
  float l = luma(c);
  float l2 = clamp01((l - 0.5) * uContrast + 0.5 + uBrightness);
  if (l <= 0.0001) return vec3(l2);
  return clamp(c * (l2 / l), 0.0, 1.0);
}

float falloffAt(vec2 px) {
  float dist = length(px - uPointer);
  float t = clamp01(1.0 - dist / max(uRadius, 1.0));
  return t * t * (3.0 - 2.0 * t) * uInfluence;
}

float dotScreen(vec2 px, float angle, float value, float pitch) {
  float co = cos(angle);
  float si = sin(angle);
  vec2 p = mat2(co, si, -si, co) * px;
  vec2 f = fract(p / pitch) - 0.5;
  float dist = length(f);
  float radius = sqrt(clamp01(value)) * 0.48;
  return 1.0 - smoothstep(radius - 0.03, radius + 0.03, dist);
}

void main() {
  vec2 px = vUv * uResolution;
  float fall = falloffAt(px);
  vec2 delta = px - uPointer;
  float dist = length(delta);
  vec2 dir = dist > 0.001 ? delta / dist : vec2(0.0);
  vec2 samplePx = px;
  if (uInteraction > 0.5 && uInteraction < 1.5) {
    samplePx += dir * fall * uStrength * min(uRadius, 280.0) * 0.22;
  }
  vec4 texel = texture(uSource, samplePx / uResolution);
  // Transparent texels are letterbox or transparent source pixels: paper only.
  if (texel.a < 0.5) {
    oColor = vec4(uBg, 1.0);
    return;
  }
  vec3 src = adjust(texel.rgb);
  float v = luma(src);
  if (uInteraction > 1.5 && uInteraction < 2.5) {
    float lift = fall * uStrength * 0.85;
    v = clamp01(v + lift);
    src = clamp(src + vec3(lift), 0.0, 1.0);
  }
  float pitch = uPitch;
  float ang = 0.0;
  if (uInteraction > 2.5) {
    pitch = mix(uPitch, max(3.0, uPitch * 0.62), clamp(fall * uStrength, 0.0, 1.0));
    ang = fall * uStrength * 1.15;
  }
  vec3 col;
  if (uColorMode > 0.5 && uColorMode < 1.5) {
    if (luma(uBg) > 0.5) {
      // Light paper: subtractive CMY screens. Cyan absorbs red, magenta green, yellow blue.
      float cs = dotScreen(samplePx, radians(15.0) + ang, 1.0 - src.r, pitch);
      float ms = dotScreen(samplePx, radians(75.0) + ang, 1.0 - src.g, pitch);
      float ys = dotScreen(samplePx, ang, 1.0 - src.b, pitch);
      col = uBg * (vec3(1.0) - vec3(cs, ms, ys));
    } else {
      // Dark paper: additive RGB screens.
      float rs = dotScreen(samplePx, radians(15.0) + ang, src.r, pitch);
      float gs = dotScreen(samplePx, radians(75.0) + ang, src.g, pitch);
      float bs = dotScreen(samplePx, ang, src.b, pitch);
      col = uBg + vec3(rs, gs, bs) * (vec3(1.0) - uBg);
    }
  } else {
    vec3 ink = uFg;
    if (uColorMode > 1.5) ink = mix(mix(uBg, uFg, 0.28), uFg, v);
    float d = dotScreen(samplePx, radians(18.0) + ang, v, pitch);
    col = mix(uBg, ink, d);
  }
  oColor = vec4(col, 1.0);
}
`;

/**
 * `mode: 'halftone'`: a rotated screen of marks, one per cell, sized by the mean tone of
 * that cell. The source texture is mipmapped and read at the cell's footprint, so a lookup
 * is the cell average. Each pixel tests the four cells around its nearest grid corner,
 * which covers every mark that can reach it (the largest dot has radius √2/2 cells).
 * Shapes: 0 dot, 1 square, 2 line, 3 diamond. Palettes: 0 mono, 1 cmyk, 2 source.
 */
export const SCREEN_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 oColor;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform float uPitch;
uniform float uLod;
// Screen → grid rotations, by channel: 0 K / mono, 1 C, 2 M, 3 Y.
uniform mat2 uRot[4];
uniform int uShape;
uniform int uPalette;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uContrast;
uniform float uBrightness;
uniform float uInvert;
uniform vec2 uPointer;
uniform float uRadius;
uniform float uStrength;
uniform float uInfluence;
uniform int uInteraction;

const float PI = 3.14159265;
const float HALF_DIAGONAL = 0.70710678;

float clamp01(float v) { return clamp(v, 0.0, 1.0); }

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 adjust(vec3 c) {
  if (uInvert > 0.5) c = vec3(1.0) - c;
  float l = luma(c);
  float l2 = clamp01((l - 0.5) * uContrast + 0.5 + uBrightness);
  if (l <= 0.0001) return vec3(l2);
  return clamp(c * (l2 / l), 0.0, 1.0);
}

// Mirrors halftoneExtent() in halftone.ts.
float extent(float d) {
  d = clamp01(d);
  if (uShape == 1) return sqrt(d) * 0.5;
  if (uShape == 2) return d * 0.5;
  if (uShape == 3) return d <= 0.5 ? sqrt(d * 0.5) : 1.0 - sqrt((1.0 - d) * 0.5);
  if (d <= PI * 0.25) return sqrt(d / PI);
  return 0.5 + (HALF_DIAGONAL - 0.5) * ((d - PI * 0.25) / (1.0 - PI * 0.25));
}

float metric(vec2 q) {
  if (uShape == 1) return max(abs(q.x), abs(q.y));
  if (uShape == 2) return abs(q.y);
  if (uShape == 3) return abs(q.x) + abs(q.y);
  return length(q);
}

float falloffAt(vec2 px) {
  float t = clamp01(1.0 - length(px - uPointer) / max(uRadius, 1.0));
  return t * t * (3.0 - 2.0 * t) * uInfluence;
}

// Mirrors rgbToCmyk() in halftone.ts: half of the common gray goes to black.
vec4 cmyk(vec3 c) {
  vec3 cmy = vec3(1.0) - c;
  float k = clamp01(min(cmy.x, min(cmy.y, cmy.z)) * 0.5);
  return vec4(clamp((cmy - vec3(k)) / (1.0 - k), 0.0, 1.0), k);
}

// Ink amount for one screen. channel: 0 K / mono, 1 C, 2 M, 3 Y.
float darkness(vec3 src, int channel) {
  if (uPalette != 1) return 1.0 - luma(src);
  vec4 cmy = cmyk(src);
  if (channel == 0) return cmy.w;
  if (channel == 1) return cmy.x;
  if (channel == 2) return cmy.y;
  return cmy.z;
}

// Farthest a mark can reach from its cell center, in the shape's metric.
float maxExtent() {
  if (uShape == 3) return 1.0;
  if (uShape == 0) return HALF_DIAGONAL;
  return 0.5;
}

// Coverage of the strongest mark at p; .rgb carries that mark's source color.
// rot maps screen space (device pixels, origin at the canvas center) to grid space (cells).
vec4 screenAt(vec2 p, mat2 rot, int channel, float lift, float flip) {
  vec2 g = rot * (p - uResolution * 0.5) / uPitch;
  mat2 back = transpose(rot) * uPitch;
  vec2 base = floor(g - 0.5);
  float aa = 0.7 / uPitch;
  float reach = maxExtent() + aa;
  // Lines only meet the rows above and below.
  int columns = uShape == 2 ? 1 : 2;
  vec4 best = vec4(0.0);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < columns; i++) {
      vec2 center = base + vec2(float(i), float(j)) + 0.5;
      float dist = metric(g - center);
      if (dist > reach) continue;
      vec2 at = center;
      // Lines follow the tone along their length, like an engraving.
      if (uShape == 2) at.x = g.x;
      vec2 uv = (back * at + uResolution * 0.5) / uResolution;
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) continue;
      vec4 texel = textureLod(uSource, uv, uLod);
      // Letterbox and transparent pixels are paper. Mip levels average alpha, so un-weight the color.
      if (texel.a < 0.5) continue;
      vec3 src = adjust(texel.rgb / texel.a);
      src = clamp(src + vec3(lift), 0.0, 1.0);
      float d = darkness(src, channel);
      d = mix(d, 1.0 - d, flip);
      float size = extent(d);
      if (size <= 0.0) continue;
      float cov = clamp01((size - dist) / (2.0 * aa) + 0.5) * clamp01(size / aa);
      if (cov > best.a) best = vec4(src, cov);
    }
  }
  return best;
}

void main() {
  vec2 px = vUv * uResolution;
  float fall = falloffAt(px);
  vec2 delta = px - uPointer;
  float lift = 0.0;
  float flip = 0.0;
  // Repel magnifies around the pointer: the screen spreads out, so marks grow and move away.
  if (uInteraction == 1) px = uPointer + delta * max(0.25, 1.0 - fall * uStrength * 0.45);
  else if (uInteraction == 2) lift = fall * uStrength * 0.85;
  else if (uInteraction == 3) flip = clamp01(fall * uStrength);

  vec3 col = uPaper;
  if (uPalette == 1) {
    vec4 y = screenAt(px, uRot[3], 3, lift, flip);
    vec4 c = screenAt(px, uRot[1], 1, lift, flip);
    vec4 m = screenAt(px, uRot[2], 2, lift, flip);
    vec4 k = screenAt(px, uRot[0], 0, lift, flip);
    col *= mix(vec3(1.0), vec3(1.0, 0.92, 0.0), y.a);
    col *= mix(vec3(1.0), vec3(0.0, 0.64, 0.9), c.a);
    col *= mix(vec3(1.0), vec3(0.9, 0.05, 0.5), m.a);
    col *= mix(vec3(1.0), uInk, k.a);
  } else {
    vec4 s = screenAt(px, uRot[0], 0, lift, flip);
    vec3 ink = uPalette == 2 ? s.rgb : uInk;
    col = mix(uPaper, ink, s.a);
  }
  oColor = vec4(col, 1.0);
}
`;
