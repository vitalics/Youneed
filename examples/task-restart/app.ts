// Auto-restarting task: a task counts up once per tick, and when the count
// reaches a threshold the task RESTARTS itself (a new "lap" begins).
//
// The mechanism, in our components:
//   1. A `task()` drives an async loop, committing a reactive `count` each tick.
//   2. `@Component.watch("count")` fires synchronously whenever `count` changes.
//   3. When the watcher sees `count >= threshold`, it resets and calls
//      `task.run()` again. `run()` aborts the in-flight run and starts a fresh
//      one — so it's a clean restart, not a second concurrent loop.
//
// Why a watcher (not an `if` inside the task)? The "restart when X happens" rule
// lives in ONE place and reacts to the value however it changed — the task loop,
// a manual +1 button, or a future bit of code. The task just produces the value.

import { Component, html, css, task, type OnMount } from "@youneed/dom";

/** A cancellable delay: rejects (AbortError) if the task is superseded/aborted. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

const STYLES = css`
  :host {
    display: block;
    font-family: system-ui, sans-serif;
    color: #1b1b1f;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  button {
    font: 600 14px system-ui;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid #3730a3;
    background: #4f46e5;
    color: #fff;
    cursor: pointer;
  }
  button.ghost {
    background: #fff;
    color: #3730a3;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .count {
    font: 700 48px ui-monospace, Menlo, monospace;
    color: #4f46e5;
    min-width: 90px;
    text-align: center;
  }
  .bar {
    height: 12px;
    border-radius: 999px;
    background: #e4e4e7;
    overflow: hidden;
  }
  .bar > i {
    display: block;
    height: 100%;
    background: #4f46e5;
    transition: width 0.25s;
  }
  .stat {
    font: 13px ui-monospace, Menlo, monospace;
    color: #52525b;
  }
  .stat b {
    color: #1b1b1f;
  }
  label {
    font: 13px system-ui;
    color: #52525b;
  }
`;

@Component.define()
class RestartCounter extends Component("restart-counter", { styles: STYLES }) implements OnMount {
  // Reactive: each change re-renders AND fires the @watch below.
  @Component.prop() count = 0;
  @Component.prop() threshold = 5;
  @Component.prop() laps = 0;
  @Component.prop() running = true;

  // The task: an async loop that bumps `count` once per tick until aborted.
  // Calling `tick.run()` again aborts this loop (signal fires) and starts fresh.
  tick = task<[], void>(this, async (signal) => {
    while (!signal.aborted) {
      await wait(700, signal); // cancellable — supersede/abort rejects it
      this.count += 1; // reactive commit → render + @watch("count")
    }
  });

  onMount(): void {
    this.tick.run();
  }

  // ── THE ANSWER ────────────────────────────────────────────────────────────
  // Fires on every `count` change. When it reaches the threshold, restart the
  // task: count a lap, reset to 0, and run() again (aborts the old loop, starts
  // a clean one). Setting count = 0 re-enters this watcher with 0 (< threshold),
  // which returns immediately — no recursion.
  @Component.watch("count")
  onCount(next: number): void {
    if (next < this.threshold) return;
    this.laps += 1;
    this.count = 0;
    this.tick.run(); // ← restart the task
  }

  @Component.event()
  toggle(): void {
    this.running = !this.running;
    if (this.running) this.tick.run();
    else this.tick.abort(); // pause: cancels the in-flight wait
  }

  @Component.event()
  bump(): void {
    this.count += 1; // manual +1 — the SAME watcher restarts at the threshold
  }

  render() {
    const pct = Math.min(100, Math.round((this.count / this.threshold) * 100));
    return html`
      <div class="row">
        <div class="count">${this.count}</div>
        <div style="flex:1">
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="stat" style="margin-top:6px">
            restart at <b>${this.threshold}</b> · laps completed: <b>${this.laps}</b> ·
            ${this.running ? "running" : "paused"}
          </div>
        </div>
      </div>
      <div class="row">
        <button @click=${this.toggle}>${this.running ? "⏸ Pause" : "▶ Resume"}</button>
        <button class="ghost" @click=${this.bump}>+1 now</button>
        <label>
          threshold
          <input
            type="number"
            min="1"
            .value=${String(this.threshold)}
            @input=${(e: Event) => (this.threshold = Math.max(1, Number((e.target as HTMLInputElement).value) || 1))}
            style="width:56px"
          />
        </label>
      </div>
    `;
  }
}
