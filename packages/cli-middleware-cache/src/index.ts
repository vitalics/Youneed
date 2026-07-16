// @youneed/cli-middleware-cache — a tiny on-disk cache for @youneed/cli.
//
//   class Build extends Command("build", { middleware: [cache()] }) {
//     async execute() {
//       const deps = await this.cache.wrap("deps", () => resolveDeps(), 60_000);
//     }
//   }
//
// `this.cache` stores JSON entries under a per-app directory (the OS temp dir by
// default), with optional TTL. `wrap` is get-or-compute. Keys are hashed for the
// filename, so any string is a valid key.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { contribute, type CliMiddleware } from "@youneed/cli";

/** The `this.cache` surface. */
export interface Cache {
  /** Read a value, or `undefined` if missing/expired. */
  get<T>(key: string): T | undefined;
  /** Store a value, optionally expiring after `ttlMs`. */
  set(key: string, value: unknown, ttlMs?: number): void;
  /** Get `key`, or compute via `factory`, store, and return it. */
  wrap<T>(key: string, factory: () => Promise<T> | T, ttlMs?: number): Promise<T>;
  /** Remove one entry. */
  delete(key: string): void;
  /** Remove every entry in this namespace. */
  clear(): void;
}

/** Options for {@link cache}/{@link createCache}. */
export interface CacheOptions {
  /** Base directory. Default `<os-temp>/youneed-cli-cache`. */
  dir?: string;
  /** Per-app namespace (subdirectory). Default the program name. */
  namespace?: string;
}

interface Entry {
  value: unknown;
  expires?: number;
}

/** Create a {@link Cache} (the middleware's backing store). */
export function createCache(options: CacheOptions = {}): Cache {
  const base = options.dir ?? join(tmpdir(), "youneed-cli-cache");
  const dir = join(base, options.namespace ?? "default");
  const ensure = (): void => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  };
  const fileFor = (key: string): string => join(dir, createHash("sha1").update(key).digest("hex") + ".json");

  const get = <T>(key: string): T | undefined => {
    const file = fileFor(key);
    if (!existsSync(file)) return undefined;
    try {
      const entry = JSON.parse(readFileSync(file, "utf8")) as Entry;
      if (entry.expires !== undefined && Date.now() > entry.expires) {
        rmSync(file, { force: true });
        return undefined;
      }
      return entry.value as T;
    } catch {
      return undefined;
    }
  };

  const set = (key: string, value: unknown, ttlMs?: number): void => {
    ensure();
    const entry: Entry = { value, expires: ttlMs !== undefined ? Date.now() + ttlMs : undefined };
    writeFileSync(fileFor(key), JSON.stringify(entry));
  };

  return {
    get,
    set,
    async wrap(key, factory, ttlMs) {
      const hit = get(key);
      if (hit !== undefined) return hit as Awaited<ReturnType<typeof factory>>;
      const value = await factory();
      set(key, value, ttlMs);
      return value;
    },
    delete(key) {
      rmSync(fileFor(key), { force: true });
    },
    clear() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Cache middleware. Adds `this.cache`. */
export function cache(options: CacheOptions = {}): CliMiddleware<{ readonly cache: Cache }> {
  return {
    name: "cache",
    install(ctx) {
      contribute(ctx.command, "cache", createCache({ namespace: ctx.program.name, ...options }));
    },
  };
}
