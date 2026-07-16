import assert from "node:assert/strict";
import { Reporter, Test, TestApplication, NoopReporter } from "@youneed/test";
import { Retry, Timeout, retry, timeout, TimeoutError } from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};
const run = (b: ReturnType<typeof TestApplication>) => b.reporter(new NoopReporter()).run({ setExitCode: false });

// ── retry: a flaky test passes after re-runs; count lands on metadata ─────────
{
  let n = 0;
  class S extends Test() {
    @Test.it("flaky")
    f() {
      if (++n < 3) throw new Error("flake");
    }
  }
  const s = await run(TestApplication().addTests(S).use(retry(3)));
  ok("retry re-runs until the test passes", s.passed === 1 && n === 3);
  ok("retry records the count on metadata", s.results[0].metadata?.retries === 2);
}

// ── @Retry overrides the plugin default ───────────────────────────────────────
{
  let n = 0;
  const seen: number[] = [];
  class Cap extends Reporter({ name: "cap" }) {
    @Reporter.event("onRetry") r(e: { attempt: number }) {
      seen.push(e.attempt);
    }
  }
  class S extends Test() {
    @Retry(4)
    @Test.it("needs four")
    f() {
      if (++n < 5) throw new Error("nope");
    }
  }
  const s = await TestApplication().addTests(S).use(retry(0)).reporter(new NoopReporter()).reporter(new Cap()).run({ setExitCode: false });
  ok("@Retry(4) overrides retry(0) default", s.passed === 1 && n === 5);
  ok("onRetry event fired per failed attempt", seen.join() === "1,2,3,4");
}

// ── timeout: a slow test fails with TimeoutError ──────────────────────────────
{
  class S extends Test() {
    @Test.it("slow")
    async f() {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const s = await run(TestApplication().addTests(S).use(timeout(20)));
  ok("timeout fails a too-slow test", s.failed === 1);
  ok("the failure is a TimeoutError", /timed out after 20ms/.test(s.results[0].error?.message ?? ""));

  // @Timeout overrides + a fast test passes under it
  class F extends Test() {
    @Timeout(200)
    @Test.it("fast under override")
    async ok2() {
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const sf = await run(TestApplication().addTests(F).use(timeout(1)));
  ok("@Timeout(200) overrides timeout(1) so a 5ms test passes", sf.passed === 1);
}

// ── composition: retry OUTER + timeout INNER ──────────────────────────────────
{
  let attempts = 0;
  let retried = 0;
  class Cap extends Reporter({ name: "cap" }) {
    @Reporter.event("onRetry") r() {
      retried++;
    }
  }
  class S extends Test() {
    @Test.it("always slow")
    async f() {
      attempts++;
      await new Promise((r) => setTimeout(r, 80));
    }
  }
  const s = await TestApplication()
    .addTests(S)
    .use(retry(2)) // outer
    .use(timeout(20)) // inner — each attempt times out
    .reporter(new NoopReporter())
    .reporter(new Cap())
    .run({ setExitCode: false });
  ok("retry wraps timeout: 1 + 2 retries = 3 attempts", attempts === 3);
  ok("each retry was driven by a timeout failure", retried === 2 && s.failed === 1);
  ok("final failure is the (timed-out) error", s.results[0].error instanceof Error);
  ok("TimeoutError is exported", new TimeoutError(5) instanceof Error);
}

console.log(`\nall checks passed (${checks})`);
