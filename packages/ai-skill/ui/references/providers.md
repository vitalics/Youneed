# Component providers — color-scheme, direction, logger, zustand, env

All plug into `Component(tag, { providers: [...] })`, each contributing one namespaced object
on `this`, composable in a single array (orthogonal to the a11y/i18n/rbac/feature-flags
providers). The provider slot is the DOM analogue of a server `Controller`'s `{ guards,
interceptors }`.

## Color scheme (light/dark/auto) — `@youneed/dom-provider-color-scheme`

Reflects CSS `color-scheme` (native controls/scrollbars/`light-dark()` follow it) + a
`data-color-scheme` attribute hook. `this.colorScheme`.
```ts
import { colorSchemeProvider } from "@youneed/dom-provider-color-scheme";

class Card extends Component("x-card", { providers: [colorSchemeProvider("auto")] }) {
  render() {
    return html`<button @click=${() => this.colorScheme.toggle()}>theme</button>
      <p>scheme: ${this.colorScheme.value} (${this.colorScheme.resolved})</p>`;
  }
}
```
`this.colorScheme.{ value, resolved, set, toggle }`. **Global vs per-component:**
`colorSchemeProvider("auto")` — each instance owns its scheme; `colorSchemeProvider(store)` —
pass a shared `ColorSchemeStore` and every bound component themes together (app-wide dark mode).

## Direction (LTR/RTL) — `@youneed/dom-provider-direction`

Reflects the `dir` attribute so shadow content inherits direction; flips at runtime.
`this.direction`.
```ts
import { directionProvider, createDirectionStore, directionOf } from "@youneed/dom-provider-direction";
import { i18nProvider } from "@youneed/dom-provider-i18n";

const dir = createDirectionStore(directionOf(appI18n.locale));   // "ar" → "rtl"
appI18n.subscribe((locale) => dir.set(directionOf(locale)));     // follow the locale

class Card extends Component("x-card", { providers: [i18nProvider(appI18n), directionProvider(dir)] }) {
  render() { return html`<p>dir: ${this.direction.value}</p>`; }
}
```
`this.direction.{ value, set, toggle }`. Compose with `i18nProvider` so an RTL locale and its
direction move together.

## Scoped logger — `@youneed/dom-provider-logger`

A `child(...)` of an app-wide `@youneed/logger`, auto-stamped with the component tag.
`this.logger`.
```ts
import { loggerProvider, setBaseLogger } from "@youneed/dom-provider-logger";
import { createLogger, format } from "@youneed/logger";

setBaseLogger(createLogger({ level: "debug", format: format.combine(format.timestamp(), format.json()) }));

class Cart extends Component("x-cart", { providers: [loggerProvider()] }) {
  onMount() { this.logger.info("mounted"); }     // → { component: "x-cart", message: "mounted", … }
}
```
Set the base once (transports/level/redaction); every component's `this.logger` inherits it
(children share the base's transports). See the `youneed-logging` skill for the logger core.

## Zustand store — `@youneed/dom-provider-zustand`

Bind a vanilla Zustand store; re-render on change (optionally only on a selected slice).
`this.store`.
```ts
import { createStore } from "zustand/vanilla";
import { zustandProvider } from "@youneed/dom-provider-zustand";

const cart = createStore((set) => ({ items: [], add: (i) => set((s) => ({ items: [...s.items, i] })) }));

class Cart extends Component("x-cart", { providers: [zustandProvider(cart)] }) {
  render() {
    return html`<span>items: ${this.store.state.items.length}</span>
      <button @click=${() => this.store.state.add(newItem)}>add</button>`;
  }
}
```
Slice-scoped re-render: `zustandProvider(cart, { selector: (s) => s.items.length })` — unrelated
updates won't repaint.

## Frontend env (type-safe, fail-fast) — `@youneed/dom-provider-env`

Coerce + validate a raw string source against a `@youneed/schema` `t` spec; read via `this.env`.
```ts
import { defineEnvironmentVariables, envProvider, t } from "@youneed/dom-provider-env";

export const env = defineEnvironmentVariables(import.meta.env, {
  schema: { API_URL: t.url(), FEATURE_X: t.boolean().default(false) },
});   // typed: { API_URL: string; FEATURE_X: boolean }

class Widget extends Component("x-widget", { providers: [envProvider(env)] }) {
  render() { return html`<a href=${this.env.API_URL}>open</a>`; }   // typed this.env
}
```
Validation engine is `@youneed/schema` — `t` (chainable, coercing) and the loader are shared
with the server's `@youneed/server-plugin-env`; only platform defaults differ (default source
`import.meta.env`). Fails fast at load if a var is missing/invalid.
