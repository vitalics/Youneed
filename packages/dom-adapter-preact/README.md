# @youneed/dom-adapter-preact

Bridge [`@youneed/dom`](../dom) and Preact, both directions:

- **`toPreact`** — turn a `@youneed/dom` component into a real Preact component.
- **`fromPreact`** — wrap an existing Preact component as a custom element so it
  drops into a `@youneed/dom` tree (no rewrite, no porting).

Part of the host-framework adapter family (`@youneed/dom-adapter-react`,
`@youneed/dom-adapter-vue`, `@youneed/dom-adapter-svelte`, …).

```tsx
import { toPreact } from "@youneed/dom-adapter-preact";
import { UserCard } from "./user-card";

const PreactUserCard = toPreact(UserCard);

function Profile({ user }) {
  return <PreactUserCard user={user} onSelect={e => console.log(e.detail)} />;
}
```

Why not just write `<user-card>`? Because a bare tag string is invisible to "find
references" and survives a rename silently. Passing the **component** keeps the usage
greppable and refactor-safe, and the props you pass are type-checked against the
component's own `@prop` fields.

## `toPreact(target)`

Three forms, in order of preference:

| call | when |
| --- | --- |
| `toPreact(UserCard)` | **preferred** — component reference, typed props |
| `toPreact(UserCard.tagName)` | raw tag string — escape hatch, no prop typing |
| `toPreact(new UserCard({ user }))` | wrap a specific live instance |

Returns a **Preact component** you use like any other.

- **Plain props are assigned as JS *properties*** (not attributes), so a reactive
  `@prop` setter fires with the real value — objects, arrays and functions pass
  through intact, and they stay in sync when Preact re-renders.
- **`on<Event>` props** are wired to the component's exposed `@Component.event`
  CustomEvents. `onSelect` matches the `select` *and* `onSelect` event types, so it
  works whether the dom author named the event by its field (`select`) or
  explicitly (`onSelect`); the handler gets the `CustomEvent` (read `e.detail`).
- **`children`** become the element's light DOM (projected into its `<slot>`);
  `className`, `id` and `style` are forwarded to the host element.
- **`ref`** resolves to the underlying element instance.

## `fromPreact(Comp, props?)`

The other direction: take a Preact component you already have and use it as a custom
element inside `@youneed/dom`. The wrapper renders the component into itself and
re-renders when its props change.

```ts
import { fromPreact } from "@youneed/dom-adapter-preact";
import { Chart } from "some-preact-charts";

const PreactChart = fromPreact(Chart); // ← a custom-element class
```

Two forms, mirroring `toPreact`:

| call | when |
| --- | --- |
| `fromPreact(Comp)` | **preferred** — a reusable custom-element class (auto-registered, carries `.tagName`). Update `.props` to re-render in place. |
| `fromPreact(Comp, props)` | a configured instance (a live `Node`) you embed directly. |

```ts
// Reusable class — bind props via ONE lowercase `.props` binding (HTML lowercases
// attribute names, so a camelCase `.someProp=` never reaches the element):
html`<${PreactChart.tagName} .props=${{ data }}></${PreactChart.tagName}>`;

// Or drop a ready instance straight into a slot:
html`<section>${fromPreact(Chart, { data })}</section>`;
```

- **Props** come from `.props`; reassign to re-render in place (Preact diffs into
  the same container — no remount).
- Pass `{ tagName }` for a stable, predictable tag, or `{ shadow: true }` to render
  into a shadow root instead of light DOM.
- On disconnect the Preact tree is unmounted (`render(null, host)`).

This package depends only on `preact` (peer). It never imports `@youneed/dom` at
runtime — the component type is matched structurally — so it adds nothing to your
bundle beyond the bridge itself.
