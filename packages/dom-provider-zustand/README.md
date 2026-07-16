# @youneed/dom-provider-zustand

Bind a [Zustand](https://github.com/pmndrs/zustand) store to
[`@youneed/dom`](../dom) components. The provider contributes a reactive
`this.store` (read state, write it, select slices) and re-renders the component
when the store changes — optionally only when a selected slice changes.

```ts
import { createStore } from "zustand/vanilla";
import { Component, html } from "@youneed/dom";
import { zustandProvider } from "@youneed/dom-provider-zustand";

const cart = createStore((set) => ({
  items: [],
  add: (item) => set((s) => ({ items: [...s.items, item] })),
}));

class Cart extends Component("x-cart", { providers: [zustandProvider(cart)] }) {
  render() {
    return html`
      <span>items: ${this.store.state.items.length}</span>
      <button @click=${() => this.store.state.add(newItem)}>add</button>`;
  }
}
```

Re-render only when a slice changes (unrelated updates won't repaint):

```ts
zustandProvider(cart, { selector: (s) => s.items.length })
```

It plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to the
other providers (`i18nProvider`, `loggerProvider`, …), composed in one array.

## `this.store`

| Member | meaning |
| --- | --- |
| `this.store.state` | the current store state (live snapshot) |
| `this.store.get()` | read the current state |
| `this.store.set(partial, replace?)` | update the store (object patch or updater) |
| `this.store.select(selector)` | read a derived slice of the current state |

| option | default | meaning |
| --- | --- | --- |
| `selector` | — | re-render only when this slice changes (vs. on any change) |
| `equals` | `Object.is` | equality for the selected slice |

## Devtools — capture (`plugin`) + display (`panel`)

`@youneed/dom-provider-zustand/devtools` adds a zustand tab to the
[`@youneed/devtools`](../devtools) panel, split into **capture** and **display**:

- **`zustandPlugin(store, { name })`** — a `DevtoolsPlugin` (capture). Register one
  per store with `installDevtools({ plugins })`; it records every change.
- **`zustandPanel()`** — a `DevtoolsPanel` (display). Mount it with
  `mountDevtoolsPanel({ panels })`; it shows each watched store's current state
  and a tail of changes, each with a **restore** (time-travel) button.

```ts
import { installDevtools, mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
import { zustandPlugin, zustandPanel } from "@youneed/dom-provider-zustand/devtools";
import { cart, user } from "./stores.ts";

installDevtools({ plugins: [zustandPlugin(cart, { name: "cart" }), zustandPlugin(user, { name: "user" })] });
mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), zustandPanel()] });
```

Captured data is also exposed directly (`zustandChanges()`, `onZustandChanges(fn)`,
`zustandStores()`, `clearZustandChanges()`) to feed any UI.

## No hard dependency on Zustand

The package types against a structural, Zustand-compatible `StoreApi` — a real
`StoreApi<T>` from `zustand/vanilla` satisfies it — so there's **no bundled
Zustand**. Bring your own (`zustand` is an optional peer dependency). The store
subscription is removed on disconnect.
