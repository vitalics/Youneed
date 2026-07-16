# @youneed/server-plugin-env

Type-safe, fail-fast **environment variables for the server**. Coerce + validate
`process.env` (or any source) against a [`@youneed/schema`](../schema) `t` spec,
throwing one aggregated `EnvError` at boot.

```ts
import { defineEnvironmentVariables, t } from "@youneed/server-plugin-env";

export const env = defineEnvironmentVariables(process.env, {
  schema: {
    PORT: t.port().default(3000),
    DATABASE_URL: t.url().secret(),
    NODE_ENV: t.enum(["development", "production", "test"] as const).default("development"),
  },
});
//    ^ typed: { PORT: number; DATABASE_URL: string; NODE_ENV: "development" | "production" | "test" }
```

- **Validation engine is `@youneed/schema`** — same `t` builder and loader as the
  frontend package ([`@youneed/dom-provider-env`](../dom-provider-env)); only the platform defaults
  differ. Re-exported here for a single import.
- **Default source is `process.env`.** Pass an explicit source for tests.
- **Fail-fast at boot** — call it at module top level; invalid/missing variables
  abort startup with every issue listed. Secret values are never echoed in errors.
- **`describeEnv(env, schema)`** returns a safe-to-log view with every `.secret()`
  field masked as `[REDACTED]`.

## As a ServerPlugin

`environment()` validates eagerly (fail-fast) and surfaces a **redacted** view in
`app.topology()` / devtools:

```ts
import { environment, t } from "@youneed/server-plugin-env";

const envPlugin = environment({
  schema: { PORT: t.port().default(3000), DATABASE_URL: t.url().secret() },
});
app.plugin(envPlugin);

envPlugin.values.PORT; // typed, validated
```

## `t` — the schema builder

`t.string()`, `t.number()`, `t.int()`, `t.boolean()`, `t.port()`, `t.url()`,
`t.enum([...] as const)`, `t.json<T>()`. Chain `.optional()`, `.default(v)`,
`.min(n)`, `.max(n)`, `.secret()`, `.describe(text)`, `.refine(fn, msg)`.
