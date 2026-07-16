import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createClient, CircuitBreaker, CircuitOpenError, TimeoutError } from "../src/index.ts";

/** A fake fetch whose responses/errors are scripted per call. */
function scriptedFetch(steps: Array<{ status?: number; headers?: Record<string, string>; throw?: unknown }>) {
  let i = 0;
  const fn = (async (_input: any, _init: any) => {
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    if (step.throw !== undefined) throw step.throw;
    return new Response("ok", { status: step.status ?? 200, headers: step.headers });
  }) as unknown as typeof fetch;
  return { fn, get calls() { return i; } };
}

class RetrySuite extends Test({ name: "http-client: retry" }) {
  @Test.it("retries a flaky fetch (fail, fail, succeed) and returns 200 after 3 calls")
  async flaky() {
    const f = scriptedFetch([{ throw: new Error("ECONNRESET") }, { throw: new Error("ECONNRESET") }, { status: 200 }]);
    const client = createClient({ retries: 3, fetch: f.fn, sleep: async () => {} });
    const res = await client.get("https://api.test/x");
    expect(res.status).toBe(200);
    expect(f.calls).toBe(3);
  }

  @Test.it("retries a 503 (status-based) for an idempotent GET")
  async retry503() {
    const f = scriptedFetch([{ status: 503 }, { status: 200 }]);
    const client = createClient({ retries: 2, fetch: f.fn, sleep: async () => {} });
    const res = await client.get("https://api.test/x");
    expect(res.status).toBe(200);
    expect(f.calls).toBe(2);
  }

  @Test.it("does NOT retry a non-idempotent POST by default (one call)")
  async noPostRetry() {
    const f = scriptedFetch([{ status: 503 }, { status: 200 }]);
    const client = createClient({ retries: 2, fetch: f.fn, sleep: async () => {} });
    const res = await client.post("https://api.test/x");
    expect(res.status).toBe(503);
    expect(f.calls).toBe(1);
  }

  @Test.it("retries a POST when retryNonIdempotent is set")
  async postRetryOptIn() {
    const f = scriptedFetch([{ status: 503 }, { status: 200 }]);
    const client = createClient({ retries: 2, retryNonIdempotent: true, fetch: f.fn, sleep: async () => {} });
    const res = await client.post("https://api.test/x");
    expect(res.status).toBe(200);
    expect(f.calls).toBe(2);
  }

  @Test.it("honors Retry-After: 2 → waits ~2000ms (captured from injected sleep)")
  async retryAfter() {
    const f = scriptedFetch([{ status: 429, headers: { "retry-after": "2" } }, { status: 200 }]);
    const delays: number[] = [];
    const client = createClient({
      retries: 2,
      fetch: f.fn,
      random: () => 0, // zero jitter so Retry-After wins deterministically
      sleep: async (ms) => {
        delays.push(ms);
      },
    });
    const res = await client.get("https://api.test/x");
    expect(res.status).toBe(200);
    expect(delays.length).toBe(1);
    expect(delays[0]).toBe(2000);
  }
}

class TimeoutSuite extends Test({ name: "http-client: timeout" }) {
  @Test.it("rejects with TimeoutError when fetch never resolves")
  async timesOut() {
    // Fake fetch that only resolves/rejects when its signal aborts.
    const hangingFetch = ((_input: any, init: any) =>
      new Promise<Response>((_resolve, reject) => {
        const signal: AbortSignal = init.signal;
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })) as unknown as typeof fetch;

    const client = createClient({ timeout: 10, retries: 0, fetch: hangingFetch });
    let caught: unknown;
    try {
      await client.get("https://api.test/slow");
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof TimeoutError).toBe(true);
  }
}

class BreakerSuite extends Test({ name: "http-client: circuit breaker" }) {
  @Test.it("opens after failureThreshold and then fails fast without calling fetch")
  async opensAndFailsFast() {
    let clock = 1_000;
    const f = scriptedFetch([{ throw: new Error("down") }]);
    const client = createClient({
      retries: 0,
      failureThreshold: 2,
      resetTimeout: 5_000,
      fetch: f.fn,
      now: () => clock,
      sleep: async () => {},
    });

    // Two real failures trip the breaker.
    for (let n = 0; n < 2; n++) {
      let err: unknown;
      try {
        await client.get("https://api.test/x");
      } catch (e) {
        err = e;
      }
      expect(err instanceof Error).toBe(true);
    }
    expect(client.breaker.state).toBe("open");
    const afterTrip = f.calls;

    // Next call fails fast — fetch is NOT invoked again.
    let fastErr: unknown;
    try {
      await client.get("https://api.test/x");
    } catch (e) {
      fastErr = e;
    }
    expect(fastErr instanceof CircuitOpenError).toBe(true);
    expect(f.calls).toBe(afterTrip);

    // Advance past resetTimeout → half-open, and let the next call succeed → closed.
    clock += 6_000;
    expect(client.breaker.state).toBe("half-open");
    // Swap the fake to succeed now.
    const ok = scriptedFetch([{ status: 200 }]);
    const client2 = createClient({
      retries: 0,
      failureThreshold: 2,
      resetTimeout: 5_000,
      fetch: ok.fn,
      now: () => clock,
      sleep: async () => {},
    });
    const res = await client2.get("https://api.test/x");
    expect(res.status).toBe(200);
  }

  @Test.it("standalone CircuitBreaker.exec: trips, fails fast, half-open recovery")
  async standalone() {
    let clock = 0;
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 1_000, now: () => clock });
    expect(cb.state).toBe("closed");

    const fail = async () => {
      throw new Error("boom");
    };
    for (let n = 0; n < 2; n++) {
      try {
        await cb.exec(fail);
      } catch {
        /* expected */
      }
    }
    expect(cb.state).toBe("open");

    // Fails fast without calling fn.
    let called = false;
    let caught: unknown;
    try {
      await cb.exec(async () => {
        called = true;
        return 1;
      });
    } catch (e) {
      caught = e;
    }
    expect(caught instanceof CircuitOpenError).toBe(true);
    expect(called).toBe(false);

    // Cooldown elapses → half-open; a success closes it.
    clock += 1_000;
    expect(cb.state).toBe("half-open");
    const v = await cb.exec(async () => 42);
    expect(v).toBe(42);
    expect(cb.state).toBe("closed");
  }

  @Test.it("a failed half-open trial re-opens the breaker")
  async halfOpenReopen() {
    let clock = 0;
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeout: 1_000, now: () => clock });
    try {
      await cb.exec(async () => {
        throw new Error("x");
      });
    } catch {
      /* expected */
    }
    expect(cb.state).toBe("open");
    clock += 1_000;
    expect(cb.state).toBe("half-open");
    try {
      await cb.exec(async () => {
        throw new Error("again");
      });
    } catch {
      /* expected */
    }
    expect(cb.state).toBe("open");
  }
}

await TestApplication()
  .addTests(RetrySuite)
  .addTests(TimeoutSuite)
  .addTests(BreakerSuite)
  .reporter(new ConsoleReporter())
  .run();
