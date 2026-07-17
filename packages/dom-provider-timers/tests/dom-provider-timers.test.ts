// Run: pnpm --filter @youneed/dom-provider-timers test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { timersProvider, createTimers, type TimersApi } from "../src/index.ts";

registerDOM();
const { Component, html, flushSync } = await import("@youneed/dom");

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

@Component.define()
class TimedCard extends Component("timed-card", { providers: [timersProvider()] }) {
  render() {
    return html`<p>timed</p>`;
  }
}

// ── type-level checks (never executed) ────────────────────────────────────────
() => {
  const el = document.createElement("timed-card") as InstanceType<typeof TimedCard>;
  const h = el.timers.setTimeout(() => {}, 10); // ✓ namespaced under this.timers
  h.cancel(); // ✓
  const pending: boolean = h.pending; // ✓
  void pending;
  const p: Promise<void> = el.timers.delay(5); // ✓
  void p;
  const t: Promise<number> = el.timers.postTask(() => 42, { priority: "background" }); // ✓ result typed
  void t;
  const d = el.timers.debounce((n: number) => void n, 100);
  d(1); // ✓ args typed
  d.cancel(); // ✓
  const disposables: Disposable[] = [el.timers, h, d]; // ✓ everything is `using`-able
  void disposables;
  // @ts-expect-error — debounced fn keeps the callback's signature
  d("nope");
  // @ts-expect-error — not a Scheduler priority
  el.timers.postTask(() => {}, { priority: "asap" });
};

const root = document.createElement("div");
document.body.appendChild(root);

const mount = (): InstanceType<typeof TimedCard> => {
  const el = document.createElement("timed-card") as InstanceType<typeof TimedCard>;
  root.appendChild(el);
  flushSync();
  return el;
};

class TimersSuite extends Test({ name: "dom-provider-timers" }) {
  @Test.it("contributes this.timers (namespaced, not flat)") namespaced() {
    const el = mount();
    expect(typeof el.timers.setTimeout).toBe("function");
    expect((el as unknown as { setTimeout2?: unknown }).setTimeout2).toBeUndefined();
    el.remove();
  }

  @Test.it("setTimeout fires once; pending flips; cancel prevents") async timeout() {
    const el = mount();
    let fired = 0;
    const h = el.timers.setTimeout(() => fired++, 5);
    expect(h.pending).toBe(true);
    await sleep(20);
    expect(fired).toBe(1);
    expect(h.pending).toBe(false);
    expect(el.timers.active).toBe(0); // fired timers leave the registry

    let cancelled = 0;
    const c = el.timers.setTimeout(() => cancelled++, 5);
    c.cancel();
    await sleep(20);
    expect(cancelled).toBe(0);
    expect(c.pending).toBe(false);
    el.remove();
  }

  @Test.it("setInterval repeats until cancel") async interval() {
    const el = mount();
    let ticks = 0;
    const h = el.timers.setInterval(() => ticks++, 5);
    await sleep(30);
    h.cancel();
    const at = ticks;
    expect(ticks >= 2).toBeTruthy();
    await sleep(20);
    expect(ticks).toBe(at); // no more after cancel
    el.remove();
  }

  @Test.it("disconnect cancels everything scheduled") async autoCleanup() {
    const el = mount();
    let fired = 0;
    el.timers.setTimeout(() => fired++, 10);
    el.timers.setInterval(() => fired++, 10);
    expect(el.timers.active).toBe(2);
    el.remove();
    flushSync();
    await sleep(40);
    expect(fired).toBe(0);
    expect(el.timers.active).toBe(0);
  }

  @Test.it("delay resolves after ms; rejects AbortError on disconnect") async delay() {
    const el = mount();
    await el.timers.delay(5); // resolves

    const el2 = mount();
    const rejected = el2.timers.delay(60).then(
      () => "resolved",
      (err: unknown) => (err instanceof DOMException ? err.name : "other"),
    );
    el2.remove();
    flushSync();
    expect(await rejected).toBe("AbortError");
    el.remove();
  }

  @Test.it("postTask runs the task and resolves its result (fallback path)") async postTask() {
    const el = mount();
    const result = await el.timers.postTask(() => 6 * 7, { delay: 5 });
    expect(result).toBe(42);
    el.remove();
  }

  @Test.it("postTask rejects when aborted before running") async postTaskAbort() {
    const el = mount();
    const ctl = new AbortController();
    const p = el.timers.postTask(() => "ran", { delay: 50, signal: ctl.signal }).then(
      () => "resolved",
      () => "rejected",
    );
    ctl.abort();
    expect(await p).toBe("rejected");
    el.remove();
  }

  @Test.it("yield hops the task queue") async yields() {
    const el = mount();
    let after = false;
    queueMicrotask(() => (after = true));
    await el.timers.yield();
    expect(after).toBe(true); // microtasks drained before we resumed
    el.remove();
  }

  @Test.it("debounce coalesces bursts to one trailing call") async debounce() {
    const el = mount();
    const seen: number[] = [];
    const d = el.timers.debounce((n: number) => seen.push(n), 10);
    d(1);
    d(2);
    d(3);
    await sleep(30);
    expect(seen).toEqual([3]);
    el.remove();
  }

  @Test.it("throttle: leading call now, trailing call per window") async throttle() {
    const el = mount();
    const seen: number[] = [];
    const t = el.timers.throttle((n: number) => seen.push(n), 20);
    t(1); // leading — immediate
    t(2);
    t(3); // trailing — latest args win
    expect(seen).toEqual([1]);
    await sleep(40);
    expect(seen).toEqual([1, 3]);
    el.remove();
  }

  @Test.it("clearAll cancels every pending timer") async clearAll() {
    const el = mount();
    let fired = 0;
    el.timers.setTimeout(() => fired++, 10);
    el.timers.setInterval(() => fired++, 10);
    el.timers.clearAll();
    expect(el.timers.active).toBe(0);
    await sleep(30);
    expect(fired).toBe(0);
    el.remove();
  }

  @Test.it("standalone createTimers honours its lifetime signal") async standalone() {
    const ctl = new AbortController();
    const timers: TimersApi = createTimers({ signal: ctl.signal });
    let fired = 0;
    timers.setInterval(() => fired++, 5);
    await sleep(15);
    ctl.abort();
    const at = fired;
    expect(fired >= 1).toBeTruthy();
    await sleep(20);
    expect(fired).toBe(at);
    // scheduling after abort is inert
    const h = timers.setTimeout(() => fired++, 1);
    expect(h.pending).toBe(false);
    await sleep(10);
    expect(fired).toBe(at);
  }

  @Test.it("Symbol.dispose: `using` cancels handles, wrappers and registries") async dispose() {
    const el = mount();
    let fired = 0;
    {
      using h = el.timers.setTimeout(() => fired++, 5);
      expect(h.pending).toBe(true);
    } // end of scope → cancel()
    await sleep(20);
    expect(fired).toBe(0);

    let debounced = 0;
    {
      using d = el.timers.debounce(() => debounced++, 5);
      d();
    } // pending trailing call dropped
    await sleep(20);
    expect(debounced).toBe(0);

    let ticks = 0;
    {
      using timers = createTimers();
      timers.setInterval(() => ticks++, 5);
      await sleep(15);
      expect(ticks >= 1).toBeTruthy();
    } // end of scope → clearAll()
    const at = ticks;
    await sleep(20);
    expect(ticks).toBe(at);
    el.remove();
  }

  @Test.it("disposing the COMPONENT (`using el = …`) stops its timers") async hostDispose() {
    let fired = 0;
    const el = mount();
    {
      using scoped = el; // component base implements Symbol.dispose (teardown = disconnect)
      scoped.timers.setTimeout(() => fired++, 10);
      scoped.timers.setInterval(() => fired++, 10);
      expect(scoped.timers.active).toBe(2);
    } // ← el[Symbol.dispose](): runs onCleanup teardowns + aborts host.abortSignal
    expect(el.timers.active).toBe(0);
    await sleep(40);
    expect(fired).toBe(0);
    el.remove(); // disconnect after dispose — idempotent, must not throw
  }

  @Test.it("requestAnimationFrame / requestIdleCallback fall back and fire") async frames() {
    const el = mount();
    let frames = 0;
    let idles = 0;
    el.timers.requestAnimationFrame(() => frames++);
    el.timers.requestIdleCallback(() => idles++);
    await sleep(60);
    expect(frames).toBe(1);
    expect(idles).toBe(1);
    el.remove();
  }
}

await TestApplication().addTests(TimersSuite).reporter(new ConsoleReporter()).run();
