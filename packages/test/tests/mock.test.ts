// Self-test for the mocking system. Drives fn/spyOn directly with node:assert,
// and exercises the mock matchers + auto-restore by running suites in-process.
import assert from "node:assert/strict";
import {
  fn,
  spyOn,
  mock,
  expect,
  Test,
  TestApplication,
  NoopReporter,
  AssertionError,
  isMockFunction,
} from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};
const run = (b: ReturnType<typeof TestApplication>) => b.reporter(new NoopReporter()).run({ setExitCode: false });
const throwsAssertion = (f: () => void) => {
  try {
    f();
    return false;
  } catch (e) {
    return e instanceof AssertionError;
  }
};

// ── fn(): recording ────────────────────────────────────────────────────────
{
  const f = fn((a: number, b: number) => a + b);
  const r = f(2, 3);
  f(10, 20);
  console.log("fn recording:");
  ok("calls through to the implementation", r === 5);
  ok("records each call's args", f.mock.calls.length === 2 && f.mock.calls[0][0] === 2);
  ok("records results", f.mock.results[0].value === 5 && f.mock.results[1].value === 30);
  ok("lastCall is the most recent args", f.mock.lastCall?.[0] === 10);
  ok("isMockFunction recognizes it", isMockFunction(f) && !isMockFunction(() => {}));
  const captured = fn(function (this: { id: number }) {});
  captured.call({ id: 7 });
  ok("records the `this` receiver", (captured.mock.instances[0] as { id: number }).id === 7);
}

// ── fn(): configured behaviour ───────────────────────────────────────────────
{
  console.log("fn behaviour:");
  const f = fn<() => number>();
  ok("bare mock returns undefined", f() === undefined);
  f.mockReturnValue(42);
  ok("mockReturnValue applies", f() === 42 && f() === 42);
  f.mockReturnValueOnce(1).mockReturnValueOnce(2);
  ok("mockReturnValueOnce is FIFO then falls back", f() === 1 && f() === 2 && f() === 42);

  const impl = fn((n: number) => n * 2);
  impl.mockImplementationOnce((n) => n + 100);
  ok("mockImplementationOnce overrides one call", impl(5) === 105 && impl(5) === 10);

  ok("recorded throw", (() => {
    const boom = fn(() => {
      throw new Error("nope");
    });
    try {
      boom();
    } catch {
      /* ignore */
    }
    return boom.mock.results[0].type === "throw";
  })());
}

// ── fn(): async helpers + clear/reset ────────────────────────────────────────
await (async () => {
  console.log("fn async + clear/reset:");
  const resolved = fn<() => Promise<string>>().mockResolvedValue("ok");
  ok("mockResolvedValue resolves", (await resolved()) === "ok");
  const rejected = fn<() => Promise<never>>().mockRejectedValue(new Error("fail"));
  ok("mockRejectedValue rejects", await rejected().then(() => false, (e) => e.message === "fail"));

  const f = fn((n: number) => n).mockReturnValue(9);
  f(1);
  f.mockClear();
  ok("mockClear forgets calls, keeps impl", f.mock.calls.length === 0 && f(2) === 9);
  f.mockReset();
  ok("mockReset drops the impl too", f(2) === undefined);
})();

// ── spyOn() ──────────────────────────────────────────────────────────────────
{
  console.log("spyOn:");
  const mailer = {
    sent: 0,
    send(to: string) {
      this.sent++;
      return `to:${to}`;
    },
  };
  const spy = spyOn(mailer, "send");
  ok("calls through to the original by default", mailer.send("a") === "to:a" && mailer.sent === 1);
  ok("records the call", spy.mock.calls[0][0] === "a");

  spy.mockReturnValue("stub");
  ok("can be stubbed", mailer.send("b") === "stub" && mailer.sent === 1);

  spy.mockRestore();
  ok("mockRestore puts the original back", mailer.send("c") === "to:c" && mailer.sent === 2);

  ok("spyOn on a non-function throws", (() => {
    try {
      spyOn(mailer as object, "sent" as never);
      return false;
    } catch {
      return true;
    }
  })());
}

// ── mock matchers ─────────────────────────────────────────────────────────────
{
  console.log("matchers:");
  const f = fn((n: number) => n * 2);
  f(2);
  f(3);
  ok("toHaveBeenCalled", !throwsAssertion(() => expect(f).toHaveBeenCalled()));
  ok("toHaveBeenCalledTimes", !throwsAssertion(() => expect(f).toHaveBeenCalledTimes(2)));
  ok("toHaveBeenCalledWith (some call)", !throwsAssertion(() => expect(f).toHaveBeenCalledWith(2)));
  ok("toHaveBeenLastCalledWith", !throwsAssertion(() => expect(f).toHaveBeenLastCalledWith(3)));
  ok("toHaveBeenNthCalledWith (1-based)", !throwsAssertion(() => expect(f).toHaveBeenNthCalledWith(1, 2)));
  ok("toHaveReturnedWith", !throwsAssertion(() => expect(f).toHaveReturnedWith(6)));
  ok(".not inverts", !throwsAssertion(() => expect(f).not.toHaveBeenCalledWith(99)));
  ok("a wrong expectation fails", throwsAssertion(() => expect(f).toHaveBeenCalledTimes(5)));
  ok("matcher on a non-mock throws", throwsAssertion(() => expect(() => {}).toHaveBeenCalled()));
}

// ── auto-restore after each test ──────────────────────────────────────────────
await (async () => {
  console.log("auto-restore:");
  const obj = {
    value() {
      return "real";
    },
  };
  const original = obj.value;

  class S extends Test() {
    @Test.it("stubs without restoring") a() {
      spyOn(obj, "value").mockReturnValue("stubbed" as never);
      expect(obj.value()).toBe("stubbed");
    }
  }
  const summary = await run(TestApplication().addTests(S));
  ok("the test passed", summary.passed === 1);
  ok("the spy was restored after the test", obj.value === original && obj.value() === "real");

  // mock.restoreAll is the manual equivalent.
  const target = { f() { return 1; } };
  spyOn(target, "f").mockReturnValue(2 as never);
  mock.restoreAll();
  ok("mock.restoreAll() restores live spies", target.f() === 1);
})();

console.log(`\nall checks passed (${checks})`);
