# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-09

### Added

- `mode: 'halftone'`: a print-style halftone screen in place of glyphs. One mark per cell of a grid rotated by `angle` (45° by default), sized by the cell's mean tone, so dark areas nearly merge. Works with images, video, canvas, and the camera, in WebGL2 with a Canvas2D fallback.
- Halftone options: `angle`, `shape` (`dot`, `square`, `line`, `diamond`), `palette` (`mono`, `cmyk`, `source`), `ink`, and `paper`. `cellSize`, `contrast`, `brightness`, `invert`, and the pointer interactions apply as well. The `<ascii-fx>` element takes the same names as attributes, plus `mode`.
- `cmyk` draws cyan, magenta, yellow, and black screens at the classic offsets around `angle` and multiplies them like ink, which produces the rosette.
- `getSnapshot().mode`. Exports: `halftoneExtent`, `halftoneCoverage`, `halftoneScreens`, `rgbToCmyk`, `parseRenderMode`, `parseShape`, `parsePalette`, and the `RenderMode`, `HalftoneShape`, and `HalftonePalette` types.
- Playground: an ASCII / Halftone switch with controls for the new options.

### Fixed

- A looping video no longer freezes on its first loop. At the loop seam the video has no current frame for a moment, and the draw loop used to stop there with nothing to restart it. It now keeps the last frame and continues when the video does.

## [0.1.3] - 2026-10-28

### Added

- `invalidate()` draws one frame from the current source and leaves the loop stopped. A paused effect, reduced motion, and a `<canvas>` source whose pixels changed all refresh on that call, including inside the frame cap.

## [0.1.2] - 2026-10-27

### Fixed

- A custom charset keeps its leading and trailing spaces. Before, options trimmed the ramp, so `' .:#'` lost its darkest step and the darkest areas drew `.` instead of nothing.
- A custom ramp that matches an `Object` property name, such as `constructor`, renders as characters instead of being treated as a preset name.

## [0.1.1] - 2026-10-27

### Fixed

- Pictures in glyph and braille modes are no longer squeezed horizontally. The source was fitted in the sampler's grid space, whose pixels are not square, so every image was distorted by the cell aspect (about 0.55) and `contain` letterboxed it wrongly.
- With `fit: 'contain'`, the letterbox stays empty. Before, the bars were sampled as background color and turned into glyphs, a wall of `@` with `invert` or a light background. This applies to glyphs, braille, halftone, and the Canvas2D fallback.
- Glyphs are sharp. The backing store now matches the element's device pixels and centers the grid, instead of being stretched to fit by a fraction of a cell. The resolution budget is about 4 megapixels, up from 1440×900, so a full-screen hero on a DPR 2 display is no longer rendered at roughly 1×.
- Halftone in `color` mode works on light backgrounds. It uses subtractive CMY screens when the paper is light; the additive RGB screen left a white background blank.
- A cross-origin source without CORS reports an error through `onError` and `ascii-fx-error`. Before, it threw an uncaught `SecurityError` inside the animation frame and the loop stopped silently.
- `<ascii-fx>`: a source set with `el.source = …` before the element is connected, or before it moves in the DOM, is no longer lost.
- `<ascii-fx>`: removing an attribute resets that option to its default. Removing `src` unloads the source. Before, the previous value stayed in effect, which affected framework bindings that drop attributes.
- `<ascii-fx>`: changing any attribute while `webcam` is on no longer replaces the camera with `src`.

### Changed

- Fully transparent areas of a source, such as transparent PNG pixels, render as empty cells instead of glyphs in the background color.
- `update({ source: undefined })` unloads the current source.

## [0.1.0] - 2026-10-27

### Added

- First release: `createAsciiFx` renderer (WebGL2 with a Canvas2D fallback) and the `<ascii-fx>` custom element.
- Charsets: `classic`, `standard`, `blocks`, `shades`, `minimal`, `binary`, `braille`, or a custom ramp.
- Color modes: `mono`, `color`, `duotone`. Dither modes: `none`, `bayer`, `floyd-steinberg`, `halftone`.
- Pointer interactions: `repel`, `brighten`, `swap`.
- Sources: images, video, canvas, and camera streams. Exports: `toPNG()` and `toText()`.

[0.2.0]: https://github.com/EmilM32/ascii-fx/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/EmilM32/ascii-fx/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/EmilM32/ascii-fx/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/EmilM32/ascii-fx/compare/61a7d18...v0.1.1
[0.1.0]: https://github.com/EmilM32/ascii-fx/commit/61a7d18
