# @youneed/dom — Component Reference

Web components on TC39 decorators. Source of truth: `packages/dom/src/dom.ts`,
`packages/dom/src/register.ts`, examples in `examples/dom/bin-dom.ts`.

## Defining a component

```ts
import { Component, html, css } from "@youneed/dom";

@Component.define()                       // register now
class Counter extends Component("x-counter") {
  static styles = css`button { font: inherit }`;
  @Component.prop() count = 0;            // reactive field
  @Component.event() inc() { this.count++; }   // auto-bound method
  render() {
    return html`<button @click=${this.inc}>${this.count}</button>`;
  }
}
```

- `@Component.define()` registers immediately. `@Component.define("domcontentloaded" | "load" | "idle" | <ms> | "server")` defers. `define(Class)` registers imperatively.
- Custom element name comes from `Component("tag")`. Light DOM: `Component("tag", { shadow: false })` (static styles ignored, mounts faster). Per-component scheduler: `Component("tag", { scheduler })`.
- Typed public contract: `class C extends Component<Props>("tag") { declare _typed_props: Props }`. `Component<TProps>` types `.of`, not the instance — force field declaration with `implements Props`.
- Instantiate: `Counter.of({ count: 5 })` (typed factory), `new Counter({ count: 5 })`, or `Mount(document.body, Counter)`.

## Templates (`html`, `css`)

```ts
html`<div class="${cls}"></div>`              // attribute (string)
html`<input .value=${text} .disabled=${!ok}/>` // .prop = JS property
html`<button @click=${this.onClick}></button>` // @event (camelCase preserved)
html`${when(cond, () => html`<a/>`, () => html`<b/>`)}`        // conditional
html`<ul>${repeat(items, it => it.id, it => html`<li>${it.name}</li>`)}</ul>` // keyed list
html`<ul>${map(items, (it,i) => html`<li>${it}</li>`)}</ul>`  // unkeyed list
html`<input ${ref(this.#input)} />`            // capture element
html`${portal(document.body, content)}`        // render outside Shadow DOM
html`<div class=${classMap({ active: on })} style=${styleMap({ color })}></div>`
```

CSS: `static styles = css\`...\``, raw string, an array of them, or a lazy `() => import("./x.css")` (FOUC risk). `:host([attr])` works with reflected props.

**Template identity matters** — return the *same* `html` literal each render so only holes update; building a new template (e.g. concatenating two `html``) rebuilds the DOM.

## Reactivity

```ts
@Component.prop() count = 0;                          // reactive
@Component.prop({ attribute: true }) label = "text";  // reads HTML attr, coerces type
@Component.prop({ attribute: "max-count" }) max = 10; // explicit lowercase attr name
@Component.prop({ reflect: true }) enabled = false;   // two-way → <x-el enabled>, :host([enabled])
@Component.computed() get total() { return this.items.reduce((s,i)=>s+i.price,0); } // cached
@Component.watch("search") onSearch(next, prev) { /* runs on change */ }
```

Assigning a reactive field schedules `requestUpdate()`. Before the element connects, assignments are pending and flush on `connectedCallback`.

## Signals (Preact / Angular style)

Fine-grained reactive values, an alternative to `@prop` for internal state that
isn't an attribute. Writing a signal schedules a re-render; `this.computed` /
`this.effect` track signal reads automatically.

```ts
class Counter extends Component("x-counter") {
  count = this.signal(0);                       // writable signal bound to this host
  doubled = this.computed(() => this.count() * 2); // memoized derived signal
  onMount() {
    this.effect(() => console.log(this.count())); // re-runs on change, auto-stops on disconnect
  }
  render() {
    // read: count() (Angular) or count.value (Preact)
    return html`<button @click=${() => this.count.update(n => n + 1)}>${this.count()} → ${this.doubled()}</button>`;
  }
}
```

- Read: `count()` or `count.value`; `count.peek()` reads without subscribing.
- Write: `count.set(x)`, `count.value = x`, `count.update(prev => …)`.
- `count.subscribe(fn)` / `count.asReadonly()` / custom `this.signal(0, { equals })`.
- Standalone primitives (module/store state): `import { signal, computed, effect, batch } from "@youneed/dom"`. `batch(() => { a.set(1); b.set(2) })` coalesces dependent effects into one run. Standalone `effect()` is NOT auto-disposed — keep the returned stopper; on a host prefer `this.effect()`.

`@prop` (attribute-facing, reflected) vs `signal` (value-typed internal state) — both schedule a re-render; pick `@prop` when it maps to an HTML attribute.

## Props vs attributes

- `.prop=${obj}` passes a real JS property (objects, functions, numbers) — not reflected to HTML.
- `attribute: true` reads from the HTML attribute (always a string, coerced by `type`).
- **camelCase gotcha:** HTML lowercases attributes, so `.myProp=${x}` becomes `myprop`. Group multiple values into one `.data=${{ a, b }}` object, or pass them via events.

## Events

```ts
@Component.event() add!: EventEmitter<string>;            // @Output-style exposed event
@Component.event("onSave") save!: EventEmitter<string>;   // explicit name (camelCase kept)
@Component.event({ name: "onDelete", bubbles: false, composed: true, exposed: false }) del!: EventEmitter<string>;
// fire: this.add("hi")   |   parent listens: html`<app-button @add=${e => e.detail}>`
this.emit("custom", { data: 42 });                        // raw CustomEvent (lowercase name)
this.listen(window, "resize", handler);                   // auto-removed on disconnect
```

`getExposedEvents(Class)` lists exposed event names (devtools/introspection).

## Lifecycle & cleanup

```ts
class C extends Component("x-c") implements OnMount, OnUpdate, OnUnmount {
  onMount() {/* after first render, once */}
  onUpdate() {/* after every later render */}
  onUnmount() {/* on disconnect */}
}
this.onCleanup(() => clearInterval(id));    // teardown, runs LIFO on disconnect
window.addEventListener("scroll", fn, { signal: this.abortSignal }); // this.abortSignal aborts on disconnect
```

Host helpers: `requestUpdate(priority?)`, `flushSync()`, `slotted()`, `setScheduler()`,
`getStyles()/setStyles()`, `onFrame(cb)`, `signal()/computed()/effect()`, `abortSignal`, `[Symbol.dispose]()`.

## Error boundary

```ts
class Safe extends Component("x-safe") implements OnError {
  onError(error: unknown, info: ErrorInfo) { // info.phase: render|mount|update|unmount, info.tag
    this.errorMsg = String(error); this.requestUpdate();
  }
}
setErrorHandler((err, info) => log(err, info)); // global fallback
```

The scheduler flush is resilient — one component throwing does not stop sibling flushes.

## Async tasks

```ts
load = this.task(async (userId, signal) => (await fetch(`/u/${userId}`, { signal })).json());
onMount() { this.load.run(this.userId); }   // .run() aborts the previous run
// pass an extra signal to also abort the task externally:
//   this.task(fn, { signal: this.abortSignal, priority: "background" })
render() {
  if (this.load.pending) return html`<spinner/>`;
  if (this.load.error)   return html`<div>${this.load.error}</div>`;
  return html`<div>${this.load.value?.name}</div>`;   // also .aborted
}
```

## Schedulers

`setDefaultScheduler(s)` globally; `syncScheduler` (SSR/tests), `rafScheduler` (browser default),
`createScheduler()`, `createFpsScheduler(60)`. Swap per component via constructor option or `this.setScheduler()`.

## Virtualization — `@youneed/dom-provider-virtual`

```ts
// Provider form — adds this.virtual(...)
import { virtualProvider } from "@youneed/dom-provider-virtual";
class Feed extends Component("x-feed", { providers: [virtualProvider()] }) {
  render() {
    return html`${this.virtual({ items: this.rows, render: r => html`<div>${r.title}</div>`,
      estimateHeight: 40, chunkSize: 20, overscan: 400, key: (r,i) => r.id })}`;
  }
}

// Standalone form — still exported
import { virtual } from "@youneed/dom-provider-virtual";
render() { return html`${virtual({ items: this.rows, render: r => html`<div>${r.title}</div>` })}`; }
```

Chunks into `<vm-virtual-chunk>`; an IntersectionObserver activates on-screen chunks and collapses off-screen ones to spacers. Parent does not re-render on scroll.

## SSR / SSG — `@youneed/ssr`

```ts
import { registerDOM } from "@youneed/dom/register";
registerDOM();   // happy-dom; call before importing components
import { renderToString, renderPage, Page, mountPages, renderPageToString } from "@youneed/ssr";

renderToString(MyComponent);           // Declarative Shadow DOM + inlined styles
class Home extends Page("/", { title: "Home", clientScript: () => import("./client.ts") }) {
  render(ctx) { return HomeComponent; }
  @Page.get("/stats") getStats(ctx) { return this.json({ online: 100 }); }
  @Page.post() submit(ctx) { return this.redirect("/"); }
}
mountPages(Application(), Home).listen(3010);    // SSR with routing
await renderPageToString(Home);                   // SSG one page
```

Render modes: `"ssr"` (default, re-render per request), `"ssg"` (render once, cache), `"client"` (shell only).

## Node DOM registration — `@youneed/dom/register`

`registerDOM(opts?)`, `unregisterDOM()`, `isDOMRegistered()`. Always go through this package — it encapsulates happy-dom — rather than touching `GlobalRegistrator`.

## React interop — `@youneed/dom-adapter-react`

`toReact(VmGrid, { size: 40 })`, `toReact("vm-grid", props)`, or `toReact(new VmGrid({...}))`.
Props are assigned as JS properties (reactive setters fire); React children land in light DOM via `<slot>`.
