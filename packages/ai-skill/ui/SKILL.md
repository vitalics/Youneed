---
name: youneed-ui
description: "UI building blocks for @youneed/dom: the shadcn-style component library @youneed/dom-ui-shad (Custom Elements + Shadow DOM styled with Tailwind, a copy-the-source `shad` CLI so you own the components, plus direct imports) and the composable component providers that augment `this` — @youneed/dom-provider-color-scheme (light/dark/auto, reflects CSS color-scheme + data-color-scheme), @youneed/dom-provider-direction (LTR/RTL dir), @youneed/dom-provider-logger (scoped @youneed/logger child stamped with the component tag), @youneed/dom-provider-zustand (bind a Zustand store, re-render on change or on a selected slice), and @youneed/dom-provider-env (type-safe fail-fast frontend env via @youneed/schema `t`). Use this skill when scaffolding or customizing shad UI components, setting up Tailwind in Shadow DOM, adding theming/dark-mode or RTL, giving components a scoped logger or env, or wiring Zustand state into components. For the a11y and i18n providers see the main youneed skill; for the provider mechanism itself see references/dom.md."
license: ISC
---

# youneed — UI (shad component library + component providers)

Two things layered on `@youneed/dom`: a ready-made **component library** you copy into your
project (shadcn-style), and a set of **composable providers** that plug into the
`Component(tag, { providers: [...] })` slot to augment `this` — the same mechanism as the
a11y/i18n/rbac/feature-flags providers documented elsewhere.

Source of truth: `packages/dom-ui-shad/src`, `packages/dom-provider-{color-scheme,direction,
logger,zustand,env}/src`. Verify a signature before asserting it.

## Route to the reference

| Task | Read |
|------|------|
| Scaffolding / customizing shad components, the `shad` CLI, Tailwind in Shadow DOM | `references/shad.md` |
| Theming (light/dark), RTL, scoped logger, Zustand store, type-safe frontend env | `references/providers.md` |

## The provider slot (shared mechanism)

`Component(tag, { providers: [...] })` is the DOM analogue of a server `Controller`'s
`{ guards, interceptors }`: an array of orthogonal extensions that augment `this`. Each
provider here contributes a single namespaced object (`this.colorScheme`, `this.direction`,
`this.logger`, `this.store`, `this.env`) and — where reactive — re-renders the component when
its backing state changes. They compose in one array:

```ts
class Card extends Component("x-card", {
  providers: [
    colorSchemeProvider(scheme),   // this.colorScheme
    directionProvider(dir),        // this.direction
    loggerProvider(),              // this.logger
    envProvider(env),              // this.env
  ],
}) { /* … */ }
```

## At a glance — shad

```bash
npx shad init                 # create shad.json + copy the shared lib
npx shad add button badge     # copy components into your project (you own them)
```
```ts
import { ShadButton, registerTailwind } from "@youneed/dom-ui-shad";   // …or import directly
```

## Ground rules

- **shad is copy-the-source, not a black box** — the CLI writes `ui/*.ts` + `lib/shad.ts` into
  your project; edit them freely. `@youneed/dom-ui-shad` direct imports are the quick-start path.
- **Tailwind in Shadow DOM needs registration** — see `references/shad.md` (and the memory
  gotchas: `@property` at document level, `::slotted` vs preflight `!important`).
- **Providers are per-component and composable** — prefer a store (shared) vs per-instance
  (`"auto"`) depending on whether the concern is app-wide (dark mode) or local.
- **`this.env` validates with `@youneed/schema` `t`** — the same builder/loader as the server's
  `@youneed/server-plugin-env`; only the platform defaults differ.
