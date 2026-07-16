# @youneed/dom-adapter-svelte

Bridge [`@youneed/dom`](../dom) and Svelte 5, both directions:

- **`toSvelte`** — a Svelte **action** (`use:`) that drives a `@youneed/dom`
  component from a Svelte template.
- **`fromSvelte`** — wrap an existing Svelte component as a custom element so it
  drops into a `@youneed/dom` tree (no rewrite, no porting).

Part of the host-framework adapter family (`@youneed/dom-adapter-react`,
`@youneed/dom-adapter-vue`, `@youneed/dom-adapter-preact`, …).

## `toSvelte(target)` — a Svelte action

Svelte is compiler-first: there is no runtime API to *construct* a Svelte component
to embed in another component's template. But Svelte already renders custom elements
natively from their tag — so the dom→Svelte direction ships as a **Svelte action**.
The action does the part Svelte can't: assign plain values as JS *properties* (so
reactive `@prop` setters fire) and wire `on<Event>` handlers to the component's
exposed CustomEvents.

```svelte
<script>
  import { toSvelte } from "@youneed/dom-adapter-svelte";
  import { UserCard } from "./user-card";

  const userCard = toSvelte(UserCard);   // ← a Svelte action; carries .tagName
  let user = $state({ name: "Ada" });
</script>

<svelte:element this={userCard.tagName}
                use:userCard={{ user, onSelect: e => console.log(e.detail) }} />
```

Passing the **component** (not the bare tag) keeps the usage greppable and
rename-safe; `userCard.tagName` is the registered tag for `<svelte:element>`.

| call | when |
| --- | --- |
| `toSvelte(UserCard)` | **preferred** — component reference, typed params |
| `toSvelte(UserCard.tagName)` | raw tag string — escape hatch, no param typing |

- **Plain params are assigned as JS *properties*** (not attributes), so a reactive
  `@prop` setter fires with the real value — objects, arrays and functions pass
  through intact, and they re-apply when Svelte re-runs the action.
- **`on<Event>` params** are wired to the component's exposed `@Component.event`
  CustomEvents. `onSelect` matches the `select` *and* `onSelect` event types; the
  handler gets the `CustomEvent` (read `e.detail`).
- **`class`, `id` and `style`** params are forwarded to the host element.

## `fromSvelte(Comp, props?)`

The other direction: take a Svelte component you already have and use it as a custom
element inside `@youneed/dom`. The wrapper owns a Svelte instance (Svelte 5's
`mount`) and renders the component into itself.

```ts
import { fromSvelte } from "@youneed/dom-adapter-svelte";
import Chart from "./Chart.svelte";

const SvelteChart = fromSvelte(Chart, { events: ["select"] }); // ← a custom-element class
```

Two forms, mirroring `toSvelte`:

| call | when |
| --- | --- |
| `fromSvelte(Comp, options?)` | **preferred** — a reusable custom-element class (auto-registered, carries `.tagName`). |
| `fromSvelte(Comp, props)` | a configured instance (a live `Node`) you embed directly. |

```ts
// Reusable class — bind props via ONE lowercase `.props` binding (HTML lowercases
// attribute names, so a camelCase `.someProp=` never reaches the element), and
// listen to the nominated events by name with `@event`:
html`<${SvelteChart.tagName} .props=${{ data }} @select=${onSelect}></${SvelteChart.tagName}>`;

// Or drop a ready instance straight into a slot:
html`<section>${fromSvelte(Chart, { data })}</section>`;
```

- **Events.** Svelte 5 surfaces "events" as callback props (`onselect={…}`). List the
  ones to forward via `events: ["select", …]` — each becomes a bubbling, composed
  `CustomEvent` of that name (with `event.detail` set to the callback's first
  argument), wired through the `on<name>` callback prop.
- **Reactive prop updates.** Svelte 5 has no runtime API to push fresh props into a
  mounted component without a compiler-built `$state` proxy (unavailable to a
  plain-JS bridge), so reassigning `.props` **re-mounts** the component. Prefer
  keeping state inside the Svelte component, or set props once at construction.
- Pass `{ tagName }` for a stable, predictable tag, or `{ shadow: true }` to render
  into a shadow root instead of light DOM.
- On disconnect the Svelte instance is unmounted.

> `svelte` is a **peer dependency** and is imported *dynamically* on the first
> `fromSvelte` mount — apps that only use `toSvelte` never pull Svelte's runtime
> into their bundle. (Bundle for the browser, or with the `browser` export
> condition, so `mount` resolves to Svelte's client runtime rather than its server
> build.)

This package never imports `@youneed/dom` at runtime — the component type is matched
structurally — so it adds nothing to your bundle beyond the bridge itself.
