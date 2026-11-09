# ascii-fx

Live ASCII, dither, and halftone for an image, a video, or a camera. The core is TypeScript with no runtime dependencies. A `<ascii-fx>` element wraps it for HTML, React, Vue, and Svelte.

[![demo](docs/demo.png)](https://github.com/EmilM32/ascii-fx)

The letters track luminance. Bayer, Floyd–Steinberg, and halftone are separate readings of the same frame. `mode: 'halftone'` swaps the letters for a print screen: rotated dots, squares, lines, or diamonds, in one ink, CMYK, or the source color. Repel, brighten, and swap follow the pointer with a spring, then fall off with distance.

## Install

```bash
npm i ascii-fx
```

The package is ESM. `ascii-fx` is the renderer. `ascii-fx/element` registers the custom element and is the only entry with a side effect.

Gzipped `dist/index.js`: **20.69 kB**. The custom-element entry (`dist/element.js`) is a few lines that register `<ascii-fx>` and re-export the class.

## JavaScript

```ts
import { createAsciiFx } from 'ascii-fx';

const fx = createAsciiFx(document.querySelector('#stage')!, {
  source: '/cover.jpg', // image, video URL, <img>, <video>, <canvas>, or MediaStream
  charset: 'classic',
  cellSize: 8,
  color: 'duotone',
  foreground: '#e2ff3d',
  background: '#070708',
  dither: 'bayer',
  interaction: 'repel',
  radius: 180,
  strength: 1,
});

fx.update({ dither: 'halftone' });
await fx.toPNG(); // Blob
fx.toText();      // plain ASCII of the current frame
fx.pause();
fx.invalidate(); // one frame from the current source; the loop stays stopped
fx.destroy();
```

`source` URLs ending in `.mp4`, `.webm`, `.ogg`, or `.mov` load as looping, muted video. Remote URLs need CORS, or `toPNG()` and the sampler will fail. Dropped files and `blob:` URLs stay local.

## Custom element

```html
<script type="module">
  import 'ascii-fx/element';
</script>

<ascii-fx
  src="cover.jpg"
  charset="classic"
  cell-size="10"
  color="duotone"
  foreground="#e2ff3d"
  background="#070708"
  dither="bayer"
  interaction="repel"
  radius="180"
  strength="1"
></ascii-fx>
```

Set an object source on the element: `el.source = stream`. `el.toPNG()`, `el.toText()`, `el.play()`, `el.pause()`, `el.invalidate()`, and `el.getSnapshot()` match the JS handle. Failures dispatch `ascii-fx-error`. The first frame dispatches `ascii-fx-ready`.

### Attributes

| Attribute | Default | Values |
| --- | --- | --- |
| `src` | — | Image or video URL |
| `mode` | `ascii` | `ascii`, `halftone`. See [Halftone mode](#halftone-mode) |
| `charset` | `classic` | `classic`, `standard`, `blocks`, `shades`, `minimal`, `binary`, `braille`, or a custom ramp (darkest first) |
| `cell-size` | `8` | Cell height in CSS pixels, 2–64 |
| `color` | `mono` | `mono`, `color` (alias `original`), `duotone` (alias `tint`) |
| `foreground` | `#f4f1ea` | Ink. Any CSS color |
| `background` | `#090909` | Paper |
| `dither` | `none` | `none`, `bayer` (alias `ordered`), `floyd-steinberg` (alias `floyd`), `halftone` |
| `angle` | `45` | Halftone screen angle in degrees |
| `shape` | `dot` | Halftone mark: `dot`, `square`, `line`, `diamond` |
| `palette` | `mono` | Halftone ink: `mono`, `cmyk`, `source` |
| `ink` | `#1c1a17` | Halftone ink color (`mono`, and the black screen in `cmyk`) |
| `paper` | `#f3ecdb` | Halftone paper color |
| `contrast` | `1` | 0–3 |
| `brightness` | `0` | -1–1, applied after contrast |
| `invert` | off | Boolean attribute |
| `interaction` | `none` | `none`, `repel` (alias `scatter`), `brighten`, `swap` |
| `radius` | `140` | Pointer radius in CSS pixels |
| `strength` | `1` | 0–3 |
| `fps` | `60` | Frame cap. `0` is uncapped |
| `fit` | `cover` | `cover`, `contain` |
| `font` | system monospace | CSS font stack used for the glyph atlas |
| `webcam` | off | Opens the camera and ignores `src` until removed |
| `paused` | off | Boolean attribute |

`braille` samples a 2×4 dot per cell and draws the matching pattern (U+2800–U+28FF in `toText()`). Floyd–Steinberg is for still images. Video and camera streams use Bayer while that mode is selected, so the diffusion doesn’t crawl. `toText()` in halftone mode exports the glyph reading, not dots. `toPNG()` exports the pixels on screen.

`prefers-reduced-motion: reduce` disables pointer effects and holds video on a still frame unless you pass `reducedMotion: 'allow'`. Offscreen elements pause via `IntersectionObserver`. `invalidate()` draws a single fresh frame while that loop is stopped — paused, offscreen, hidden, or reduced motion — including when the source is a `<canvas>` whose pixels changed. The backing store matches the element's device pixels (device pixel ratio up to 2) so glyphs stay sharp, and drops below that only past about 4 megapixels. With `fit: 'contain'` or a transparent source, cells outside the picture stay empty.

## Halftone mode

`mode: 'halftone'` draws the picture the way newsprint and comics do. The frame is cut into a grid of square cells, `cellSize` CSS pixels apart. Each cell gets one mark, sized by the mean tone of that cell: light areas get small dots, dark areas get large ones that reach into their neighbors and nearly merge. The grid is rotated by `angle` (45° by default), which is what separates it from pixelation.

```ts
import { createAsciiFx } from 'ascii-fx';

const fx = createAsciiFx(document.querySelector('#stage')!, {
  source: '/cover.jpg',
  mode: 'halftone',
  cellSize: 8,     // screen pitch in CSS pixels
  angle: 45,
  shape: 'dot',    // 'dot' | 'square' | 'line' | 'diamond'
  palette: 'mono', // 'mono' | 'cmyk' | 'source'
  ink: '#1c1a17',
  paper: '#f3ecdb',
  contrast: 1.2,
});

fx.update({ palette: 'cmyk' }); // four screens and a rosette
```

```html
<ascii-fx src="cover.jpg" mode="halftone" cell-size="8" shape="line" angle="30"></ascii-fx>
```

| Option | Default | |
| --- | --- | --- |
| `mode` | `'ascii'` | `'halftone'` turns the screen on. Charset, `color`, `foreground`, `background`, and `dither` are ignored while it is on. |
| `cellSize` | `8` | Distance between marks in CSS pixels, 2–64 |
| `angle` | `45` | Screen angle in degrees |
| `shape` | `'dot'` | `dot`, `square`, `line` (an engraving-style line screen whose width follows the tone along each line), `diamond` |
| `palette` | `'mono'` | `mono`: `ink` on `paper`. `cmyk`: cyan, magenta, yellow, and black screens at `angle` − 30°, `angle` + 30°, `angle` − 45°, and `angle` (15° / 75° / 0° / 45° by default), multiplied like ink. Half of the common gray goes to black, so grays keep some color dots and the rosette shows. `source`: each mark takes the source color under it. |
| `ink` | `'#1c1a17'` | Mark color in `mono`; the black screen in `cmyk` |
| `paper` | `'#f3ecdb'` | Background, and what letterbox and transparent areas show |
| `contrast`, `brightness`, `invert` | | Applied to the tone before the marks are sized, as in the glyph modes |

Mark area tracks ink coverage: a square at 30 % gray covers 30 % of its cell. Dots follow that until neighbors touch, then grow until the cell is solid. Pointer effects work here too: `repel` magnifies the screen around the cursor, `brighten` lifts the tone, and `swap` trades ink for paper.

The screen is a fragment shader in WebGL2. The frame is uploaded once per video frame with mipmaps, and each pixel reads the mip level whose texels are about one cell wide, so a lookup is the cell's mean tone. Each pixel tests only the four cells around its nearest grid corner. Without WebGL2, the same geometry is drawn with Canvas2D paths, which is slower and meant for still images. `toPNG()` exports the canvas pixels, the same picture that is on screen. `toText()` exports the glyph reading of the frame, as with `dither: 'halftone'`.

`dither: 'halftone'` still exists and is unchanged: a fixed-angle dot screen inside the glyph mode's colors. `mode: 'halftone'` is the separate, configurable print screen.

## Options

`createAsciiFx(target, options)` accepts the same fields in camelCase (`cellSize`, `fontFamily`, `reducedMotion`) plus:

| Field | Meaning |
| --- | --- |
| `source` | `'url'`, `HTMLImageElement`, `HTMLVideoElement`, `HTMLCanvasElement`, or `MediaStream` |
| `onError` | `(error: Error) => void` |
| `onReady` | First frame |

`target` is a canvas or any element. A canvas you pass in is used as-is; any other element gets a canvas inside it. The handle:

| Method | |
| --- | --- |
| `update(partial)` | Merge options. A new `source` reloads. |
| `play()` / `pause()` | The draw loop and owned video |
| `invalidate()` | One frame from the current source. The loop stays stopped |
| `destroy()` | Observers, video element, WebGL context |
| `toPNG()` | `Promise<Blob>` |
| `toText()` | Glyphs of the current frame, one row per line |
| `getSnapshot()` | Columns, rows, renderer (`webgl2` or `canvas2d`), mode, fps, effective dither |
| `canvas` | The drawing surface |

Glyphs are instanced in WebGL2 (one quad per cell, atlas sampled at the cell’s pixel size). Halftone is a fullscreen shader: one ink for mono and duotone, RGB screens at 15° / 75° / 0° for original color. If WebGL2 is missing, glyphs and `mode: 'halftone'` fall back to Canvas2D.

Charset presets live on `CHARSET_PRESETS`. `luminance`, `adjustLuma`, `quantizeLuma`, `bayerThreshold`, `floydSteinberg`, `halftoneDot`, `halftoneExtent`, `halftoneCoverage`, `halftoneScreens`, and `rgbToCmyk` are exported for the same math the renderer uses.

## Frameworks

Register the element once. The tag is a normal DOM element after that.

### React

```tsx
import 'ascii-fx/element';

export function Cover() {
  return (
    <ascii-fx
      src="/cover.jpg"
      charset="classic"
      cell-size="8"
      color="duotone"
      foreground="#e2ff3d"
      background="#070708"
      interaction="repel"
    />
  );
}
```

For TypeScript, extend JSX:

```ts
import type { AsciiFxElement } from 'ascii-fx';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ascii-fx': React.DetailedHTMLProps<React.HTMLAttributes<AsciiFxElement>, AsciiFxElement> & {
        src?: string;
        mode?: 'ascii' | 'halftone';
        charset?: string;
        'cell-size'?: number | string;
        color?: string;
        dither?: string;
        interaction?: string;
        foreground?: string;
        background?: string;
        angle?: number | string;
        shape?: string;
        palette?: string;
        ink?: string;
        paper?: string;
      };
    }
  }
}
```

### Vue

```ts
// main.ts
import 'ascii-fx/element';
```

```vue
<ascii-fx src="/cover.jpg" charset="blocks" cell-size="10" interaction="brighten" />
```

### Svelte

```svelte
<script lang="ts">
  import 'ascii-fx/element';
</script>

<ascii-fx src="/cover.jpg" charset="classic" cell-size="8" interaction="repel"></ascii-fx>
```

If the template type-checker complains, declare the tag:

```ts
declare namespace svelteHTML {
  interface IntrinsicElements {
    'ascii-fx': {
      src?: string;
      mode?: string;
      charset?: string;
      'cell-size'?: string | number;
      color?: string;
      dither?: string;
      interaction?: string;
      shape?: string;
      palette?: string;
    };
  }
}
```

## Demo

```bash
npm install
npm run dev
```

`npm run build` writes the library to `dist/` and the static site to `site/`. The landing page is a full-viewport `<ascii-fx>` plus a playground: drag-and-drop or a file input (processed locally), webcam, live controls, a snippet that follows those controls, and PNG / TXT export.

Bundled pictures are NASA public-domain Apollo photographs. See `demo/public/samples/ATTRIBUTION.txt`. `scripts/make-samples.sh` rebuilds them.

## Scripts

| Script | |
| --- | --- |
| `npm test` | Glyph mapping, Bayer, Floyd–Steinberg, halftone dots, braille masks, halftone screen geometry and CMYK |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Library (ESM + `.d.ts`) and demo |

## License

[MIT](LICENSE) © Emil Majer
