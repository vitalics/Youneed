// Devtools capture-layer test: drive the global hook with synthetic component
// events and assert on the recorded store. happy-dom is registered first because
// core.ts imports @youneed/dom (which touches DOM globals at load).
// Run: pnpm --filter @youneed/devtools test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { installDevtools, components, inspect, clearDevtools, subscribe } = await import("../src/core.ts");

interface Hook {
  send(e: Record<string, unknown>): void;
}
installDevtools();
const hook = (globalThis as { __DOM_DEVTOOLS__?: Hook }).__DOM_DEVTOOLS__!;

clearDevtools();
let notified = 0;
const unsub = subscribe(() => notified++);

hook.send({ kind: "mount", id: 1, tag: "x-root", time: 0, props: { a: 1 }, exposed: ["onAdd", "onPick"] });
hook.send({ kind: "update", id: 1, tag: "x-root", time: 1, props: { a: 2 }, version: 1 });
hook.send({ kind: "emit", id: 1, tag: "x-root", time: 2, emit: { type: "ping", detail: 5 } });
hook.send({ kind: "mount", id: 2, tag: "x-child", time: 3, parentId: 1, props: {} });
hook.send({ kind: "unmount", id: 1, tag: "x-root", time: 4 });

const list = components();
const root = inspect(1)!;
const child = inspect(2)!;
const sends = notified;
unsub();

class DevtoolsCaptureTest extends Test({ name: "devtools capture" }) {
  @Test.it("records each mounted component") records() {
    expect(list.length).toBe(2);
  }
  @Test.it("captures the tag + latest props (update applied)") props() {
    expect(root.tag).toBe("x-root");
    expect((root.props as { a: number }).a).toBe(2);
  }
  @Test.it("keeps state history (mount + update snapshots)") history() {
    expect(root.history.length).toBeGreaterThan(1);
  }
  @Test.it("records emitted events") events() {
    expect(root.events.some((e) => e.type === "ping" && e.detail === 5)).toBeTruthy();
  }
  @Test.it("captures exposed events (@Component.event surface)") exposed() {
    expect(root.exposed.join(",")).toBe("onAdd,onPick");
    expect(child.exposed.length).toBe(0); // mounted without an `exposed` field → empty
  }
  @Test.it("builds the parent tree (parentId)") tree() {
    expect(child.parentId).toBe(1);
  }
  @Test.it("marks unmounted components (alive=false)") unmount() {
    expect(root.alive).toBeFalsy();
    expect(child.alive).toBeTruthy();
  }
  @Test.it("inspect() is undefined for an unknown id") unknown() {
    expect(inspect(999)).toBeUndefined();
  }
  @Test.it("subscribe() fires once per send") notify() {
    expect(sends).toBe(5);
  }
  @Test.it("clearDevtools() empties the store") clear() {
    clearDevtools();
    expect(components().length).toBe(0);
  }
}

await TestApplication().addTests(DevtoolsCaptureTest).reporter(new ConsoleReporter()).run();
