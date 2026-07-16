# @youneed/dom-provider-env

Type-safe, fail-fast **environment variables for the frontend**, as a composable
[`@youneed/dom`](../dom) provider. Coerce + validate a raw string source
(`import.meta.env`, a runtime-fetched config, …) against a
[`@youneed/schema`](../schema) `t` spec, read it through `this.env`, and inspect it
in devtools.

```ts
import { Component, html } from "@youneed/dom";
import { defineEnvironmentVariables, envProvider, t } from "@youneed/dom-provider-env";

export const env = defineEnvironmentVariables(import.meta.env, {
  schema: {
    API_URL: t.url(),
    FEATURE_X: t.boolean().default(false),
  },
});
//    ^ typed: { API_URL: string; FEATURE_X: boolean }

class Widget extends Component("x-widget", { providers: [envProvider(env)] }) {
  render() {
    return html`<a href=${this.env.API_URL}>open</a>`; // ← typed this.env
  }
}
```

- **Validation engine is `@youneed/schema`** — `t` (the chainable, coercing schema
  builder) and the loader are shared with the server package
  ([`@youneed/server-plugin-env`](../server-plugin-env)); only the platform defaults
  differ. Re-exported here for a single import.
- **`this.env`** — `envProvider(env)` plugs into the `Component(tag, { providers })`
  slot and exposes the validated env, typed to exactly what you passed.
- **Default source is `import.meta.env`** (the bundler injects it across every
  module). Pass any `Record<string, string | undefined>` explicitly otherwise.
- **Async / lazy sources** — pass a `Promise` or a `() => Promise` and the call
  returns a `Promise<env>`.
- **Fail-fast** — invalid/missing variables throw one `EnvError` with every issue
  aggregated; the result is frozen.

> Browser env is **public** (it ships in the bundle). `.secret()` masks a value in
> the devtools panel but is **not** a privacy guarantee — keep real secrets on the
> server with [`@youneed/server-plugin-env`](../server-plugin-env).

## Devtools

`@youneed/dom-provider-env/devtools` ships a panel that lists every defined
environment with values, types and flags — **secrets masked**:

```ts
import { mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
import { envPanel } from "@youneed/dom-provider-env/devtools";

mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), envPanel()] });
```

The panel reads the registry the core fills on each `defineEnvironmentVariables`
call (`registeredEnvironments()` / `onEnvironmentRegistered()`), so any UI can
render the same data.

## `t` — the schema builder

`t.string()`, `t.number()`, `t.int()`, `t.boolean()`, `t.port()`, `t.url()`,
`t.enum([...] as const)`, `t.json<T>()`. Chain `.optional()`, `.default(v)`,
`.min(n)`, `.max(n)`, `.secret()`, `.describe(text)`, `.refine(fn, msg)`.
