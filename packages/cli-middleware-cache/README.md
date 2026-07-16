# @youneed/cli-middleware-cache

A tiny **on-disk cache** for [`@youneed/cli`](../cli). Adds `this.cache` to a
command — JSON entries stored under a per-app directory (the OS temp dir by
default) with optional TTL. Use it to memoise expensive work (dependency
resolution, network lookups, compiled results) across invocations of your CLI,
without standing up a separate cache layer.

```ts
import { Command } from "@youneed/cli";
import { cache } from "@youneed/cli-middleware-cache";

class Build extends Command("build", { middleware: [cache()] }) {
  async execute() {
    // get-or-compute, expiring after 60s
    const deps = await this.cache.wrap("deps", () => resolveDeps(), 60_000);
    console.log(deps);
  }
}
```

Keys are SHA-1 hashed for the filename, so any string is a valid key. Entries
are read/written lazily, and an expired entry is deleted on read.

## `this.cache`

| Method | Description |
| --- | --- |
| `get<T>(key)` | Read a value, or `undefined` if missing/expired. |
| `set(key, value, ttlMs?)` | Store a value, optionally expiring after `ttlMs`. |
| `wrap<T>(key, factory, ttlMs?)` | Get `key`, or compute via `factory`, store, and return it. |
| `delete(key)` | Remove one entry. |
| `clear()` | Remove every entry in this namespace. |

## Options

`cache(options?)`:

- `dir` — base directory. Default `<os-temp>/youneed-cli-cache`.
- `namespace` — per-app subdirectory. Defaults to the program name, so two CLIs
  don't collide.

## Exports

- **`cache(options?)`** — the middleware. Adds `this.cache`.
- **`createCache(options?)`** — build the backing `Cache` store directly (the
  same object the middleware contributes), for use outside a command.
- **`Cache`**, **`CacheOptions`** — types.
