# @youneed/server-plugin-secrets

Wire a [`@youneed/secrets`](../secrets) engine into [`@youneed/server`](../server):
a **`ServerPlugin`** (safe introspection routes + an `inspect()` for the devtools
tab) plus a **controller provider** that gives a controller `this.secrets` — the
raw `Secrets` engine — so handlers resolve secrets server-side.

> **🔒 Security guarantee.** This plugin **never exposes secret values** over HTTP
> or devtools. Routes surface secret **names** and a **masked** presence probe
> only (e.g. `sk•••ab`). The full value never leaves the server.

```ts
import { Application, Controller } from "@youneed/server";
import { createSecrets, EnvSecrets, secrets, secretsProvider } from "@youneed/server-plugin-secrets";

const engine = createSecrets(new EnvSecrets(), { cacheTtlMs: 60_000 });

class BillingController extends Controller("/billing", {
  providers: [secretsProvider(engine)],
}) {
  @Controller.post()
  async charge() {
    const key = await this.secrets.require("STRIPE_KEY"); // resolved server-side; never returned
    // … call Stripe with `key` …
    return { ok: true };
  }
}

const app = Application(BillingController).plugin(secrets(engine));
app.listen(3000);
```

## The provider — `this.secrets`

`secretsProvider(engine)` is a controller provider (like [`ormProvider`](../orm-sql)
and [`flagsProvider`](../server-plugin-feature-flags)): it contributes a private,
typed `this.secrets` — the [`Secrets`](../secrets) engine itself — so handlers call
it directly:

- **`await this.secrets.get(name)`** — the value, or `undefined`.
- **`await this.secrets.require(name)`** — the value, or throws if missing.
- **`await this.secrets.resolve("secret://STRIPE_KEY")`** — resolve a reference.
- **`await this.secrets.resolveAll(config)`** — deep-resolve every `secret://` in a config.

What (if anything) reaches the client is entirely the handler's decision — the
plugin's own routes never return a value.

## The plugin

`secrets(engine, { basePath?, exposeDevtools?, allowResolveTester? })` is a
`ServerPlugin`. It mounts routes under `basePath` (default `/__secrets`):

- **`GET /`** and **`GET /names`** — the secret **names** (`engine.list()`) plus the
  `backend` id. **Names only — never values.**
- **`GET /health?name=`** — does the secret **resolve**? Returns
  `{ name, present, length?, preview? }` where `preview` is a **masked** string
  (first 2 · `•••` · last 2, e.g. `sk•••OP`) — **never the raw value**.

`allowResolveTester` (default `true`) gates the `length` + masked `preview` on
`/health`. Set it `false` in production so `/health` reports only `present:
boolean` — no length, no preview. `inspect()` reports
`{ kind: "secrets", backend, count, endpoints }` for the devtools topology.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
engine gets a **Secrets** panel (under Infra): a live table of secret **names**
with a per-name **check** button that hits `/health` and shows presence (✓/✗),
length, and a **masked** preview. A prominent note reminds you that **values are
never shown**. Because names/health are read live, the panel fetches over the
routes above. Registered by importing
`@youneed/server-plugin-secrets/devtools` into the devtools web bundle.
