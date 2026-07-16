# @youneed/dom-provider-i18n

Use [`@youneed/i18n`](../i18n) translations inside [`@youneed/dom`](../dom)
components — call `i18n('key')` straight in an `html` template, and have the
component re-render when the locale changes.

```ts
import { Component, html } from "@youneed/dom";
import { createI18n } from "@youneed/i18n";
import { provideI18n, i18n, localized } from "@youneed/dom-provider-i18n";

provideI18n(createI18n({
  resources: { en: { hello: "Hello {name}" }, de: { hello: "Hallo {name}" } },
  locale: "en",
}));

class Greeting extends Component() {
  constructor() {
    super();
    localized(this); // ← re-render on every setLocale(...)
  }
  render() {
    return html`<div>${i18n("hello", { name: "Ada" })}</div>`;
  }
}
```

`i18n(...)` reads the app-wide translator installed by `provideI18n(...)` and
returns a plain string, so it drops into any template hole. Reactivity is opt-in
per component via `localized(this)`: it subscribes the host and calls
`requestUpdate()` on every `setLocale(...)`, auto-unsubscribing on disconnect.

## Key autocomplete

The global `i18n(...)` is **loosely typed** (`key: string`) — convenient, but no
key autocomplete. Two ways to get it:

**1. Use the typed instance directly.** `createI18n(...)` returns a translator
whose call signature narrows the key to the inferred union — so it autocompletes
out of the box. Just call it in the template:

```ts
const appI18n = createI18n({ resources, locale: "en" });
// in a component:
render() { return html`${appI18n("hel…")}`; } // ← autocompletes "hello" | "bye" | …
```

**2. `i18nProvider` — the `providers` slot (recommended).** `Component(tag, {
providers: [...] })` is the DOM analogue of a server `Controller`'s `{ guards,
interceptors }`: an array of orthogonal extensions that augment `this`. Drop in
`i18nProvider(appI18n)` to get a **typed** `this.i18n` AND automatic re-render on
locale change — no `localized` boilerplate, and it composes with other providers
(theme, a11y, …) in the same array:

```ts
import { Component, html } from "@youneed/dom";
import { i18nProvider } from "@youneed/dom-provider-i18n";

class Greeting extends Component("greeting", { providers: [i18nProvider(appI18n)] }) {
  render() {
    return html`<div>${this.i18n("hello", { name: "Ada" })}</div>`;
    //                       ^ autocompletes the keys and type-checks them
  }
}
```

**3. `withI18n` — the same, as a base-class mixin.** Equivalent to a single
provider, in `extends withI18n(Base, t)` form — handy when you're already
chaining mixins:

```ts
import { withI18n } from "@youneed/dom-provider-i18n";
class Greeting extends withI18n(Component("greeting"), appI18n) {
  render() { return html`<div>${this.i18n("hello", { name: "Ada" })}</div>`; }
}
```

| API | meaning |
| --- | --- |
| `provideI18n(instance)` | install the app-wide translator; returns it |
| `i18n(key, params?)` / `t(...)` | translate via the app-wide translator (untyped, for template holes) |
| `getI18n()` | the active translator (throws if none provided) |
| `localized(host, instance?)` | re-render `host` on locale change; auto-unsubscribes on disconnect |
| `i18nProvider(translator)` | a `ComponentProvider` adding a **typed** `this.i18n` + auto reactivity |
| `withI18n(Base, translator)` | the mixin form of the same contribution |

## Devtools — capture (`plugin`) + display (`panel`)

`@youneed/dom-provider-i18n/devtools` adds an i18n tab to the
[`@youneed/devtools`](../devtools) panel, split into **capture** and **display**:

- **`i18nPlugin()`** — a `DevtoolsPlugin` (capture). Register it with
  `installDevtools({ plugins })`; it records every translator's `t()` call
  framework-wide (via the core hook).
- **`i18nPanel(i18n, { resources? })`** — a `DevtoolsPanel` (display). Mount it
  with `mountDevtoolsPanel({ panels })`; it shows a live locale switcher, a
  searchable key browser (per-locale gaps flagged), and a tail of captured calls.

```ts
import { installDevtools, mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
import { i18nPlugin, i18nPanel } from "@youneed/dom-provider-i18n/devtools";
import { i18n, resources } from "./i18n.ts";

installDevtools({ plugins: [i18nPlugin()] });                                            // capture
mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), i18nPanel(i18n, { resources })] }); // display
```

Captured data is also exposed directly (`i18nUsage()`, `onI18nUsage(fn)`,
`clearI18nUsage()`) to feed any UI. `@youneed/devtools` is an optional peer
dependency (only needed for this import).
