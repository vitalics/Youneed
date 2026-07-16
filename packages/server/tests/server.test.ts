// Server infra self-test: compiled serializer, middleware, cookies, bearer,
// response cache + invalidation, security, body-limit/timeout/etag/multipart,
// SWR, and the QUERY method. Run: pnpm --filter @youneed/server test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Controller, Response, t, createCache, createDistributedCache, HttpError, guardWithDocumentation, withDocumentation } from "../src/server.ts";
import type { MultipartBody, AppBuilder, HTTP, ListenOptions, Interceptor, Context, ServerPlugin } from "../src/server.ts";
import { MemoryKV } from "@youneed/kv";
// Middlewares moved to their own @youneed/server-middleware-* packages.
import { bearer } from "@youneed/server-middleware-bearer";
import { cors } from "@youneed/server-middleware-cors";
import { rateLimit, RateLimitStrategy, TokenBucket } from "@youneed/server-middleware-rate-limit";
import { http2Guard } from "@youneed/server-middleware-http2-guard";
import type { Http2AbuseInfo } from "@youneed/server-middleware-http2-guard";
import { compression } from "@youneed/server-middleware-compression";
import { requestLogger } from "@youneed/server-middleware-request-logger";
import { helmet } from "@youneed/server-middleware-helmet";
import { csrf } from "@youneed/server-middleware-csrf";
import { bodyLimit } from "@youneed/server-middleware-body-limit";
import { timeout } from "@youneed/server-middleware-timeout";
import { etag } from "@youneed/server-middleware-etag";
import { connect as http2Connect } from "node:http2";
import { request as httpsRequest } from "node:https";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { File, cacheControl, clearSiteData } from "../src/server.ts";

const listen = (app: AppBuilder, port: number, opts?: ListenOptions): Promise<HTTP> =>
  new Promise((resolve) => {
    const h = opts ? app.listen(port, opts, () => resolve(h)) : app.listen(port, () => resolve(h));
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Self-signed cert via openssl (dev machines have it); null if unavailable. */
function makeTestCert(): { key: Buffer; cert: Buffer } | null {
  const keyPath = join(tmpdir(), "youneed-h2-key.pem");
  const certPath = join(tmpdir(), "youneed-h2-cert.pem");
  const r = spawnSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=localhost"],
    { stdio: "ignore" },
  );
  if (r.status !== 0 || !existsSync(keyPath)) return null;
  return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
}

/** Minimal HTTP/2 client GET → { status, body, alpn }. */
function h2get(authority: string, path: string, opts: object): Promise<{ status: number; body: string; alpn: string }> {
  return new Promise((resolve, reject) => {
    const client = http2Connect(authority, opts as never);
    client.on("error", reject);
    const req = client.request({ ":path": path });
    let status = 0;
    let body = "";
    req.on("response", (h) => (status = Number(h[":status"])));
    req.setEncoding("utf8");
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const alpn = (client.socket as unknown as { alpnProtocol?: string }).alpnProtocol ?? "h2c";
      client.close();
      resolve({ status, body, alpn });
    });
    req.on("error", reject);
    req.end();
  });
}

// ── App 1: cache, cookies, compiled serializer ───────────────────────────────
class CacheSuite extends Test({ name: "server: cache / cookies / serializer" }) {
  #cache = createCache({ ttl: 60_000 });
  #counter = 0;
  #slowRuns = 0;
  #server!: HTTP;
  base = "http://127.0.0.1:41010";

  @Test.beforeAll() async start() {
    const app = Application()
      .use(this.#cache.middleware())
      .get("/cached", () => Response.json({ n: ++this.#counter }))
      .get("/slow", async () => {
        this.#slowRuns++;
        await sleep(80);
        return Response.json({ runs: this.#slowRuns });
      })
      .get("/login", (ctx) => {
        ctx.cookies.set("sid", "abc123", { httpOnly: true, sameSite: "Lax" });
        return Response.json({ ok: true });
      })
      .get("/me", (ctx) => Response.json({ sid: ctx.cookies.get("sid") ?? null }))
      .get("/typed", () => Response.json({ id: 1, name: "neo", secret: "leak" }), {
        response: t.object({ id: t.number(), name: t.string() }),
      });
    this.#server = await listen(app, 41010);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }

  @Test.it("MISS then HIT; cached body identical (handler ran once)") async hit() {
    const r1 = await fetch(`${this.base}/cached`);
    const b1 = (await r1.json()) as { n: number };
    const r2 = await fetch(`${this.base}/cached`);
    const b2 = (await r2.json()) as { n: number };
    expect(r1.headers.get("x-cache")).toBe("MISS");
    expect(r2.headers.get("x-cache")).toBe("HIT");
    expect(b1.n === 1 && b2.n === 1).toBeTruthy();
  }
  @Test.it("invalidate drops + handler re-runs; regex invalidate works") async invalidate() {
    expect(this.#cache.invalidate("GET /cached")).toBe(1);
    const r3 = await fetch(`${this.base}/cached`);
    const b3 = (await r3.json()) as { n: number };
    expect(b3.n === 2 && r3.headers.get("x-cache") === "MISS").toBeTruthy();
    expect(this.#cache.invalidate(/cached/)).toBe(1);
  }
  @Test.it("coalescing: 6 concurrent misses → one leader, rest COALESCED") async coalescing() {
    const burst = await Promise.all(Array.from({ length: 6 }, () => fetch(`${this.base}/slow`)));
    const tags = burst.map((r) => r.headers.get("x-cache"));
    await Promise.all(burst.map((r) => r.body?.cancel()));
    expect(this.#slowRuns).toBe(1);
    expect(tags.filter((x) => x === "MISS").length).toBe(1);
    expect(tags.filter((x) => x === "COALESCED").length).toBe(5);
  }
  @Test.it("cookies: Set-Cookie + attributes + reads inbound Cookie") async cookies() {
    const rl = await fetch(`${this.base}/login`);
    const setCookie = rl.headers.get("set-cookie") ?? "";
    await rl.body?.cancel();
    expect(/sid=abc123/.test(setCookie)).toBeTruthy();
    expect(/HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie)).toBeTruthy();
    const rme = await fetch(`${this.base}/me`, { headers: { cookie: "sid=xyz; theme=dark" } });
    expect(((await rme.json()) as { sid: string | null }).sid).toBe("xyz");
  }
  @Test.it("compiled serializer: declared fields, drop undeclared, JSON type") async serializer() {
    const rt = await fetch(`${this.base}/typed`);
    const bt = (await rt.json()) as Record<string, unknown>;
    expect(bt.id === 1 && bt.name === "neo").toBeTruthy();
    expect("secret" in bt).toBeFalsy();
    expect((rt.headers.get("content-type") ?? "").includes("application/json")).toBeTruthy();
  }
}

// ── App 2: bearer auth (global middleware) ────────────────────────────────────
class BearerSuite extends Test({ name: "server: bearer auth" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41011";
  @Test.beforeAll() async start() {
    const app = Application()
      .use(bearer({ verify: (token) => (token === "s3cret" ? { id: 7, name: "trinity" } : false), realm: "test-api" }))
      .get("/whoami", (ctx) => Response.json(ctx.state.user));
    this.#server = await listen(app, 41011);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }
  @Test.it("401 + WWW-Authenticate challenge without a token") async noToken() {
    const no = await fetch(`${this.base}/whoami`);
    await no.body?.cancel();
    expect(no.status).toBe(401);
    expect((no.headers.get("www-authenticate") ?? "").includes('Bearer realm="test-api"')).toBeTruthy();
  }
  @Test.it("401 with a bad token") async badToken() {
    const bad = await fetch(`${this.base}/whoami`, { headers: { authorization: "Bearer wrong" } });
    await bad.body?.cancel();
    expect(bad.status).toBe(401);
  }
  @Test.it("200 with a valid token, principal in state") async goodToken() {
    const ok = await fetch(`${this.base}/whoami`, { headers: { authorization: "Bearer s3cret" } });
    const b = (await ok.json()) as { id: number; name: string };
    expect(ok.status === 200 && b.name === "trinity" && b.id === 7).toBeTruthy();
  }
}

// ── App 3: cors, compression, rate-limit (scoped), per-route mw, logger ───────
class MiddlewareSuite extends Test({ name: "server: cors / gzip / rate-limit / scoped mw" }) {
  #logs: string[] = [];
  #server!: HTTP;
  base = "http://127.0.0.1:41012";
  @Test.beforeAll() async start() {
    const app = Application()
      .use(requestLogger({ log: (l) => this.#logs.push(l) }))
      .use(cors({ origin: "*", maxAge: 600 }))
      .use(compression({ threshold: 1 }))
      .use("/limited", rateLimit({ max: 3, windowMs: 60_000 }))
      .use("/admin", (ctx, next) => {
        ctx.state.role = "admin";
        return next();
      })
      .get("/hello", () => Response.text("hi"))
      .get("/limited", () => Response.json({ ok: true }))
      .get("/admin/me", (ctx) => Response.json({ role: ctx.state.role ?? null }))
      .get("/plain", (ctx) => Response.json({ role: ctx.state.role ?? null }))
      .get("/big", () => Response.json({ blob: "x".repeat(5000) }));
    this.#server = await listen(app, 41012);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }
  @Test.it("cors: ACAO + preflight 204 with methods + max-age") async cors() {
    const ch = await fetch(`${this.base}/hello`, { headers: { origin: "https://app.example" } });
    await ch.body?.cancel();
    expect(ch.headers.get("access-control-allow-origin")).toBe("*");
    const pf = await fetch(`${this.base}/hello`, { method: "OPTIONS", headers: { origin: "https://app.example", "access-control-request-method": "GET" } });
    await pf.body?.cancel();
    expect(pf.status).toBe(204);
    expect((pf.headers.get("access-control-allow-methods") ?? "").includes("GET")).toBeTruthy();
    expect(pf.headers.get("access-control-max-age")).toBe("600");
  }
  @Test.it("compression: gzip Content-Encoding, body intact") async gzip() {
    const big = await fetch(`${this.base}/big`, { headers: { "accept-encoding": "gzip" } });
    const body = (await big.json()) as { blob: string };
    expect(big.headers.get("content-encoding")).toBe("gzip");
    expect(body.blob.length).toBe(5000);
  }
  @Test.it("rate-limit (scoped): header, 429 over cap, other routes untouched") async rateLimit() {
    let last: globalThis.Response | undefined;
    for (let i = 0; i < 3; i++) {
      last = await fetch(`${this.base}/limited`);
      await last.body?.cancel();
    }
    expect(last!.headers.get("x-ratelimit-limit")).toBe("3");
    const over = await fetch(`${this.base}/limited`);
    await over.body?.cancel();
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).not.toBeNull();
    const other = await fetch(`${this.base}/hello`);
    await other.body?.cancel();
    expect(other.status).toBe(200);
  }
  @Test.it("per-route middleware runs on its prefix only") async scopedMw() {
    const adm = await fetch(`${this.base}/admin/me`);
    expect(((await adm.json()) as { role: string | null }).role).toBe("admin");
    const pl = await fetch(`${this.base}/plain`);
    expect(((await pl.json()) as { role: string | null }).role).toBeNull();
  }
  @Test.it("request logger recorded requests") async logger() {
    expect(this.#logs.length > 0 && this.#logs.some((l) => /GET \/hello 200/.test(l))).toBeTruthy();
  }
}

// A custom strategy (subclass of the abstract RateLimitStrategy): a counter that
// never resets — allows `limit` requests per key, ever. Proves pluggability.
class AllowN extends RateLimitStrategy<number> {
  readonly limit: number;
  constructor(limit: number) {
    super();
    this.limit = limit;
  }
  protected decide(count: number | undefined, now: number) {
    const c = (count ?? 0) + 1;
    const limited = c > this.limit;
    return { state: c, decision: { limited, remaining: Math.max(0, this.limit - c), resetMs: now, retryAfterMs: limited ? 1000 : 0 } };
  }
  protected dead() {
    return false;
  }
}

// ── App 3b: rate-limit strategies (fixed / sliding / exponential / token / custom) ──
class RateLimitStrategySuite extends Test({ name: "server: rate-limit strategies" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41020";
  @Test.beforeAll() async start() {
    const app = Application()
      .use("/fixed", rateLimit({ strategy: "fixed", max: 2, windowMs: 300 }))
      .use("/sliding", rateLimit({ strategy: "sliding", max: 2, windowMs: 300 }))
      .use("/exp", rateLimit({ strategy: "exponential", max: 1, windowMs: 600, maxBlockMs: 60_000 }))
      .use("/bucket", rateLimit({ strategy: "token-bucket", max: 2, windowMs: 1000 })) // cap 2, ~1 token/500ms
      .use("/custom", rateLimit({ strategy: new AllowN(1) })) // strategy instance, not a name
      .get("/fixed", () => Response.json({ ok: true }))
      .get("/sliding", () => Response.json({ ok: true }))
      .get("/exp", () => Response.json({ ok: true }))
      .get("/bucket", () => Response.json({ ok: true }))
      .get("/custom", () => Response.json({ ok: true }));
    this.#server = await listen(app, 41020);
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }
  async #hit(path: string): Promise<globalThis.Response> {
    const r = await fetch(`${this.base}${path}`);
    await r.body?.cancel();
    return r;
  }

  @Test.it("fixed: allows max, 429 over cap, recovers after the window") async fixed() {
    expect((await this.#hit("/fixed")).status).toBe(200);
    expect((await this.#hit("/fixed")).status).toBe(200);
    expect((await this.#hit("/fixed")).status).toBe(429);
    await sleep(350); // window resets
    expect((await this.#hit("/fixed")).status).toBe(200);
  }

  @Test.it("sliding: allows max, 429 over cap, recovers as the window slides") async sliding() {
    expect((await this.#hit("/sliding")).status).toBe(200);
    expect((await this.#hit("/sliding")).status).toBe(200);
    expect((await this.#hit("/sliding")).status).toBe(429);
    await sleep(350); // the two logged hits fall out of the rolling window
    expect((await this.#hit("/sliding")).status).toBe(200);
  }

  @Test.it("exponential: cooldown doubles on repeat offenses") async exponential() {
    expect((await this.#hit("/exp")).status).toBe(200); // count 1 == max
    const first = await this.#hit("/exp"); // count 2 > max → strike 1, cooldown 600ms
    expect(first.status).toBe(429);
    const retry1 = Number(first.headers.get("retry-after"));
    await sleep(900); // cooldown + window expire; window was abusive → strikes NOT forgiven
    expect((await this.#hit("/exp")).status).toBe(200); // fresh window, count 1
    const second = await this.#hit("/exp"); // count 2 > max → strike 2, cooldown 1200ms
    expect(second.status).toBe(429);
    const retry2 = Number(second.headers.get("retry-after"));
    expect(retry2 > retry1).toBeTruthy(); // exponential growth (≈600ms → ≈1200ms)
  }

  @Test.it("token-bucket: bursts to capacity, then paces to the refill rate") async tokenBucket() {
    expect((await this.#hit("/bucket")).status).toBe(200); // burst 1
    expect((await this.#hit("/bucket")).status).toBe(200); // burst 2 (capacity)
    expect((await this.#hit("/bucket")).status).toBe(429); // empty bucket
    await sleep(600); // ~1 token refills (rate ≈ 1 / 500ms)
    expect((await this.#hit("/bucket")).status).toBe(200);
  }

  @Test.it("accepts a custom RateLimitStrategy instance (pluggable)") async custom() {
    expect((await this.#hit("/custom")).status).toBe(200); // AllowN(1): first allowed
    const blocked = await this.#hit("/custom");
    expect(blocked.status).toBe(429); // never resets → always limited after
    expect(blocked.headers.get("x-ratelimit-limit")).toBe("1");
  }
}

// ── App 4: helmet + csrf ──────────────────────────────────────────────────────
class SecuritySuite extends Test({ name: "server: helmet + csrf" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41013";
  #token = "";
  @Test.beforeAll() async start() {
    const app = Application()
      .use(helmet())
      .use(csrf())
      .get("/token", () => Response.json({ ok: true }))
      .post("/submit", () => Response.json({ ok: true }));
    this.#server = await listen(app, 41013);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }
  @Test.it("helmet sets the security headers") async helmet() {
    const hs = await fetch(`${this.base}/token`);
    this.#token = /csrf=([^;]+)/.exec(hs.headers.get("set-cookie") ?? "")?.[1] ?? "";
    await hs.body?.cancel();
    expect(hs.headers.get("x-content-type-options")).toBe("nosniff");
    expect(hs.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect((hs.headers.get("content-security-policy") ?? "").includes("default-src 'self'")).toBeTruthy();
    expect(hs.headers.get("referrer-policy")).toBe("no-referrer");
    expect((hs.headers.get("strict-transport-security") ?? "").includes("includeSubDomains")).toBeTruthy();
    expect(hs.headers.get("cross-origin-opener-policy")).toBe("same-origin");
  }
  @Test.it("csrf: token issued on GET, double-submit enforced on POST") async csrf() {
    expect(this.#token.length > 0).toBeTruthy();
    const blocked = await fetch(`${this.base}/submit`, { method: "POST" });
    await blocked.body?.cancel();
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("x-content-type-options")).toBe("nosniff"); // security headers on 403
    const ok = await fetch(`${this.base}/submit`, { method: "POST", headers: { "x-csrf-token": this.#token, cookie: `csrf=${this.#token}` } });
    await ok.body?.cancel();
    expect(ok.status).toBe(200);
    const bad = await fetch(`${this.base}/submit`, { method: "POST", headers: { "x-csrf-token": "tampered", cookie: `csrf=${this.#token}` } });
    await bad.body?.cancel();
    expect(bad.status).toBe(403);
  }
}

// ── App 5: body-limit, timeout, ETag, multipart ──────────────────────────────
class LimitsSuite extends Test({ name: "server: etag / body-limit / timeout / multipart" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41014";
  @Test.beforeAll() async start() {
    const app = Application()
      .use(etag())
      .use(timeout(100))
      .use(bodyLimit("1kb"))
      .get("/data", () => Response.json({ hello: "etag" }))
      .post("/echo", (ctx) => Response.json({ bytes: (ctx.body as string)?.length ?? 0 }))
      .get("/slow", async () => {
        await sleep(300);
        return Response.json({ ok: true });
      })
      .post("/upload", (ctx) => {
        const mp = ctx.body as MultipartBody;
        return Response.json({ fields: mp.fields, files: mp.files.map((f) => ({ name: f.name, filename: f.filename, size: f.data.length })) });
      });
    this.#server = await listen(app, 41014);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }
  @Test.it("etag: header present, If-None-Match → 304") async etag() {
    const e1 = await fetch(`${this.base}/data`);
    const tag = e1.headers.get("etag") ?? "";
    await e1.body?.cancel();
    expect(/^W\/".+"$/.test(tag)).toBeTruthy();
    const e2 = await fetch(`${this.base}/data`, { headers: { "if-none-match": tag } });
    await e2.body?.cancel();
    expect(e2.status).toBe(304);
  }
  @Test.it("body-limit: under → 200, over 1kb → 413") async bodyLimit() {
    const under = await fetch(`${this.base}/echo`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x".repeat(100) });
    await under.body?.cancel();
    expect(under.status).toBe(200);
    const over = await fetch(`${this.base}/echo`, { method: "POST", headers: { "content-type": "text/plain" }, body: "x".repeat(2048) });
    await over.body?.cancel();
    expect(over.status).toBe(413);
  }
  @Test.it("timeout: slow handler → 503") async timeout() {
    const slow = await fetch(`${this.base}/slow`);
    await slow.body?.cancel();
    expect(slow.status).toBe(503);
  }
  @Test.it("multipart/form-data: fields + files parsed") async multipart() {
    const fd = new FormData();
    fd.set("title", "hello");
    fd.set("file", new Blob([Buffer.from("FILE-CONTENT")], { type: "text/plain" }), "note.txt");
    const up = await fetch(`${this.base}/upload`, { method: "POST", body: fd });
    const b = (await up.json()) as { fields: Record<string, string>; files: { filename: string; size: number }[] };
    expect(b.fields.title).toBe("hello");
    expect(b.files[0]?.filename === "note.txt" && b.files[0]?.size === 12).toBeTruthy();
  }
}

// ── App 6: stale-while-revalidate + response compilation ─────────────────────
class CacheModesSuite extends Test({ name: "server: SWR + response compilation" }) {
  #swrRuns = 0;
  #compRuns = 0;
  #server!: HTTP;
  base = "http://127.0.0.1:41015";
  @Test.beforeAll() async start() {
    const swr = createCache({ ttl: 150, staleWhileRevalidate: 2_000 });
    const compiled = createCache({ ttl: 60_000, compile: true });
    const app = Application()
      .use("/swr", swr.middleware())
      .use("/compiled", compiled.middleware())
      .get("/swr", async () => {
        this.#swrRuns++;
        await sleep(40);
        return Response.json({ runs: this.#swrRuns });
      })
      .get("/compiled", () => {
        this.#compRuns++;
        return Response.json({ runs: this.#compRuns, blob: "x".repeat(64) });
      });
    this.#server = await listen(app, 41015);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }
  @Test.it("MISS → HIT → STALE → HIT after background revalidate") async swr() {
    const s1 = await fetch(`${this.base}/swr`);
    expect(s1.headers.get("x-cache") === "MISS" && ((await s1.json()) as { runs: number }).runs === 1).toBeTruthy();
    const s2 = await fetch(`${this.base}/swr`);
    await s2.body?.cancel();
    expect(s2.headers.get("x-cache")).toBe("HIT");
    await sleep(200); // past ttl(150), within swr window
    const s3 = await fetch(`${this.base}/swr`);
    expect(s3.headers.get("x-cache") === "STALE" && ((await s3.json()) as { runs: number }).runs === 1).toBeTruthy();
    await sleep(150); // let the background refresh finish
    const s4 = await fetch(`${this.base}/swr`);
    expect(s4.headers.get("x-cache") === "HIT" && ((await s4.json()) as { runs: number }).runs === 2).toBeTruthy();
  }
  @Test.it("compiled cache: MISS→HIT, handler once, identical bytes, type kept") async compiled() {
    const c1 = await fetch(`${this.base}/compiled`);
    const c1b = await c1.text();
    const c2 = await fetch(`${this.base}/compiled`);
    const c2b = await c2.text();
    expect(c1.headers.get("x-cache")).toBe("MISS");
    expect(c2.headers.get("x-cache")).toBe("HIT");
    expect(this.#compRuns).toBe(1);
    expect(c1b).toBe(c2b);
    expect((c2.headers.get("content-type") ?? "").includes("application/json")).toBeTruthy();
  }
}

// ── App 7: HTTP QUERY (safe method with a body) ──────────────────────────────
class SearchController extends Controller("/api") {
  @Controller.query("/find", {
    body: t.object({ term: t.string() }),
    response: t.object({ term: t.string(), hits: t.number() }),
  })
  find(ctx: { body: { term: string } }) {
    return Response.json({ term: ctx.body.term, hits: ctx.body.term.length });
  }
}

class QuerySuite extends Test({ name: "server: QUERY method" }) {
  #cache = createCache({ ttl: 60_000 });
  #searchRuns = 0;
  #server!: HTTP;
  base = "http://127.0.0.1:41016";
  readonly QH = { "content-type": "application/json" };
  @Test.beforeAll() async start() {
    const app = Application(SearchController)
      .use(this.#cache.middleware())
      .query("/search", (ctx) => {
        this.#searchRuns++;
        const body = ctx.body as { q?: string } | undefined;
        return Response.json({ echo: body?.q ?? null, runs: this.#searchRuns });
      });
    this.#server = await listen(app, 41016);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }
  @Test.it("routes a QUERY request, body in ctx.body") async routes() {
    const q1 = await fetch(`${this.base}/search`, { method: "QUERY", headers: this.QH, body: JSON.stringify({ q: "neo" }) });
    const b = (await q1.json()) as { echo: string; runs: number };
    expect(q1.status === 200 && b.echo === "neo").toBeTruthy();
    expect(b.runs).toBe(1);
  }
  @Test.it("body-aware cache key: same body HIT, different body MISS") async cacheKey() {
    const q2 = await fetch(`${this.base}/search`, { method: "QUERY", headers: this.QH, body: JSON.stringify({ q: "neo" }) });
    await q2.body?.cancel();
    expect(q2.headers.get("x-cache")).toBe("HIT");
    expect(this.#searchRuns).toBe(1);
    const q3 = await fetch(`${this.base}/search`, { method: "QUERY", headers: this.QH, body: JSON.stringify({ q: "trinity" }) });
    const b3 = (await q3.json()) as { echo: string };
    expect(q3.headers.get("x-cache") === "MISS" && b3.echo === "trinity").toBeTruthy();
  }
  @Test.it("@Controller.query routes + validates the body schema") async controller() {
    const q4 = await fetch(`${this.base}/api/find`, { method: "QUERY", headers: this.QH, body: JSON.stringify({ term: "matrix" }) });
    const b4 = (await q4.json()) as { term: string; hits: number };
    expect(q4.status === 200 && b4.term === "matrix" && b4.hits === 6).toBeTruthy();
    const q5 = await fetch(`${this.base}/api/find`, { method: "QUERY", headers: this.QH, body: JSON.stringify({ term: 123 }) });
    await q5.body?.cancel();
    expect(q5.status).toBe(422);
  }
}

// ── App 8: HTTP/2 (cleartext h2c, h2 over TLS + HTTP/1.1 ALPN) + HTTP/3 guard ──
class Http2Suite extends Test({ name: "server: HTTP/2 + HTTP/3 guard" }) {
  #h2c!: HTTP;
  #h2tls?: HTTP;
  #cert = makeTestCert(); // null on machines without openssl → TLS cases assert-skip

  @Test.beforeAll() async start() {
    this.#h2c = await listen(
      Application().get("/json", () => Response.json({ ok: true, proto: "h2c" })),
      41090,
      { http2: "h2c" },
    );
    if (this.#cert) {
      this.#h2tls = await listen(
        Application().get("/json", () => Response.json({ ok: true, proto: "h2" })),
        41091,
        { http2: true, key: this.#cert.key, cert: this.#cert.cert },
      );
    }
    await sleep(150);
  }

  @Test.afterAll() async stop() {
    await this.#h2c?.close();
    await this.#h2tls?.close();
  }

  @Test.it("serves cleartext HTTP/2 (h2c)") async h2c() {
    const r = await h2get("http://127.0.0.1:41090", "/json", {});
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).proto).toBe("h2c");
  }

  @Test.it("serves HTTP/2 over TLS, ALPN negotiates h2") async h2tls() {
    if (!this.#cert) return expect(true).toBeTruthy(); // skip: no openssl
    const r = await h2get("https://localhost:41091", "/json", { rejectUnauthorized: false });
    expect(r.alpn).toBe("h2");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).proto).toBe("h2");
  }

  @Test.it("keeps HTTP/1.1 ALPN fallback on the h2 TLS port") async fallback() {
    if (!this.#cert) return expect(true).toBeTruthy(); // skip: no openssl
    const result: { ver: string; status: number } = await new Promise((resolve, reject) => {
      const rq = httpsRequest(
        { host: "localhost", port: 41091, path: "/json", rejectUnauthorized: false, ALPNProtocols: ["http/1.1"] },
        (rs) => {
          rs.on("data", () => {});
          rs.on("end", () => resolve({ ver: rs.httpVersion, status: rs.statusCode ?? 0 }));
        },
      );
      rq.on("error", reject);
      rq.end();
    });
    expect(result.ver).toBe("1.1");
    expect(result.status).toBe(200);
  }

  @Test.it("http3 throws with proxy-termination guidance (no runtime support)") h3() {
    let msg = "";
    try {
      Application().get("/", () => Response.json({})).listen(41092, { http3: true }, () => {});
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg.includes("HTTP/3")).toBeTruthy();
  }

  @Test.it("http2Guard tears down an HTTP/2 Rapid Reset flood") async rapidReset() {
    const abuse: Http2AbuseInfo[] = [];
    const guarded = await listen(
      Application()
        .use(http2Guard({ windowMs: 5000, maxResetsPerWindow: 10, onAbuse: (i) => abuse.push(i) }))
        .get("/", () => Response.json({ ok: true })),
      41093,
      { http2: "h2c" },
    );
    const client = http2Connect("http://127.0.0.1:41093");
    client.on("error", () => {}); // GOAWAY/teardown surfaces as a client error
    // One normal request first → the guard instruments this session.
    await new Promise<void>((res) => {
      const r = client.request({ ":path": "/" });
      r.on("data", () => {});
      r.on("end", () => res());
      r.on("error", () => res());
      r.end();
    });
    // Flood: open a stream then immediately RST_STREAM(CANCEL=8). Past the
    // threshold the guard destroys the session, so request() starts throwing.
    for (let i = 0; i < 40 && abuse.length === 0; i++) {
      try {
        const r = client.request({ ":path": "/" });
        r.on("error", () => {});
        r.close(8);
      } catch {
        break; // session destroyed → no more streams
      }
      await sleep(5);
    }
    await sleep(100);
    try { client.destroy(); } catch { /* already gone */ }
    await guarded.close();
    expect(abuse.length).toBe(1);
    expect(abuse[0].reason).toBe("rapid-reset");
  }
}

// ── Interceptors (controller/handler-scoped, around + transform) ──────────────
const order: string[] = [];
const tag = (name: string): Interceptor => async (_ctx, next) => {
  order.push(`${name}:before`);
  const r = await next();
  order.push(`${name}:after`);
  return r;
};
const envelope: Interceptor = async (_ctx, next) => ({ data: await next() }); // transform result

class WidgetController extends Controller("/widgets", { interceptors: [tag("class")] }) {
  @Controller.get("/")
  @Controller.intercept(tag("method"), envelope)
  list() {
    order.push("handler");
    return { items: [1, 2] };
  }

  @Controller.get("/guarded")
  @Controller.guard(() => false) // rejects before any interceptor runs
  @Controller.intercept(tag("g-int"))
  secret() {
    order.push("secret-handler");
    return { secret: true };
  }

  @Controller.get("/short")
  @Controller.intercept(async () => Response.json({ shorted: true }, { status: 202 })) // no next()
  never() {
    order.push("never");
    return { reached: true };
  }
}

class InterceptorSuite extends Test({ name: "server: interceptors" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41017";
  @Test.beforeAll() async start() {
    this.#server = await listen(Application(WidgetController), 41017);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }
  @Test.it("wraps the handler, transforms the result, class outermost → method inner") async wrap() {
    order.length = 0;
    const r = await fetch(`${this.base}/widgets`);
    const body = (await r.json()) as { data: { items: number[] } };
    expect(body.data.items).toEqual([1, 2]); // envelope transformed the result
    expect(order.join(",")).toBe("class:before,method:before,handler,method:after,class:after");
  }
  @Test.it("guards run BEFORE interceptors (rejection skips them + the handler)") async guardsFirst() {
    order.length = 0;
    const r = await fetch(`${this.base}/widgets/guarded`);
    await r.body?.cancel();
    expect(r.status).toBe(403);
    expect(order.length).toBe(0); // neither g-int nor secret-handler ran
  }
  @Test.it("an interceptor that doesn't call next() short-circuits the handler") async shortCircuit() {
    order.length = 0;
    const r = await fetch(`${this.base}/widgets/short`);
    const body = (await r.json()) as { shorted: boolean };
    expect(r.status).toBe(202);
    expect(body.shorted).toBe(true);
    expect(order.includes("never")).toBe(false); // handler skipped
  }
}

// ── File: Cache-Control ───────────────────────────────────────────────────────
const cssFile = join(tmpdir(), "youneed-file-cc.css");
writeFileSync(cssFile, ".a{color:red}");

class FileSuite extends Test({ name: "server: File Cache-Control" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41018";
  @Test.beforeAll() async start() {
    const app = Application()
      .get("/struct", () => File(cssFile, { cacheControl: { public: true, maxAge: 3600, immutable: true } }))
      .get("/raw", () => File(cssFile, { cacheControl: "no-store" }))
      .get("/none", () => File(cssFile))
      .get("/const", File(cssFile)) // bare descriptor → CONSTANT route (reused per request)
      .get("/override", () => File(cssFile, { cacheControl: { maxAge: 1 }, headers: { "Cache-Control": "private, max-age=99" } }))
      // client-cache invalidation: tell the browser to purge cached data
      .get("/logout", () => Response.json({ ok: true }, { headers: { "Clear-Site-Data": clearSiteData("cache", "cookies") } }));
    this.#server = await listen(app, 41018);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
    rmSync(cssFile, { force: true });
  }

  @Test.it("serializes structured directives + keeps Content-Type by extension") async structured() {
    const r = await fetch(`${this.base}/struct`);
    expect(await r.text()).toBe(".a{color:red}");
    expect(r.headers.get("cache-control")).toBe("public, immutable, max-age=3600");
    expect((r.headers.get("content-type") ?? "").includes("text/css")).toBeTruthy();
  }
  @Test.it("accepts a raw Cache-Control string") async raw() {
    const r = await fetch(`${this.base}/raw`);
    await r.body?.cancel();
    expect(r.headers.get("cache-control")).toBe("no-store");
  }
  @Test.it("no cacheControl → no Cache-Control header") async none() {
    const r = await fetch(`${this.base}/none`);
    await r.body?.cancel();
    expect(r.headers.get("cache-control")).toBeNull();
  }
  @Test.it("a bare File() constant route re-opens the stream on every request") async constStream() {
    // Regression: File() baked a single createReadStream into the descriptor, so a
    // constant route streamed the file once and then served 0 bytes forever after.
    const a = await fetch(`${this.base}/const`);
    expect(await a.text()).toBe(".a{color:red}");
    const b = await fetch(`${this.base}/const`);
    expect(await b.text()).toBe(".a{color:red}");
    expect((b.headers.get("content-type") ?? "").includes("text/css")).toBeTruthy();
  }
  @Test.it("explicit headers['Cache-Control'] wins over cacheControl") async override() {
    const r = await fetch(`${this.base}/override`);
    await r.body?.cancel();
    expect(r.headers.get("cache-control")).toBe("private, max-age=99");
  }
  @Test.it("cacheControl() serializer: directive order + numbers") async serializer() {
    const v = cacheControl({ private: true, noCache: true, maxAge: 60, staleWhileRevalidate: 30 });
    expect(v).toBe("private, no-cache, max-age=60, stale-while-revalidate=30");
  }
  @Test.it("clearSiteData() emits quoted directives (client-cache invalidation)") async clearSite() {
    expect(clearSiteData("cache", "cookies")).toBe('"cache", "cookies"');
    expect(clearSiteData()).toBe('"*"'); // no args → clear everything
    const r = await fetch(`${this.base}/logout`);
    await r.body?.cancel();
    expect(r.headers.get("clear-site-data")).toBe('"cache", "cookies"');
  }
}

// ── graceful shutdown (drain) ─────────────────────────────────────────────────
class GracefulSuite extends Test({ name: "server: graceful shutdown" }) {
  @Test.it("drain() runs onShutdown, finishes in-flight, then closes") async drains() {
    let inflightDone = false;
    let onShutdownRan = false;
    const app = Application().get("/slow", async () => {
      await sleep(60);
      inflightDone = true;
      return Response.json({ ok: true });
    });
    const server = await listen(app, 41019);
    // start an in-flight request, then drain mid-flight
    const pending = fetch("http://127.0.0.1:41019/slow").then((r) => r.json());
    await sleep(15);
    await server.drain({ timeout: 2000, onShutdown: () => { onShutdownRan = true; } });
    const body = (await pending) as { ok: boolean };
    expect(onShutdownRan).toBe(true);
    expect(inflightDone).toBe(true); // in-flight request was allowed to finish
    expect(body.ok).toBe(true);
    // server no longer accepts connections
    let refused = false;
    await fetch("http://127.0.0.1:41019/slow").catch(() => { refused = true; });
    expect(refused).toBe(true);
  }
}

// Distributed (KV-backed) response cache: shared store, compiled-byte replay,
// SWR, coalescing, and async invalidate/clear/size via scan.
const dhits = { c: 0, slow: 0, swr: 0 };
class DistributedCacheSuite extends Test({ name: "server: distributed cache" }) {
  kv = new MemoryKV({ sweepMs: 0 });
  cache = createDistributedCache({ store: this.kv, ttl: 30_000 });
  swrCache = createDistributedCache({ store: this.kv, ttl: 120, staleWhileRevalidate: 1000, prefix: "swr:" });
  server!: HTTP;
  swrServer!: HTTP;
  base = "http://127.0.0.1:41030";
  swrBase = "http://127.0.0.1:41031";

  @Test.beforeAll() async boot() {
    const app = Application()
      .use(this.cache.middleware())
      .get("/c", () => Response.json({ n: ++dhits.c }))
      .get("/slow", async () => {
        await sleep(50);
        return Response.json({ n: ++dhits.slow });
      });
    this.server = await listen(app, 41030);
    const swrApp = Application()
      .use(this.swrCache.middleware())
      .get("/s", () => Response.json({ n: ++dhits.swr }));
    this.swrServer = await listen(swrApp, 41031);
  }
  @Test.afterAll() async stop() {
    await this.server?.close();
    await this.swrServer?.close();
  }

  @Test.it("MISS then HIT replays compiled bytes without re-running the handler") async hit() {
    const r1 = await fetch(`${this.base}/c`);
    expect(r1.headers.get("x-cache")).toBe("MISS");
    const b1 = (await r1.json()) as { n: number };
    const ran = dhits.c;
    const r2 = await fetch(`${this.base}/c`);
    expect(r2.headers.get("x-cache")).toBe("HIT");
    const b2 = (await r2.json()) as { n: number };
    expect(b2.n).toBe(b1.n); // same cached bytes
    expect(dhits.c).toBe(ran); // handler did not re-run
  }

  @Test.it("invalidate(string) drops the exact key → next is a MISS") async invStr() {
    await fetch(`${this.base}/c`); // ensure cached
    const before = dhits.c;
    expect(await this.cache.invalidate("GET /c")).toBe(1);
    const r = await fetch(`${this.base}/c`);
    expect(r.headers.get("x-cache")).toBe("MISS");
    expect(dhits.c).toBe(before + 1); // recomputed
  }

  @Test.it("invalidate(RegExp) scans the prefix and drops matches") async invRe() {
    await fetch(`${this.base}/c`); // cache it
    const n = await this.cache.invalidate(/\/c$/);
    expect(n).toBeGreaterThan(0);
    expect((await fetch(`${this.base}/c`)).headers.get("x-cache")).toBe("MISS");
  }

  @Test.it("coalesces concurrent misses onto one handler run") async coalesce() {
    const before = dhits.slow;
    const rs = await Promise.all(Array.from({ length: 5 }, () => fetch(`${this.base}/slow`)));
    const tags = rs.map((r) => r.headers.get("x-cache"));
    const bodies = (await Promise.all(rs.map((r) => r.json()))) as { n: number }[];
    expect(dhits.slow).toBe(before + 1); // handler ran exactly once
    expect(bodies.every((b) => b.n === bodies[0].n)).toBe(true);
    expect(tags.filter((t) => t === "COALESCED").length).toBeGreaterThan(0);
  }

  @Test.it("stale-while-revalidate serves stale, then refreshes in the background") async swr() {
    const r1 = await fetch(`${this.swrBase}/s`);
    expect(r1.headers.get("x-cache")).toBe("MISS");
    const n1 = ((await r1.json()) as { n: number }).n;
    await sleep(150); // past ttl(120), inside swr window
    const r2 = await fetch(`${this.swrBase}/s`);
    expect(r2.headers.get("x-cache")).toBe("STALE");
    expect(((await r2.json()) as { n: number }).n).toBe(n1); // stale copy
    await sleep(40); // background revalidation lands
    const r3 = await fetch(`${this.swrBase}/s`);
    expect(r3.headers.get("x-cache")).toBe("HIT");
    expect(((await r3.json()) as { n: number }).n).toBe(n1 + 1); // refreshed
  }

  @Test.it("size() and clear() operate over the prefix via scan") async sizeClear() {
    await fetch(`${this.base}/c`); // ensure at least one entry under "cache:"
    expect(await this.cache.size()).toBeGreaterThan(0);
    await this.cache.clear();
    expect(await this.cache.size()).toBe(0);
  }
}

// ctx.meta — self-describing guards/interceptors that also feed the OpenAPI doc.
const requireAuth = (ctx: Context): boolean => {
  ctx.meta = { name: "require auth", description: "Bearer token in the Authorization header" };
  ctx.meta.done(); // declaration complete — stops here while documenting, no-op on a real request
  if (!ctx.request.headers["authorization"]) throw new HttpError(401, { error: "Unauthorized" });
  return true;
};

let ioRuns = 0;
const trackedGuard = (ctx: Context): boolean => {
  ctx.meta = { name: "tracked", description: "guard with post-done() work" };
  ctx.meta.done();
  ioRuns++; // "I/O" after the declaration — must be skipped while documenting
  return true;
};

class AccountController extends Controller("/account") {
  @Controller.get("/me")
  @Controller.guard(requireAuth)
  me(ctx: Context) {
    return Response.json({ user: "ada", meta: ctx.meta });
  }

  @Controller.get("/tracked")
  @Controller.guard(trackedGuard)
  tracked() {
    return Response.json({ ok: true });
  }
}

class MetaSuite extends Test({ name: "server: ctx.meta" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41040";
  @Test.beforeAll() async start() {
    const app = Application(AccountController)
      .get("/ping", (ctx) => {
        ctx.meta.name = "ping"; // pre-initialized to {} → mutation works
        return Response.json({ name: ctx.meta.name });
      })
      .openapi({ path: "/openapi.json", title: "Meta API", version: "2.0" });
    this.#server = await listen(app, 41040);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }

  @Test.it("ctx.meta is pre-initialized and mutable in a handler") async basic() {
    const r = await fetch(`${this.base}/ping`);
    expect(((await r.json()) as { name: string }).name).toBe("ping");
  }

  @Test.it("a guard runs normally on a real request (401 without auth)") async guardRejects() {
    const r = await fetch(`${this.base}/account/me`);
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("guard passes with auth, and its ctx.meta is visible to the handler") async guardPasses() {
    const r = await fetch(`${this.base}/account/me`, { headers: { authorization: "Bearer x" } });
    const body = (await r.json()) as { user: string; meta: { name: string } };
    expect(r.status).toBe(200);
    expect(body.user).toBe("ada");
    expect(body.meta.name).toBe("require auth");
  }

  @Test.it("the OpenAPI doc harvests guard meta via the describing pass") async openapi() {
    const doc = (await (await fetch(`${this.base}/openapi.json`)).json()) as {
      paths: Record<string, Record<string, { description?: string; "x-guards"?: { name?: string; description?: string }[] }>>;
    };
    const op = doc.paths["/account/me"].get;
    expect(op["x-guards"]![0].name).toBe("require auth");
    expect(op.description!.includes("Bearer token")).toBe(true);
  }

  @Test.it("ctx.meta.done() halts the annotator while documenting, not on a real request") async doneHalts() {
    await (await fetch(`${this.base}/openapi.json`)).body?.cancel(); // triggers the describing pass (once)
    expect(ioRuns).toBe(0); // post-done() work was skipped during harvest
    await (await fetch(`${this.base}/account/tracked`)).body?.cancel();
    expect(ioRuns).toBe(1); // a real request ran it
  }
}

// Server plugin system — lifecycle hooks instead of wrapping the server.
class PluginSuite extends Test({ name: "server: plugins" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41050";
  events: string[] = [];
  @Test.beforeAll() async start() {
    const events = this.events;
    const p: ServerPlugin = {
      name: "demo",
      setup(app) {
        events.push("setup");
        app.get("/_plugin", () => Response.json({ ok: true }));
      },
      onListen() {
        events.push("listen");
      },
      onShutdown() {
        events.push("shutdown");
      },
    };
    this.#server = await listen(Application().plugin(p), 41050);
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("setup runs at registration and can add routes") async setupAddsRoutes() {
    expect(this.events.includes("setup")).toBe(true);
    const r = await fetch(`${this.base}/_plugin`);
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
  }

  @Test.it("onListen runs once the server is bound") async onListenRuns() {
    expect(this.events.includes("listen")).toBe(true);
  }

  @Test.it("onShutdown hooks run on drain, LIFO") async shutdownLifo() {
    const ev: string[] = [];
    const a: ServerPlugin = { name: "a", onShutdown: () => void ev.push("a") };
    const b: ServerPlugin = { name: "b", onShutdown: () => void ev.push("b") };
    const h = await listen(Application().plugin(a, b), 41051);
    await h.drain();
    expect(ev).toEqual(["b", "a"]); // reverse registration order
  }

  @Test.it("topology() exposes mounted plugins with their inspect() info") async pluginsInTopology() {
    const p: ServerPlugin = { name: "infra-demo", inspect: () => ({ kind: "demo", count: 3 }) };
    const top = Application().plugin(p).topology();
    const found = top.plugins.find((x) => x.name === "infra-demo");
    expect(found).toBeDefined();
    expect((found!.info as { count: number }).count).toBe(3);
  }

  @Test.it("beforeListen returning false takes over the bind (no socket)") async takeover() {
    let drained = false;
    const taker: ServerPlugin = {
      name: "taker",
      beforeListen: () => false, // primary-style takeover
      onShutdown: () => void (drained = true),
    };
    let stub!: HTTP;
    const h = Application().plugin(taker).get("/never", () => Response.json({})).listen(41052, (s) => {
      stub = s;
    });
    expect(h).toBe(stub); // callback fired synchronously with the non-listening stub
    let refused = false;
    await fetch("http://127.0.0.1:41052/never").catch(() => void (refused = true));
    expect(refused).toBe(true); // nothing bound the port
    await h.drain();
    expect(drained).toBe(true); // drain still runs plugin onShutdown
  }
}

// guardWithDocumentation / withDocumentation — wrap a guard with OpenAPI docs.
const authGuard = guardWithDocumentation(
  (ctx) => {
    if (!ctx.request.headers["authorization"]) throw new HttpError(401, { error: "Unauthorized" });
    return true;
  },
  { name: "auth", description: "Bearer token required" },
);
let ownsRuns = 0;
const ownsRecord = (_ctx: Context): boolean => {
  ownsRuns++;
  return true;
};

class ThingController extends Controller("/things") {
  @Controller.get("/")
  @Controller.guard(authGuard)
  list() {
    return Response.json({ ok: true });
  }

  @Controller.get("/:id", { params: t.object({ id: t.string() }) })
  @Controller.guard(withDocumentation(ownsRecord, { name: "owner", description: "must own the record" }))
  one(ctx: Context) {
    return Response.json({ id: (ctx.params as { id: string }).id });
  }
}

class DocGuardSuite extends Test({ name: "server: guardWithDocumentation" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41053";
  @Test.beforeAll() async start() {
    this.#server = await listen(Application(ThingController).openapi({ path: "/openapi.json" }), 41053);
  }
  @Test.afterAll() async stop() {
    await this.#server[Symbol.asyncDispose]();
  }

  @Test.it("the wrapped guard still runs its logic on a real request") async runtime() {
    const denied = await fetch(`${this.base}/things`);
    await denied.body?.cancel();
    expect(denied.status).toBe(401);
    const ok = await fetch(`${this.base}/things`, { headers: { authorization: "Bearer x" } });
    await ok.body?.cancel();
    expect(ok.status).toBe(200);
  }

  @Test.it("harvests the doc into OpenAPI without running the wrapped guard") async harvested() {
    const doc = (await (await fetch(`${this.base}/openapi.json`)).json()) as {
      paths: Record<string, Record<string, { description?: string; "x-guards"?: { name?: string; description?: string }[] }>>;
    };
    expect(doc.paths["/things"].get["x-guards"]![0].name).toBe("auth");
    const byId = doc.paths["/things/{id}"].get;
    expect(byId["x-guards"]![0].name).toBe("owner");
    expect(byId.description!.includes("own the record")).toBe(true);
    expect(ownsRuns).toBe(0); // documenting halted at ctx.meta.done(), before ownsRecord ran
  }

  @Test.it("the inline-wrapped guard runs on a real request") async inlineRuntime() {
    const r = await fetch(`${this.base}/things/42`);
    expect((await r.json() as { id: string }).id).toBe("42");
    expect(ownsRuns).toBe(1); // now it actually ran
  }

  @Test.it("doc is optional — omitting it returns the guard unchanged") async optionalDoc() {
    const g = (_ctx: Context): boolean => true;
    expect(guardWithDocumentation(g)).toBe(g);
  }
}

// AppBuilder.tryGuards — run a route's guards against synthetic input (devtools).
const gateA = guardWithDocumentation(
  (ctx) => {
    if (!ctx.request.headers["x-key"]) throw new HttpError(401, { error: "no key" });
    return true;
  },
  { name: "apiKey", description: "x-key header required" },
);
const gateB = (_ctx: Context): boolean => true;

class GateController extends Controller("/gate") {
  @Controller.get("/")
  @Controller.guard(gateA, gateB)
  open() {
    return Response.json({ ok: true });
  }
}
const gateApp = Application(GateController); // mounted ONCE (re-mounting would duplicate guards)

class TryGuardsSuite extends Test({ name: "server: tryGuards" }) {
  @Test.it("denies and skips the rest when the first guard rejects") async denied() {
    const t = await gateApp.tryGuards("GET", "/gate");
    expect(t[0].name).toBe("apiKey");
    expect(t[0].outcome).toBe("denied");
    expect(t[0].status).toBe(401);
    expect(t[1].outcome).toBe("skipped"); // gateB never reached
  }
  @Test.it("passes every guard with valid synthetic input") async passed() {
    const t = await gateApp.tryGuards("GET", "/gate", { headers: { "x-key": "secret" } });
    expect(t[0].outcome).toBe("passed");
    expect(t[1].outcome).toBe("passed");
  }
  @Test.it("reports an error for an unknown route") async unknown() {
    const t = await gateApp.tryGuards("GET", "/nope");
    expect(t[0].outcome).toBe("error");
  }
}

await TestApplication()
  .addTests(CacheSuite, BearerSuite, MiddlewareSuite, RateLimitStrategySuite, SecuritySuite, LimitsSuite, CacheModesSuite, QuerySuite, Http2Suite, InterceptorSuite, FileSuite, GracefulSuite, DistributedCacheSuite, MetaSuite, PluginSuite, DocGuardSuite, TryGuardsSuite)
  .reporter(new ConsoleReporter())
  .run();
