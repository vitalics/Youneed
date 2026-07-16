# @youneed/devtools — Runtime Inspector

A floating, React-DevTools-style panel for `@youneed/dom` components. Browser/DOM only.
Source: `packages/devtools/src/core.ts`, `panel.ts`, `dom-devtools.ts`, `page-devtools.ts`.

## Install & mount

```ts
import { installDevtools, mountDevtoolsPanel } from "@youneed/devtools";

installDevtools();        // MUST run before components mount — installs the capture hook
mountDevtoolsPanel();     // optional floating UI; mountDevtoolsPanel(target?, options?)
```

`mountDevtoolsPanel` is idempotent (returns the existing host on re-call). Options:

```ts
interface DevtoolsPanelOptions {
  dock?: "bottom" | "top" | "left" | "right";
  launcher?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  panels?: DevtoolsPanel[];   // replace the built-in tabs
}
```

For SSR/SSG apps there is also `installPageDevtools(target?, options?)` which adds
**Page** (SSR payload), **Routes** (route table) and **Map** (page-link graph) tabs.

## Dev-only wiring (keep it out of production)

`@youneed/devtools` is `sideEffects: false`; if you never import it, bundlers drop it.
Import it lazily behind a dev flag:

```ts
if (import.meta.env.DEV) {
  const { installDevtools, mountDevtoolsPanel } = await import("@youneed/devtools");
  installDevtools();
  mountDevtoolsPanel();
}
```

On the DOM side the cost when devtools is *not* installed is a single
`globalThis.__DOM_DEVTOOLS__` null-check per lifecycle event — capture is skipped entirely.

## What it captures (per component)

`ComponentRecord`: `id`, `tag`, `parentId`, `mountedAt`, `alive`, live `elRef`
(`WeakRef<Element>`), `props`, `history` (state snapshots), `events` (emitted), `exposed`
(`@Component.event` names), `listeners` (`.listen()` subscriptions), `scheduler`,
`priority`, `styles` (scoped CSS rules).

Programmatic access (no UI needed):

```ts
import { components, inspect, subscribe, clearDevtools, dump } from "@youneed/devtools";
components();             // ComponentRecord[]
inspect(id);             // one record
const off = subscribe(() => render());  // reactive updates
dump();                  // console-dump everything
```

## Panel tabs

- **Components** — searchable tree; hover highlights the element on the page, click selects.
- **Time-Travel** — step through state snapshots, see the props diff, restore an old state.
- **Styles** — list/edit scoped CSS rules in the shadow root, preview & revert.
- **Page / Routes / Map** — SSR-only (via `installPageDevtools`).

Prefs (dock, launcher, active tab, plugin settings) persist in `localStorage`
(`dom-devtools-prefs`) and survive HMR / SPA navigation.

## How it integrates with @youneed/dom

`@youneed/dom` emits lifecycle/emit events to `globalThis.__DOM_DEVTOOLS__` when present.
Devtools reads `getExposedEvents(ctor)` for the event list and calls the instance
`setScheduler(scheduler?)` to swap schedulers live (sync / raf / microtask / fps / custom)
from the dropdown. Emitted events are intercepted via the component `emit` path.

## Custom panels

Add your own tab implementing `DevtoolsPanel` (`id`, `title`, optional `styles`/`settings`,
`render(container, ctx)`, optional `subscribe(rerender)`), then pass it in `panels:` or use
`componentPlugin(id, title, Component)`. `ctx` (`DevtoolsContext`) exposes `components()`,
`inspect()`, `select()/selected()`, `highlight()`, `schedulerChoices()`, `replay()`,
`setting()` and subscription hooks.
