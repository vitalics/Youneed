// Run: pnpm --filter @youneed/server-plugin-store-redis test
//
// There is NO real Redis here, so we stand up a tiny in-process RESP loopback
// server (node:net) that speaks just enough of the protocol to back an in-memory
// Map, and point RedisKV at it. This exercises the real RESP2 encode/parse path,
// the command mapping, and reconnect — without any external service.

import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import net from "node:net";
import { RedisKV } from "../src/index.ts";

// ── fake RESP server ──────────────────────────────────────────────────────────

interface Entry {
  value: string;
  /** absolute expiry epoch ms, or 0 for none */
  expiresAt: number;
}

const INCR_LUA =
  "local v=redis.call('INCRBY',KEYS[1],ARGV[1]); " +
  "if v==tonumber(ARGV[1]) and tonumber(ARGV[2])>0 then redis.call('EXPIRE',KEYS[1],ARGV[2]) end; " +
  "return v";

class FakeRedis {
  store = new Map<string, Entry>();
  #server?: net.Server;
  #sockets = new Set<net.Socket>();
  port = 0;

  #live(key: string): Entry | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== 0 && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e;
  }

  // Listen on `port` (0 = ephemeral). Retries briefly if the OS still holds a
  // just-released fixed port (used by the reconnect test to rebind the same port).
  listen(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const attempt = (n: number) => {
        const srv = net.createServer((sock) => this.#onConn(sock));
        srv.once("error", (err) => {
          srv.removeAllListeners();
          if (port !== 0 && n < 30) setTimeout(() => attempt(n + 1), 50);
          else reject(err);
        });
        srv.listen(port, "127.0.0.1", () => {
          this.#server = srv;
          this.port = (srv.address() as net.AddressInfo).port;
          resolve(this.port);
        });
      };
      attempt(0);
    });
  }

  start(): Promise<number> {
    return this.listen(0);
  }

  /** Close the server and forcibly drop existing connections (simulate a drop).
   *  `net.Server` has no `closeAllConnections`, so we destroy tracked sockets
   *  ourselves — otherwise `close()` would block waiting for the client. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      const srv = this.#server;
      this.#server = undefined;
      for (const s of this.#sockets) s.destroy();
      this.#sockets.clear();
      if (!srv) return resolve();
      srv.close(() => resolve());
    });
  }

  // Parse RESP command arrays out of the buffer; reply per command. Buffers
  // partial chunks like the real client.
  #onConn(sock: net.Socket): void {
    this.#sockets.add(sock);
    sock.on("close", () => this.#sockets.delete(sock));
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const parsed = parseCommand(buf, 0);
        if (!parsed) break;
        buf = buf.subarray(parsed.next);
        const reply = this.#dispatch(parsed.args);
        if (reply !== null) sock.write(reply);
        if (parsed.args[0]?.toUpperCase() === "QUIT") sock.end();
      }
    });
    sock.on("error", () => {});
  }

  #dispatch(args: string[]): string | null {
    const cmd = args[0]?.toUpperCase();
    switch (cmd) {
      case "AUTH":
      case "SELECT":
        return "+OK\r\n";
      case "QUIT":
        return "+OK\r\n";
      case "GET": {
        const e = this.#live(args[1]);
        return e ? bulk(e.value) : "$-1\r\n";
      }
      case "SET": {
        let expiresAt = 0;
        if (args[3]?.toUpperCase() === "EX") expiresAt = Date.now() + Number(args[4]) * 1000;
        this.store.set(args[1], { value: args[2], expiresAt });
        return "+OK\r\n";
      }
      case "DEL": {
        const had = this.#live(args[1]) ? 1 : 0;
        this.store.delete(args[1]);
        return `:${had}\r\n`;
      }
      case "INCRBY": {
        const e = this.#live(args[1]);
        const next = (e ? Number(e.value) || 0 : 0) + Number(args[2]);
        this.store.set(args[1], { value: String(next), expiresAt: e ? e.expiresAt : 0 });
        return `:${next}\r\n`;
      }
      case "EXPIRE": {
        const e = this.#live(args[1]);
        if (!e) return ":0\r\n";
        e.expiresAt = Date.now() + Number(args[2]) * 1000;
        return ":1\r\n";
      }
      case "TTL": {
        const e = this.#live(args[1]);
        if (!e) return ":-2\r\n";
        if (e.expiresAt === 0) return ":-1\r\n";
        return `:${Math.ceil((e.expiresAt - Date.now()) / 1000)}\r\n`;
      }
      case "SCAN": {
        const matchIdx = args.findIndex((a) => a.toUpperCase() === "MATCH");
        const pattern = matchIdx >= 0 ? args[matchIdx + 1] : "*";
        const re = globToRegExp(pattern);
        const keys = [...this.store.keys()].filter((k) => this.#live(k) && re.test(k));
        // Single pass: return cursor 0 + all matches.
        return `*2\r\n${bulk("0")}*${keys.length}\r\n${keys.map(bulk).join("")}`;
      }
      case "EVAL": {
        const script = args[1];
        if (script === INCR_LUA) {
          // KEYS[1] = args[3], ARGV[1] = by = args[4], ARGV[2] = ttl = args[5]
          const key = args[3];
          const by = Number(args[4]);
          const ttl = Number(args[5]);
          const e = this.#live(key);
          const next = (e ? Number(e.value) || 0 : 0) + by;
          let expiresAt = e ? e.expiresAt : 0;
          if (next === by && ttl > 0) expiresAt = Date.now() + ttl * 1000;
          this.store.set(key, { value: String(next), expiresAt });
          return `:${next}\r\n`;
        }
        return "-ERR unknown script\r\n";
      }
      default:
        return `-ERR unknown command '${cmd}'\r\n`;
    }
  }
}

// ── RESP helpers ────────────────────────────────────────────────────────────

function bulk(s: string): string {
  return `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
}

function globToRegExp(pattern: string): RegExp {
  // Mirror the client's escaping: \x literal, * → .*, ? → ., [...] passthrough.
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      const n = pattern[++i] ?? "";
      re += n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(re + "$");
}

// Parse one RESP command array (`*N` of bulk strings) starting at `start`.
function parseCommand(buf: Buffer, start: number): { args: string[]; next: number } | null {
  if (buf[start] !== 0x2a) return null; // '*'
  let eol = buf.indexOf("\r\n", start + 1, "latin1");
  if (eol === -1) return null;
  const count = Number(buf.toString("utf8", start + 1, eol));
  let pos = eol + 2;
  const args: string[] = [];
  for (let i = 0; i < count; i++) {
    if (buf[pos] !== 0x24) return null; // '$'
    eol = buf.indexOf("\r\n", pos + 1, "latin1");
    if (eol === -1) return null;
    const len = Number(buf.toString("utf8", pos + 1, eol));
    const bodyStart = eol + 2;
    const bodyEnd = bodyStart + len;
    if (buf.length < bodyEnd + 2) return null;
    args.push(buf.toString("utf8", bodyStart, bodyEnd));
    pos = bodyEnd + 2;
  }
  return { args, next: pos };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── suite ─────────────────────────────────────────────────────────────────

let fake: FakeRedis;
let kv: RedisKV;

class RedisKVSuite extends Test({ name: "kv-redis: RedisKV over fake RESP server" }) {
  @Test.beforeAll()
  async start() {
    fake = new FakeRedis();
    const port = await fake.start();
    kv = new RedisKV({ host: "127.0.0.1", port });
  }

  @Test.afterAll()
  async stop() {
    await kv.close();
    await fake.stop();
  }

  @Test.it("get/set/delete round-trips")
  async getSet() {
    expect(await kv.get("a")).toBe(undefined);
    await kv.set("a", "hello");
    expect(await kv.get("a")).toBe("hello");
    await kv.delete("a");
    expect(await kv.get("a")).toBe(undefined);
  }

  @Test.it("set with ttl then TTL reports it")
  async setTtl() {
    await kv.set("s", "v", { ttl: 30 });
    expect(await kv.get("s")).toBe("v");
    expect(await kv.ttl("s")).toBe(30);
  }

  @Test.it("ttl reports -1 no-expiry, -2 missing")
  async ttlSpecials() {
    await kv.set("forever", "x");
    expect(await kv.ttl("forever")).toBe(-1);
    expect(await kv.ttl("missing-key")).toBe(-2);
  }

  @Test.it("atomic incr with ttl creates+expires; second incr keeps the ttl")
  async incr() {
    expect(await kv.incr("c", { ttl: 60 })).toBe(1); // created → ttl applied
    expect(await kv.ttl("c")).toBe(60);
    const after = await kv.incr("c", { by: 5 }); // existing → ttl untouched
    expect(after).toBe(6);
    expect(await kv.ttl("c")).toBeGreaterThan(0);
    expect(await kv.ttl("c")).toBe(60);
  }

  @Test.it("expire sets a window on an existing key")
  async expire() {
    await kv.set("e", "v");
    expect(await kv.ttl("e")).toBe(-1);
    await kv.expire("e", 45);
    expect(await kv.ttl("e")).toBe(45);
  }

  @Test.it("scan returns keys by prefix")
  async scan() {
    await kv.set("user:1", "a");
    await kv.set("user:2", "b");
    await kv.set("post:1", "c");
    const users = (await kv.scan("user:")).sort();
    expect(users).toEqual(["user:1", "user:2"]);
  }

  @Test.it("scan escapes glob metachars in the prefix")
  async scanGlob() {
    await kv.set("ns[x]:1", "a");
    await kv.set("nsXy:1", "b"); // would match if '[x]' were treated as a glob class
    const keys = await kv.scan("ns[x]:");
    expect(keys).toEqual(["ns[x]:1"]);
  }

  @Test.it("reconnects and succeeds after the server drops the connection")
  async reconnect() {
    await kv.set("persist", "before");
    expect(await kv.get("persist")).toBe("before");

    // Drop the connection (and the server) — the next command fails fast and a
    // reconnect is scheduled. Restart a fresh server on the SAME port (reusing
    // the backing map for continuity) and confirm the client recovers.
    const oldPort = fake.port;
    const data = fake.store;
    await fake.stop();

    fake = new FakeRedis();
    fake.store = data;
    await fake.listen(oldPort);

    // Poll: the client should reconnect on the next command(s).
    let value: string | undefined;
    for (let i = 0; i < 40; i++) {
      try {
        value = await kv.get("persist");
        if (value === "before") break;
      } catch {
        // not reconnected yet
      }
      await sleep(50);
    }
    expect(value).toBe("before");

    // And a write goes through post-reconnect.
    await kv.set("after", "ok");
    expect(await kv.get("after")).toBe("ok");
  }
}

await TestApplication().addTests(RedisKVSuite).reporter(new ConsoleReporter()).run();
