// bin-dom.ts — example app for the dom.ts framework.
// Browser: bundled to bin-dom.js (`pnpm build:dom`) and loaded by index.html.
// Headless: `pnpm test:dom`.

import {
  Component,
  html,
  css,
  when,
  repeat,
  classMap,
  Mount,
  rafScheduler,
  type OnMount,
  type OnUnmount,
} from "@youneed/dom";
import { installDevtools, mountDevtoolsPanel } from "@youneed/devtools";

// A custom base class — its members are inherited by the component.
class Logger extends HTMLElement {
  log(...args: unknown[]): void {
    const tag = (this.constructor as { tagName?: string }).tagName ?? "?";
    console.log(`[${tag}]`, ...args);
  }
}

// A reusable styling base: anything built on it gets a yellow background.
// Its `static styles` are merged into the component's shadow root.
class Highlighted extends HTMLElement {
  static styles = css`
    :host {
      background: yellow;
      display: block;
    }
  `;
}

// Uses Highlighted as its base — inherits the highlight + adds its own rule.
// Styles here are RAW CSS TEXT (a string), e.g. the contents of an imported
// `.css` file (`import text from "./my-text.css?raw"`); the framework turns it
// into a scoped stylesheet. A `css` sheet works the same way.
@Component.define()
class MyText extends Component("app-text", {
  base: Highlighted,
  styles: "div { font-weight: bold; }",
}) {
  render() {
    return html`<div>some highlighted text</div>`;
  }
}

// A child component that counts on a timer and emits each tick UP to its
// parent (child -> parent via a CustomEvent — Angular @Output / Vue emit).
@Component.define()
class TickerComponent extends Component("app-ticker") {
  // Two-way value: parent passes it down (.count=…), child reports changes up.
  @Component.prop()
  count = 0;

  // Input WITHOUT a default — provided from the parent via .label=…
  @Component.prop()
  label!: string;

  onMount() {
    const timer = setInterval(() => this.advance(), 1000);
    this.onCleanup(() => clearInterval(timer)); // auto-cleared on disconnect
  }

  /** One tick: bump and notify the parent (the "change" half of two-way). */
  advance() {
    this.count++;
    this.emit("count-change", this.count);
  }

  // Reset lives INSIDE the ticker now: it resets its own value and reports the
  // change up, so the parent's two-way binding stays in sync.
  @Component.event()
  reset() {
    this.count = 0;
    this.emit("count-change", this.count);
  }

  render() {
    return html`
      <span>${this.label ?? "?"}: ${this.count}</span>
      <button @click=${this.reset}>reset</button>
    `;
  }
}

// Low-priority component: its re-renders are deferred (idle/macrotask), not
// flushed on the microtask queue. Good for non-urgent, off-screen-ish UI.
@Component.define()
class BadgeComponent extends Component("app-badge", { priority: "background" }) {
  // `type: Number` is type-checked against the field — must be a number prop.
  @Component.prop({ type: Number })
  n = 0;

  render() {
    return html`<span>badge ${this.n}</span>`;
  }
}

// Realistic background update: a widget that polls "stats" on a timer. The
// refresh is a *background* task, so its pending/value updates are scheduled at
// low priority and never block render-blocking interactions (clicks, typing).
@Component.define()
class StatsComponent extends Component("app-stats") {
  refresh = this.task<[], number>(
    async (signal) => {
      const res = await fetch("https://example.com/stats", { signal });
      const { online } = await res.json();
      return online;
    },
    { priority: "background" }, // <- the developer just marks it background
  );

  onMount() {
    this.refresh.run(); // initial load
    const id = setInterval(() => this.refresh.run(), 5000); // poll in the background
    this.onCleanup(() => clearInterval(id)); // auto-stopped on disconnect
  }

  render() {
    const v = this.refresh.value;
    return html`<span>online: ${v ?? "…"}${this.refresh.pending ? " (syncing)" : ""}</span>`;
  }
}

// Global, high-frequency events. `this.listen` subscribes and auto-unsubscribes
// on disconnect; `static scheduler = rafScheduler` coalesces the flood of
// mousemove/resize updates to one render per animation frame.
@Component.define()
class PointerComponent extends Component("app-pointer", { scheduler: rafScheduler }) {
  @Component.prop() x = 0;
  @Component.prop() y = 0;
  @Component.prop() width = 0;

  onMount() {
    this.width = window.innerWidth;
    this.listen(window, "resize", () => {
      this.width = window.innerWidth;
    });
    this.listen(document, "mousemove", (e) => {
      const m = e as MouseEvent;
      this.x = m.clientX;
      this.y = m.clientY;
    });
  }

  render() {
    return html`<span>${this.width}px · pointer (${this.x}, ${this.y})</span>`;
  }
}

// ── when() + repeat(): conditional + keyed-list rendering ─────────────────────
// A tiny todo list that puts both flow directives to work:
//   • repeat(items, keyFn, tpl) — KEYED reconciliation. On reorder/add/remove the
//     framework MOVES the existing DOM by key instead of recreating it, so live
//     state (a focused input, a checkbox, scroll) survives. Hit "reverse": the
//     <li> nodes are reused, just re-ordered.
//   • when(cond, then, else?) — a lazy branch; only the taken side runs. Here it
//     swaps between the list and an empty-state message.
//   • classMap({...}) — builds the class string from a flag map.
interface Todo {
  id: number;
  text: string;
  done: boolean;
}
type TodoFilter = "all" | "active" | "done";

@Component.define()
class TodosComponent extends Component("app-todos") {
  static styles = css`
    :host { display: block; font: 14px/1.5 system-ui, sans-serif; }
    .bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    button { font: inherit; padding: 2px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; }
    .chip.on { background: #4f46e5; border-color: #4f46e5; color: #fff; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    li { display: flex; align-items: center; gap: 8px; }
    li.done label { text-decoration: line-through; color: #94a3b8; }
    .empty { color: #94a3b8; font-style: italic; }
    .count { color: #64748b; margin: 8px 0 0; }
  `;

  @Component.prop() items: Todo[] = [
    { id: 1, text: "learn when()", done: true },
    { id: 2, text: "learn repeat()", done: false },
    { id: 3, text: "ship the example", done: false },
  ];
  @Component.prop() filter: TodoFilter = "all";
  #nextId = 4;

  // The list the template renders — derived from items + filter.
  get visible(): Todo[] {
    if (this.filter === "all") return this.items;
    const wantDone = this.filter === "done";
    return this.items.filter((t) => t.done === wantDone);
  }

  @Component.event() setFilter(e: Event) {
    this.filter = (e.currentTarget as HTMLElement).dataset.filter as TodoFilter;
  }
  @Component.event() add() {
    const id = this.#nextId++;
    this.items = [...this.items, { id, text: `task ${id}`, done: false }];
  }
  @Component.event() reverse() {
    this.items = [...this.items].reverse(); // keyed repeat MOVES nodes, not recreates
  }

  // Plain methods — they reassign the reactive `items` prop, which re-renders.
  toggle(id: number) {
    this.items = this.items.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  }
  removeItem(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }

  render() {
    const left = this.items.filter((t) => !t.done).length;
    return html`
      <div class="bar">
        ${repeat(
          ["all", "active", "done"] as const,
          (f) => f,
          (f) => html`<button class=${classMap({ chip: true, on: this.filter === f })} data-filter=${f} @click=${this.setFilter}>${f}</button>`,
        )}
        <button @click=${this.add}>add</button>
        <button @click=${this.reverse}>reverse</button>
      </div>

      ${when(
        this.visible.length === 0,
        () => html`<p class="empty">nothing here — pick another filter</p>`,
        () => html`<ul>
          ${repeat(
            this.visible,
            (t) => t.id, // stable key → keyed reconciliation
            (t) => html`<li class=${classMap({ done: t.done })}>
              <label><input type="checkbox" .checked=${t.done} @change=${() => this.toggle(t.id)} /> ${t.text}</label>
              <button @click=${() => this.removeItem(t.id)}>✕</button>
            </li>`,
          )}
        </ul>`,
      )}

      <p class="count">${left} left · ${this.items.length} total</p>
    `;
  }
}

// ── abortable long-running task: start it, cancel it, unmount cancels it ──────
// `this.task(fn)` injects an AbortSignal as fn's LAST argument. A long operation
// (here a faked 8-second "request" via setTimeout) becomes cancellable by
// honoring that signal. The run is aborted when ANY of these happen:
//   • you call `.abort()` (or `[Symbol.dispose]()`);
//   • you `.run()` again (the previous run is superseded);
//   • the component unmounts (auto, via the host's cleanup);
//   • an external `{ signal }` you passed to the task fires.
// An abort rejects with AbortError, which the task treats as a CANCELLATION
// (not an `.error`) and flips `.aborted` on — so the UI can show "cancelled".
@Component.define()
class SlowComponent extends Component("app-slow") {
  static styles = css`
    :host { display: block; font: 14px/1.5 system-ui, sans-serif; }
    button { font: inherit; padding: 2px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer; margin-right: 6px; }
    button:disabled { opacity: 0.5; cursor: default; }
    .status { margin-top: 6px; }
    .pending { color: #b45309; }
    .done { color: #15803d; }
    .aborted { color: #b91c1c; }
  `;

  // The "very long request": resolves after 8s, but aborts INSTANTLY when the
  // injected signal fires — note it clears its timer so nothing leaks.
  slow = this.task<[], string>(
    (signal) =>
      new Promise<string>((resolve, reject) => {
        const id = setTimeout(() => resolve("✅ data (after 8s)"), 8000);
        signal.addEventListener("abort", () => {
          clearTimeout(id);
          const err = new Error("aborted");
          err.name = "AbortError"; // → task records it as `.aborted`, not `.error`
          reject(err);
        });
      }),
  );

  render() {
    const t = this.slow;
    const status = t.pending
      ? html`<span class="pending">loading… (8s — hit Abort or unmount me)</span>`
      : t.aborted
        ? html`<span class="aborted">aborted ✕</span>`
        : t.error
          ? html`<span class="aborted">error</span>`
          : html`<span class="done">${t.value ?? "idle"}</span>`;
    return html`
      <button @click=${() => t.run()} .disabled=${t.pending}>load</button>
      <button @click=${() => t.abort()} .disabled=${!t.pending}>abort</button>
      <div class="status">${status}</div>
    `;
  }
}

class RootComponent extends Component("app-root", { base: Logger }) implements OnMount, OnUnmount {
  @Component.prop()
  name = "hello";

  @Component.prop()
  clicks = 0;

  // Parent owns the two-way value; it flows down to the child and back up.
  @Component.prop()
  shared = 10;

  // Incremented by an external (document-level) event we subscribe to in onMount.
  @Component.prop()
  pings = 0;

  // Typed task: `this.load.run(name)` and `this.load.pending` autocomplete.
  load = this.task<[prop: string], void>(async (prop, signal) => {
    const response = await fetch(`https://example.com/${prop}`, { signal });
    this.name = response.ok ? "okay" : "failed";
  });

  // Vue-style computed (cached until the next reactive change).
  @Component.computed()
  get shout(): string {
    return this.name.toUpperCase();
  }

  // Vue watch / Angular ngOnChanges.
  @Component.watch("name")
  onNameChange(next: string, prev: string) {
    this.log(`name: ${prev} -> ${next}`); // uses the inherited base method
  }

  @Component.event()
  onClick() {
    this.clicks++; // synchronous reactive update
    this.emit("count", this.clicks); // Angular @Output / Vue emit
    this.load.run(this.name); // start the abortable task (signal injected)
  }

  // "change" half of two-way: child reported a new value (tick or reset) ->
  // store it (which then flows back down into the child via .count=${shared}).
  @Component.event()
  onCountChange(event: Event) {
    this.shared = (event as CustomEvent<number>).detail;
  }

  // Lifecycle hooks.
  onMount() {
    this.log("mounted");
    // External subscription — auto-removed on disconnect (no manual cleanup).
    this.listen(document, "app:ping", () => {
      this.pings++;
    });
  }
  onUnmount() {
    this.log("unmounted");
  }

  render() {
    return html`
      <p>hello ${this.name} (${this.shout})</p>
      <button @click=${this.onClick}>clicks: ${this.clicks}</button>
      <p>task: ${this.load.pending ? "loading…" : "idle"}</p>

      <!-- two-way: .count down + @count-change up; .label is an input w/o default.
           The ticker now owns its own reset button. -->
      <app-ticker
        .count=${this.shared}
        .label=${"ticks"}
        @count-change=${this.onCountChange}
      ></app-ticker>
      <p>shared (two-way): ${this.shared}</p>
      <p>pings (external event): ${this.pings}</p>

      <!-- background-priority child: re-renders deferred, not on microtask -->
      <app-badge .n=${this.shared}></app-badge>
      <!-- realistic background update: polls stats via a background task -->
      <app-stats></app-stats>
      <!-- styles: yellow background inherited from the Highlighted base -->
      <app-text></app-text>
      <!-- global high-frequency events (resize/mousemove), rAF-coalesced -->
      <app-pointer></app-pointer>
      <!-- when() (conditional) + repeat() (keyed list): try the chips & "reverse" -->
      <app-todos></app-todos>
      <!-- abortable long task: load (8s) then Abort, or unmount mid-flight -->
      <app-slow></app-slow>
    `;
  }
}

function bootstrap() {
  installDevtools(); // before mounting, so the inspector captures everything
  // Components self-register via @Component.define at declaration time.
  let root = document.getElementById("root");
  if (!root) {
    root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
  }
  const app = Mount(root, RootComponent);
  mountDevtoolsPanel(); // floating inspector panel (dev only)
  return app;
}

bootstrap();
