// Run: pnpm --filter @youneed/server-middleware-rate-limit test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Controller, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { rateLimit, rateLimitProvider, RateLimitStrategy, fixedWindow, slidingWindow, tokenBucket, leakyBucket, exponentialBackoff, kvFixedWindow, type RateLimitApi } from "../src/index.ts";
// Deep-import entries (@youneed/server-middleware-rate-limit/strategies/*.js)
import { fixedWindow as fixedWindowDeep } from "../src/strategies/fixedWindow.ts";
import { leakyBucket as leakyBucketDeep } from "../src/strategies/leakyBucket.ts";
import { MemoryKV } from "@youneed/kv";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

class RateLimitStrategySuite extends Test({ name: "server-middleware-rate-limit" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41202";
  @Test.beforeAll() async start() {
    const app = Application()
      .use("/fixed", rateLimit({ strategy: "fixed", max: 2, windowMs: 300 })) // name shorthand
      .use("/sliding", rateLimit({ strategy: slidingWindow({ max: 2, windowMs: 300 }) }))
      .use("/exp", rateLimit({ strategy: exponentialBackoff({ max: 1, windowMs: 600, maxBlockMs: 60_000 }) }))
      .use("/bucket", rateLimit({ strategy: tokenBucket({ capacity: 2, refillPerSec: 2 }) })) // ~1 token/500ms
      .use("/leaky", rateLimit({ strategy: leakyBucket({ capacity: 2, leakPerSec: 2 }) })) // ~1 slot/500ms
      .use("/custom", rateLimit({ strategy: new AllowN(1) })) // strategy instance, not a name/factory
      .get("/fixed", () => Response.json({ ok: true }))
      .get("/sliding", () => Response.json({ ok: true }))
      .get("/exp", () => Response.json({ ok: true }))
      .get("/bucket", () => Response.json({ ok: true }))
      .get("/leaky", () => Response.json({ ok: true }))
      .get("/custom", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41202, () => resolve(h));
    });
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

  @Test.it("leaky-bucket: bursts to capacity, then a slot frees as the bucket drains") async leakyBucket() {
    expect((await this.#hit("/leaky")).status).toBe(200); // pour 1
    expect((await this.#hit("/leaky")).status).toBe(200); // pour 2 (capacity)
    const spilled = await this.#hit("/leaky"); // overflow → spill
    expect(spilled.status).toBe(429);
    expect(Number(spilled.headers.get("retry-after")) >= 1).toBe(true);
    await sleep(600); // ~1 unit drains (rate ≈ 1 / 500ms) → a slot frees
    expect((await this.#hit("/leaky")).status).toBe(200);
  }

  @Test.it("accepts a custom RateLimitStrategy instance (pluggable)") async custom() {
    expect((await this.#hit("/custom")).status).toBe(200); // AllowN(1): first allowed
    const blocked = await this.#hit("/custom");
    expect(blocked.status).toBe(429); // never resets → always limited after
    expect(blocked.headers.get("x-ratelimit-limit")).toBe("1");
  }

  @Test.it("deep imports (strategies/*.js) resolve to working limiters") async deepImports() {
    expect(fixedWindowDeep({ max: 1 }).limit).toBe(1);
    // capacity 1 → no burst tolerance; the very next hit inside the interval spills
    const lb = leakyBucketDeep({ capacity: 1, leakPerSec: 100 }); // one slot per 10ms
    expect((await lb.check("k", 1000)).limited).toBe(false);
    expect((await lb.check("k", 1001)).limited).toBe(true);
    expect((await lb.check("k", 1015)).limited).toBe(false); // interval drained
  }
}

// ── KvFixedWindow: a distributed limiter sharing a single KV ───────────────────
// Two `rateLimit()` middlewares each wrap their OWN KvFixedWindow, but both
// limiters point at the SAME MemoryKV — simulating two app nodes behind a load
// balancer talking to one shared store. The counter must be shared, so the limit
// holds ACROSS nodes (not per-process).
class KvFixedWindowSuite extends Test({ name: "rate-limit/kv-fixed-window" }) {
  #server!: HTTP;
  #kv!: MemoryKV;
  base = "http://127.0.0.1:41203";
  @Test.beforeAll() async start() {
    // One shared store, two limiters (= two nodes) pointing at it.
    this.#kv = new MemoryKV({ sweepMs: 0 });
    const nodeA = rateLimit({ strategy: kvFixedWindow(this.#kv, { max: 2, windowMs: 60_000, prefix: "rl:test:" }) });
    const nodeB = rateLimit({ strategy: kvFixedWindow(this.#kv, { max: 2, windowMs: 60_000, prefix: "rl:test:" }) });
    // A standalone window for the basic single-node 200/429 assertions.
    const solo = rateLimit({ strategy: kvFixedWindow(this.#kv, { max: 2, windowMs: 60_000, prefix: "rl:solo:" }) });
    const app = Application()
      .use("/a", nodeA)
      .use("/b", nodeB)
      .use("/solo", solo)
      .get("/a", () => Response.json({ ok: true }))
      .get("/b", () => Response.json({ ok: true }))
      .get("/solo", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41203, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
    await this.#kv.close();
  }
  async #hit(path: string): Promise<globalThis.Response> {
    const r = await fetch(`${this.base}${path}`);
    await r.body?.cancel();
    return r;
  }

  @Test.it("under the limit → 200 with X-RateLimit-* headers; over max → 429 + Retry-After") async basic() {
    const r1 = await this.#hit("/solo");
    expect(r1.status).toBe(200);
    expect(r1.headers.get("x-ratelimit-limit")).toBe("2");
    expect(r1.headers.get("x-ratelimit-remaining")).toBe("1");
    expect(r1.headers.get("x-ratelimit-reset")).toBeTruthy();
    expect((await this.#hit("/solo")).status).toBe(200); // 2nd == max
    const over = await this.#hit("/solo"); // 3rd > max
    expect(over.status).toBe(429);
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
  }

  @Test.it("distributed: counter shared across two nodes → 3rd request (any node) is 429") async distributed() {
    // max = 2 over the shared store. Mix the two "nodes": A, then B, then A.
    expect((await this.#hit("/a")).status).toBe(200); // shared count → 1
    expect((await this.#hit("/b")).status).toBe(200); // shared count → 2 (== max), DIFFERENT node
    expect((await this.#hit("/a")).status).toBe(429); // shared count → 3 (> max), tripped across nodes
    expect((await this.#hit("/b")).status).toBe(429); // still over on the other node too
  }
}

// ── rateLimitProvider: the controller drives the limiter itself ───────────────
class LimitedController extends Controller("/limited", {
  providers: [rateLimitProvider({ strategy: fixedWindow({ max: 2, windowMs: 300 }) })],
}) {
  @Controller.get() async enforced() {
    await this.rateLimit.enforce(); // 429 + Retry-After when over — like the middleware
    return Response.json({ ok: true });
  }
  @Controller.get("/peek") async peek() {
    const d = await this.rateLimit.check(); // verdict only — the handler decides
    return Response.json({ limited: d.limited, remaining: d.remaining });
  }
}

class RateLimitProviderSuite extends Test({ name: "rate-limit/provider" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41204";
  @Test.beforeAll() async start() {
    const app = Application(LimitedController);
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41204, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }
  async #hit(path: string): Promise<globalThis.Response> {
    const r = await fetch(`${this.base}${path}`);
    await r.body?.cancel();
    return r;
  }

  @Test.it("enforce(): controller bounces over-limit requests with 429 + headers") async enforce() {
    expect((await this.#hit("/limited")).status).toBe(200);
    const second = await this.#hit("/limited");
    expect(second.status).toBe(200);
    expect(second.headers.get("x-ratelimit-limit")).toBe("2");
    const over = await this.#hit("/limited");
    expect(over.status).toBe(429); // the controller rejected it, no middleware involved
    expect(Number(over.headers.get("retry-after"))).toBeGreaterThan(0);
    await sleep(350); // window resets
    expect((await this.#hit("/limited")).status).toBe(200);
  }

  @Test.it("check(): verdict without rejection — remaining counts down") async check() {
    await sleep(350); // fresh window (the strategy is shared with the enforce suite)
    const peek = async () => {
      const r = await fetch(`${this.base}/limited/peek`);
      return { status: r.status, body: (await r.json()) as { limited: boolean; remaining: number } };
    };
    const r1 = await peek();
    expect(r1.status).toBe(200);
    expect(r1.body.remaining).toBe(1);
    const r2 = await peek();
    expect(r2.body.limited).toBe(false);
    const r3 = await peek();
    expect(r3.body.limited).toBe(true); // verdict, still 200
    expect(r3.status).toBe(200);
    await sleep(350);
  }

  @Test.it("outside a request the api still checks against the store (global key)") async outsideRequest() {
    const host: Record<string, unknown> = {};
    rateLimitProvider({ strategy: fixedWindow({ max: 1, windowMs: 300 }) }).install(host);
    const api = host.rateLimit as RateLimitApi;
    expect(api.limit).toBe(1);
    expect((await api.check()).limited).toBe(false);
    expect((await api.check()).limited).toBe(true);
  }
}

await TestApplication().addTests(RateLimitStrategySuite, KvFixedWindowSuite, RateLimitProviderSuite).reporter(new ConsoleReporter()).run();
