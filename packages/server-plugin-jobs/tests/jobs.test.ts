import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { MemoryKV } from "@youneed/kv";
import { Application } from "@youneed/server";
import { createScheduler, jobs, parseCron, nextRun, type TimerHandle } from "../src/index.ts";

// ── deterministic fake clock + timer registry ─────────────────────────────────
//
// `now()` reads a mutable `t`. `setTimer` records a due time; `advance(ms)`
// bumps `t` and fires every callback whose due time has been reached, in order.
// No real time passes, so the whole suite is instant.

interface FakeTimer {
  id: number;
  cb: () => void;
  due: number;
  cancelled: boolean;
}

class FakeClock {
  t = 0;
  #seq = 0;
  #timers: FakeTimer[] = [];

  now = (): number => this.t;

  setTimer = (cb: () => void, ms: number): TimerHandle => {
    const timer: FakeTimer = { id: ++this.#seq, cb, due: this.t + ms, cancelled: false };
    this.#timers.push(timer);
    return timer;
  };

  clearTimer = (h: TimerHandle): void => {
    (h as FakeTimer).cancelled = true;
  };

  /** Advance the clock by `ms`, firing all due (uncancelled) callbacks in order. */
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      const next = this.#timers
        .filter((x) => !x.cancelled && x.due <= target)
        .sort((a, b) => a.due - b.due)[0];
      if (!next) break;
      this.t = next.due;
      next.cancelled = true;
      this.#timers = this.#timers.filter((x) => x !== next);
      next.cb();
      // let any microtasks (handler promises, re-arm) settle before continuing.
      // A macrotask turn (setImmediate) fully drains the async #fire/#arm chain.
      await new Promise<void>((r) => setImmediate(r));
    }
    this.t = target;
  }
}

const opts = (c: FakeClock, extra: object = {}) => ({
  now: c.now,
  setTimer: c.setTimer,
  clearTimer: c.clearTimer,
  ...extra,
});

// A manually-gated promise: resolve it from the test to release a slow handler.
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

// ── cron parsing / nextRun ────────────────────────────────────────────────────

class CronSuite extends Test({ name: "jobs: cron" }) {
  @Test.it("*/15 → next quarter-hour (UTC)")
  quarter() {
    // 2026-01-01T00:07:00Z → next is 00:15:00Z
    const from = new Date(Date.UTC(2026, 0, 1, 0, 7, 0));
    const next = nextRun("*/15 * * * *", from);
    expect(next.getTime()).toBe(Date.UTC(2026, 0, 1, 0, 15, 0));
  }

  @Test.it("0 9 * * MON → next Monday 09:00 UTC")
  monday() {
    // 2026-01-01 is a Thursday. Next Monday is 2026-01-05.
    const from = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    const next = nextRun("0 9 * * MON", from);
    expect(next.getTime()).toBe(Date.UTC(2026, 0, 5, 9, 0, 0));
    expect(next.getUTCDay()).toBe(1); // Monday
  }

  @Test.it("step + range + list expression")
  combo() {
    // minutes 0,30 ; hours 8-10 step 2 → 8,10
    const from = new Date(Date.UTC(2026, 0, 1, 7, 45, 0));
    const next = nextRun("0,30 8-10/2 * * *", from);
    expect(next.getTime()).toBe(Date.UTC(2026, 0, 1, 8, 0, 0));
    const after = nextRun("0,30 8-10/2 * * *", next);
    expect(after.getTime()).toBe(Date.UTC(2026, 0, 1, 8, 30, 0));
    // skips 9, jumps to 10:00
    const third = nextRun("0,30 8-10/2 * * *", new Date(Date.UTC(2026, 0, 1, 8, 30, 0)));
    expect(third.getTime()).toBe(Date.UTC(2026, 0, 1, 10, 0, 0));
  }

  @Test.it("6-field with seconds + month names")
  sixField() {
    const f = parseCron("*/30 0 0 1 JAN *");
    expect(f.second).toEqual([0, 30]);
    expect(f.month).toEqual([1]);
    const next = nextRun("30 0 0 1 JAN *", new Date(Date.UTC(2026, 0, 1, 0, 0, 0)));
    expect(next.getTime()).toBe(Date.UTC(2026, 0, 1, 0, 0, 30));
  }

  @Test.it("dow 7 normalizes to Sunday(0)")
  sunday() {
    const f = parseCron("0 0 * * 7");
    expect(f.dow).toEqual([0]);
  }

  @Test.it("invalid expression throws")
  invalid() {
    let threw = false;
    try {
      nextRun("not a cron", new Date());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    let threw2 = false;
    try {
      parseCron("60 * * * *"); // minute 60 out of range
    } catch {
      threw2 = true;
    }
    expect(threw2).toBe(true);

    let threw3 = false;
    try {
      parseCron("* * *"); // wrong field count
    } catch {
      threw3 = true;
    }
    expect(threw3).toBe(true);
  }
}

// ── interval / runOnStart / overlap / onError ─────────────────────────────────

class IntervalSuite extends Test({ name: "jobs: scheduling" }) {
  @Test.it("interval job fires the expected number of times")
  async interval() {
    const c = new FakeClock();
    let count = 0;
    const s = createScheduler(opts(c));
    s.add({ name: "tick", schedule: { every: 1000 }, handler: () => void count++ });
    s.start();
    expect(count).toBe(0);
    await c.advance(1000);
    expect(count).toBe(1);
    await c.advance(3000); // 3 more fires
    expect(count).toBe(4);
    s.stop();
    await c.advance(5000);
    expect(count).toBe(4); // stopped
  }

  @Test.it("runOnStart fires immediately")
  async runOnStart() {
    const c = new FakeClock();
    let count = 0;
    const s = createScheduler(opts(c));
    s.add({ name: "boot", schedule: { every: 1000 }, runOnStart: true, handler: () => void count++ });
    s.start();
    await Promise.resolve();
    expect(count).toBe(1); // fired on start before any time passed
    await c.advance(1000);
    expect(count).toBe(2);
  }

  @Test.it("overlap=false skips a still-running occurrence")
  async overlapSkip() {
    const c = new FakeClock();
    let starts = 0;
    let g = gate();
    const s = createScheduler(opts(c));
    s.add({
      name: "slow",
      schedule: { every: 1000 },
      overlap: false,
      handler: async () => {
        starts++;
        await g.promise; // stays in flight until released
      },
    });
    s.start();
    await c.advance(1000); // first fire — starts, stays running
    expect(starts).toBe(1);
    await c.advance(1000); // second fire — should SKIP (still running)
    expect(starts).toBe(1);
    g.release(); // let the first finish
    await Promise.resolve();
    await Promise.resolve();
    g = gate(); // fresh gate for the next run
    await c.advance(1000); // now free → runs again
    expect(starts).toBe(2);
    g.release();
  }

  @Test.it("overlap=true allows concurrent runs")
  async overlapAllow() {
    const c = new FakeClock();
    let starts = 0;
    const g = gate();
    const s = createScheduler(opts(c));
    s.add({
      name: "slow",
      schedule: { every: 1000 },
      overlap: true,
      handler: async () => {
        starts++;
        await g.promise;
      },
    });
    s.start();
    await c.advance(1000);
    expect(starts).toBe(1);
    await c.advance(1000); // overlap allowed → runs again while first is in flight
    expect(starts).toBe(2);
    g.release();
  }

  @Test.it("onError catches handler rejection and the job still reschedules")
  async onError() {
    const c = new FakeClock();
    const errors: unknown[] = [];
    let count = 0;
    const s = createScheduler(opts(c, { onError: (e: unknown) => errors.push(e) }));
    s.add({
      name: "flaky",
      schedule: { every: 1000 },
      handler: () => {
        count++;
        throw new Error("boom");
      },
    });
    s.start();
    await c.advance(1000);
    expect(count).toBe(1);
    expect(errors.length).toBe(1);
    await c.advance(1000); // still rescheduled after the failure
    expect(count).toBe(2);
    expect(errors.length).toBe(2);
  }

  @Test.it("one-off {after} fires once and does not reschedule")
  async oneOff() {
    const c = new FakeClock();
    let count = 0;
    const s = createScheduler(opts(c));
    s.add({ name: "once", schedule: { after: 500 }, handler: () => void count++ });
    s.start();
    await c.advance(500);
    expect(count).toBe(1);
    await c.advance(5000);
    expect(count).toBe(1);
  }
}

// ── leader-lock + introspection ───────────────────────────────────────────────

class FleetSuite extends Test({ name: "jobs: fleet + introspection" }) {
  @Test.it("two schedulers sharing one KV run an occurrence exactly once")
  async leaderLock() {
    const c = new FakeClock();
    const kv = new MemoryKV({ sweepMs: 0, now: c.now });
    let runsA = 0;
    let runsB = 0;
    const sA = createScheduler(opts(c, { store: kv, lockTtl: 60 }));
    const sB = createScheduler(opts(c, { store: kv, lockTtl: 60 }));
    sA.add({ name: "cron-job", schedule: { every: 1000 }, handler: () => void runsA++ });
    sB.add({ name: "cron-job", schedule: { every: 1000 }, handler: () => void runsB++ });
    sA.start();
    sB.start();
    await c.advance(1000); // both fire at the same slot; only one wins the lock
    expect(runsA + runsB).toBe(1);
    await c.advance(1000); // next slot → again exactly one
    expect(runsA + runsB).toBe(2);
  }

  @Test.it("trigger runs on demand and returns the result")
  async trigger() {
    const c = new FakeClock();
    let count = 0;
    const s = createScheduler(opts(c));
    s.add({ name: "manual", schedule: { every: 100000 }, handler: () => { count++; return 42; } });
    s.start();
    const result = await s.trigger("manual");
    expect(result).toBe(42);
    expect(count).toBe(1);
  }

  @Test.it("list reports nextRun and running")
  async list() {
    const c = new FakeClock();
    const g = gate();
    const s = createScheduler(opts(c));
    s.add({ name: "idle", schedule: { every: 1000 }, handler: () => {} });
    s.add({ name: "busy", schedule: { every: 1000 }, overlap: true, handler: async () => { await g.promise; } });
    s.start();
    const before = s.list();
    const idle = before.find((j) => j.name === "idle")!;
    expect(idle.running).toBe(false);
    expect(idle.nextRun !== null).toBe(true);
    expect(idle.nextRun!.getTime()).toBe(1000);

    await c.advance(1000); // both fire; busy stays running
    const during = s.list();
    expect(during.find((j) => j.name === "busy")!.running).toBe(true);
    g.release();
    await Promise.resolve();
    await Promise.resolve();
    const after = s.list();
    expect(after.find((j) => j.name === "busy")!.running).toBe(false);
  }
}

// ── server plugin: lifecycle binding ──────────────────────────────────────────

class PluginSuite extends Test({ name: "jobs: server plugin" }) {
  @Test.it("jobs() exposes a scheduler and the plugin contract")
  contract() {
    const p = jobs();
    expect(p.name).toBe("jobs");
    expect(p.scheduler !== undefined).toBe(true);
    expect(typeof p.onListen).toBe("function");
    expect(typeof p.onShutdown).toBe("function");
    // up-front jobs land on the scheduler before start
    const p2 = jobs({ jobs: [{ name: "seed", schedule: { every: 1000 }, handler: () => {} }] });
    expect(p2.scheduler.list().length).toBe(1);
    expect(p2.scheduler.list()[0].name).toBe("seed");
  }

  @Test.it("onListen starts and onShutdown stops via the server lifecycle")
  async lifecycle() {
    const c = new FakeClock();
    let booted = 0;
    let ticks = 0;
    const port = 39173;

    const cron = jobs(
      opts(c, {
        jobs: [
          // runOnStart proves onListen() -> scheduler.start() actually fired
          { name: "boot", schedule: { every: 1000 }, runOnStart: true, handler: () => void booted++ },
          { name: "tick", schedule: { every: 1000 }, handler: () => void ticks++ },
        ],
      }),
    );

    // Before listen: nothing armed, nothing fired.
    expect(cron.scheduler.list().find((j) => j.name === "tick")!.nextRun).toBeNull();
    expect(booted).toBe(0);

    const app = Application().plugin(cron);
    const server = await new Promise<{ drain: () => Promise<void> }>((resolve) => {
      const http = app.listen(port, () => resolve(http as unknown as { drain: () => Promise<void> }));
    });

    // onListen ran → scheduler started: runOnStart fired and the tick is armed.
    await Promise.resolve();
    expect(booted).toBe(1);
    const tickInfo = cron.scheduler.list().find((j) => j.name === "tick")!;
    expect(tickInfo.nextRun !== null).toBe(true);

    // Clock drives the interval while listening.
    await c.advance(1000);
    expect(ticks).toBe(1);
    await c.advance(2000);
    expect(ticks).toBe(3);

    // onShutdown ran during drain → scheduler stopped: no further fires.
    await server.drain();
    await c.advance(10000);
    expect(ticks).toBe(3);
    // stop() clears the armed timer.
    expect(cron.scheduler.list().find((j) => j.name === "tick")!.nextRun).toBeNull();
  }

  @Test.it("scheduler is mutable after registration (add + trigger)")
  async mutable() {
    const c = new FakeClock();
    let count = 0;
    const port = 39174;
    const cron = jobs(opts(c));
    const app = Application().plugin(cron);
    const server = await new Promise<{ drain: () => Promise<void> }>((resolve) => {
      const http = app.listen(port, () => resolve(http as unknown as { drain: () => Promise<void> }));
    });
    // add after listen → armed immediately because the scheduler is started
    cron.scheduler.add({ name: "late", schedule: { every: 1000 }, handler: () => void count++ });
    await c.advance(1000);
    expect(count).toBe(1);
    const r = await cron.scheduler.trigger("late");
    expect(count).toBe(2);
    expect(r).toBeUndefined();
    await server.drain();
  }
}

await TestApplication()
  .addTests(CronSuite)
  .addTests(IntervalSuite)
  .addTests(FleetSuite)
  .addTests(PluginSuite)
  .reporter(new ConsoleReporter())
  .run();
