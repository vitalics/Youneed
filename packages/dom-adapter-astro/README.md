# @youneed/dom-adapter-astro

Render [`@youneed/dom`](../dom) components into [Astro](https://astro.build) — as
server-rendered islands that hydrate on the client.

Astro is SSR-first and compiler-driven: there is no runtime "Astro component" to
construct, so this adapter meets Astro where it lives. **`toAstro`** renders a
`@youneed/dom` component to an HTML string (Declarative Shadow DOM, styles inlined)
that you drop into a `.astro` template with `set:html`. The custom element upgrades
itself on the client the moment its definition is imported, and a
`<script data-hydrate>` block lets **`hydrate()`** re-apply the props it was rendered
with — so the island comes alive with the same data.

Part of the host-framework adapter family (`@youneed/dom-adapter-react`,
`@youneed/dom-adapter-vue`, `@youneed/dom-adapter-svelte`, …).

```astro
---
// src/pages/index.astro  (server frontmatter)
import { toAstro } from "@youneed/dom-adapter-astro";
import { UserCard } from "../components/user-card";

const markup = await toAstro(UserCard, { user });
---
<Fragment set:html={markup} />

<script>
  // client island: importing the component registers + upgrades it,
  // then hydrate() applies the SSR'd props.
  import "../components/user-card";
  import { hydrate } from "@youneed/dom-adapter-astro/client";
  hydrate();
</script>
```

Why not just write `<user-card>`? Because a bare tag string is invisible to "find
references" and survives a rename silently. Passing the **component** keeps the usage
greppable and refactor-safe, and the props you pass are type-checked against the
component's own `@prop` fields.

## `toAstro(target, props?, options?)` → `Promise<string>`

Three forms, in order of preference:

| call | when |
| --- | --- |
| `toAstro(UserCard, { user })` | **preferred** — component reference, typed props |
| `toAstro(UserCard.tagName, { user })` | raw tag string — escape hatch, no prop typing |
| `toAstro(new UserCard({ user }))` | render a specific live instance |

Returns the SSR HTML string (Declarative Shadow DOM + a `data-hydrate` script).

- **Declarative Shadow DOM.** The shadow tree is serialized as
  `<template shadowrootmode="open">` with adopted styles inlined, so the markup is
  styled before any JS runs and hydrates natively.
- **Hydration.** Unless `{ hydrate: false }`, a `<script type="application/json"
  data-hydrate>` block carries `{ tag, props }` (with `<` escaped). On the client,
  `hydrate()` reads it and assigns the props to the matching element — reactive
  `@prop` setters fire, so the island renders with its server data. Set
  `{ hydrate: false }` for fully static, non-interactive markup.

## `@youneed/dom-adapter-astro/client`

The browser-side half, on its own subpath so a client island never pulls in the
server-only renderer. Re-exports `hydrate`, `getHydrationProps` and `Mount` from
`@youneed/dom`. Import your component definitions (which register the custom
elements and upgrade the SSR'd markup), then call `hydrate()` once.

## Server DOM

`renderToString` needs a server DOM, and `@youneed/dom` component classes
`extends HTMLElement` at import time — so a DOM must be registered **before** your
components are imported. In Astro, register it once at startup (e.g. a top-level
import in your config or an early server module):

```ts
import { registerDOM } from "@youneed/dom/register";
registerDOM();
```

`toAstro` also calls `registerDOM()` defensively (it's idempotent and a no-op when a
DOM is already present).

> `@youneed/dom` and `@youneed/ssr` are **peer dependencies**, imported
> *dynamically* inside `toAstro` — so it stays a server-only path and the client
> bundle pulls only the tiny `/client` re-export.
