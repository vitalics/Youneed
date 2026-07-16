# @youneed/dom

Reactive components on native **Custom Elements + Shadow DOM**. A blend of Lit
(`html`` templates, scoped styles, fine-grained updates), Angular (decorators,
tasks) and the platform — no virtual DOM.

## Install

```bash
pnpm add @youneed/dom
```

> Components use TC39 decorators. Run with `tsx`, or add
> [`@youneed/vite-plugin`](../vite-plugin) when bundling with Vite.

## Component

```ts
import { Component, html, css } from "@youneed/dom";

@Component.define()
class Counter extends Component("x-counter") {
  static styles = css`button { font: inherit }`;

  @Component.prop() count = 0;          // reactive: assigning re-renders
  @Component.prop({ attribute: true }) label = "count"; // reflects <x-counter label="…">

  @Component.event() inc() { this.count++; } // auto-bound for @click

  render() {
    return html`<button @click=${this.inc}>${this.label}: ${this.count}</button>`;
  }
}
```

A component is a real custom element, so it drops into plain HTML, React, Vue, or
SSR markup with no glue.

## What you get

- **Templates** — `html` tagged templates compiled once per call site, then only
  the dynamic holes are patched (`@event`, `.prop`, `attr`, text/node).
- **Reactive state** — `@Component.prop()` (re-renders on assign);
  `{ attribute: true | "name" }` reads an HTML attribute into the prop;
  `{ reflect: true }` also writes it back to the attribute on change, so
  `:host([prop])` CSS and outside observers react; `@Component.computed()`
  (cached getter); `@Component.watch("prop")` (Vue-style).
- **Signals** — fine-grained reactive values (Preact/Angular style):
  `count = this.signal(0)` (read `count()` or `count.value`, write `count.set/.update`),
  `this.computed(() => …)` (memoized derived), `this.effect(() => …)` (auto-tracks,
  auto-stops on disconnect). Writing a signal schedules a re-render. Standalone
  `signal`/`computed`/`effect`/`batch` are also exported for store-level state.
- **Lifecycle** — `onMount()`, `onUpdate()`, `onUnmount()`; `this.abortSignal`
  (an `AbortSignal`) auto-removes listeners on disconnect; `[Symbol.dispose]`.
- **Events** — `this.emit("change", detail)` dispatches a bubbling, composed
  `CustomEvent`. Or **declare an exposed event** (Angular `@Output`-style) with
  `@Component.event` on an `EventEmitter` field — a parent binds it with
  `@name=${fn}` (camelCase preserved). `getExposedEvents(Class)` lists them.

  ```ts
  class AppButton extends Component("app-button") {
    @Component.event("onAdd") add!: EventEmitter<string>;                 // shorthand name
    @Component.event({ name: "onSave", bubbles: false }) save!: EventEmitter<string>; // options
    @Component.event({ exposed: false }) ping!: EventEmitter<number>;     // emits, but hidden from the surface
    render() { return html`<button @click=${() => this.add("hi")}>add</button>`; }
  }
  // parent: <app-button @onAdd=${e => console.log(e.detail)}></app-button>
  ```

  `@Component.event(name | { name?, exposed?, bubbles?, composed?, cancelable? })`.
  `exposed` (default `true` for a field) controls whether it shows up in
  `getExposedEvents` / the devtools panel / editor completion.
- **Template helpers** — `repeat` (keyed lists), `when`, `map`, `classMap`,
  `styleMap`, `ref`/`createRef`, `portal`.
- **Async** — `this.task(fn, opts?)` (or standalone `task(this, fn, opts?)`) for
  cancellable async with `.pending` / `.value` / `.error` / `.aborted`. `fn`
  receives an `AbortSignal` as its last arg; the run is aborted by `.abort()`, by
  re-running, on unmount, or via an external `opts.signal`.
- **Scheduling** — `setDefaultScheduler`, `syncScheduler`, `rafScheduler`,
  `createScheduler`, `createFpsScheduler` (per-component via `static scheduler`).
- **Registration** — `@Component.define(when?)`: immediate, or deferred to
  `"domcontentloaded"` / `"load"` / `"idle"` / a delay in ms / `"server"`
  (SSR-only). `Mount(root, Comp)` / `define(...)` for imperative use.
- **SSR hydration** — `hydrate` / `getHydrationProps` / `flushPendingDefines`
  cooperate with [`@youneed/ssr`](../ssr).

## Examples

`examples/dom`, `examples/raf`, `examples/priority`, `examples/styles`,
`examples/portal`, `examples/cascade`, `examples/compose`.

```bash
pnpm examples:serve:dom   # → http://localhost:8080
```
