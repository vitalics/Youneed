# @youneed/server-plugin-feature-flags

Wire a [`@youneed/feature-flags`](../feature-flags) engine into
[`@youneed/server`](../server): a **`ServerPlugin`** (control + client-bootstrap
routes, dev override toggles, an `inspect()` for the devtools tab) plus a
**controller provider** that gives a controller a **request-scoped `this.flags`**
— every call evaluates against the `EvaluationContext` derived from the in-flight
request (user, headers, …).

```ts
import { Application, Controller } from "@youneed/server";
import { createFlags, featureFlags, flagsProvider } from "@youneed/server-plugin-feature-flags";
import type { Context } from "@youneed/server";

const flags = createFlags([
  { key: "new-checkout", defaultValue: false, rollout: 20 }, // stable 20% of users
  {
    key: "pricing",
    defaultValue: "control",
    variants: { control: "control", fast: "fast" },
    rules: [{ attributes: { plan: "pro" }, variant: "fast" }],
  },
]);

// Derive the per-request evaluation context (bucket by the authenticated user).
const ctxOf = (ctx: Context) => ({
  targetingKey: (ctx.state.user as { id?: string } | undefined)?.id,
  attributes: { plan: (ctx.state.user as { plan?: string } | undefined)?.plan },
});

class CheckoutController extends Controller("/checkout", {
  providers: [flagsProvider(flags, { context: ctxOf })],
}) {
  @Controller.get()
  index() {
    if (this.flags.isEnabled("new-checkout")) return { ui: "v2" };
    return { ui: "v1", variant: this.flags.variant("pricing") };
  }
}

const app = Application(CheckoutController).plugin(featureFlags(flags, { context: ctxOf }));
app.listen(3000);
```

## The provider — `this.flags`

`flagsProvider(flags, { context? })` is a controller provider (like
[`ormProvider`](../orm-sql)): it contributes a private, typed `this.flags`
**bound to the current request's derived context**, so handlers call it without
passing a context:

- **`this.flags.isEnabled(key)`** — truthy value ⇒ enabled.
- **`this.flags.variant(key)`** — the selected variant name, if any.
- **`this.flags.value(key, fallback?)`** — the typed value (fallback for unknown flags).
- **`this.flags.evaluate(key)`** — the full `Evaluation` (value + variant + reason).
- **`this.flags.all()`** — every flag evaluated for this request.

The context is read lazily per call via async-local storage, so one installed
provider serves every request. `requestFlags(flags, derive, ctx?)` is exported as
the pure facade builder (used in tests with a fake request).

## The plugin

`featureFlags(flags, { basePath?, exposeDevtools?, context?, allowOverride? })` is
a `ServerPlugin`. It mounts routes under `basePath` (default `/__flags`):

- **`GET /`** and **`GET /list`** — all flag **definitions** + current overrides.
- **`GET /snapshot`** — `flags.all(context(ctx))`, the client-bootstrap snapshot a
  [dom-provider](../dom-provider-feature-flags) hydrates from.
- **`POST /override`** `{ key, value }` — force a flag value (dev only).
- **`POST /clear`** `{ key? }` — clear one (or all) overrides.
- **`GET /evaluate?key=&targetingKey=&attr.plan=pro`** — evaluate one flag for an
  ad-hoc context (the devtools tester).

`override`/`clear` are gated behind `allowOverride` (default `true`) — set it
`false` in production to make the store read-only over HTTP.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
engine gets a **Feature Flags** panel (under Infra): a live table (key / value /
variant / reason / rollout%) with a **per-flag override toggle + clear**, and an
**eval tester** (targetingKey + attributes JSON → value/variant/reason). Because
evaluations depend on a request context, the panel fetches live over the routes
above. Registered by importing `@youneed/server-plugin-feature-flags/devtools`
into the devtools web bundle.
