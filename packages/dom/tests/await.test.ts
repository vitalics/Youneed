// Await directive (flow.await): render a promise's pending → then / catch states
// inline, patching the slot on settle WITHOUT a host re-render (so an inline
// promise isn't recreated in a loop).
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, flow, Await, task } = await import("../src/dom.ts");

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

@Component.define()
class AwaitHost extends Component("await-host") {
  @Component.prop() p: Promise<string> | string = "";
  @Component.prop() tag = "x"; // unrelated prop, to force a same-input re-render
  renders = 0;
  render() {
    this.renders++;
    return html`<div>
      ${flow.await(this.p, {
        pending: () => html`<span class="s">pending</span>`,
        then: (v) => html`<span class="s">value:${v}:${this.tag}</span>`,
        catch: (e) => html`<span class="s">error:${String(e)}</span>`,
      })}
    </div>`;
  }
}

type Host = HTMLElement & { p: Promise<string> | string; tag: string; renders: number; flushSync(): void };
const root = document.createElement("div");
document.body.appendChild(root);
const txt = (el: Host) => el.shadowRoot!.querySelector(".s")?.textContent ?? "";

// ── resolve: pending → then, with NO extra render (no loop) ─────────────────────
const d1 = deferred<string>();
const h1 = document.createElement("await-host") as Host;
h1.p = d1.promise;
root.appendChild(h1);
h1.flushSync();
const pendingShown = txt(h1) === "pending";
const rendersAtMount = h1.renders;
d1.resolve("ok");
await tick();
const valueShown = txt(h1) === "value:ok:x";
const noReRenderOnSettle = h1.renders === rendersAtMount; // settle patched the slot directly

// ── reject: pending → catch ─────────────────────────────────────────────────
const d2 = deferred<string>();
const h2 = document.createElement("await-host") as Host;
h2.p = d2.promise;
root.appendChild(h2);
h2.flushSync();
d2.reject("boom");
await tick();
const errorShown = txt(h2) === "error:boom";

// ── same-input re-render re-runs the current branch with latest handlers ────────
h1.tag = "y"; // unrelated prop change → full re-render, same promise identity
h1.flushSync();
const rerenderedWithLatest = txt(h1) === "value:ok:y"; // then() ran again, patched the hole
const reSubscribedNothing = h1.renders === rendersAtMount + 1; // exactly one extra render (ours)

// ── changing the awaited value re-subscribes (pending → new value) ──────────────
const d3 = deferred<string>();
h1.p = d3.promise;
h1.flushSync();
const backToPending = txt(h1) === "pending";
d3.resolve("again");
await tick();
const newValueShown = txt(h1) === "value:again:y";

// ── a non-promise value resolves immediately ────────────────────────────────
const h4 = document.createElement("await-host") as Host;
h4.p = "sync";
root.appendChild(h4);
h4.flushSync();
await tick();
const syncResolved = txt(h4) === "value:sync:x";

// ── late settle after unmount is ignored (no throw, no DOM touch) ───────────────
const d5 = deferred<string>();
const h5 = document.createElement("await-host") as Host;
h5.p = d5.promise;
root.appendChild(h5);
h5.flushSync();
h5.remove(); // unmount → onCleanup invalidates the subscription
d5.resolve("late");
await tick();
const lateSettleSafe = true; // reaching here without a throw is the assertion

// ── awaiting a Task / task.run(): runtime backstop warns about the loop ─────────
// A real `task.run()` promise is brand-tagged. We drive the task with a no-op host
// (its requestUpdate does nothing) so this test can't loop, and store the run
// promise so the awaiting component re-renders against a stable identity.
const noopHost = { requestUpdate() {}, onCleanup() {} } as never;
const realTask = task(noopHost, async () => "done");
const runPromise = realTask.run(); // genuine branded TaskRun, no loop (host is inert)

@Component.define()
class TaskHost extends Component("task-host") {
  @Component.prop() p: Promise<string | undefined> = runPromise;
  @Component.prop() tag = "x"; // unrelated prop, to force a second render
  render() {
    return html`<div>
      ${flow.await(this.p, {
        pending: () => html`<span class="s">pending</span>`,
        then: (v) => html`<span class="s">v:${v}</span>`,
      })}
    </div>`;
  }
}

const errs: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => void errs.push(String(a[0]));
let taskValueShown = false;
let warnedOnce = false;
try {
  const ht = document.createElement("task-host") as Host & { tag: string };
  root.appendChild(ht);
  ht.flushSync();
  ht.tag = "y"; // second render — the warning must NOT repeat
  ht.flushSync();
  await tick();
  taskValueShown = txt(ht) === "v:done"; // still renders the value despite the warning
  warnedOnce = errs.filter((m) => m.includes("infinite update loop")).length === 1;
} finally {
  console.error = origError;
}
const warnedAboutLoop = errs.some((m) => m.includes("infinite update loop"));

// Type-level rejection (never executed — asserts the compiler refuses a Task).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _typeChecks() {
  const t = task(noopHost, async () => 1);
  // @ts-expect-error flow.await must reject a Task object
  flow.await(t, { then: () => "" });
  // @ts-expect-error flow.await must reject a task.run() promise
  flow.await(t.run(), { then: () => "" });
  flow.await(Promise.resolve(1), { then: (n) => `${n}` }); // a plain promise is fine
}

class AwaitTest extends Test({ name: "flow.await directive" }) {
  @Test.it("flow.await === Await") alias() {
    expect(flow.await === Await).toBeTruthy();
  }
  @Test.it("shows pending() before settle") pending() {
    expect(pendingShown).toBeTruthy();
  }
  @Test.it("shows then(value) on resolve") resolved() {
    expect(valueShown).toBeTruthy();
  }
  @Test.it("settle patches the slot without a host re-render") noLoop() {
    expect(noReRenderOnSettle).toBeTruthy();
  }
  @Test.it("shows catch(error) on reject") rejected() {
    expect(errorShown).toBeTruthy();
  }
  @Test.it("same-input re-render re-runs the branch with latest handlers") rerender() {
    expect(rerenderedWithLatest).toBeTruthy();
  }
  @Test.it("same-input re-render does not re-subscribe") oneRender() {
    expect(reSubscribedNothing).toBeTruthy();
  }
  @Test.it("changing the awaited value re-subscribes (back to pending)") resub() {
    expect(backToPending).toBeTruthy();
  }
  @Test.it("new awaited value resolves") newValue() {
    expect(newValueShown).toBeTruthy();
  }
  @Test.it("a non-promise value resolves immediately") syncVal() {
    expect(syncResolved).toBeTruthy();
  }
  @Test.it("late settle after unmount is ignored") lateSettle() {
    expect(lateSettleSafe).toBeTruthy();
  }
  @Test.it("awaiting a task.run() warns about the infinite loop") taskWarns() {
    expect(warnedAboutLoop).toBeTruthy();
  }
  @Test.it("the task loop warning is emitted only once per slot") taskWarnsOnce() {
    expect(warnedOnce).toBeTruthy();
  }
  @Test.it("still renders the awaited task value (degraded)") taskRenders() {
    expect(taskValueShown).toBeTruthy();
  }
}

await TestApplication().addTests(AwaitTest).reporter(new ConsoleReporter()).run();
