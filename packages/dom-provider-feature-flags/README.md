# @youneed/dom-provider-feature-flags

Use [`@youneed/feature-flags`](../feature-flags) inside [`@youneed/dom`](../dom)
components — evaluate a flag straight in an `html` template, and have the
component re-render when the flag changes (an override, or the source reloading).

```ts
import { Component, html, when } from "@youneed/dom";
import { createFlags } from "@youneed/feature-flags";
import { provideFlags, flags, flagged } from "@youneed/dom-provider-feature-flags";

provideFlags(createFlags([{ key: "new-dashboard", defaultValue: false }]));

class Dashboard extends Component() {
  constructor() {
    super();
    flagged(this); // ← re-render on every flag change
  }
  render() {
    return when(flags().isEnabled("new-dashboard"), () => html`<new-ui></new-ui>`);
  }
}
```

`flags()` returns the app-wide engine installed by `provideFlags(...)`; its
synchronous `isEnabled` / `variant` / `value` / `all` drop into any template
hole. Reactivity is opt-in per component via `flagged(this)`: it subscribes the
host and calls `requestUpdate()` on every `onChange` (override / source reload),
auto-unsubscribing on disconnect.

## Scoped `this.flags` — the `providers` slot (recommended)

`Component(tag, { providers: [...] })` is the DOM analogue of a server
`Controller`'s `{ guards, interceptors }`: an array of orthogonal extensions that
augment `this`. `featureFlagsProvider(engine, { context })` adds a **scoped**
`this.flags` — every call evaluates against the provider's `context()`, so you
never thread the `EvaluationContext` through each check — AND automatic re-render
on flag change (no `flagged` boilerplate). It composes with other providers
(i18n, a11y, …) in the same array:

```ts
import { Component, html, when } from "@youneed/dom";
import { featureFlagsProvider } from "@youneed/dom-provider-feature-flags";

class Card extends Component("x-card", {
  providers: [featureFlagsProvider(engine, { context: () => ({ targetingKey: user.id }) })],
}) {
  render() {
    return when(this.flags.isEnabled("new-ui"), () => html`<new-ui></new-ui>`);
    //                ^ evaluated against the provider's context, re-renders on change
  }
}
```

`this.flags` exposes `isEnabled(key)`, `variant(key)`, `value(key, fallback?)`,
`evaluate(key)`, and `all()` — each bound to the scoped context.

## `withFlags` — the same, as a base-class mixin

Equivalent to a single `featureFlagsProvider`, in `extends withFlags(Base,
engine)` form — handy when you're already chaining mixins:

```ts
import { withFlags } from "@youneed/dom-provider-feature-flags";
class Card extends withFlags(Component("x-card"), engine) {
  render() { return when(this.flags.isEnabled("new-ui"), () => html`<new-ui></new-ui>`); }
}
```

## SSR → client hydration

The SSR plugin evaluates `engine.all(ctx)` on the server and serialises the
record (e.g. `window.__FLAGS__`). On the client, `hydrateFlags()` rebuilds a
read-only engine from it — no flag definitions shipped, values match exactly what
the server rendered — and installs it as the app-wide engine:

```ts
import { hydrateFlags, flags } from "@youneed/dom-provider-feature-flags";

hydrateFlags();                 // reads window.__FLAGS__ (default)
// hydrateFlags("__MY_FLAGS__"); // pick a different global
// hydrateFlags(recordObject);   // or pass the snapshot record directly

flags().isEnabled("new-dashboard"); // ← same value the server rendered
```

## API

| API | meaning |
| --- | --- |
| `provideFlags(engine)` | install the app-wide flags engine; returns it |
| `flags()` / `getFlags()` | the active engine (throws if none provided) — for template holes |
| `flagged(host, engine?)` | re-render `host` on flag change; auto-unsubscribes on disconnect |
| `featureFlagsProvider(engine, { context? })` | a `ComponentProvider` adding a **scoped** `this.flags` + auto reactivity |
| `withFlags(Base, engine, { context? })` | the mixin form of the same contribution |
| `hydrateFlags(snapshot?)` | rebuild a read-only engine from an SSR snapshot (record or global name) and install it |

`this.flags` (from the provider / mixin): `isEnabled(key)`, `variant(key)`,
`value(key, fallback?)`, `evaluate(key)`, `all()` — each evaluated against the
provider's `context()` (default `{}`).
