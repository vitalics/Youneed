# @youneed/server-middleware-session

Signed-cookie sessions for [`@youneed/server`](../server) with a pluggable store.
The cookie carries only the session **id**, signed with an HMAC (`<id>.<hmac>`)
and verified in constant time, so a forged/tampered id is rejected. Session
**data** lives in the store (default in-memory), keyed by that id.

```ts
import { Application, Response } from "@youneed/server";
import { session, getSession } from "@youneed/server-middleware-session";

const app = Application()
  .use(session({ secret: process.env.SESSION_SECRET! }))
  .get("/login", (ctx) => {
    getSession(ctx)!.set("user", "ada");          // persisted on the way out
    return Response.json({ ok: true });
  })
  .get("/me", (ctx) => Response.json({ user: getSession(ctx)?.get("user") }))
  .get("/logout", (ctx) => {
    getSession(ctx)!.destroy();                    // clears store + cookie
    return Response.json({ ok: true });
  });
```

## API

- **`session(opts)`** — middleware. Reads & verifies the signed id cookie, loads
  data from the store, and exposes the session at `ctx.state.session`. On the way
  out it persists + re-signs the cookie **only when the session was touched**; a
  `destroy()` clears the store entry and the cookie. Options:
  - `secret` (**required**) — HMAC key signing the id cookie.
  - `cookieName` — default `"sid"`.
  - `maxAge` — cookie/store lifetime in seconds (default: a session cookie).
  - `store` — a `SessionStore` (default a fresh `MemoryStore`).
  - `cookie` — extra cookie attributes (merged over the defaults: `HttpOnly` +
    `SameSite=Lax`, `Path=/`).

- **`getSession(ctx)`** — typed accessor returning the `Session` (or `undefined`
  when the middleware isn't installed):
  - `id` — the session id.
  - `data` — a snapshot copy of the current data.
  - `get(key)` / `set(key, value)` / `delete(key)` / `clear()`.
  - `destroy()` — drop the session (store + cookie cleared on the way out).

- **`SessionStore`** — pluggable backend: `get(id)`, `set(id, data)`,
  `destroy(id)` (each may be sync or async). **`MemoryStore`** is the default.

- **`KvSessionStore`** — a `SessionStore` backed by a [`@youneed/kv`](../kv) `KV`.
  Constructor `(kv, { prefix = "sess:", ttl })` — `ttl` in **seconds** (optional;
  refreshes the entry's expiry on every write). Data is JSON-encoded under
  `prefix + id`; a corrupt value is treated as a missing session.

## Distributed sessions (shared across instances)

The default `MemoryStore` keeps session data **in-process**: it is lost on
restart and not shared between instances behind a load balancer (a request that
lands on another instance sees an empty session). Back the store with a shared
`KV` instead and sessions survive across instances **and** restarts:

```ts
import { session, KvSessionStore } from "@youneed/server-middleware-session";
import { redisKV } from "@youneed/kv-redis";

app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    store: new KvSessionStore(redisKV({ url: "redis://..." }), { ttl: 86400 }),
  }),
);
```

Any `KV` adapter works (e.g. `MemoryKV` for tests/single-instance, `redisKV`
for a real shared Redis/Valkey). The cookie still carries only the signed id;
the session data lives in the KV.
