// Run: pnpm --filter @youneed/server-middleware-session test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { session, getSession, MemoryStore, KvSessionStore } from "../src/index.ts";
import { MemoryKV } from "@youneed/kv";

interface RawRes {
  status: number;
  setCookie?: string;
  body: unknown;
}

async function get(url: string, cookie?: string): Promise<RawRes> {
  const res = await fetch(url, { headers: cookie ? { cookie } : {} });
  return {
    status: res.status,
    setCookie: res.headers.get("set-cookie") ?? undefined,
    body: await res.json(),
  };
}

/** Pull `sid=<value>` out of a Set-Cookie header so it can be echoed back. */
function sidCookie(setCookie: string | undefined): string | undefined {
  if (!setCookie) return undefined;
  const m = /(^|,\s*)(sid=[^;]+)/.exec(setCookie);
  return m?.[2];
}

class SessionSuite extends Test({ name: "server-middleware-session" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41326";

  @Test.beforeAll() async start() {
    const store = new MemoryStore(); // shared so persistence survives requests
    const app = Application()
      .use(session({ secret: "test-secret", store }))
      .get("/login", (ctx) => {
        getSession(ctx)!.set("user", "ada");
        return Response.json({ ok: true });
      })
      .get("/me", (ctx) => Response.json({ user: getSession(ctx)?.get("user") ?? null }))
      .get("/logout", (ctx) => {
        getSession(ctx)!.destroy();
        return Response.json({ ok: true });
      });
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41326, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("first request issues a signed sid cookie") async issues() {
    const r = await get(`${this.base}/me`);
    expect(r.status).toBe(200);
    const sid = sidCookie(r.setCookie);
    expect(typeof sid).toBe("string");
    expect(sid!.includes(".")).toBe(true); // <id>.<hmac>
    expect((r.body as { user: unknown }).user).toBe(null);
  }

  @Test.it("set() persists across requests via the store") async persists() {
    const login = await get(`${this.base}/login`);
    const sid = sidCookie(login.setCookie);
    expect(typeof sid).toBe("string");
    const me = await get(`${this.base}/me`, sid);
    expect((me.body as { user: unknown }).user).toBe("ada");
  }

  @Test.it("a tampered cookie is rejected → fresh empty session") async tampered() {
    const login = await get(`${this.base}/login`);
    const sid = sidCookie(login.setCookie)!;
    // flip the last char of the hmac to break the signature
    const last = sid.slice(-1) === "A" ? "B" : "A";
    const forged = sid.slice(0, -1) + last;
    const me = await get(`${this.base}/me`, forged);
    expect((me.body as { user: unknown }).user).toBe(null);
    // a new (different) cookie must be issued for the fresh session
    expect(sidCookie(me.setCookie)).not.toBe(undefined);
  }

  @Test.it("destroy() clears the session and the cookie") async destroys() {
    const login = await get(`${this.base}/login`);
    const sid = sidCookie(login.setCookie)!;
    const out = await get(`${this.base}/logout`, sid);
    // cookie cleared (Max-Age=0)
    expect(/Max-Age=0/i.test(out.setCookie ?? "")).toBe(true);
    // store entry gone → reusing the (still-valid-signature) cookie reads empty
    const me = await get(`${this.base}/me`, sid);
    expect((me.body as { user: unknown }).user).toBe(null);
  }
}

class KvSessionSuite extends Test({ name: "server-middleware-session (kv store)" }) {
  #server!: HTTP;
  #kv!: MemoryKV;
  base = "http://127.0.0.1:41227";

  @Test.beforeAll() async start() {
    this.#kv = new MemoryKV({ sweepMs: 0 }); // shared KV, no background timer
    const app = Application()
      .use(session({ secret: "test-secret", store: new KvSessionStore(this.#kv) }))
      .get("/login", (ctx) => {
        getSession(ctx)!.set("user", "grace");
        return Response.json({ ok: true });
      })
      .get("/me", (ctx) => Response.json({ user: getSession(ctx)?.get("user") ?? null }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41227, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("set() persists across requests through the KV store") async persistsViaKv() {
    const login = await get(`${this.base}/login`);
    const sid = sidCookie(login.setCookie);
    expect(typeof sid).toBe("string");
    const me = await get(`${this.base}/me`, sid);
    expect((me.body as { user: unknown }).user).toBe("grace");
  }

  @Test.it("KvSessionStore writes JSON under the prefixed key, destroy removes it") async unit() {
    const kv = new MemoryKV({ sweepMs: 0 });
    const store = new KvSessionStore(kv, { prefix: "sess:" });
    await store.set("abc", { user: "ada", n: 7 });
    const raw = await kv.get("sess:abc");
    expect(typeof raw).toBe("string");
    expect(JSON.parse(raw!)).toEqual({ user: "ada", n: 7 });
    // round-trips back through the store
    expect(await store.get("abc")).toEqual({ user: "ada", n: 7 });
    // destroy removes the prefixed key
    await store.destroy("abc");
    expect(await kv.get("sess:abc")).toBe(undefined);
    expect(await store.get("abc")).toBe(undefined);
  }

  @Test.it("a corrupt (non-JSON) value reads back as a missing session") async corrupt() {
    const kv = new MemoryKV({ sweepMs: 0 });
    const store = new KvSessionStore(kv);
    await kv.set("sess:bad", "not-json{");
    expect(await store.get("bad")).toBe(undefined);
  }
}

await TestApplication()
  .addTests(SessionSuite)
  .addTests(KvSessionSuite)
  .reporter(new ConsoleReporter())
  .run();
