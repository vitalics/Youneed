// @youneed/feature-flags-vercel — a Vercel Edge Config-backed FlagSource.
//
// Vercel Edge Config is a low-latency, globally-replicated key/value store —
// a natural home for feature flags. This adapter reads all items from an Edge
// Config over its plain HTTP read API (no Vercel SDK needed) and maps each item
// to a {@link FlagDefinition} the local @youneed/feature-flags engine evaluates.
//
//   import { createFlags } from "@youneed/feature-flags";
//   import { vercelSource } from "@youneed/feature-flags-vercel";
//
//   const flags = createFlags(vercelSource({
//     connectionString: process.env.EDGE_CONFIG, // https://edge-config.vercel.com/<id>?token=<token>
//     prefix: "flag:",                            // only `flag:*` items, prefix stripped
//   }));
//   await flags.load();
//   flags.isEnabled("new-dashboard", { targetingKey: user.id });
//
// An Edge Config item can hold EITHER a simple value (boolean/string/number) —
// mapped to `{ key, defaultValue: value }` — OR a full flag-definition object
// (`{ defaultValue, rules?, variants?, rollout?, enabled? }`) — passed through
// as the definition. `onChange` polls the store and reloads the engine on change.

import type { FlagDefinition, FlagSource, FlagValue } from "@youneed/feature-flags";

/** The `fetch` signature this adapter needs — inject one in tests. */
export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

/** Options for {@link vercelSource}. */
export interface VercelSourceOptions {
  /** Edge Config id (the `<id>` in the connection string). Used with {@link token}. */
  edgeConfigId?: string;
  /** Read access token. Used with {@link edgeConfigId}. */
  token?: string;
  /** A full connection string: `https://edge-config.vercel.com/<id>?token=<token>`.
   *  Parsed to derive `edgeConfigId` + `token` (takes precedence over the pair). */
  connectionString?: string;
  /** Only import items whose key starts with this prefix; the prefix is stripped
   *  from the resulting flag key (e.g. `prefix: "flag:"` → item `flag:beta` → `beta`). */
  prefix?: string;
  /** Poll interval in ms for {@link FlagSource.onChange}. Default `30000`. */
  pollMs?: number;
  /** `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Base URL of the Edge Config read API. Defaults to Vercel's. */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://edge-config.vercel.com";
const DEFAULT_POLL_MS = 30_000;

/** A {@link FlagSource} that reads flag definitions from a Vercel Edge Config. */
export interface VercelSource extends FlagSource {
  all(): Promise<FlagDefinition[]>;
  onChange(cb: () => void): () => void;
  /** Stop the change-polling timer. Also exposed as `Symbol.dispose`. */
  close(): void;
  [Symbol.dispose](): void;
}

/** Parse `{ edgeConfigId, token }` out of the options (connection string wins). */
function resolveTarget(opts: VercelSourceOptions): { id: string; token: string } {
  if (opts.connectionString) {
    let url: URL;
    try {
      url = new URL(opts.connectionString);
    } catch {
      throw new Error(`@youneed/feature-flags-vercel: invalid connectionString: ${opts.connectionString}`);
    }
    // Path is `/<id>` (possibly with a trailing segment); the id is the first segment.
    const id = url.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (!id || !token) {
      throw new Error("@youneed/feature-flags-vercel: connectionString must be https://edge-config.vercel.com/<id>?token=<token>");
    }
    return { id, token };
  }
  if (opts.edgeConfigId && opts.token) return { id: opts.edgeConfigId, token: opts.token };
  throw new Error("@youneed/feature-flags-vercel: provide either `connectionString` or both `edgeConfigId` and `token`");
}

/** Does a value look like a full flag-definition object (not a plain flag value)? */
function isFlagDefObject(value: unknown): value is Omit<FlagDefinition, "key"> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "defaultValue" in (value as Record<string, unknown>);
}

/** Map one Edge Config `(key, value)` pair to a {@link FlagDefinition}. */
function toDefinition(key: string, value: unknown): FlagDefinition {
  if (isFlagDefObject(value)) return { ...(value as Omit<FlagDefinition, "key">), key };
  return { key, defaultValue: value as FlagValue };
}

/**
 * Create a {@link FlagSource} backed by a Vercel Edge Config.
 *
 * `all()` reads every item via `GET <baseUrl>/<id>/items?token=<token>` and maps
 * each to a definition. `onChange(cb)` polls (`pollMs`, default 30s) and fires
 * `cb` whenever the fetched JSON differs from the last seen — so the engine
 * reloads. Call `close()` (or `using src = vercelSource(...)`) to stop polling.
 */
export function vercelSource(opts: VercelSourceOptions): VercelSource {
  const { id, token } = resolveTarget(opts);
  const doFetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  if (!doFetch) throw new Error("@youneed/feature-flags-vercel: no global `fetch`; pass `opts.fetch`");
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const prefix = opts.prefix;
  const itemsUrl = `${baseUrl}/${encodeURIComponent(id)}/items?token=${encodeURIComponent(token)}`;

  const subs = new Set<() => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastSerialized: string | undefined;

  /** Fetch the raw `{ [key]: value }` items object from Edge Config. */
  async function fetchItems(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const res = await doFetch(itemsUrl, signal ? { signal } : undefined);
    if (!res.ok) {
      throw new Error(`@youneed/feature-flags-vercel: Edge Config read failed (HTTP ${res.status})`);
    }
    const body = (await res.json()) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("@youneed/feature-flags-vercel: unexpected /items response shape");
    }
    return body as Record<string, unknown>;
  }

  /** Map an items object to definitions, applying the optional prefix filter/strip. */
  function mapItems(items: Record<string, unknown>): FlagDefinition[] {
    const defs: FlagDefinition[] = [];
    for (const [rawKey, value] of Object.entries(items)) {
      if (prefix !== undefined) {
        if (!rawKey.startsWith(prefix)) continue;
        defs.push(toDefinition(rawKey.slice(prefix.length), value));
      } else {
        defs.push(toDefinition(rawKey, value));
      }
    }
    return defs;
  }

  function emit(): void {
    for (const cb of [...subs]) cb();
  }

  async function poll(): Promise<void> {
    try {
      const items = await fetchItems();
      const serialized = JSON.stringify(items);
      if (lastSerialized !== undefined && serialized !== lastSerialized) {
        lastSerialized = serialized;
        emit();
      } else {
        lastSerialized = serialized;
      }
    } catch {
      // Swallow transient poll errors; the next tick retries and `all()` surfaces
      // hard failures to callers that await it.
    }
  }

  function stop(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  return {
    async all(): Promise<FlagDefinition[]> {
      const items = await fetchItems();
      lastSerialized = JSON.stringify(items);
      return mapItems(items);
    },
    onChange(cb: () => void): () => void {
      subs.add(cb);
      if (timer === undefined) {
        timer = setInterval(() => void poll(), pollMs);
        // Don't keep the process alive just for polling (Node only).
        (timer as { unref?: () => void }).unref?.();
      }
      return () => {
        subs.delete(cb);
        if (subs.size === 0) stop();
      };
    },
    close(): void {
      stop();
      subs.clear();
    },
    [Symbol.dispose](): void {
      this.close();
    },
  };
}
