# @youneed/dom-provider-direction

Per-component text direction (LTR / RTL) for [`@youneed/dom`](../dom). A
composable provider that reflects the `dir` attribute on a component (so its
shadow content inherits the direction) and lets it flip at runtime. Its members
live under a single namespaced object — **`this.direction`** — so they read as
the provider's, not as native members (like `this.i18n` / `this.a11y`).

```ts
import { Component, html } from "@youneed/dom";
import { directionProvider } from "@youneed/dom-provider-direction";

class Panel extends Component("x-panel", { providers: [directionProvider("ltr")] }) {
  render() {
    return html`
      <button @click=${() => this.direction.toggle()}>flip</button>
      <p>dir: ${this.direction.value}</p>`;
    //          ^ this.direction.{ value, set, toggle } are typed
  }
}
```

It plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to
other providers, so an RTL **locale** and its **direction** compose in one array:

```ts
import { i18nProvider } from "@youneed/dom-provider-i18n";
import { directionProvider, createDirectionStore, directionOf } from "@youneed/dom-provider-direction";

const dir = createDirectionStore(directionOf(appI18n.locale)); // "ar" → "rtl"
appI18n.subscribe((locale) => dir.set(directionOf(locale)));    // follow the locale

class Card extends Component("x-card", {
  providers: [i18nProvider(appI18n), directionProvider(dir)],
}) {
  render() { return html`${this.i18n("hello", { name: "Ada" })}`; }
}
```

## Per-instance vs shared

- **`directionProvider("ltr")`** — each instance owns its direction; toggling one
  doesn't affect another.
- **`directionProvider(store)`** — pass a shared `DirectionStore` and every bound
  component flips together (app-wide RTL).

| API | meaning |
| --- | --- |
| `directionProvider(init?)` | the `ComponentProvider`; `init` is a `Direction` literal (per-instance) or a shared `DirectionStore` |
| `this.direction.value` | current direction (mirrors the host's `dir`) |
| `this.direction.set(dir)` | set it, reflect `dir`, re-render (and notify peers if shared) |
| `this.direction.toggle()` | flip `ltr` ⇄ `rtl` |
| `createDirectionStore(initial?)` | a standalone reactive direction store (`direction` / `set` / `toggle` / `subscribe`) |
| `directionOf(locale)` | the natural direction of a BCP-47 locale (`"ar"` → `"rtl"`) |
