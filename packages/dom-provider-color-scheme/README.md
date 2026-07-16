# @youneed/dom-provider-color-scheme

Light / dark / auto **color scheme** for [`@youneed/dom`](../dom), globally or per
component. A composable provider that reflects the CSS `color-scheme` property
(so native form controls, scrollbars and `light-dark()` follow it) plus a
`data-color-scheme` attribute (a hook for your own CSS). Its members live under a
single namespaced object — **`this.colorScheme`** — like `this.i18n` / `this.a11y`.

```ts
import { Component, html } from "@youneed/dom";
import { colorSchemeProvider } from "@youneed/dom-provider-color-scheme";

class Card extends Component("x-card", { providers: [colorSchemeProvider("auto")] }) {
  render() {
    return html`
      <button @click=${() => this.colorScheme.toggle()}>theme</button>
      <p>scheme: ${this.colorScheme.value} (${this.colorScheme.resolved})</p>`;
    //          ^ this.colorScheme.{ value, resolved, set, toggle } are typed
  }
}
```

It plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to
other providers (e.g. `i18nProvider`, `directionProvider`), so they compose in one
array.

## Global vs per-component

- **`colorSchemeProvider("auto")`** — each instance owns its scheme; toggling one
  doesn't affect another.
- **`colorSchemeProvider(store)`** — pass a shared `ColorSchemeStore` and every
  bound component themes together (app-wide light/dark):

```ts
import { createColorSchemeStore } from "@youneed/dom-provider-color-scheme";
const theme = createColorSchemeStore("auto");
class A extends Component("x-a", { providers: [colorSchemeProvider(theme)] }) {}
theme.set("dark"); // A (and every other follower) re-renders in dark
```

`auto` resolves against the OS preference (`prefers-color-scheme`), and maps to
the CSS `color-scheme: light dark`. `this.colorScheme.resolved` gives the concrete
`"light"` / `"dark"` in effect.

| API | meaning |
| --- | --- |
| `colorSchemeProvider(init?)` | the `ComponentProvider`; `init` is a `ColorScheme` literal (per-instance) or a shared `ColorSchemeStore` |
| `this.colorScheme.value` | the chosen preference (`light` / `dark` / `auto`) |
| `this.colorScheme.resolved` | the concrete scheme in effect (`auto` resolved) |
| `this.colorScheme.set(s)` | set it, reflect CSS + `data-color-scheme`, re-render (notify peers if shared) |
| `this.colorScheme.toggle()` | flip to the opposite of what's in effect |
| `createColorSchemeStore(initial?)` | a standalone reactive store (`colorScheme` / `set` / `toggle` / `subscribe`) |
| `resolveColorScheme(s)` / `systemPrefersDark()` | resolve `auto`; read the OS preference |
