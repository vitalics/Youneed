// Self-test for @youneed/test — drives the framework programmatically and
// asserts on the RunSummary with node:assert (so it doesn't recurse on itself).
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Test,
  Fixture,
  Reporter,
  TestApplication,
  mergeReports,
  dispose,
  expect,
  registerTestCase,
  AssertionError,
  NoopReporter,
  webServer,
  type TestResult,
  type TestContext,
  type TestPlugin,
} from "../src/index.ts";
import { createServer } from "node:http";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};
const silent = () => new NoopReporter(); // dogfood the built-in silencer
const run = (b: ReturnType<typeof TestApplication>) => b.reporter(silent()).run({ setExitCode: false });

// ── pass / fail / skip accounting ─────────────────────────────────────────────
{
  class S extends Test() {
    @Test.it("passes") a() {
      expect(1 + 1).toBe(2);
    }
    @Test.it("fails") b() {
      expect(1).toBe(2);
    }
    @Test.skip("skipped") c() {
      throw new Error("should not run");
    }
  }
  const s = await run(TestApplication().addTests(S));
  console.log("accounting:");
  ok("3 total", s.total === 3);
  ok("1 passed", s.passed === 1);
  ok("1 failed", s.failed === 1);
  ok("1 skipped", s.skipped === 1);
  ok("failure carries an error", s.results.find((r) => r.name === "fails")?.error instanceof Error);
}

// ── only filtering ────────────────────────────────────────────────────────────
{
  class S extends Test() {
    @Test.it("ignored") a() {}
    @Test.only("focused") b() {}
  }
  const s = await run(TestApplication().addTests(S));
  console.log("only:");
  ok("runs only the focused test", s.total === 1 && s.results[0].name === "focused");
}

// ── lifecycle hook ordering ────────────────────────────────────────────────────
{
  const order: string[] = [];
  class S extends Test() {
    @Test.beforeAll() ba() {
      order.push("beforeAll");
    }
    @Test.afterAll() aa() {
      order.push("afterAll");
    }
    @Test.beforeEach() be() {
      order.push("beforeEach");
    }
    @Test.afterEach() ae() {
      order.push("afterEach");
    }
    @Test.it("t1") t1() {
      order.push("t1");
    }
    @Test.it("t2") t2() {
      order.push("t2");
    }
  }
  await run(TestApplication().addTests(S));
  console.log("lifecycle:");
  ok(
    "beforeAll → (beforeEach,test,afterEach)×2 → afterAll",
    order.join() === ["beforeAll", "beforeEach", "t1", "afterEach", "beforeEach", "t2", "afterEach", "afterAll"].join(),
  );
}

// ── fixture scopes ──────────────────────────────────────────────────────────────
{
  let testScopeBuilds = 0;
  let runScopeBuilds = 0;
  const torndown: string[] = [];

  class PerTest extends Fixture<{ n: number }>({ scope: "test" }) {
    setup() {
      return { n: ++testScopeBuilds };
    }
    teardown() {
      torndown.push("test");
    }
  }
  class PerRun extends Fixture<{ id: number }>({ scope: "run" }) {
    setup() {
      return { id: ++runScopeBuilds };
    }
    teardown() {
      torndown.push("run");
    }
  }
  class S extends Test() {
    @Test.use(PerTest) t!: { n: number };
    @Test.use(PerRun) r!: { id: number };
    @Test.it("a") a() {
      expect(this.r.id).toBe(1);
    }
    @Test.it("b") b() {
      expect(this.r.id).toBe(1);
    }
  }
  await run(TestApplication().addTests(S));
  console.log("fixture scopes:");
  ok("test-scope rebuilds per test (2 tests → 2 builds)", testScopeBuilds === 2);
  ok("run-scope builds once", runScopeBuilds === 1);
  ok("test-scope torn down twice", torndown.filter((t) => t === "test").length === 2);
  ok("run-scope torn down once", torndown.filter((t) => t === "run").length === 1);
}

// ── fixture-to-fixture dependency injection ────────────────────────────────────
{
  class Config extends Fixture<{ host: string }>({ scope: "run" }) {
    setup() {
      return { host: "localhost" };
    }
  }
  class Client extends Fixture<{ url: string }>({ scope: "test" }) {
    @Fixture.use(Config) cfg!: { host: string };
    setup() {
      return { url: `http://${this.cfg.host}` };
    }
  }
  class S extends Test() {
    @Test.use(Client) client!: { url: string };
    @Test.it("resolves transitive deps") a() {
      expect(this.client.url).toBe("http://localhost");
    }
  }
  const s = await run(TestApplication().addTests(S));
  console.log("fixture deps:");
  ok("a fixture can depend on another fixture", s.passed === 1 && s.failed === 0);
}

// ── decorator-free injection via Fixture.get() ─────────────────────────────────
{
  let builds = 0;
  class GetFix extends Fixture<{ n: number }>({ scope: "test" }) {
    setup() {
      return { n: ++builds };
    }
  }
  class S extends Test() {
    db = GetFix.get(); // field initializer — no decorator
    @Test.it("injects the resolved value") a() {
      expect(this.db.n).toBe(1);
    }
    @Test.it("resolves per test (scope respected)") b() {
      expect(this.db.n).toBe(2);
    }
  }
  const s = await run(TestApplication().addTests(S));
  console.log("fixture get():");
  ok("Fixture.get() injects + resolves per test", s.passed === 2 && s.failed === 0);
  ok("get() respected the test scope (2 builds)", builds === 2);
}

// ── reporter event priority ────────────────────────────────────────────────────
{
  const calls: number[] = [];
  class R extends Reporter({ name: "r" }) {
    @Reporter.event("onTestEnd", { priority: 10 }) late(_r: TestResult) {
      calls.push(10);
    }
    @Reporter.event("onTestEnd", { priority: 1 }) early(_r: TestResult) {
      calls.push(1);
    }
  }
  class S extends Test() {
    @Test.it("x") x() {}
  }
  await TestApplication().addTests(S).reporter(new R()).run({ setExitCode: false });
  console.log("reporter priority:");
  ok("lower priority runs first", calls.join() === "1,10");
}

// ── assertions ──────────────────────────────────────────────────────────────
{
  console.log("assertions:");
  ok("toBe passes on identity", safe(() => expect(2).toBe(2)));
  ok("toBe throws AssertionError on mismatch", throwsAssertion(() => expect(2).toBe(3)));
  ok("toEqual deep-compares", safe(() => expect({ a: [1, 2] }).toEqual({ a: [1, 2] })));
  ok("not inverts", safe(() => expect(1).not.toBe(2)));
  ok("toThrow catches", safe(() => expect(() => {
    throw new Error("boom");
  }).toThrow("boom")));
  ok("toContain on arrays", safe(() => expect([1, 2, 3]).toContain(2)));
}

// ── disposable fixtures (Symbol.dispose / Symbol.asyncDispose) ────────────────
{
  console.log("dispose helper:");
  const sync = dispose(() => {});
  const async = dispose(async () => {});
  ok("sync cleanup → Symbol.dispose", typeof (sync as Record<symbol, unknown>)[Symbol.dispose] === "function");
  ok("async cleanup → Symbol.asyncDispose", typeof (async as Record<symbol, unknown>)[Symbol.asyncDispose] === "function");
  ok("dispose(value, fn) returns the value", (() => {
    const v = { x: 1 };
    return dispose(v, () => {}) === v;
  })());

  const log: string[] = [];

  // value made disposable via dispose(value, cleanup) — sync.
  class ResFixture extends Fixture<{ name: string }>({ scope: "test" }) {
    setup() {
      return dispose({ name: "res" }, () => log.push("sync-dispose"));
    }
  }
  // bare async disposable returned as the value.
  class AsyncResFixture extends Fixture({ scope: "run" }) {
    setup() {
      return dispose(async () => log.push("async-dispose"));
    }
  }
  // explicit teardown AND a disposable value → both run.
  class BothFixture extends Fixture<{ name: string }>({ scope: "test" }) {
    setup() {
      return dispose({ name: "both" }, () => log.push("both-dispose"));
    }
    teardown() {
      log.push("both-teardown");
    }
  }

  class S extends Test() {
    @Test.use(ResFixture) res!: { name: string };
    @Test.use(AsyncResFixture) ares!: AsyncDisposable;
    @Test.use(BothFixture) both!: { name: string };
    @Test.it("uses disposables") a() {
      expect(this.res.name).toBe("res");
    }
  }
  await run(TestApplication().addTests(S));

  console.log("disposable fixtures:");
  ok("sync Symbol.dispose value disposed at scope end", log.includes("sync-dispose"));
  ok("async Symbol.asyncDispose value disposed (awaited)", log.includes("async-dispose"));
  ok("teardown() and value disposal both run", log.includes("both-teardown") && log.includes("both-dispose"));
}

// ── blob + sharded merge (à la Playwright blob reporter) ──────────────────────
{
  class Alpha extends Test() {
    @Test.it("a1") a1() {}
    @Test.it("a2") a2() {}
  }
  class Beta extends Test() {
    @Test.it("b1") b1() {}
    @Test.it("b2 fails") b2() {
      expect(1).toBe(2);
    }
  }

  const dir = mkdtempSync(join(tmpdir(), "youneed-blob-"));
  // Simulate two parallel shards in-process via the worker-mode env contract.
  process.env.YOUNEED_BLOB_DIR = dir;
  for (const shard of ["1/2", "2/2"]) {
    process.env.YOUNEED_SHARD = shard;
    await TestApplication().addTests(Alpha, Beta).run({ setExitCode: false });
  }
  delete process.env.YOUNEED_SHARD;
  delete process.env.YOUNEED_BLOB_DIR;

  console.log("blob shards:");
  const blobs = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  ok("each shard wrote its own blob", blobs.length === 2);
  ok("shard files are labelled i-of-n", blobs.includes("shard-1-of-2.jsonl") && blobs.includes("shard-2-of-2.jsonl"));

  // Merge: replay every blob through a capturing reporter → one coherent run.
  const seen: string[] = [];
  const collected: TestResult[] = [];
  class Capture extends Reporter({ name: "capture" }) {
    @Reporter.event("onRunStart") rs() {
      seen.push("runStart");
    }
    @Reporter.event("onTestEnd") te(r: TestResult) {
      seen.push("testEnd");
      collected.push(r);
    }
    @Reporter.event("onRunEnd") re() {
      seen.push("runEnd");
    }
  }
  const merged = await mergeReports({ dir, reporters: [new Capture()] }, { setExitCode: false });

  console.log("merge:");
  ok("merged summary spans all shards (4 tests)", merged.total === 4);
  ok("merged passed/failed aggregated", merged.passed === 3 && merged.failed === 1);
  ok("exactly one synthesized runStart + runEnd", seen.filter((e) => e === "runStart").length === 1 && seen.filter((e) => e === "runEnd").length === 1);
  ok("all test results replayed", collected.length === 4);
  ok("error survives blob round-trip as an Error", collected.find((r) => r.status === "failed")?.error instanceof Error);

  rmSync(dir, { recursive: true, force: true });
}

// ── in-process parallelism (.parallel — async lanes) ──────────────────────────
{
  const finished: string[] = [];
  const slowSuite = (name: string, ms: number) => {
    class S extends Test({ name }) {
      @Test.it("waits")
      async waits() {
        await new Promise((r) => setTimeout(r, ms));
        finished.push(name);
      }
    }
    return S;
  };
  // Serial time ≈ 30+20+10 = 60ms; concurrent ≈ max ≈ 30ms.
  const A = slowSuite("Par-A", 30);
  const B = slowSuite("Par-B", 20);
  const C = slowSuite("Par-C", 10);

  const t0 = performance.now();
  const s = await run(TestApplication().addTests(A, B, C).parallel(3));
  const elapsed = performance.now() - t0;

  console.log("parallel:");
  ok("parallel runs every suite", s.total === 3 && s.passed === 3 && s.failed === 0);
  ok("lanes ran concurrently (well under the serial sum)", elapsed < 55);
  ok("lanes finished by duration (C<B<A) → truly concurrent", finished.join() === "Par-C,Par-B,Par-A");

  // Same suites, sequential: results identical, just slower / ordered by lane.
  const seq = await run(TestApplication().addTests(A, B, C));
  ok("parallel result matches sequential", seq.total === s.total && seq.passed === s.passed);
}

// ── parallel respects only + reports failures from any lane ───────────────────
{
  class L1 extends Test({ name: "Lane1" }) {
    @Test.it("ok") ok1() {}
    @Test.it("boom") boom() {
      expect(1).toBe(2);
    }
  }
  class L2 extends Test({ name: "Lane2" }) {
    @Test.it("ok") ok2() {}
  }
  const s = await run(TestApplication().addTests(L1, L2).parallel(2));
  console.log("parallel failures:");
  ok("a failure in any lane surfaces in the merged summary", s.failed === 1 && s.passed === 2);
  ok("failed test keeps its Error after lane merge", s.results.find((r) => r.status === "failed")?.error instanceof Error);
}

// ── explicit shard selection (.shard) ─────────────────────────────────────────
{
  class Sh1 extends Test({ name: "Sh1" }) {
    @Test.it("x") x() {}
  }
  class Sh2 extends Test({ name: "Sh2" }) {
    @Test.it("x") x() {}
  }
  class Sh3 extends Test({ name: "Sh3" }) {
    @Test.it("x") x() {}
  }
  class Sh4 extends Test({ name: "Sh4" }) {
    @Test.it("x") x() {}
  }
  const app = () => TestApplication().addTests(Sh1, Sh2, Sh3, Sh4);
  const a = await run(app().shard("1/2"));
  const b = await run(app().shard("2/2"));

  console.log("shard selection:");
  ok("each shard runs a deterministic subset", a.total === 2 && b.total === 2);
  ok("shards are disjoint and together cover everything", a.total + b.total === 4);
  ok("invalid shard spec throws", !safe(() => void app().shard("5/2")));
}

// ── TestContext (plugins, Cucumber-style World) ───────────────────────────────
{
  const seenCtx: TestContext[] = [];
  let worldUser: string | undefined;
  class Cap extends Reporter({ name: "ctxcap" }) {
    @Reporter.event("onTestStart") on(ctx: TestContext) {
      seenCtx.push(ctx);
    }
  }
  class S extends Test() {
    @Test.beforeEach() setup(ctx: TestContext) {
      ctx.data.set("world", { user: "alice" }); // a Cucumber-style "World"
    }
    @Test.it("reads the shared World + annotates")
    a(ctx: TestContext) {
      worldUser = (ctx.data.get("world") as { user: string }).user;
      ctx.annotate("tag", "@smoke");
      ctx.attach({ name: "note", body: "hello" }); // → metadata.attachments
      ctx.metadata.browser = "chromium"; // arbitrary report-facing field
      expect(worldUser).toBe("alice");
    }
  }
  const s = await TestApplication().addTests(S).reporter(silent()).reporter(new Cap()).run({ setExitCode: false });
  const r = s.results[0];

  console.log("context:");
  ok("onTestStart receives a TestContext (identity)", seenCtx.length === 1 && seenCtx[0].suite === "S");
  ok("beforeEach + body share one context (World via data)", worldUser === "alice");
  ok("the reporter's context is the same mutable object", seenCtx[0].data.get("world") !== undefined);
  ok("annotations surface on the result", r.annotations?.length === 1 && r.annotations[0].type === "tag" && r.annotations[0].description === "@smoke");
  ok("attachments live under metadata on the result", r.metadata?.attachments.length === 1 && r.metadata.attachments[0].name === "note");
  ok("custom metadata fields surface on the result", r.metadata?.browser === "chromium");
}

// ── plugin API (.use + runTest middleware + custom events + registerTestCase) ──
{
  const events: string[] = [];
  let bodyRuns = 0;
  // A plugin that loops the body 3× and emits a custom event (a mini-benchmark).
  const repeatPlugin: TestPlugin = {
    name: "repeat",
    async runTest(exec) {
      await exec.emit("onRepeat", { name: exec.ctx.name });
      for (let i = 0; i < 3; i++) await exec.next();
      exec.ctx.metadata.repeated = 3;
    },
  };
  class Cap extends Reporter({ name: "rcap" }) {
    @Reporter.event("onRepeat") s() {
      events.push("repeat");
    }
  }
  class S extends Test() {
    @Test.it("body") body() {
      bodyRuns++;
    }
  }
  const s = await TestApplication().addTests(S).use(repeatPlugin).reporter(silent()).reporter(new Cap()).run({ setExitCode: false });

  console.log("plugins:");
  ok("plugin.runTest wraps + loops the body (3×)", bodyRuns === 3 && s.passed === 1);
  ok("plugin can emit a custom reporter event", events.length === 1 && events[0] === "repeat");
  ok("plugin output rides on metadata", s.results[0].metadata?.repeated === 3);

  // registerTestCase: a custom decorator with no @Test.it still produces a case.
  let ran = false;
  const markRun = (_v: unknown, dctx: ClassMethodDecoratorContext) => {
    dctx.addInitializer(function (this: unknown) {
      registerTestCase((this as { constructor: Function }).constructor, String(dctx.name), { name: "custom" });
    });
  };
  class T extends Test() {
    @markRun
    step() {
      ran = true;
    }
  }
  const s2 = await run(TestApplication().addTests(T));
  ok("registerTestCase makes a standalone custom decorator runnable", ran && s2.passed === 1 && s2.results[0].name === "custom");
}

// ── NoopReporter (silence a run, still get the summary) ───────────────────────
{
  class S extends Test() {
    @Test.it("a") a() {}
    @Test.it("b") b() {}
  }
  const lines: string[] = [];
  const realLog = console.log.bind(console);
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(" "));
  const s = await TestApplication().addTests(S).reporter(new NoopReporter()).run({ setExitCode: false });
  console.log = realLog;

  console.log("noop reporter:");
  ok("NoopReporter produces zero output", lines.length === 0);
  ok("NoopReporter still returns a full summary", s.total === 2 && s.passed === 2 && s.failed === 0);
}

// ── data-driven tests (@Test.it input + @Test.each table) ────────────────────
{
  // single computed input → passed as arg #1; ctx shifts to arg #2.
  let got: number | undefined;
  let ctxName: string | undefined;
  class S extends Test() {
    @Test.test({ input: () => 21 * 2 })
    answer(input: number, ctx: TestContext) {
      got = input;
      ctxName = ctx.name;
      expect(input).toBe(42);
    }
  }
  const s = await run(TestApplication().addTests(S));

  console.log("data-driven:");
  ok("input thunk resolved + passed as arg #1", got === 42 && s.passed === 1);
  ok("ctx is still available as arg #2", ctxName === "answer");

  // table → one case per row, row is arg #1.
  const rows: Array<[number, number, number]> = [
    [1, 1, 2],
    [2, 3, 5],
    [10, 5, 15],
  ];
  const seen: string[] = [];
  class T extends Test() {
    @Test.each(rows, ([a, b]) => `${a}+${b}`)
    adds([a, b, sum]: [number, number, number]) {
      seen.push(`${a}+${b}`);
      expect(a + b).toBe(sum);
    }
  }
  const st = await run(TestApplication().addTests(T));
  ok("each generates one case per row", st.total === 3 && st.passed === 3);
  ok("each names rows via the name fn", st.results.map((r) => r.name).join() === "1+1,2+3,10+5");
  ok("each ran every row's body with its row", seen.join() === "1+1,2+3,10+5");

  // default naming when no name fn.
  class D extends Test() {
    @Test.each([10, 20])
    tens(n: number) {
      expect(n % 10).toBe(0);
    }
  }
  const sd = await run(TestApplication().addTests(D));
  ok("each default names are 'key [i]'", sd.results.map((r) => r.name).join() === "tens [0],tens [1]");

  // name interpolation: $1 against a single (non-array) input value.
  class N extends Test() {
    @Test.test({ name: "qwe($1)", input: () => 42 })
    info(value: number) {
      expect(value).toBe(42);
    }
  }
  const sn = await run(TestApplication().addTests(N));
  ok("input value interpolates into the name ($1)", sn.results[0].name === "qwe(42)");

  // typed name FUNCTION — `v` is inferred from the input thunk's return type.
  class F extends Test() {
    @Test.test({ name: (v) => `value is ${v + 1}`, input: () => 7 })
    fn(value: number) {
      expect(value).toBe(7);
    }
  }
  const sf = await run(TestApplication().addTests(F));
  ok("typed name function receives the input value", sf.results[0].name === "value is 8");

  // each with a positional template ($1/$2) + the index ($#).
  class E extends Test() {
    @Test.each(rows, "$1 + $2 [$#]")
    sum([a, b, total]: [number, number, number]) {
      expect(a + b).toBe(total);
    }
  }
  const se = await run(TestApplication().addTests(E));
  ok("each interpolates positional + index placeholders", se.results.map((r) => r.name).join() === "1 + 1 [0],2 + 3 [1],10 + 5 [2]");
}

// ── steps (ctx.step + Test.step, nestable) ────────────────────────────────────
{
  const order: string[] = [];
  class S extends Test() {
    @Test.it("with steps")
    async a(ctx: TestContext) {
      await ctx.step("outer", async () => {
        order.push("outer");
        await ctx.step("inner", async () => {
          order.push("inner");
        });
      });
      await Test.step("ambient", async () => {
        order.push("ambient");
      });
    }
  }
  const s = await run(TestApplication().addTests(S));
  const r = s.results[0];

  console.log("steps:");
  ok("test with steps passes", s.passed === 1);
  ok("steps recorded on the result", (r.steps?.length ?? 0) === 2);
  ok("nested step recorded under its parent", r.steps?.[0].name === "outer" && r.steps?.[0].steps[0]?.name === "inner");
  ok("Test.step (ambient) recorded too", r.steps?.[1].name === "ambient");
  ok("steps ran in order, inner before parent completes", order.join() === "outer,inner,ambient");
  ok("steps carry a duration", typeof r.steps?.[0].durationMs === "number");

  // a throwing step records its error message and fails the test
  let stepErr: string | undefined;
  class F extends Test() {
    @Test.it("failing step")
    async b(ctx: TestContext) {
      await ctx.step("boom", () => {
        throw new Error("kaboom");
      });
    }
  }
  const sf = await run(TestApplication().addTests(F));
  stepErr = sf.results[0].steps?.[0].error;
  ok("a throwing step fails the test + records the message", sf.failed === 1 && stepErr === "kaboom");
}

// ── plugin extras: exec.instance + run-level setup/teardown ───────────────────
{
  const order: string[] = [];
  let seenDb: string | undefined;
  // A plugin that: starts a "resource" in setup, reads an injected fixture off
  // the suite instance in runTest, and stops the resource in teardown.
  const dbPlugin: TestPlugin = {
    name: "db",
    setup() {
      order.push("setup");
    },
    teardown() {
      order.push("teardown");
    },
    async runTest(exec) {
      seenDb = (exec.instance as { db?: string }).db; // injected fixture field
      order.push("test");
      await exec.next();
    },
  };

  class Conn extends Fixture<string>({ scope: "run" }) {
    setup() {
      return "pg://local";
    }
  }
  class S extends Test() {
    @Test.use(Conn) db!: string;
    @Test.it("uses the connection") a() {
      expect(this.db).toBe("pg://local");
    }
  }
  const s = await TestApplication().addTests(S).use(dbPlugin).reporter(new NoopReporter()).run({ setExitCode: false });

  console.log("plugin extras:");
  ok("plugin runs + test passes", s.passed === 1);
  ok("exec.instance exposes injected fixtures to the plugin", seenDb === "pg://local");
  ok("run-level setup/teardown fire once, around the tests", order.join() === "setup,test,teardown");
}

// ── conditional skip (predicate + .context run params) ────────────────────────
{
  class S extends Test() {
    @Test.it("firefox only", { skip: (ctx) => ctx.metadata.browser !== "firefox" })
    a() {}
    @Test.it("always") b() {}
    @Test.it("needs net", { skip: () => "needs network" }) c() {}
    @Test.it("bad predicate", {
      skip: () => {
        throw new Error("boom");
      },
    })
    d() {}
  }
  const chromium = await run(TestApplication().addTests(S).context({ browser: "chromium" }));
  const firefox = await run(TestApplication().addTests(S).context({ browser: "firefox" }));
  const at = (s: typeof chromium, name: string) => s.results.find((x) => x.name === name)!;

  console.log("conditional skip:");
  ok("predicate skips the case (chromium)", at(chromium, "firefox only").status === "skipped");
  ok("predicate runs it under the matching .context param (firefox)", at(firefox, "firefox only").status === "passed");
  ok("a non-conditional test always runs", at(chromium, "always").status === "passed");
  ok(
    "a string predicate skips + records the reason",
    at(chromium, "needs net").status === "skipped" && at(chromium, "needs net").annotations?.[0]?.description === "needs network",
  );
  ok("a throwing predicate fails the test", at(chromium, "bad predicate").status === "failed");
  ok(".context() seeds ctx.metadata onto the result", at(firefox, "always").metadata?.browser === "firefox");
}

// ── abortSignal + timeout ─────────────────────────────────────────────────────
{
  // ctx.signal is live during the test, then aborted once it's done.
  let liveDuring = false;
  let abortedAfter: Promise<boolean>;
  class S extends Test() {
    @Test.it("exposes a live signal")
    a(ctx: TestContext) {
      liveDuring = ctx.signal instanceof AbortSignal && !ctx.signal.aborted;
      // observe the signal AFTER the test ends (microtask after the body resolves)
      abortedAfter = new Promise<boolean>((resolve) => {
        ctx.signal.addEventListener("abort", () => resolve(true), { once: true });
      });
    }
  }
  const s = await run(TestApplication().addTests(S));
  console.log("abortSignal:");
  ok("ctx.signal is a live AbortSignal during the test", liveDuring && s.passed === 1);
  ok("ctx.signal is aborted once the test finishes", await abortedAfter!);

  // a per-case timeout aborts the signal + fails the test with a TimeoutError.
  let abortReasonName: string | undefined;
  class T extends Test() {
    @Test.it("times out", { timeout: 30 })
    async slow(ctx: TestContext) {
      ctx.signal.addEventListener("abort", () => {
        abortReasonName = (ctx.signal.reason as Error)?.name;
      });
      await new Promise((r) => setTimeout(r, 500)); // exceeds the 30ms budget
    }
  }
  const st = await run(TestApplication().addTests(T));
  console.log("timeout:");
  ok("a per-case timeout fails the test", st.failed === 1);
  ok("the timeout error is a TimeoutError", st.results[0].error?.name === "TimeoutError");
  ok("timeout aborts ctx.signal with the TimeoutError as reason", abortReasonName === "TimeoutError");

  // a run-level default timeout applies, and a per-case timeout overrides it.
  class U extends Test() {
    @Test.it("uses the run default") slow() {
      return new Promise((r) => setTimeout(r, 200));
    }
    @Test.it("overrides with a generous budget", { timeout: 1000 }) fine() {
      return new Promise((r) => setTimeout(r, 50));
    }
  }
  const su = await run(TestApplication().addTests(U).timeout(40));
  console.log("default timeout:");
  ok("run-level .timeout() fails the slow case", su.results.find((r) => r.name === "uses the run default")?.status === "failed");
  ok("a per-case timeout overrides the run default", su.results.find((r) => r.name === "overrides with a generous budget")?.status === "passed");
}

// ── webServer (precondition) ──────────────────────────────────────────────────
{
  console.log("webServer:");
  // reuseExistingServer: an already-listening target is reused (nothing spawned).
  const server = createServer((_req, res) => res.end("ok"));
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
  });

  let ran = false;
  class S extends Test() {
    @Test.it("runs against the reused server")
    async a() {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(await res.text()).toBe("ok");
      ran = true;
    }
  }
  const s = await run(
    TestApplication()
      .addTests(S)
      .webServer({ command: "this-command-should-never-run", url: `http://127.0.0.1:${port}/`, reuseExistingServer: true }),
  );
  ok("reuseExistingServer reuses a live target (no spawn) + tests run", ran && s.passed === 1);
  server.close();

  // a bad config (no url/port) throws synchronously.
  ok("webServer requires url or port", !safe(() => webServer({ command: "x" } as never)));
}

function safe(fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}
function throwsAssertion(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof AssertionError;
  }
}

console.log(`\nall checks passed (${checks})`);
