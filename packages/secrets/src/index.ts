// @youneed/secrets — a tiny, framework-agnostic secrets manager.
//
// One `SecretsProvider` contract; the `Secrets` engine adds caching, `secret://`
// reference resolution (so config can hold `secret://DB_PASSWORD` and be resolved
// at boot), and `require`. Built-in providers cover env / in-memory / a JSON file;
// managed backends are adapters (`@youneed/secrets-vault`, `@youneed/secrets-aws`).
//
//   const secrets = createSecrets(new EnvSecrets());
//   const db = await secrets.require("DATABASE_URL");
//   const cfg = await secrets.resolveAll({ db: "secret://DATABASE_URL", ttl: 60 });
//
// Values are strings — the caller parses/serialises. `list()` returns NAMES only,
// never values (safe for a devtools/audit view).

/** A source of secret values. `get` is the only required method. */
export interface SecretsProvider {
  readonly name: string;
  get(key: string): Promise<string | undefined>;
  /** Batch fetch (default: parallel `get`s). */
  getMany?(keys: string[]): Promise<Record<string, string | undefined>>;
  /** Secret NAMES available (never values) — for audit/devtools. */
  list?(): Promise<string[]>;
  close?(): Promise<void>;
}

export interface SecretsOptions {
  /** Cache a fetched value this long (ms). `0` disables caching. Default `60000`. */
  cacheTtlMs?: number;
  /** Prefix applied to every key before hitting the provider (namespacing). */
  prefix?: string;
  /** Injectable clock (tests). */
  now?: () => number;
}

/** The `secret://NAME` reference scheme resolved by {@link Secrets.resolve}. */
export const SECRET_SCHEME = "secret://";

interface CacheEntry {
  value: string | undefined;
  at: number;
}

/**
 * Wraps a {@link SecretsProvider} with caching + reference resolution. Reads are
 * async (the backend is remote); a short TTL cache avoids hammering it.
 */
export class Secrets {
  readonly #provider: SecretsProvider;
  readonly #ttl: number;
  readonly #prefix: string;
  readonly #now: () => number;
  #cache = new Map<string, CacheEntry>();

  constructor(provider: SecretsProvider, opts: SecretsOptions = {}) {
    this.#provider = provider;
    this.#ttl = opts.cacheTtlMs ?? 60_000;
    this.#prefix = opts.prefix ?? "";
    this.#now = opts.now ?? (() => Date.now());
  }

  /** The underlying provider's name (e.g. "env", "vault", "aws"). */
  get backend(): string {
    return this.#provider.name;
  }

  /** Fetch a secret (cached). Returns `undefined` if absent. */
  async get(key: string): Promise<string | undefined> {
    const full = this.#prefix + key;
    const hit = this.#cache.get(full);
    if (hit && (this.#ttl === 0 ? false : this.#now() - hit.at < this.#ttl)) return hit.value;
    const value = await this.#provider.get(full);
    if (this.#ttl > 0) this.#cache.set(full, { value, at: this.#now() });
    return value;
  }

  /** Fetch a secret; throw if it is missing/empty. */
  async require(key: string): Promise<string> {
    const value = await this.get(key);
    if (value === undefined || value === "") throw new Error(`Missing required secret "${this.#prefix + key}" (from ${this.#provider.name})`);
    return value;
  }

  /** Fetch several secrets at once. */
  async getMany(keys: string[]): Promise<Record<string, string | undefined>> {
    if (this.#provider.getMany) {
      const out = await this.#provider.getMany(keys.map((k) => this.#prefix + k));
      // strip the prefix back off the returned keys
      const stripped: Record<string, string | undefined> = {};
      for (const k of keys) stripped[k] = out[this.#prefix + k];
      return stripped;
    }
    const entries = await Promise.all(keys.map(async (k) => [k, await this.get(k)] as const));
    return Object.fromEntries(entries);
  }

  /** Resolve a `secret://NAME` reference to its value; any other string passes through. */
  async resolve(value: string): Promise<string> {
    if (!value.startsWith(SECRET_SCHEME)) return value;
    const name = value.slice(SECRET_SCHEME.length);
    return this.require(name);
  }

  /** Deep-resolve every `secret://` string in a config object/array. */
  async resolveAll<T>(config: T): Promise<T> {
    if (typeof config === "string") return (await this.resolve(config)) as T;
    if (Array.isArray(config)) return (await Promise.all(config.map((v) => this.resolveAll(v)))) as T;
    if (config && typeof config === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(config)) out[k] = await this.resolveAll(v);
      return out as T;
    }
    return config;
  }

  /** Secret NAMES available (never values). Empty when the provider can't enumerate. */
  async list(): Promise<string[]> {
    return (await this.#provider.list?.()) ?? [];
  }

  /** Drop the cache (force fresh reads). */
  clearCache(): void {
    this.#cache.clear();
  }

  async close(): Promise<void> {
    await this.#provider.close?.();
  }
}

/** Convenience constructor. */
export function createSecrets(provider: SecretsProvider, opts?: SecretsOptions): Secrets {
  return new Secrets(provider, opts);
}

// ── built-in providers ──────────────────────────────────────────────────────

/** Reads from `process.env` (or any injected record). The default provider. */
export class EnvSecrets implements SecretsProvider {
  readonly name = "env";
  readonly #env: Record<string, string | undefined>;
  constructor(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}) {
    this.#env = env;
  }
  async get(key: string): Promise<string | undefined> {
    return this.#env[key];
  }
  async list(): Promise<string[]> {
    return Object.keys(this.#env);
  }
}

/** In-memory secrets (tests / dev). */
export class MemorySecrets implements SecretsProvider {
  readonly name = "memory";
  readonly #store: Map<string, string>;
  constructor(initial: Record<string, string> = {}) {
    this.#store = new Map(Object.entries(initial));
  }
  set(key: string, value: string): void {
    this.#store.set(key, value);
  }
  async get(key: string): Promise<string | undefined> {
    return this.#store.get(key);
  }
  async list(): Promise<string[]> {
    return [...this.#store.keys()];
  }
}

/** Reads secrets from a flat JSON file (`{ "KEY": "value" }`). Lazily loaded + cached. */
export class FileSecrets implements SecretsProvider {
  readonly name = "file";
  readonly #path: string;
  #data?: Record<string, string>;
  constructor(path: string) {
    this.#path = path;
  }
  async #load(): Promise<Record<string, string>> {
    if (this.#data) return this.#data;
    const { readFile } = await import("node:fs/promises");
    this.#data = JSON.parse(await readFile(this.#path, "utf8")) as Record<string, string>;
    return this.#data;
  }
  async get(key: string): Promise<string | undefined> {
    return (await this.#load())[key];
  }
  async list(): Promise<string[]> {
    return Object.keys(await this.#load());
  }
}
