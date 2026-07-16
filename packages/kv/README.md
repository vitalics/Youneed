# @youneed/kv

**Back-compat alias.** The KV contract + `MemoryKV` now live in
[`@youneed/server-plugin-store`](../server-plugin-store); this package re-exports
everything from there so existing `@youneed/kv` imports keep working.

```ts
// Both of these resolve to the same exports:
import { MemoryKV, namespaced, type KV } from "@youneed/kv";
import { MemoryKV, namespaced, type KV } from "@youneed/server-plugin-store";
```

Prefer importing from [`@youneed/server-plugin-store`](../server-plugin-store) in
new code — that's where the contract, `MemoryKV`, `namespaced`, and the docs
live. See its README for the full API.

The Redis backend moved too: use [`@youneed/kv-redis`](../kv-redis) (itself an
alias for [`@youneed/server-plugin-pubsub-redis`](../server-plugin-pubsub-redis)).
