// Run: pnpm --filter @youneed/dom-provider-zustand test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { DevtoolsContext } from "@youneed/devtools";
import type { StoreApi } from "../src/index.ts";

registerDOM();
const { installDevtools } = await import("@youneed/devtools");
const { zustandPlugin, zustandPanel, zustandChanges, zustandStores, clearZustandChanges } =
  await import("../src/devtools.ts");

// Minimal vanilla store (Zustand-compatible).
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

interface CartState {
  count: number;
  total: number;
}
const cart = createStore<CartState>(() => ({ count: 0, total: 0 }));

// CAPTURE: register the store plugin. DISPLAY: mount zustandPanel() separately.
installDevtools({ plugins: [zustandPlugin(cart, { name: "cart" })] });

const stubCtx = {} as DevtoolsContext;
const callCleanup = (c: void | (() => void)): void => void (typeof c === "function" && c());

const root = document.createElement("div");
document.body.appendChild(root);

class ZustandDevtoolsSuite extends Test({ name: "dom-provider-zustand/devtools" }) {
  @Test.beforeEach() reset() {
    clearZustandChanges();
    cart.setState({ count: 0, total: 0 }, true);
    clearZustandChanges(); // drop the reset's own change
  }

  @Test.it("zustandPlugin() is a capture DevtoolsPlugin; store registered") plugin() {
    const plugin = zustandPlugin(cart, { name: "x" });
    expect(plugin.name).toBe("zustand:x");
    expect(typeof plugin.install).toBe("function");
    // the cart plugin installed at top registered the store
    expect(zustandStores().some((s) => s.name === "cart")).toBeTruthy();
  }

  @Test.it("zustandPanel() is a display DevtoolsPanel") panel() {
    const panel = zustandPanel();
    expect(panel.id).toBe("zustand");
    expect(typeof panel.render).toBe("function");
  }

  @Test.it("records store changes under the registered name") capture() {
    cart.setState({ count: 2 });
    const last = zustandChanges().at(-1)!;
    expect(last.store).toBe("cart");
    expect((last.state as CartState).count).toBe(2);
    expect((last.prev as CartState).count).toBe(0);
  }

  @Test.it("panel shows current state + a change log") render() {
    const panel = zustandPanel();
    const container = document.createElement("div");
    const cleanup = panel.render(container, stubCtx);
    cart.setState({ count: 3, total: 30 });
    const text = container.textContent ?? "";
    expect(text.includes("cart")).toBeTruthy();
    expect(text.includes('"count": 3')).toBeTruthy(); // current state pretty-printed
    callCleanup(cleanup);
  }

  @Test.it("restore (time-travel) sets the store back to a snapshot") restore() {
    const panel = zustandPanel();
    const container = document.createElement("div");
    const cleanup = panel.render(container, stubCtx);
    cart.setState({ count: 1 });
    cart.setState({ count: 2 });
    // newest first → the first restore button is the latest change (count:2);
    // the second restores to count:1.
    const restores = [...container.querySelectorAll("button")].filter((b) => b.textContent === "restore");
    expect(restores.length).toBe(2);
    (restores[1] as HTMLButtonElement).click(); // restore the count:1 snapshot
    expect(cart.getState().count).toBe(1);
    callCleanup(cleanup);
  }

  @Test.it("clearZustandChanges empties the log") clear() {
    cart.setState({ count: 9 });
    expect(zustandChanges().length > 0).toBeTruthy();
    clearZustandChanges();
    expect(zustandChanges().length).toBe(0);
  }
}

await TestApplication().addTests(ZustandDevtoolsSuite).reporter(new ConsoleReporter()).run();
