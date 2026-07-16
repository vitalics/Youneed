# @youneed/dom-provider-virtual

`IntersectionObserver`-driven **list virtualization** for [`@youneed/dom`](../dom):
render a list of thousands of items but keep only the on-screen rows as real DOM.
A composable component **provider** (the same shape as the other `dom-provider-*`
packages — i18n/a11y/…): install `virtualProvider()` and call `this.virtual(...)`
from `render()`. A standalone `virtual()` function is exported for use without
the provider.

## Install

```bash
pnpm add @youneed/dom-provider-virtual
```

## Use (provider)

```ts
import { Component, html } from "@youneed/dom";
import { virtualProvider } from "@youneed/dom-provider-virtual";

class Feed extends Component("x-feed", { providers: [virtualProvider()] }) {
  @Component.prop() rows: Row[] = [];

  render() {
    return html`${this.virtual({
      items: this.rows,
      render: (r) => html`<div class="row">${r.title}</div>`,
      estimateHeight: 40,
    })}`;
  }
}
```

Or without the provider, calling `virtual()` directly:

```ts
import { virtual } from "@youneed/dom-provider-virtual";

render() {
  return html`${virtual({ items: this.rows, render: (r) => html`<div>${r.title}</div>` })}`;
}
```

## How it works

The list is split into fixed-size **chunks**, one `<vm-virtual-chunk>` rendered
per chunk. A single `IntersectionObserver` (rooted on the scroll viewport, with
an `overscan` margin) watches every chunk; as a chunk scrolls into view its
`active` prop flips and — thanks to `@youneed/dom`'s per-component isolation —
**only that chunk** re-renders its items. Off-screen chunks collapse to a spacer
of their last measured height, so the scrollbar stays correct and the parent
list never re-renders on scroll.

**SSR:** with no `IntersectionObserver`, chunks render as placeholders; the
client hydrates and the observer fills the visible ones. v1 covers vertical
lists with a per-item height estimate; variable heights settle via measurement.

## API

- **`virtualProvider()` → `ComponentProvider<{ readonly virtual: VirtualApi }>`** —
  drop into `Component(tag, { providers: [...] })`; exposes `this.virtual(opts)`.
- **`virtual<T>(opts)` → `TemplateResult`** — standalone; embed the result in a
  component's `html`. Typed over the item type, so `render`/`key` get the real
  type.
- **`VirtualOptions<T>`** — `items` (the full dataset), `render(item, index)`
  (`index` is the **global** index), optional `key(item, index)` (defaults to
  global index), `chunkSize` (items per chunk, default `20`), `estimateHeight`
  (px per item before measurement, default `32`), `overscan` (px kept rendered
  above/below the viewport, default `400`).
- **`VirtualList`**, **`VirtualChunk`** — the underlying custom elements
  (`vm-virtual-list` / `vm-virtual-chunk`), exported for advanced use.

> Config is passed as **one object prop** (`.data=${…}`) on purpose: HTML
> lowercases attribute names, so a `.camelCaseProp=${…}` template binding would
> silently miss — a single `data` prop keeps the camelCase option names intact.

Peer: [`@youneed/dom`](../dom).
