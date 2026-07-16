# youneed

A small, TypeScript-first toolkit for building web apps on **native platform
primitives** — Custom Elements, Shadow DOM, the HTTP server, the Speculation
Rules API — with no virtual DOM and minimal runtime.

Every package shares one paradigm: **a factory returns a base class you extend,
TC39 decorators register members into per-class registries, and a fluent builder
wires it together.** `Component(tag)`, `Controller(path)`, `Page(url)` and
`Test()` all feel the same.

```ts
@Component.define()
class Counter extends Component("x-counter") {
  @Component.prop() count = 0;
  @Component.event() inc() { this.count++; }
  render() {
    return html`<button @click=${this.inc}>${this.count}</button>`;
  }
}
```

## Packages

| Package | What it is |
| --- | --- |
| [`@youneed/dom`](packages/dom) | Reactive components on Custom Elements + Shadow DOM (templates, scoped styles, fine-grained updates, schedulers, tasks). |
| [`@youneed/server`](packages/server) | Tiny typed HTTP server — controllers, schema validation, guards, middleware, content negotiation. |
| [`@youneed/ssr`](packages/ssr) | Server-side rendering (Declarative Shadow DOM) + the `Page` entity with first-class Speculation Rules. |
| [`@youneed/dom-router`](packages/dom-router) | Tiny client-side SPA router (hash / history / query modes). |
| [`@youneed/devtools`](packages/devtools) | Floating inspector — component tree, time-travel, scheduler swap, plus Page/Routes/Map tabs. |
| [`@youneed/vite-plugin`](packages/vite-plugin) | Makes the framework work under Vite (lowers TC39 decorators). |
| [`@youneed/test`](packages/test) | Class + decorator test framework in the same paradigm. |
| [`create-youneedpackage`](packages/create-package) | Scaffolder for new workspace packages. |

The dependency graph is shallow: `dom` has none; `ssr` builds on `dom` + `server`;
`devtools` builds on `dom` + `ssr`. Pick only what you need.

## Quick start

```bash
pnpm install
pnpm build         # build every package
pnpm typecheck
pnpm test          # run each package's tests
```

## Examples

The `examples/` folder demonstrates each package end to end:

```bash
pnpm examples:serve:dom     # client-side components → http://localhost:8080
pnpm examples:server        # HTTP server (controllers, guards, middleware)
pnpm examples:ssr           # SSR a component to Declarative Shadow DOM
pnpm examples:pages         # Pages + Speculation Rules + devtools
pnpm examples:video         # islands: SSR markup + client state (hydration)
pnpm examples:vite:dev      # React + Vue + our framework, one Vite page
```

See [`examples/`](examples) for the full list (router, crud, styles, portal,
tailwind, cascade, priority, …).

## A note on decorators

The framework uses **TC39 standard decorators** (`@Component.define()`), which no
browser runs natively yet and which Vite's oxc/esbuild leave untransformed at
their default target. When bundling with **Vite**, add
[`@youneed/vite-plugin`](packages/vite-plugin) so they're lowered. Running with
`tsx` / `node --import tsx` (as the examples and tests do) handles them out of the box.

## License

MIT
