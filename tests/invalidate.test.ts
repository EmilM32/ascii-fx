import { fillCanvas, resetSampleReads, sampleReadsCount, settleFrames } from './dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AsciiFxElement, createAsciiFx, type AsciiFx } from '../src/index';

describe('invalidate', () => {
  const live: Array<{ destroy(): void }> = [];

  beforeEach(() => {
    resetSampleReads();
  });

  afterEach(() => {
    for (const handle of live) handle.destroy();
    live.length = 0;
  });

  async function pausedCanvas(reducedMotion: 'allow' | 'reduce') {
    const source = document.createElement('canvas');
    source.width = 32;
    source.height = 32;
    fillCanvas(source, 0, 0, 0);
    const fx = createAsciiFx(document.createElement('canvas'), {
      source,
      fps: 1,
      interaction: 'none',
      dither: 'none',
      reducedMotion,
      onError: (error) => {
        throw error;
      },
    });
    live.push(fx);
    fx.pause();
    await settleFrames();
    return { fx, source };
  }

  async function expectOneRefresh(fx: AsciiFx, source: HTMLCanvasElement) {
    expect(fx.getSnapshot().active).toBe(false);
    expect(fx.getSnapshot().options.paused).toBe(true);
    const baseline = sampleReadsCount();
    expect(baseline).toBeGreaterThan(0);

    fillCanvas(source, 255, 255, 255);
    await settleFrames();
    expect(sampleReadsCount()).toBe(baseline);
    expect(fx.getSnapshot().active).toBe(false);

    fx.invalidate();
    await settleFrames();
    expect(sampleReadsCount()).toBe(baseline + 1);
    expect(fx.getSnapshot().active).toBe(false);
    expect(fx.getSnapshot().options.paused).toBe(true);

    await settleFrames();
    expect(sampleReadsCount()).toBe(baseline + 1);
    expect(fx.toText()).toContain('@');
  }

  it('draws one frame after pause when the canvas source changes', async () => {
    const { fx, source } = await pausedCanvas('allow');
    await expectOneRefresh(fx, source);
  });

  it('draws one frame under reduced motion and does not resume the loop', async () => {
    const { fx, source } = await pausedCanvas('reduce');
    await expectOneRefresh(fx, source);
  });

  it('refreshes a paused <ascii-fx> element once', async () => {
    const source = document.createElement('canvas');
    source.width = 32;
    source.height = 32;
    fillCanvas(source, 0, 0, 0);
    const el = new AsciiFxElement();
    el.source = source;
    el.setAttribute('fps', '1');
    el.connectedCallback();
    live.push(el);
    el.pause();
    await settleFrames();

    expect(el.getSnapshot()?.active).toBe(false);
    const baseline = sampleReadsCount();
    expect(baseline).toBeGreaterThan(0);

    fillCanvas(source, 255, 255, 255);
    await settleFrames();
    expect(sampleReadsCount()).toBe(baseline);

    el.invalidate();
    await settleFrames();
    expect(sampleReadsCount()).toBe(baseline + 1);
    expect(el.getSnapshot()?.active).toBe(false);
    expect(el.getSnapshot()?.options.paused).toBe(true);
    expect(el.toText()).toContain('@');
  });
});
