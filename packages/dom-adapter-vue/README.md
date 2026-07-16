# @youneed/dom-adapter-vue

Bridge [`@youneed/dom`](../dom) and Vue, both directions:

- **`toVue`** — turn a `@youneed/dom` component into a real Vue component.
- **`fromVue`** — wrap an existing Vue component as a custom element so it drops
  into a `@youneed/dom` tree (no rewrite, no porting).

Part of the host-framework adapter family (`@youneed/dom-adapter-react`,
`@youneed/dom-adapter-angular`, …).

```vue
<script setup>
import { toVue } from "@youneed/dom-adapter-vue";
import { UserCard } from "./user-card";

const VueUserCard = toVue(UserCard);
</script>

<template>
  <VueUserCard :user="user" @select="e => console.log(e.detail)" />
</template>
```

Why not just write `<user-card>`? Because a bare tag string is invisible to "find
references" and survives a rename silently. Passing the **component** keeps the usage
greppable and refactor-safe, and the props you pass are type-checked against the
component's own `@prop` fields.

## `toVue(target)`

Three forms, in order of preference:

| call | when |
| --- | --- |
| `toVue(UserCard)` | **preferred** — component reference, typed props |
| `toVue(UserCard.tagName)` | raw tag string — escape hatch, no prop typing |
| `toVue(new UserCard({ user }))` | wrap a specific live instance |

Returns a **Vue component** you use like any other.

- **Plain props are assigned as JS *properties*** (not attributes), so a reactive
  `@prop` setter fires with the real value — objects, arrays and functions pass
  through intact, and they stay in sync when Vue re-renders.
- **`@<event>` listeners** (i.e. `on<Event>` props) are wired to the component's
  exposed `@Component.event` CustomEvents. `@select` matches the `select` *and*
  `onSelect` event types, so it works whether the dom author named the event by
  its field (`select`) or explicitly (`onSelect`); the handler gets the
  `CustomEvent` (read `e.detail`).
- The **default slot** becomes the element's light DOM (projected into its
  `<slot>`); `class`, `id` and `style` are forwarded to the host element.
- A template **`ref`** exposes `{ element }` — the underlying element instance.

## `fromVue(Comp, props?)`

The other direction: take a Vue component you already have and use it as a custom
element inside `@youneed/dom`. The wrapper owns a Vue app, renders the component
into it, and re-renders when its props change.

```ts
import { fromVue } from "@youneed/dom-adapter-vue";
import Chart from "some-vue-charts";

const VueChart = fromVue(Chart); // ← a custom-element class
```

Two forms, mirroring `toVue`:

| call | when |
| --- | --- |
| `fromVue(Comp)` | **preferred** — a reusable custom-element class (auto-registered, carries `.tagName`). Update `.props` to re-render in place. |
| `fromVue(Comp, props)` | a configured instance (a live `Node`) you embed directly. |

```ts
// Reusable class — bind props via ONE lowercase `.props` binding (HTML lowercases
// attribute names, so a camelCase `.someProp=` never reaches the element), and
// listen to the component's declared `emits` by name with `@event`:
html`<${VueChart.tagName} .props=${{ data }} @select=${onSelect}></${VueChart.tagName}>`;

// Or drop a ready instance straight into a slot:
html`<section>${fromVue(Chart, { data })}</section>`;
```

- **Props** come from `props` (a reactive object Vue re-renders on); reassign
  `.props` to update in place.
- **Declared `emits`** surface as bubbling, composed `CustomEvent`s named after the
  event, with `event.detail` set to the payload. (Undeclared emits can't be
  discovered, so declare them in the component's `emits` to forward them.)
- Pass `{ tagName }` for a stable, predictable tag, or `{ shadow: true }` to render
  into a shadow root instead of light DOM.
- On disconnect the Vue app is unmounted.

> `vue` is a **peer dependency** and is imported *dynamically* on the first
> `fromVue` mount — apps that only use `toVue` never pull a second Vue copy into
> their bundle.

This package depends only on `vue` (peer). It never imports `@youneed/dom` at
runtime — the component type is matched structurally — so it adds nothing to your
bundle beyond the bridge itself.
