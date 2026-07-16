# @youneed/devtools

A floating, React-DevTools-style inspector for [`@youneed/dom`](../dom): a live,
searchable **component tree**, a **detail** view with props, **time-travel** over
state snapshots, a props diff, emitted events, live **scheduler** swapping, and
per-element **style** editing. Extensible with tabs — [`@youneed/ssr`](../ssr)
pages add **Page / Routes / Map** views.

## Install

```bash
pnpm add -D @youneed/devtools
```

## Use

Install the hook **before** components mount (so their mounts are captured), then
optionally mount the panel:

```ts
import { installDevtools, mountDevtoolsPanel } from "@youneed/devtools";

installDevtools();        // capture per-component state/props/events/styles
mountDevtoolsPanel();     // floating, dockable, interactive panel (state persists)
```

### SSR/SSG pages

For [`@youneed/ssr`](../ssr) apps (with `enablePageDevtools()` on the server),
the client adds Page / Routes / Map tabs:

```ts
import { installDevtools } from "@youneed/devtools";
import { installPageDevtools } from "@youneed/devtools";

installDevtools();
installPageDevtools();    // = mountDevtoolsPanel({ panels: [Page, Routes, Map] })
```

- **Page** — the current page's url, title, clientScript and speculation rules.
- **Routes** — the full route table (current route highlighted).
- **Map** — an SVG graph of the pages, edges drawn from speculation-rule targets
  (green = prerender, blue = prefetch).

## API

- `installDevtools()`, `subscribe(fn)`, `components()`, `inspect(id)`, `clearDevtools()`.
- `mountDevtoolsPanel(target?, options?)` — `options.dock`, `launcher`,
  `highlight`, and `panels: DevtoolsPanel[]` to contribute tabs. Open/collapsed
  state and the active tab persist across (MPA) navigations.
- Page tabs: `installPageDevtools()`, `pageDevtoolsPanels()`, `pagePanel()`,
  `routesPanel()`, `mapPanel()`, `readPayload()`.

## Examples

```bash
pnpm examples:pages    # Components + Page + Routes + Map tabs
pnpm examples:video    # devtools alongside SSR islands
```
