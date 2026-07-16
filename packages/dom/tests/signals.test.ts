// Reactive signals (Preact / Angular style) — standalone primitives + the
// component-bound `this.signal()` / `this.computed()` / `this.effect()` API.
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, Mount, flushSync, signal, computed, effect, batch } = await import(
  "../src/dom.ts"
);

// A component exercising the full host API: reactive state, a derived value,
// and an exposed event whose handler mutates a signal.
@Component.define()
class SigCounter extends Component("sig-counter") {
  count = this.signal(0);
  doubled = this.computed(() => this.count() * 2);
  // effect log, to prove host effects run + auto-dispose.
  log: number[] = [];
  onMount() {
    this.effect(() => {
      this.log.push(this.count());
    });
  }
  render() {
    // Read both styles: call form and `.value`.
    return html`<p>${this.count()}|${this.doubled.value}</p>`;
  }
}

const root = document.createElement("div");
document.body.appendChild(root);

class SignalsSuite extends Test({ name: "dom: signals" }) {
  // ── standalone primitives ────────────────────────────────────────────────
  @Test.it("signal reads via call and .value; writes via set/.value/update") rw() {
    const s = signal(1);
    expect(s()).toBe(1);
    expect(s.value).toBe(1);
    s.set(2);
    expect(s()).toBe(2);
    s.value = 3;
    expect(s.value).toBe(3);
    s.update((n) => n + 10);
    expect(s()).toBe(13);
    expect(s.peek()).toBe(13);
  }

  @Test.it("signal skips no-op writes (Object.is) and honors custom equals") equals() {
    let runs = 0;
    const s = signal(0);
    const stop = effect(() => {
      s();
      runs++;
    });
    expect(runs).toBe(1); // initial run
    s.set(0); // same value → no notify
    expect(runs).toBe(1);
    s.set(1);
    expect(runs).toBe(2);
    stop();

    // custom equals: treat objects equal by `id`
    const o = signal({ id: 1 }, { equals: (a, b) => a.id === b.id });
    let oRuns = 0;
    const stopO = effect(() => {
      o();
      oRuns++;
    });
    o.set({ id: 1 }); // equal by id → skipped
    expect(oRuns).toBe(1);
    o.set({ id: 2 });
    expect(oRuns).toBe(2);
    stopO();
  }

  @Test.it("computed derives and recomputes lazily on dependency change") computedDerives() {
    const a = signal(2);
    const b = signal(3);
    let computes = 0;
    const sum = computed(() => {
      computes++;
      return a() + b();
    });
    expect(sum()).toBe(5);
    expect(computes).toBe(1);
    expect(sum()).toBe(5); // memoized — no recompute
    expect(computes).toBe(1);
    a.set(10);
    expect(sum()).toBe(13); // recomputes on read after dep change
    expect(computes).toBe(2);
  }

  @Test.it("effect re-runs on change, runs cleanup, and stops on dispose") effectLifecycle() {
    const s = signal(0);
    const seen: number[] = [];
    let cleanups = 0;
    const stop = effect(() => {
      seen.push(s());
      return () => {
        cleanups++;
      };
    });
    s.set(1);
    s.set(2);
    expect(JSON.stringify(seen)).toBe("[0,1,2]");
    expect(cleanups).toBe(2); // cleanup ran before each re-run
    stop();
    expect(cleanups).toBe(3); // and once more on dispose
    s.set(3); // no longer subscribed
    expect(JSON.stringify(seen)).toBe("[0,1,2]");
  }

  @Test.it("batch coalesces multiple writes into one effect run") batching() {
    const a = signal(1);
    const b = signal(2);
    let runs = 0;
    const stop = effect(() => {
      a();
      b();
      runs++;
    });
    expect(runs).toBe(1);
    batch(() => {
      a.set(10);
      b.set(20);
    });
    expect(runs).toBe(2); // one run for both writes, not two
    stop();
  }

  // ── component integration ────────────────────────────────────────────────
  @Test.it("this.signal triggers a re-render; this.computed derives") hostReactive() {
    const { element } = Mount(root, SigCounter);
    flushSync();
    const el = element as SigCounter;
    const text = () => el.shadowRoot!.querySelector("p")!.textContent;
    expect(text()).toBe("0|0");

    el.count.set(2);
    flushSync();
    expect(text()).toBe("2|4");

    el.count.update((n) => n + 1);
    flushSync();
    expect(text()).toBe("3|6");

    el.count.value++;
    flushSync();
    expect(text()).toBe("4|8");
    element.remove();
  }

  @Test.it("host effect runs on mount and on each signal change") hostEffect() {
    const { element } = Mount(root, SigCounter);
    flushSync();
    const el = element as SigCounter;
    el.count.set(5);
    flushSync();
    el.count.set(6);
    flushSync();
    // mount(0), then 5, then 6
    expect(JSON.stringify(el.log)).toBe("[0,5,6]");
    element.remove();
  }

  @Test.it("host signals stop re-rendering after disconnect") disposed() {
    const { element } = Mount(root, SigCounter);
    flushSync();
    const el = element as SigCounter;
    element.remove(); // disconnect → cleanups stop the bridge effect
    const before = JSON.stringify(el.log);
    el.count.set(99); // must not push to the (stopped) effect
    expect(JSON.stringify(el.log)).toBe(before);
  }

  @Test.it("abortSignal is exposed and aborts on disconnect") abortSignal() {
    const { element } = Mount(root, SigCounter);
    flushSync();
    const el = element as SigCounter & { abortSignal: AbortSignal };
    expect(el.abortSignal.aborted).toBeFalsy();
    element.remove();
    expect(el.abortSignal.aborted).toBeTruthy();
  }
}

await TestApplication().addTests(SignalsSuite).reporter(new ConsoleReporter()).run();
