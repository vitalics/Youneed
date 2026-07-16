// Run: pnpm --filter @youneed/dom-provider-zustand test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { zustandProvider, type StoreApi } from "../src/index.ts";

registerDOM();
const { Component, html, flushSync } = await import("@youneed/dom");

// A minimal vanilla store with Zustand's semantics (initializer + set/get) — a
// real `createStore` from `zustand/vanilla` is structurally identical.
function createStore<T>(init: (set: StoreApi<T>["setState"], get: () => T) => T): StoreApi<T> {
  let state: T;
  const subs = new Set<(s: T, p: T) => void>();
  const setState: StoreApi<T>["setState"] = (partial, replace) => {
    const part = typeof partial === "function" ? partial(state) : partial;
    const prev = state;
    state = replace ? (part as T) : { ...state, ...part };
    for (const fn of [...subs]) fn(state, prev);
  };
  const getState = (): T => state;
  state = init(setState, getState);
  return {
    getState,
    setState,
    subscribe: (fn) => {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
}

interface CounterState {
  count: number;
  other: string;
  inc: () => void;
}

const store = createStore<CounterState>((set) => ({
  count: 0,
  other: "a",
  inc: () => set((s) => ({ count: s.count + 1 })),
}));

@Component.define()
class ReactiveCard extends Component("zu-reactive", { providers: [zustandProvider(store)] }) {
  render() {
    return html`<span>${this.store.state.count}:${this.store.state.other}</span>`;
  }
}

@Component.define()
class SelectiveCard extends Component("zu-selective", {
  providers: [zustandProvider(store, { selector: (s) => s.count })],
}) {
  renders = 0;
  render() {
    this.renders++;
    return html`<span>${this.store.state.count}:${this.store.state.other}</span>`;
  }
}

// ── type-level checks (never executed) ───────────────────────────────────────────
() => {
  const el = document.createElement("zu-reactive") as InstanceType<typeof ReactiveCard>;
  const n: number = el.store.state.count; // ✓ typed state
  el.store.set({ count: 1 }); // ✓
  el.store.set((s) => ({ count: s.count + 1 })); // ✓ updater
  const c: number = el.store.select((s) => s.count); // ✓ selector
  void n;
  void c;
  // @ts-expect-error — `count` is a number
  el.store.set({ count: "x" });
  // @ts-expect-error — not part of the bound store API
  el.store.nope();
};

const root = document.createElement("div");
document.body.appendChild(root);

class ZustandSuite extends Test({ name: "dom-provider-zustand" }) {
  @Test.afterEach() reset() {
    store.setState({ count: 0, other: "a" });
  }

  @Test.it("this.store reads the current state") read() {
    const el = document.createElement("zu-reactive");
    root.appendChild(el);
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("0:a");
    el.remove();
  }

  @Test.it("re-renders when the store changes") reactive() {
    const el = document.createElement("zu-reactive");
    root.appendChild(el);
    flushSync();
    store.setState({ count: 5 });
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("5:a");
    el.remove();
  }

  @Test.it("this.store.set updates the store + re-renders") set() {
    const el = document.createElement("zu-reactive") as HTMLElement & {
      store: { set(p: Partial<CounterState>): void };
    };
    root.appendChild(el);
    flushSync();
    el.store.set({ other: "z" });
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("0:z");
    el.remove();
  }

  @Test.it("store actions work through this.store.state") action() {
    const el = document.createElement("zu-reactive") as HTMLElement & {
      store: { state: CounterState };
    };
    root.appendChild(el);
    flushSync();
    el.store.state.inc();
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("1:a");
    el.remove();
  }

  @Test.it("selector gates re-renders to the selected slice") selector() {
    const el = document.createElement("zu-selective") as HTMLElement & { renders: number };
    root.appendChild(el);
    flushSync();
    expect(el.renders).toBe(1);

    store.setState({ other: "b" }); // not selected → no re-render
    flushSync();
    expect(el.renders).toBe(1);
    expect(el.shadowRoot!.textContent).toBe("0:a"); // stale `other`, as expected

    store.setState({ count: 7 }); // selected → re-render
    flushSync();
    expect(el.renders).toBe(2);
    expect(el.shadowRoot!.textContent).toBe("7:b"); // now reflects both
    el.remove();
  }

  @Test.it("unsubscribes from the store on disconnect") cleanup() {
    const el = document.createElement("zu-reactive");
    root.appendChild(el);
    flushSync();
    el.remove();
    store.setState({ count: 99 });
    flushSync(); // must not throw / touch the detached node
    expect(el.shadowRoot!.textContent).toBe("0:a");
  }
}

await TestApplication().addTests(ZustandSuite).reporter(new ConsoleReporter()).run();
