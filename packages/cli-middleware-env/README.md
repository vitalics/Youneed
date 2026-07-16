# @youneed/cli-middleware-env

Typed, **validated environment variables** for [`@youneed/cli`](../cli) commands.
Adds `this.env` — `process.env` parsed and coerced through
[`@youneed/schema`](../schema)'s env engine. Parsing happens at install time
(before `execute`) and throws an error listing **every** problem at once, so a
misconfigured environment never reaches command logic.

```ts
import { Command } from "@youneed/cli";
import { env, t } from "@youneed/cli-middleware-env";

class Serve extends Command({
  name: "serve",
  middleware: [env({ PORT: t.port().default(3000), NODE_ENV: t.enum(["dev", "prod"]) })],
}) {
  execute() {
    this.server.listen(this.env.PORT); // this.env.PORT: number
    // this.env.NODE_ENV: "dev" | "prod"
  }
}
```

Each `t.*()` coerces and validates one variable; `this.env` is the typed result,
inferred from the schema. The `t` builder is re-exported here so you need only
one import.

## Options

`env(schema, options?)`:

- `schema` — an `@youneed/schema` `EnvSchema` (a record of `t.*()` validators).
- `options.source` — where to read variables from. Defaults to `process.env`
  (handy for tests: pass a plain object).

If any variable is missing or invalid, install throws with a message listing
each offending key and its reason.

## Exports

- **`env(schema, options?)`** — the middleware. Adds a typed `this.env`.
- **`t`** — re-exported `@youneed/schema` env builder (`t.port()`, `t.enum()`, …).
- Types: `EnvMiddlewareOptions`, and re-exported `EnvOf`, `EnvSchema`,
  `EnvSource`, `Infer`.
