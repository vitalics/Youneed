// Render priority demo: render-blocking vs background.
//
// Both widgets receive the same rapidly-bumped `tick` and do a deliberately
// expensive render (a short busy-wait). The ONLY difference is their scheduler
// priority:
//   • render-blocking — flushes on the microtask queue, right after the current
//     task, BEFORE the browser paints. Always fresh, but its work competes with
//     everything else on the main thread.
//   • background — flushes on idle (requestIdleCallback). Under a flood of
//     updates the idle callback is starved, so renders COALESCE: fewer renders,
//     the shown value lags, but the main thread (and the FPS heartbeat) stays
//     responsive.
//
// Watch the FPS heartbeat and each widget's render count while flooding.

import { Component, html, css, type Priority } from "@youneed/dom";

/** Block the main thread for `ms` — simulates an expensive render. */
function busyWait(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    /* spin */
  }
}

const RENDER_COST_MS = 6; // each widget render burns this long (simulates heavy work)

const widgetStyles = css`
  :host {
    display: block;
    flex: 1;
    border: 1px solid #d4d4d8;
    border-radius: 10px;
    padding: 12px 14px;
    font-family: system-ui, sans-serif;
  }
  .title {
    font-weight: 600;
    margin-bottom: 8px;
  }
  .badge {
    font: 11px ui-monospace, Menlo, monospace;
    border-radius: 4px;
    padding: 1px 6px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    margin: 3px 0;
    font: 13px ui-monospace, Menlo, monospace;
  }
  .big {
    font-size: 26px;
    font-weight: 700;
  }
  .lag {
    color: #b45309;
  }
`;

// A widget that re-renders `tick` with an expensive render. `renders`/`lastTick`
// are PLAIN fields (not @prop): they're mutated inside render(), and mutating a
// reactive prop during render would re-dirty the host and loop forever ("flush
// did not converge"). The render count shows up in devtools anyway — it's the
// length of the component's update history.
interface WidgetSkin {
  tick: number;
  renders: number;
  lastTick: number;
}

function renderHeavy(self: WidgetSkin, title: string, accent: string, prio: Priority) {
  self.renders++;
  busyWait(RENDER_COST_MS); // expensive render — makes scheduling visible
  const skipped = self.tick - self.lastTick; // ticks coalesced since last render
  self.lastTick = self.tick;
  return html`
    <div class="title">
      ${title}
      <span class="badge" style="background:${accent};color:#fff">${prio}</span>
    </div>
    <div class="big">${self.tick}</div>
    <div class="row"><span>renders</span><span>${self.renders}</span></div>
    <div class="row lag"><span>ticks skipped since last</span><span>${skipped}</span></div>
  `;
}

// Priority AND styles are set right at the Component() call — no static fields.
@Component.define()
class BlockingWidget extends Component("blocking-widget", {
  priority: "render-blocking",
  styles: widgetStyles,
}) {
  @Component.prop() tick = 0;
  renders = 0;
  lastTick = 0;
  render() {
    return renderHeavy(this, "Blocking", "#dc2626", "render-blocking");
  }
}

@Component.define()
class BackgroundWidget extends Component("background-widget", {
  priority: "background",
  styles: widgetStyles,
}) {
  @Component.prop() tick = 0;
  renders = 0;
  lastTick = 0;
  render() {
    return renderHeavy(this, "Background", "#2563eb", "background");
  }
}

const rootStyles = css`
  :host {
    display: block;
    font-family: system-ui, -apple-system, sans-serif;
    color: #1b1b1f;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 14px;
  }
  button {
    font: 600 14px system-ui;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #3730a3;
    background: #4f46e5;
    color: #fff;
    cursor: pointer;
  }
  button.stop {
    background: #b91c1c;
    border-color: #7f1d1d;
  }
  .stat {
    font: 13px ui-monospace, Menlo, monospace;
  }
  .fps {
    font-size: 20px;
    font-weight: 700;
  }
  .fps.bad {
    color: #dc2626;
  }
  .fps.ok {
    color: #16a34a;
  }
  .widgets {
    display: flex;
    gap: 14px;
  }
  .hint {
    margin-top: 12px;
    color: #52525b;
    font-size: 13px;
    max-width: 620px;
  }
`;

@Component.define()
class PriorityRoot extends Component("priority-demo", { styles: rootStyles }) {

  @Component.prop() tick = 0;
  @Component.prop() flooding = false;
  @Component.prop() fps = 0;

  #rafId = 0;
  #channel?: MessageChannel;

  onMount() {
    // Independent rAF heartbeat: measures REAL main-thread responsiveness,
    // regardless of the scheduler. It tanks when blocking renders hog the thread.
    let frames = 0;
    let last = performance.now();
    const beat = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        this.fps = Math.round((frames * 1000) / (now - last));
        frames = 0;
        last = now;
      }
      this.#rafId = requestAnimationFrame(beat);
    };
    beat();
    this.onCleanup(() => cancelAnimationFrame(this.#rafId));
    this.onCleanup(() => this.stop());
  }

  // @event binds `this` to the instance, so `@click=${this.toggle}` keeps it.
  @Component.event()
  toggle() {
    this.flooding ? this.stop() : this.start();
  }

  start() {
    if (this.flooding) return;
    this.flooding = true;
    // Flood `tick` via a MessageChannel — a fast stream of macrotasks that
    // saturates the main thread. Each bump flows into both widgets and schedules
    // a re-render at their priority. render-blocking flushes on every microtask
    // (hogs the thread → FPS drops); background defers to idle, which is starved
    // under load → it coalesces many ticks into far fewer renders.
    const ch = (this.#channel = new MessageChannel());
    ch.port1.onmessage = () => {
      if (!this.flooding) return;
      this.tick++;
      ch.port2.postMessage(0);
    };
    ch.port2.postMessage(0);
    // Auto-stop so the busy-wait flood can't freeze the tab indefinitely.
    window.setTimeout(() => this.stop(), 4000);
  }

  stop() {
    this.flooding = false;
    this.#channel?.port1.close();
    this.#channel?.port2.close();
    this.#channel = undefined;
  }

  render() {
    const fpsClass = this.fps && this.fps < 45 ? "bad" : "ok";
    return html`
      <div class="controls">
        <button
          class=${this.flooding ? "stop" : ""}
          @click=${this.toggle}
        >
          ${this.flooding ? "Stop flood" : "Start flood"}
        </button>
        <span class="stat">tick: ${this.tick}</span>
        <span class="stat">FPS: <span class="fps ${fpsClass}">${this.fps || "—"}</span></span>
      </div>

      <div class="widgets">
        <blocking-widget .tick=${this.tick}></blocking-widget>
        <background-widget .tick=${this.tick}></background-widget>
      </div>

      <p class="hint">
        Hit <b>Start flood</b>. Both widgets get the same <code>tick</code> and do
        an expensive (${RENDER_COST_MS}ms) render. The <b>blocking</b> one renders
        on every microtask — its value stays fresh but it hogs the main thread, so
        the FPS heartbeat drops. The <b>background</b> one renders on idle — fewer
        renders, its value lags behind, but FPS stays high. Open the devtools panel
        to compare their <code>priority</code> and render history.
      </p>
    `;
  }
}
