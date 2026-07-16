// ── @youneed/server-plugin-pubsub-redis — Redis/Valkey adapter (KV + Pub/Sub) ──
//
// Two adapters over ONE external Redis/Valkey instance you run, shared by every
// app instance behind your LB:
//   • RedisKV     — the `KV` store contract (@youneed/server-plugin-store).
//   • RedisPubSub — the `PubSub` contract (@youneed/server-plugin-pubsub) via
//                   Redis SUBSCRIBE/PUBLISH (needs its own connection in sub mode).
//
// In the spirit of this codebase (which hand-rolls protocols rather than pulling
// dependencies — WebSocket framing, multipart, …) this ships its OWN minimal
// RESP2 client over `node:net`. No ioredis / node-redis.

import net from "node:net";
import type { KV, IncrOptions, SetOptions } from "@youneed/server-plugin-store";
import type { PubSub, Subscriber, Subscription } from "@youneed/server-plugin-pubsub";

// ── options ───────────────────────────────────────────────────────────────────

export interface RedisKVOptions {
  /** Redis host (default `127.0.0.1`). */
  host?: string;
  /** Redis port (default `6379`). */
  port?: number;
  /** `AUTH` password, sent on (re)connect before commands resolve. */
  password?: string;
  /** Logical DB index — `SELECT`ed on (re)connect. */
  db?: number;
  /** Socket connect timeout in ms (default `5000`). */
  connectTimeout?: number;
  /** Convenience: `redis://[:password@]host:port/db`. Fields it carries override
   *  the discrete options above. */
  url?: string;
}

/** Atom of a parsed RESP reply. `null` is RESP nil (`$-1` / `*-1`). */
type RespValue = string | number | null | RespValue[];

interface Pending {
  resolve(v: RespValue): void;
  reject(e: Error): void;
}

const CRLF = "\r\n";

// The exact Lua the atomic `incr` sends. INCRBY then, only if the key was just
// created (new value === the increment) and a ttl was requested, EXPIRE it.
const INCR_LUA =
  "local v=redis.call('INCRBY',KEYS[1],ARGV[1]); " +
  "if v==tonumber(ARGV[1]) and tonumber(ARGV[2])>0 then redis.call('EXPIRE',KEYS[1],ARGV[2]) end; " +
  "return v";

function parseUrl(url: string): Partial<RedisKVOptions> {
  // redis:// or rediss:// (we don't do TLS here, but tolerate the scheme).
  const u = new URL(url);
  const out: Partial<RedisKVOptions> = {};
  if (u.hostname) out.host = u.hostname;
  if (u.port) out.port = Number(u.port);
  if (u.password) out.password = decodeURIComponent(u.password);
  const path = u.pathname.replace(/^\//, "");
  if (path) out.db = Number(path);
  return out;
}

// ── RESP2 client ────────────────────────────────────────────────────────────

class RespClient {
  #host: string;
  #port: number;
  #password?: string;
  #db?: number;
  #connectTimeout: number;

  #sock?: net.Socket;
  #buf: Buffer = Buffer.alloc(0);
  /** FIFO of resolvers — Redis answers in command order, so we pipeline freely. */
  #pending: Pending[] = [];
  /** Resolves when AUTH/SELECT handshake completes; gates user commands. */
  #ready?: Promise<void>;
  #connecting = false;
  #closed = false;
  #retry = 0;
  #reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(opts: RedisKVOptions) {
    const merged = { ...opts, ...(opts.url ? parseUrl(opts.url) : {}) };
    this.#host = merged.host ?? "127.0.0.1";
    this.#port = merged.port ?? 6379;
    this.#password = merged.password;
    this.#db = merged.db;
    this.#connectTimeout = merged.connectTimeout ?? 5000;
  }

  // Encode a command as a RESP array of bulk strings.
  static #encode(args: (string | number)[]): Buffer {
    let s = `*${args.length}${CRLF}`;
    for (const a of args) {
      const str = String(a);
      s += `$${Buffer.byteLength(str)}${CRLF}${str}${CRLF}`;
    }
    return Buffer.from(s);
  }

  /** Send a command and resolve with its parsed reply. (Re)connects as needed. */
  async command(...args: (string | number)[]): Promise<RespValue> {
    if (this.#closed) throw new Error("RedisKV: client is closed");
    await this.#ensureReady();
    return this.#send(args);
  }

  #send(args: (string | number)[]): Promise<RespValue> {
    return new Promise<RespValue>((resolve, reject) => {
      const sock = this.#sock;
      if (!sock || sock.destroyed) {
        reject(new Error("RedisKV: not connected"));
        return;
      }
      this.#pending.push({ resolve, reject });
      sock.write(RespClient.#encode(args));
    });
  }

  // Connect (if needed) and run the AUTH/SELECT handshake before resolving.
  #ensureReady(): Promise<void> {
    if (this.#sock && !this.#sock.destroyed && this.#ready) return this.#ready;
    if (!this.#ready) this.#ready = this.#connect();
    return this.#ready;
  }

  #connect(): Promise<void> {
    if (this.#connecting) return this.#ready!;
    this.#connecting = true;

    return new Promise<void>((resolve, reject) => {
      const sock = net.connect({ host: this.#host, port: this.#port });
      this.#sock = sock;
      sock.setNoDelay(true);

      const timer = setTimeout(() => {
        sock.destroy(new Error(`RedisKV: connect timeout after ${this.#connectTimeout}ms`));
      }, this.#connectTimeout);
      timer.unref?.();

      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#connecting = false;
        reject(err);
      };

      sock.once("connect", () => {
        clearTimeout(timer);
        // Run the handshake on this raw socket. Handshake replies flow through
        // the same #pending FIFO / #onData parser as everything else.
        (async () => {
          try {
            if (this.#password !== undefined) await this.#send(["AUTH", this.#password]);
            if (this.#db !== undefined) await this.#send(["SELECT", this.#db]);
            settled = true;
            this.#connecting = false;
            this.#retry = 0;
            resolve();
          } catch (err) {
            fail(err as Error);
            sock.destroy();
          }
        })();
      });

      sock.on("data", (chunk) => this.#onData(chunk));
      sock.on("error", (err) => {
        fail(err);
        this.#onDisconnect(err);
      });
      sock.on("close", () => {
        if (!settled) fail(new Error("RedisKV: connection closed during handshake"));
        this.#onDisconnect(new Error("RedisKV: connection closed"));
      });
    });
  }

  // Tear down on socket error/close: fail in-flight commands, schedule a reconnect.
  #onDisconnect(err: Error): void {
    const sock = this.#sock;
    if (sock) {
      sock.removeAllListeners();
      sock.destroy();
    }
    this.#sock = undefined;
    this.#ready = undefined;
    this.#connecting = false;
    this.#buf = Buffer.alloc(0);

    const inflight = this.#pending;
    this.#pending = [];
    for (const p of inflight) p.reject(err);

    if (this.#closed) return;
    if (this.#reconnectTimer) return; // already scheduled

    // Backoff: 50ms → … → ~2s. Timers unref'd so they don't keep the process up.
    const delay = Math.min(50 * 2 ** this.#retry, 2000);
    this.#retry++;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      if (this.#closed) return;
      // Pre-warm the connection so a healthy adapter recovers without waiting
      // for the next command. Errors here just reschedule via #onDisconnect.
      this.#ensureReady().catch(() => {});
    }, delay);
    this.#reconnectTimer.unref?.();
  }

  // Parse as many complete replies out of the buffer as possible, resolving the
  // matching #pending entry for each. Partial replies stay buffered.
  #onData(chunk: Buffer): void {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
    for (;;) {
      const parsed = RespClient.#parse(this.#buf, 0);
      if (!parsed) break; // need more bytes
      const { value, error, next } = parsed;
      this.#buf = this.#buf.subarray(next);
      const p = this.#pending.shift();
      if (!p) continue; // unsolicited (shouldn't happen for our command set)
      if (error) p.reject(new Error(error));
      else p.resolve(value!);
    }
    if (this.#buf.length === 0) this.#buf = Buffer.alloc(0);
  }

  // Parse one RESP value at `start`. Returns null if the buffer is incomplete.
  static #parse(
    buf: Buffer,
    start: number,
  ): { value?: RespValue; error?: string; next: number } | null {
    if (start >= buf.length) return null;
    const type = buf[start];
    const eol = buf.indexOf("\r\n", start + 1, "latin1");
    if (eol === -1) return null; // header line incomplete
    const line = buf.toString("utf8", start + 1, eol);
    const afterLine = eol + 2;

    switch (type) {
      case 0x2b: // '+' simple string
        return { value: line, next: afterLine };
      case 0x2d: // '-' error
        return { error: line, next: afterLine };
      case 0x3a: // ':' integer
        return { value: Number(line), next: afterLine };
      case 0x24: {
        // '$' bulk string
        const len = Number(line);
        if (len === -1) return { value: null, next: afterLine };
        const end = afterLine + len;
        if (buf.length < end + 2) return null; // body + trailing CRLF not all here
        return { value: buf.toString("utf8", afterLine, end), next: end + 2 };
      }
      case 0x2a: {
        // '*' array
        const count = Number(line);
        if (count === -1) return { value: null, next: afterLine };
        const items: RespValue[] = [];
        let pos = afterLine;
        for (let i = 0; i < count; i++) {
          const el = RespClient.#parse(buf, pos);
          if (!el) return null; // incomplete element → wait for more
          if (el.error) return { error: el.error, next: el.next };
          items.push(el.value!);
          pos = el.next;
        }
        return { value: items, next: pos };
      }
      default:
        return { error: `RedisKV: unexpected RESP type byte 0x${type.toString(16)}`, next: afterLine };
    }
  }

  async quit(): Promise<void> {
    this.#closed = true;
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }
    const sock = this.#sock;
    if (sock && !sock.destroyed) {
      try {
        await this.#send(["QUIT"]); // best-effort graceful close
      } catch {
        // ignore — we're tearing down anyway
      }
      sock.removeAllListeners();
      sock.end();
      sock.destroy();
    }
    this.#sock = undefined;
    this.#ready = undefined;
    const inflight = this.#pending;
    this.#pending = [];
    for (const p of inflight) p.reject(new Error("RedisKV: client is closed"));
  }
}

// ── glob escaping ─────────────────────────────────────────────────────────────

// SCAN MATCH uses glob patterns. Escape metachars in the literal prefix so a
// key like `user[admin]:1` isn't misinterpreted before we append the `*`.
function escapeGlob(s: string): string {
  return s.replace(/[\\*?[\]]/g, (c) => `\\${c}`);
}

// ── adapter ─────────────────────────────────────────────────────────────────

/** A `KV` backed by an external Redis/Valkey over a hand-rolled RESP2 client. */
export class RedisKV implements KV {
  #client: RespClient;

  constructor(opts: RedisKVOptions = {}) {
    this.#client = new RespClient(opts);
  }

  async get(key: string): Promise<string | undefined> {
    const v = await this.#client.command("GET", key);
    return v === null ? undefined : String(v);
  }

  async set(key: string, value: string, opts: SetOptions = {}): Promise<void> {
    if (opts.ttl !== undefined) await this.#client.command("SET", key, value, "EX", opts.ttl);
    else await this.#client.command("SET", key, value);
  }

  async delete(key: string): Promise<void> {
    await this.#client.command("DEL", key);
  }

  async incr(key: string, opts: IncrOptions = {}): Promise<number> {
    const by = opts.by ?? 1;
    const ttl = opts.ttl ?? -1; // -1 sentinel = no expiry
    // 1 KEYS, then by + ttl as ARGV. Atomic: INCRBY (+ conditional EXPIRE).
    const v = await this.#client.command("EVAL", INCR_LUA, 1, key, by, ttl);
    return Number(v);
  }

  async expire(key: string, ttl: number): Promise<void> {
    await this.#client.command("EXPIRE", key, ttl);
  }

  async ttl(key: string): Promise<number> {
    // Redis TTL semantics match our contract exactly: -2 missing, -1 no-expiry, >=0 live.
    return Number(await this.#client.command("TTL", key));
  }

  async scan(prefix: string): Promise<string[]> {
    const match = `${escapeGlob(prefix)}*`;
    const out: string[] = [];
    let cursor = "0";
    do {
      const reply = (await this.#client.command("SCAN", cursor, "MATCH", match, "COUNT", 100)) as RespValue[];
      cursor = String(reply[0]);
      const keys = reply[1] as RespValue[];
      for (const k of keys) out.push(String(k));
    } while (cursor !== "0");
    return out;
  }

  async close(): Promise<void> {
    await this.#client.quit();
  }
}

/** Construct a {@link RedisKV}. */
export function redisKV(opts: RedisKVOptions = {}): RedisKV {
  return new RedisKV(opts);
}

// ── Pub/Sub ───────────────────────────────────────────────────────────────────
// Redis pub/sub needs a connection in *subscribe mode* (it stops accepting normal
// commands and pushes `message` arrays unsolicited — incompatible with the FIFO
// RespClient). So RedisPubSub keeps a dedicated subscriber socket + a separate
// RespClient for PUBLISH.

export type RedisPubSubOptions = RedisKVOptions;

/** Parse one RESP value at `pos`; returns `[value, next]` or `null` if incomplete. */
function parseResp(buf: Buffer, pos: number): [RespValue, number] | null {
  if (pos >= buf.length) return null;
  const type = buf[pos];
  const eol = buf.indexOf("\r\n", pos);
  if (eol === -1) return null;
  const line = buf.toString("utf8", pos + 1, eol);
  const after = eol + 2;
  if (type === 0x2b /* + */ || type === 0x2d /* - */ || type === 0x3a /* : */) {
    return [type === 0x3a ? Number(line) : line, after];
  }
  if (type === 0x24 /* $ */) {
    const len = Number(line);
    if (len === -1) return [null, after];
    if (after + len + 2 > buf.length) return null;
    return [buf.toString("utf8", after, after + len), after + len + 2];
  }
  if (type === 0x2a /* * */) {
    const len = Number(line);
    if (len === -1) return [null, after];
    const arr: RespValue[] = [];
    let p = after;
    for (let i = 0; i < len; i++) {
      const next = parseResp(buf, p);
      if (!next) return null;
      arr.push(next[0]);
      p = next[1];
    }
    return [arr, p];
  }
  return null;
}

export class RedisPubSub implements PubSub {
  readonly name = "redis";
  #opts: RedisPubSubOptions;
  #pub: RespClient;
  #sock?: net.Socket;
  #ready?: Promise<void>;
  #buf: Buffer = Buffer.alloc(0);
  #handlers = new Map<string, Set<Subscriber>>();
  #closed = false;

  constructor(opts: RedisPubSubOptions = {}) {
    this.#opts = { ...opts, ...(opts.url ? parseUrl(opts.url) : {}) };
    this.#pub = new RespClient(opts);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.#pub.command("PUBLISH", channel, message);
  }

  async subscribe(channel: string, handler: Subscriber): Promise<Subscription> {
    if (this.#closed) throw new Error("RedisPubSub: client is closed");
    await this.#ensureSub();
    let set = this.#handlers.get(channel);
    if (!set) {
      this.#handlers.set(channel, (set = new Set()));
      this.#sock!.write(encodeCmd(["SUBSCRIBE", channel]));
    }
    set.add(handler);
    return {
      close: () => {
        const s = this.#handlers.get(channel);
        if (!s) return;
        s.delete(handler);
        if (s.size === 0) {
          this.#handlers.delete(channel);
          if (this.#sock && !this.#sock.destroyed) this.#sock.write(encodeCmd(["UNSUBSCRIBE", channel]));
        }
      },
    };
  }

  #ensureSub(): Promise<void> {
    if (this.#sock && !this.#sock.destroyed && this.#ready) return this.#ready;
    return (this.#ready = new Promise<void>((resolve, reject) => {
      const sock = net.connect({ host: this.#opts.host ?? "127.0.0.1", port: this.#opts.port ?? 6379 });
      this.#sock = sock;
      sock.on("data", (chunk) => this.#onData(chunk));
      sock.once("error", reject);
      sock.once("connect", () => {
        if (this.#opts.password) sock.write(encodeCmd(["AUTH", this.#opts.password]));
        if (this.#opts.db) sock.write(encodeCmd(["SELECT", String(this.#opts.db)]));
        resolve();
      });
    }));
  }

  #onData(chunk: Buffer): void {
    this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
    for (;;) {
      const parsed = parseResp(this.#buf, 0);
      if (!parsed) break;
      this.#buf = this.#buf.subarray(parsed[1]);
      const v = parsed[0];
      // message: ["message", channel, payload]  (pmessage has 4 elements)
      if (Array.isArray(v) && (v[0] === "message" || v[0] === "pmessage")) {
        const channel = String(v[v.length - 2]);
        const payload = String(v[v.length - 1]);
        const set = this.#handlers.get(channel);
        if (set) for (const h of [...set]) void h(payload, channel);
      }
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#handlers.clear();
    this.#sock?.destroy();
    await this.#pub.quit();
  }
}

// Encode a RESP command array of bulk strings (shared by the subscriber socket).
function encodeCmd(args: string[]): Buffer {
  let s = `*${args.length}${CRLF}`;
  for (const a of args) s += `$${Buffer.byteLength(a)}${CRLF}${a}${CRLF}`;
  return Buffer.from(s);
}

/** Construct a {@link RedisPubSub}. */
export function redisPubSub(opts: RedisPubSubOptions = {}): RedisPubSub {
  return new RedisPubSub(opts);
}
