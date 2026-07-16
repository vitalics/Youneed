// components.ts — the heart of the demo: two ways to make a <video> island.
//
//   <slot-video>   : the <video> lives in LIGHT DOM, projected via <slot>.
//                    Re-rendering the island's shadow never touches it →
//                    playback survives hydration.
//   <shadow-video> : the <video> lives INSIDE the shadow render().
//                    The first client render (hydration) rebuilds the shadow →
//                    the <video> is recreated → playback resets to 0.
//
// Both wire identical client state (play/pause + a live currentTime readout) so
// the ONLY difference you observe is whether the media element persisted.
//
// Registration is declarative via `@Component.define(when)`:
//   • the islands use a 3000ms delay so you can watch the difference when they
//     finally hydrate (and SSR still renders them — renderToString flushes
//     pending defines synchronously, ignoring the trigger);
//   • the page shell uses "server" — defined for SSR, but NEVER on the client,
//     so it stays static markup and never re-renders.

import { Component, html, css, type OnMount } from "@youneed/dom";

/**
 * Mirror the video's live state (currentTime + paused) into the host via
 * requestAnimationFrame, writing a prop only when its displayed value actually
 * changes. Polling beats the events here: `timeupdate` fires only ~4×/s (a
 * tenths readout built on it lags/stutters), and the `play` event often fires
 * during autoplay BEFORE we can attach a listener (the island hydrates after the
 * video has already started), so a play/pause-listener button desyncs. Reading
 * `v.paused` every frame keeps the button correct regardless of timing.
 * Cleaned up via the component's signal.
 */
function trackTime(
  host: { time: number; playing: boolean },
  v: HTMLVideoElement,
  signal: AbortSignal,
): void {
  let raf = 0;
  const tick = () => {
    const t = Math.round(v.currentTime * 10) / 10;
    if (t !== host.time) host.time = t;
    if (host.playing === v.paused) host.playing = !v.paused; // button ↔ real state
    raf = requestAnimationFrame(tick);
  };
  signal.addEventListener("abort", () => {
    if (raf) cancelAnimationFrame(raf);
  });
  tick();
}

const BAR = css`
  :host {
    display: block;
    border: 2px solid #d4d4d8;
    border-radius: 10px;
    overflow: hidden;
    font:
      14px system-ui,
      sans-serif;
  }
  :host([data-hydrated]) {
    border-color: #16a34a;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: #fafafa;
  }
  button {
    font: inherit;
    padding: 4px 12px;
    border: 1px solid #a1a1aa;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
  }
  .t {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .badge {
    margin-left: auto;
    font-size: 12px;
    color: #71717a;
  }
  :host([data-hydrated]) .badge {
    color: #16a34a;
  }
  video {
    display: block;
    width: 100%;
    background: #000;
  }
`;

/** ✅ Light DOM + <slot>: the media element is the page's, not the shadow's. */
@Component.define(3000) // hydrate 3s after load, so the difference is observable
export class SlotVideo extends Component("slot-video") implements OnMount {
  static styles = BAR;

  @Component.prop() playing = false;
  @Component.prop() time = 0;

  #video(): HTMLVideoElement | null {
    return this.querySelector("video"); // light-DOM child (projected by <slot>)
  }

  onMount(): void {
    this.setAttribute("data-hydrated", "");
    const v = this.#video();
    if (v) trackTime(this, v, this.abortSignal);
  }

  @Component.event() toggle(): void {
    const v = this.#video();
    if (v) v.paused ? v.play() : v.pause();
  }

  render() {
    return html`
      <div class="bar">
        <button @click=${this.toggle}>
          ${this.playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span class="t">${this.time.toFixed(1)}s</span>
        <span class="badge">${this.time ? "hydrated" : "static (SSR)"}</span>
      </div>
      <slot></slot>
    `;
  }
}

/** ⚠️ Video inside the shadow render(): recreated when hydration rebuilds it. */
@Component.define(3000)
export class ShadowVideo extends Component("shadow-video") implements OnMount {
  static styles = BAR;

  // `attribute: true` reflects the `src` attribute (set by the parent / SSR) into
  // this prop — so `this.src` is populated from <shadow-video src="…">.
  @Component.prop({ attribute: true }) src = "";
  @Component.prop() playing = false;
  @Component.prop() time = 0;

  #video(): HTMLVideoElement | null {
    return this.shadowRoot!.querySelector("video"); // owned by the shadow render
  }

  onMount(): void {
    this.setAttribute("data-hydrated", "");
    const v = this.#video();
    if (v) trackTime(this, v, this.abortSignal);
  }

  @Component.event() toggle(): void {
    const v = this.#video();
    if (v) v.paused ? v.play() : v.pause();
  }

  render() {
    return html`
      <div class="bar">
        <button @click=${this.toggle}>
          ${this.playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <span class="t">${this.time.toFixed(1)}s</span>
        <span class="badge">${this.time ? "hydrated" : "static (SSR)"}</span>
      </div>
      <video src=${this.src} muted loop playsinline></video>
    `;
  }
}

const SAMPLE = "https://www.w3schools.com/tags/mov_bbb.mp4";

/**
 * The page shell. It is SERVER-ONLY: defined on the server for SSR, but never
 * defined on the client, so its shadow DOM (this layout + the slotted <video>)
 * is emitted once and never re-rendered. That's what keeps the slot-video's
 * media element alive when its island hydrates.
 */
@Component.define("server") // SSR-rendered, never upgraded on the client → stays static
export class VideoLab extends Component("video-lab") {
  static styles = css`
    :host {
      display: block;
      max-width: 920px;
      margin: 2rem auto;
      font:
        15px/1.5 system-ui,
        sans-serif;
      color: #18181b;
    }
    h1 {
      font-size: 1.5rem;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }
    section h2 {
      font-size: 1rem;
      margin: 0 0 8px;
    }
    code {
      background: #f4f4f5;
      padding: 1px 5px;
      border-radius: 4px;
    }
  `;

  render() {
    return html`
      <h1>Client vs Server: a &lt;video&gt; island</h1>
      <p>
        Both players autoplay from server-rendered markup. Their JS islands
        hydrate after a 3s delay (watch the badge flip to
        <code>hydrated</code>). On hydration the right player's
        <code>&lt;video&gt;</code> is recreated and
        <strong>jumps back to 0:00</strong>; the left one keeps playing.
      </p>
      <div class="grid">
        <section>
          <h2>✅ Light DOM + &lt;slot&gt;</h2>
          <slot-video>
            <video src=${SAMPLE} autoplay muted loop playsinline></video>
          </slot-video>
        </section>
        <section>
          <h2>⚠️ &lt;video&gt; inside shadow</h2>
          <shadow-video src=${SAMPLE}></shadow-video>
        </section>
      </div>
      <!-- Content the Page injects via VideoLab.of(props, slot) lands here -->
      <footer style="margin-top:18px;color:#52525b"><slot></slot></footer>
    `;
  }
}
