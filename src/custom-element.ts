import { ATTRIBUTE_NAMES, attributesToOptions, removedAttributeOptions } from './attributes';
import { createAsciiFx } from './renderer';
import type { AsciiFx, AsciiFxOptions, AsciiFxSnapshot, AsciiFxSource } from './types';

export class AsciiFxElement extends HTMLElement {
  static observedAttributes: readonly string[] = ATTRIBUTE_NAMES;

  private fx: AsciiFx | null = null;
  private objectSource: AsciiFxSource | undefined;
  private stream: MediaStream | null = null;
  private webcamReady = false;

  get canvas(): HTMLCanvasElement | null {
    return this.fx?.canvas ?? null;
  }

  get source(): AsciiFxSource | undefined {
    return this.objectSource ?? this.getAttribute('src') ?? undefined;
  }

  set source(value: AsciiFxSource) {
    this.objectSource = value;
    this.fx?.update({ source: value });
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'ASCII art rendering');
    if (this.fx) return;
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    root.replaceChildren();
    const style = document.createElement('style');
    style.textContent = ':host{display:block;position:relative;width:100%;height:100%;min-height:240px;background:#090909}#stage{width:100%;height:100%;min-height:inherit}';
    const stage = document.createElement('div');
    stage.id = 'stage';
    root.append(style, stage);
    const options = this.readOptions();
    // A source set as a property before connecting, or kept across a move in the DOM, wins over `src`.
    if (this.objectSource !== undefined) options.source = this.objectSource;
    this.fx = createAsciiFx(stage, {
      ...options,
      onError: (error) => {
        this.dispatchEvent(new CustomEvent('ascii-fx-error', { detail: { message: error.message }, bubbles: true, composed: true }));
      },
      onReady: () => {
        this.dispatchEvent(new CustomEvent('ascii-fx-ready', { bubbles: true, composed: true }));
      },
    });
    void this.syncWebcam();
  }

  disconnectedCallback() {
    this.stopWebcam();
    this.fx?.destroy();
    this.fx = null;
    this.webcamReady = false;
  }

  attributeChangedCallback(name: string, _previous: string | null, value: string | null) {
    if (!this.fx) return;
    if (name === 'webcam') {
      void this.syncWebcam();
      return;
    }
    if (name === 'src') this.objectSource = undefined;
    const partial = this.readOptions();
    if (value === null) Object.assign(partial, removedAttributeOptions(name));
    // The camera and a property source both override `src` until they are removed.
    if (this.webcamReady || this.objectSource !== undefined) delete partial.source;
    this.fx.update(partial);
  }

  update(options: Partial<AsciiFxOptions>) {
    if (options.source !== undefined) this.objectSource = options.source;
    this.fx?.update(options);
  }

  play() {
    this.fx?.play();
    this.removeAttribute('paused');
  }

  pause() {
    this.fx?.pause();
    this.setAttribute('paused', '');
  }

  destroy() {
    this.disconnectedCallback();
  }

  toPNG(): Promise<Blob> {
    if (!this.fx) return Promise.reject(new Error('ascii-fx is not connected'));
    return this.fx.toPNG();
  }

  toText(): string {
    return this.fx?.toText() ?? '';
  }

  getSnapshot(): AsciiFxSnapshot | null {
    return this.fx?.getSnapshot() ?? null;
  }

  private readOptions(): Partial<AsciiFxOptions> {
    return attributesToOptions((name) => this.getAttribute(name));
  }

  private async syncWebcam() {
    const want = this.hasAttribute('webcam') && this.getAttribute('webcam') !== 'false' && this.getAttribute('webcam') !== '0';
    if (!want) {
      const wasOn = this.webcamReady || this.stream != null;
      this.stopWebcam();
      if (wasOn && this.objectSource === undefined) {
        this.fx?.update({ source: this.getAttribute('src') || undefined });
      }
      return;
    }
    if (this.webcamReady) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.failWebcam('Camera API is unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (!this.isConnected || this.getAttribute('webcam') === 'false' || !this.hasAttribute('webcam')) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stopWebcam();
      this.stream = stream;
      this.webcamReady = true;
      this.fx?.update({ source: stream });
    } catch {
      this.failWebcam('Camera permission was denied');
    }
  }

  private failWebcam(message: string) {
    this.webcamReady = false;
    this.dispatchEvent(new CustomEvent('ascii-fx-error', { detail: { message }, bubbles: true, composed: true }));
    if (this.hasAttribute('webcam')) this.removeAttribute('webcam');
  }

  private stopWebcam() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.webcamReady = false;
  }
}

export function defineAsciiFx(tag = 'ascii-fx'): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(tag)) customElements.define(tag, AsciiFxElement);
}
