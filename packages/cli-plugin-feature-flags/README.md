# @youneed/cli-plugin-feature-flags

Feature-flag integration for [`@youneed/cli`](../cli), on top of the
framework-agnostic [`@youneed/feature-flags`](../feature-flags) engine. It gives
your CLI two things:

- a **`flags` command** to list, inspect, and override flags at runtime, and
- **middleware** that adds `this.flags` to any command so it can gate behaviour
  on a flag.

Both operate on the **same shared `FeatureFlags` engine** you pass in, so an
override made from the `flags` command is visible to every command in the run.

```ts
import { Application, Command } from "@youneed/cli";
import { createFlags } from "@youneed/feature-flags";
import { featureFlags, flagsMiddleware } from "@youneed/cli-plugin-feature-flags";

const flags = createFlags([
  { key: "beta", defaultValue: false, rollout: 20 },
  { key: "theme", defaultValue: "light", variants: { light: "light", dark: "dark" } },
]);

class Deploy extends Command({ name: "deploy", middleware: [flagsMiddleware(flags)] }) {
  execute() {
    if (this.flags.isEnabled("beta")) console.log("beta path");
  }
}

Application({
  name: "ops",
  commands: [Deploy],
  plugins: [featureFlags(flags)],
}).run();
```

## The `flags` command

Registered by the `featureFlags(flags)` plugin:

```bash
ops flags                    # list every flag: value / variant / reason (a table)
ops flags beta               # detail for one flag
ops flags --on beta          # override beta → true
ops flags --off beta         # override beta → false
ops flags --set limit=42     # override to a parsed value (JSON, else the raw string)
ops flags --clear beta       # remove an override
```

Overrides call `FeatureFlags.override` on the shared engine and persist
**in-process** for the life of the run — unless the engine's `FlagSource`
persists them.

## The `this.flags` provider

`flagsMiddleware(flags, opts?)` is the CLI provider twin (like
[`cli-middleware-logger`](../cli-middleware-logger)'s `this.logger`): drop it in
a command's `middleware` and get a typed `this.flags` evaluator. Every call
defaults to `opts.context` when you pass none:

```ts
class Buy extends Command({
  name: "buy",
  middleware: [flagsMiddleware(flags, { context: { attributes: { plan: "pro" } } })],
}) {
  execute() {
    this.flags.value("checkout");                              // bound pro context
    this.flags.variant("theme", { targetingKey: userId });      // explicit context
    this.flags.isEnabled("beta");
  }
}
```

`this.flags` exposes `isEnabled` / `variant` / `value` / `evaluate` (all with an
optional per-call `EvaluationContext`), plus `keys()` and the underlying
`engine`.

## Exports

- **`featureFlags(engine, options?)`** — the app plugin. Registers the `flags`
  command for listing / inspecting / overriding.
- **`flagsMiddleware(engine, options?)`** — the command middleware. Contributes
  `this.flags`.
- **`renderList(engine, ctx)`** / **`renderDetail(engine, key, ctx)`** — the
  table / detail renderers the command uses (exported for reuse).
- Types: **`CommandFlags`**, **`FeatureFlagsOptions`**,
  **`FeatureFlagsPluginOptions`**; re-exports **`FeatureFlags`**,
  **`EvaluationContext`**, **`Evaluation`**, **`FlagValue`**.

## Options

- **`context`** — default `EvaluationContext` used when a call passes none.
  Default `{}`. Shared by the plugin and the middleware.
- **`command`** *(plugin only)* — name of the registered command. Default
  `flags`.
