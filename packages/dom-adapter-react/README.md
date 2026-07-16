# @youneed/dom-adapter-react

Bridge [`@youneed/dom`](../dom) and React, both directions:

- **`toReact`** — render a `@youneed/dom` component inside a React tree.
- **`fromReact`** — wrap an existing React component as a custom element so it
  drops into a `@youneed/dom` tree (no rewrite, no porting).

Part of the host-framework adapter family (`@youneed/dom-adapter-vue`,
`@youneed/dom-lit-adapter`, …).

```tsx
import { toReact } from "@youneed/dom-adapter-react";
import { UserCard } from "./user-card";

const ReactUserCard = toReact(UserCard); // ← a real React component

function Profile({ user }) {
  return (
    <section>
      <ReactUserCard user={user} onSelect={(e) => console.log(e.detail)} />
    </section>
  );
}
```

Why not just write `<user-card>`? Because a bare tag string is invisible to
"find references" and survives a rename silently. Passing the **class** keeps the
usage greppable and refactor-safe, and the props you pass are type-checked against
the component's own `@prop` fields.

## `toReact(target)` → React component

`toReact` returns a normal React component — use it as a JSX tag like any other.
Three forms, in order of preference:

| call | when |
| --- | --- |
| `toReact(UserCard)` | **preferred** — class reference, typed props |
| `toReact(UserCard.tagName)` | raw tag string — escape hatch, no prop typing |
| `toReact(new UserCard({ user }))` | wrap a pre-built live instance (single-use) |

The returned component's props are:

- **Data props** — assigned as JS *properties* (not attributes), so a reactive
  `@prop` setter fires with the real value — objects, arrays and functions pass
  through intact, and they stay in sync when React re-renders.
- **`on<Event>` handlers** — wired as listeners for the component's exposed
  `@Component.event` CustomEvents (Angular `@Output` / React style). `onSelect`
  receives the `CustomEvent` (`e.detail`), and listens for both the `select` and
  `onSelect` event types — so it works whether the dom author named the event by
  field (`select`) or declared it explicitly (`@Component.event("onSelect")`).
- **`children`** — become the element's light DOM, projected into its `<slot>`.
- **`className` / `id` / `style`** — forwarded to the host element.
- **`ref`** — resolves to the underlying element instance.
- **`key`** — for lists, exactly like any React element.

```tsx
const Row = toReact(RowComponent);
{items.map((it) => <Row key={it.id} item={it} onRemove={(e) => drop(e.detail)} />)}
```

The class/tag forms render the element natively (React owns it, reconciles it,
and tears it down on unmount). The instance form mounts the *live* element you
constructed into a layout-neutral (`display: contents`) host.

## `fromReact(Comp, props?)`

The other direction: take a React component you already have and use it as a
custom element inside `@youneed/dom`. The wrapper owns a React root, renders
`<Comp {...props}/>` into it, and re-renders when its props change.

```tsx
import { fromReact } from "@youneed/dom-adapter-react";
import { Chart } from "some-react-charts";

const ReactChart = fromReact(Chart); // ← a custom-element class
```

Two forms, mirroring `toReact`:

| call | when |
| --- | --- |
| `fromReact(Comp)` | **preferred** — a reusable custom-element class (auto-registered, carries `.tagName`). Update `.props` to re-render in place. |
| `fromReact(Comp, props)` | a configured instance (a live `Node`) you embed directly; each call mounts a fresh React root. |

```ts
// Reusable class — bind props via ONE lowercase `.props` binding (HTML lowercases
// attribute names, so a camelCase `.someProp=` never reaches the element):
html`<${ReactChart.tagName} .props=${{ data }}></${ReactChart.tagName}>`;

// Or drop a ready instance straight into a slot:
html`<section>${fromReact(Chart, { data })}</section>`;
```

- The wrapped component is a **normal React subtree**: hooks, context (wrap a
  Provider in the component you pass), and `props.children` all behave as usual.
- Pass `{ tagName }` for a stable, predictable tag (e.g. SSR markup), or
  `{ shadow: true }` to render into a shadow root instead of light DOM.
- On disconnect the React root is unmounted.

> The instance form (and any node interpolation inside a `render()`) creates a
> fresh React root on each parent re-render. For props that change often, prefer
> the class form with a `.props` binding so React updates in place.

This package depends only on `react` and `react-dom` (peers). It never imports
`@youneed/dom` at runtime — the component type is matched structurally — so it
adds nothing to your bundle beyond the bridge itself.
