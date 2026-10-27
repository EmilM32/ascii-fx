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
