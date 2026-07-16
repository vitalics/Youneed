// createFpsScheduler in plain Node: no requestAnimationFrame, so the setTimeout
// fallback is exercised naturally. The timer must be cancellable and the loop
// must self-terminate / stop with no dangling timer (the process must exit).
// Run: pnpm --filter @youneed/dom-scheduler test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createFpsScheduler } from "../src/index.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class SchedulerTest extends Test({ name: "scheduler" }) {
  @Test.it("fallback loop runs (setTimeout) and stop() cancels the timer")
  async fallbackAndStop() {
    const s = createFpsScheduler(60);
    let ticks = 0;
    s.frame(() => ticks++);
    await wait(80);
    expect(ticks).toBeGreaterThan(1);
    s.stop!();
    const atStop = ticks;
    await wait(80);
    expect(ticks).toBe(atStop); // no more ticks — timer cancelled
  }

  @Test.it("self-terminates after the last frame is unsubscribed")
  async selfTerminates() {
    const s = createFpsScheduler(60);
    let t = 0;
    const unsub = s.frame(() => t++);
    await wait(40);
    unsub();
    const afterUnsub = t;
    await wait(80);
    expect(t).toBeLessThan(afterUnsub + 2); // at most one in-flight tick after unsub
  }

  @Test.it("a one-shot request flushes once, then idles")
  async oneShot() {
    const s = createFpsScheduler();
    let flushed = 0;
    s.request({ flush: () => flushed++, depth: 0 }, "render-blocking");
    await wait(60);
    expect(flushed).toBe(1);
  }

  @Test.it("`using` runs the loop, then Symbol.dispose stops it")
  async usingDisposes() {
    let ticks = 0;
    {
      using sched = createFpsScheduler(60);
      sched.frame(() => ticks++);
      await wait(60);
    }
    const atExit = ticks;
    await wait(80);
    expect(atExit).toBeGreaterThan(1);
    expect(ticks).toBe(atExit); // disposed → stopped
  }
}

await TestApplication().addTests(SchedulerTest).reporter(new ConsoleReporter()).run();
