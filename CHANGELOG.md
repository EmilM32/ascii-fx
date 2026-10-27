# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/EmilM32/ascii-fx/compare/61a7d18...v0.1.1
[0.1.0]: https://github.com/EmilM32/ascii-fx/commit/61a7d18
