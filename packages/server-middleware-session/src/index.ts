// @youneed/server middleware — signed-cookie sessions with a pluggable store.
//
//   app.use(session({ secret: process.env.SESSION_SECRET! }))
//      .post("/login", (ctx) => {
//        getSession(ctx)!.set("user", "ada");   // persisted on the way out
//        return Response.json({ ok: true });
//      })
//      .get("/me", (ctx) => Response.json({ user: getSession(ctx)?.get("user") }));
//
// The cookie holds only the session *id*, signed with an HMAC (`<id>.<hmac>`) so a
// forged/tampered id is rejected (constant-time compare). Session *data* lives in
// the store (default in-memory `MemoryStore`); swap in Redis/SQL by implementing
// `SessionStore`. The cookie is re-set + the store persisted only when the session
// was touched (read of an existing id is free); destroyed sessions clear both.
import type { Context, CookieOptions, Middleware } from "@youneed/server";
import type { KV } from "@youneed/kv";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Arbitrary per-session data bag. */
export type SessionData = Record<string, unknown>;

/**
 * Pluggable session backend. The default is an in-memory {@link MemoryStore};
 * implement this against Redis/SQL/etc. for a shared/persistent store.
 */
export interface SessionStore {
  get(id: string): SessionData | undefined | Promise<SessionData | undefined>;
  set(id: string, data: SessionData): void | Promise<void>;
  destroy(id: string): void | Promise<void>;
}

/** Default in-memory store — a plain `Map`. Not shared across processes. */
export class MemoryStore implements SessionStore {
  #map = new Map<string, SessionData>();
  get(id: string): SessionData | undefined {
    const data = this.#map.get(id);
    return data ? { ...data } : undefined;
  }
  set(id: string, data: SessionData): void {
    this.#map.set(id, { ...data });
  }
  destroy(id: string): void {
    this.#map.delete(id);
  }
}

/** Options for {@link KvSessionStore}. */
export interface KvSessionStoreOptions {
  /** Key prefix in the KV namespace (default `"sess:"`). */
  prefix?: string;
  /** Entry lifetime in **seconds**. Refreshed on every `set`. Omit for no expiry. */
  ttl?: number;
}

/**
 * Distributed session store backed by a {@link KV}. Because session data lives
 * in the (shared) KV rather than in-process, sessions survive across app
 * instances behind a load balancer — and across process restarts (unlike the
 * per-process {@link MemoryStore}). The physical backend is chosen by which KV
 * adapter you plug in (e.g. `redisKV` from `@youneed/kv-redis`).
 *
 *   session({ secret, store: new KvSessionStore(redisKV({ url }), { ttl: 86400 }) })
 */
export class KvSessionStore implements SessionStore {
  #kv: KV;
  #prefix: string;
  #ttl?: number;

  constructor(kv: KV, opts: KvSessionStoreOptions = {}) {
    this.#kv = kv;
    this.#prefix = opts.prefix ?? "sess:";
    this.#ttl = opts.ttl;
  }

  async get(id: string): Promise<SessionData | undefined> {
    const raw = await this.#kv.get(this.#prefix + id);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as SessionData;
    } catch {
      // Corrupt/non-JSON value → treat as a missing (fresh) session.
      return undefined;
    }
  }

  async set(id: string, data: SessionData): Promise<void> {
    await this.#kv.set(
      this.#prefix + id,
      JSON.stringify(data),
      this.#ttl ? { ttl: this.#ttl } : undefined,
    );
  }

  async destroy(id: string): Promise<void> {
    await this.#kv.delete(this.#prefix + id);
  }
}

/** The session object exposed at `ctx.state.session` (see {@link getSession}). */
export interface Session {
  /** The session id (the signed value carried by the cookie). */
  readonly id: string;
  /** Snapshot of the current data (a copy — mutate via `set`/`delete`). */
  readonly data: SessionData;
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  /** Drop all keys (the session id is kept; the cookie is re-issued). */
  clear(): void;
  /** Destroy the session: clears the store entry and the cookie on the way out. */
  destroy(): void;
}

export interface SessionOptions {
  /** HMAC key used to sign the session-id cookie (required). */
  secret: string;
  /** Cookie name (default `"sid"`). */
  cookieName?: string;
  /** Cookie/store lifetime in seconds (default: session cookie, no Max-Age). */
  maxAge?: number;
  /** Backing store (default a fresh {@link MemoryStore}). */
  store?: SessionStore;
  /** Extra cookie attributes (merged over the defaults: HttpOnly + SameSite Lax). */
  cookie?: CookieOptions;
}

const STATE_KEY = "session";

/**
 * Typed accessor for the current {@link Session}. Returns `undefined` when the
 * `session()` middleware isn't installed.
 */
export function getSession(ctx: Context): Session | undefined {
  return ctx.state[STATE_KEY] as Session | undefined;
}

function sign(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("base64url");
}

/** Verify `<id>.<hmac>` in constant time; return the id, or undefined if invalid. */
function unsign(value: string, secret: string): string | undefined {
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const id = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(id, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return undefined;
  return timingSafeEqual(a, b) ? id : undefined;
}

/**
 * Signed-cookie session middleware. Reads & verifies the session-id cookie,
 * loads data from the store, and exposes the {@link Session} at
 * `ctx.state.session` (read via {@link getSession}). On the way out it persists
 * and re-signs the cookie only when the session was touched; a `destroy()`
 * clears both the store and the cookie.
 */
export function session(opts: SessionOptions): Middleware {
  if (!opts.secret) throw new Error("session(): `secret` is required");
  const secret = opts.secret;
  const cookieName = opts.cookieName ?? "sid";
  const store = opts.store ?? new MemoryStore();
  const cookieOpts: CookieOptions = {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    ...(opts.maxAge !== undefined ? { maxAge: opts.maxAge } : {}),
    ...opts.cookie,
  };

  return async (ctx, next) => {
    const raw = ctx.cookies.get(cookieName);
    const validId = raw ? unsign(raw, secret) : undefined;

    let id: string;
    let data: SessionData;
    if (validId) {
      id = validId;
      data = (await store.get(id)) ?? {};
    } else {
      id = randomBytes(18).toString("base64url");
      data = {};
    }

    let touched = false; // data changed / fresh id not yet sent
    let destroyed = false;
    // A fresh (unsigned-cookie) session must (re)issue the cookie so the client
    // gets a verifiable id; an existing valid id is left alone until written.
    if (!validId) touched = true;

    const sess: Session = {
      id,
      get data() {
        return { ...data };
      },
      get(key) {
        return data[key] as never;
      },
      set(key, value) {
        data[key] = value;
        touched = true;
      },
      delete(key) {
        if (key in data) {
          delete data[key];
          touched = true;
        }
      },
      clear() {
        data = {};
        touched = true;
      },
      destroy() {
        destroyed = true;
      },
    };
    ctx.state[STATE_KEY] = sess;

    try {
      return await next();
    } finally {
      const res = ctx.response;
      if (!res.headersSent && !res.writableEnded) {
        if (destroyed) {
          await store.destroy(id);
          ctx.cookies.delete(cookieName, { path: cookieOpts.path });
        } else if (touched) {
          await store.set(id, data);
          ctx.cookies.set(cookieName, `${id}.${sign(id, secret)}`, cookieOpts);
        }
      }
    }
  };
}
