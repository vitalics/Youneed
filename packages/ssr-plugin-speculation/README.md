# @youneed/ssr-plugin-speculation

[Speculation Rules](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
as opt-in page middleware for [`@youneed/ssr`](../ssr).

A page **declares** which URLs the browser should prefetch/prerender via the
`speculation` option (or a `speculation()` override). This package is the
middleware that turns that declaration into the injected
`<script type="speculationrules">` — extracted out of the core renderer so the
injection is composable and opt-in.

```ts
class Home extends Page("/", {
  title: "Home",
  speculation: { prerender: [{ source: "list", urls: [About.url], eagerness: "moderate" }] },
}) {
  override render() { return HomeApp; }
}
```

## Enable it

As an SSR module, via [`@youneed/server-plugin-ssr`](../server-plugin-ssr):

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { speculation } from "@youneed/ssr-plugin-speculation";

app.plugin(ssr({ pages: [Home, About], modules: [speculation()] }));
```

Or directly, when mounting with `mountPages`:

```ts
import { enableSpeculation } from "@youneed/ssr-plugin-speculation";

enableSpeculation();
mountPages(Application(), Home, About);
```

Without one of these, the `speculation` declaration is inert (the devtools page
graph still reads it, but no `<script>` is emitted).

## Build

```sh
pnpm --filter @youneed/ssr-plugin-speculation run build
```
