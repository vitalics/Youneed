// ── @youneed/server-plugin-pubsub-postgres — Postgres adapter (KV + Pub/Sub) ──
//
//   • PostgresKV     — the `KV` store contract, backed by a table (UPSERT/atomic incr).
//   • PostgresPubSub — the `PubSub` contract via Postgres `LISTEN`/`NOTIFY`.
//
// Uses the official `pg` driver (a peer dependency), imported lazily — or inject
// your own `pg`-compatible client (a `Client`/`Pool`), which also makes it testable.

import type { KV, IncrOptions, SetOptions } from "@youneed/server-plugin-store";
import type { PubSub, Subscriber, Subscription } from "@youneed/server-plugin-pubsub";

/** The minimal `pg` surface we use (satisfied by `pg.Client` / `pg.Pool`). */
export interface PgQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}
/** A dedicated `pg.Client` for LISTEN/NOTIFY (must keep the connection open). */
export interface PgListenClient extends PgQueryable {
  on(event: "notification", listener: (msg: { channel: string; payload?: string }) => void): unknown;
}

export interface PostgresOptions {
  /** A `pg` connection string (`postgres://…`). Ignored if `client` is given. */
  connectionString?: string;
  /** Inject a `pg`-compatible client (for tests, or to share a pool). */
  client?: PgQueryable & Partial<PgListenClient>;
}

async function makeClient(opts: PostgresOptions): Promise<PgQueryable & PgListenClient> {
  if (opts.client) return opts.client as PgQueryable & PgListenClient;
  const { Client } = await import("pg"); // typed via @types/pg (devDep); `pg` itself is a peer dep
  const client = new Client({ connectionString: opts.connectionString });
  await client.connect();
  return client as unknown as PgQueryable & PgListenClient;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`; // quote a channel as an identifier

// ── KV (table-backed) ─────────────────────────────────────────────────────────
export interface PostgresKVOptions extends PostgresOptions {
  /** Table name (default `youneed_kv`). */
  table?: string;
}

export class PostgresKV implements KV {
  #ready: Promise<PgQueryable>;
  #table: string;

  constructor(opts: PostgresKVOptions = {}) {
    this.#table = opts.table ?? "youneed_kv";
    this.#ready = makeClient(opts).then(async (c) => {
      await c.query(
        `CREATE TABLE IF NOT EXISTS ${ident(this.#table)} (key text PRIMARY KEY, value text NOT NULL, expires_at timestamptz)`,
      );
      return c;
    });
  }

  async #c() {
    return this.#ready;
  }

  async get(key: string): Promise<string | undefined> {
    const c = await this.#c();
    const { rows } = await c.query(`SELECT value FROM ${ident(this.#table)} WHERE key=$1 AND (expires_at IS NULL OR expires_at > now())`, [key]);
    return rows[0]?.value as string | undefined;
  }

  async set(key: string, value: string, opts: SetOptions = {}): Promise<void> {
    const c = await this.#c();
    const exp = opts.ttl !== undefined ? `now() + ($3 || ' seconds')::interval` : "NULL";
    const params = opts.ttl !== undefined ? [key, value, String(opts.ttl)] : [key, value];
    await c.query(`INSERT INTO ${ident(this.#table)} (key,value,expires_at) VALUES ($1,$2,${exp}) ON CONFLICT (key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at`, params);
  }

  async delete(key: string): Promise<void> {
    const c = await this.#c();
    await c.query(`DELETE FROM ${ident(this.#table)} WHERE key=$1`, [key]);
  }

  async incr(key: string, opts: IncrOptions = {}): Promise<number> {
    const c = await this.#c();
    const by = opts.by ?? 1;
    // Atomic upsert; `inserted` (xmax=0) tells us the row was just created.
    const { rows } = await c.query(
      `INSERT INTO ${ident(this.#table)} AS t (key,value) VALUES ($1,$2)
       ON CONFLICT (key) DO UPDATE SET value=((t.value)::bigint + $2)::text
       RETURNING value, (xmax = 0) AS inserted`,
      [key, String(by)],
    );
    const value = Number(rows[0].value);
    if (rows[0].inserted && opts.ttl !== undefined) await this.expire(key, opts.ttl);
    return value;
  }

  async expire(key: string, ttl: number): Promise<void> {
    const c = await this.#c();
    await c.query(`UPDATE ${ident(this.#table)} SET expires_at = now() + ($2 || ' seconds')::interval WHERE key=$1`, [key, String(ttl)]);
  }

  async ttl(key: string): Promise<number> {
    const c = await this.#c();
    const { rows } = await c.query(`SELECT EXTRACT(EPOCH FROM (expires_at - now())) AS s, expires_at FROM ${ident(this.#table)} WHERE key=$1`, [key]);
    if (!rows[0]) return -2;
    if (rows[0].expires_at == null) return -1;
    return Math.max(0, Math.floor(Number(rows[0].s)));
  }

  async scan(prefix: string): Promise<string[]> {
    const c = await this.#c();
    const { rows } = await c.query(`SELECT key FROM ${ident(this.#table)} WHERE key LIKE $1`, [prefix.replace(/[%_\\]/g, "\\$&") + "%"]);
    return rows.map((r) => r.key as string);
  }
}

export function postgresKV(opts: PostgresKVOptions = {}): PostgresKV {
  return new PostgresKV(opts);
}

// ── Pub/Sub (LISTEN / NOTIFY) ───────────────────────────────────────────────────
export class PostgresPubSub implements PubSub {
  readonly name = "postgres";
  #ready: Promise<PgListenClient>;
  #handlers = new Map<string, Set<Subscriber>>();

  constructor(opts: PostgresOptions = {}) {
    this.#ready = makeClient(opts).then((c) => {
      c.on("notification", (msg) => {
        const set = this.#handlers.get(msg.channel);
        if (set) for (const h of [...set]) void h(msg.payload ?? "", msg.channel);
      });
      return c;
    });
  }

  async publish(channel: string, message: string): Promise<void> {
    const c = await this.#ready;
    await c.query("SELECT pg_notify($1, $2)", [channel, message]); // pg_notify allows any channel/payload
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    const c = await this.#ready;
    let set = this.#handlers.get(channel);
    if (!set) {
      this.#handlers.set(channel, (set = new Set()));
      await c.query(`LISTEN ${ident(channel)}`); // identifier ≤ 63 bytes; longer is truncated by PG
    }
    set.add(handler);
    return {
      close: async () => {
        const s = this.#handlers.get(channel);
        if (!s) return;
        s.delete(handler);
        if (s.size === 0) {
          this.#handlers.delete(channel);
          await c.query(`UNLISTEN ${ident(channel)}`);
        }
      },
    };
  }
}

export function postgresPubSub(opts: PostgresOptions = {}): PostgresPubSub {
  return new PostgresPubSub(opts);
}
