// Exposed component events (@Component.event on a field = Angular @Output).
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { EventEmitter } from "../src/dom.ts";

registerDOM();
const { Component, html, Mount, flushSync, getExposedEvents } = await import("../src/dom.ts");

@Component.define()
class AppButton extends Component("app-button") {
  // Exposed events: a parent binds `@onAdd` / `@onPick`.
  @Component.event("onAdd") add!: EventEmitter<string>;
  @Component.event() onPick!: EventEmitter<number>; // name defaults to the field name
  @Component.event({ name: "onSave" }) save!: EventEmitter<string>; // opts form
  @Component.event({ exposed: false }) ping!: EventEmitter<number>; // emits, but private (not exposed)

  clicks = 0;
  @Component.event() handleClick(): void {
    this.clicks++; // method form: auto-bound to the instance
  }
  render() {
    return html`<button @click=${this.handleClick}>b</button>`;
  }
}

@Component.define()
class AppParent extends Component("app-parent") {
  last = "";
  render() {
    return html`<app-button @onAdd=${(e: CustomEvent<string>) => (this.last = e.detail)}></app-button>`;
  }
}

const root = document.createElement("div");
document.body.appendChild(root);

class EventsSuite extends Test({ name: "dom: exposed events" }) {
  @Test.beforeAll() warmUp() {
    // Events register on construction (addInitializer) — build one of each first.
    for (const C of [AppButton, AppParent]) {
      const { element } = Mount(root, C);
      flushSync();
      element.remove();
    }
  }

  @Test.it("registers the exposed event names (introspectable)") exposed() {
    const events = getExposedEvents(AppButton);
    expect(events.includes("onAdd")).toBeTruthy();
    expect(events.includes("onPick")).toBeTruthy();
    expect(events.includes("onSave")).toBeTruthy(); // opts { name }
    expect(events.includes("ping")).toBeFalsy(); // opts { exposed: false } → not in the surface
  }

  @Test.it("a non-exposed emitter still fires (just hidden from the surface)") notExposed() {
    const { element } = Mount(root, AppButton);
    flushSync();
    const el = element as AppButton & { ping: EventEmitter<number> };
    let got: number | undefined;
    el.addEventListener("ping", (e) => (got = (e as CustomEvent<number>).detail));
    el.ping(42);
    expect(got).toBe(42);
    element.remove();
  }

  @Test.it("the emitter field dispatches a bubbling/composed CustomEvent") emits() {
    const { element } = Mount(root, AppButton);
    flushSync();
    const el = element as AppButton & { add: EventEmitter<string> };
    let got: string | undefined;
    el.addEventListener("onAdd", (e) => (got = (e as CustomEvent<string>).detail));
    el.add("hello"); // call the emitter
    expect(got).toBe("hello");
    el.add.emit("again"); // .emit() alias
    expect(got).toBe("again");
    element.remove();
  }

  @Test.it("a parent binds the event with @onAdd and receives the detail") parentBinding() {
    const { element } = Mount(root, AppParent);
    flushSync();
    const parent = element as AppParent;
    const child = parent.shadowRoot!.querySelector("app-button") as AppButton & { add: EventEmitter<string> };
    child.add("from-child");
    expect(parent.last).toBe("from-child");
    element.remove();
  }

  @Test.it("the method form is still auto-bound to the instance") methodBind() {
    const { element } = Mount(root, AppButton);
    flushSync();
    const el = element as AppButton & { handleClick: () => void };
    const detached = el.handleClick; // pulled off the instance
    detached(); // would lose `this` if not bound
    expect(el.clicks).toBe(1);
    element.remove();
  }
}

await TestApplication().addTests(EventsSuite).reporter(new ConsoleReporter()).run();
