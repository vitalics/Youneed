// Explicit-resource-management (`using`) test for components.
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, Mount } = await import("../src/dom.ts");

let cleaned = false;

@Component.define()
class Disposable extends Component("disp-el") {
  onMount() {
    this.onCleanup(() => {
      cleaned = true;
    });
  }
  render() {
    return html`<p>alive</p>`;
  }
}

const root = document.createElement("div");
document.body.appendChild(root);

let el!: HTMLElement & { abortSignal: AbortSignal };
let aliveInside = false;
let attachedInside = false;
let abortedInside = true;
{
  // `using` => app[Symbol.dispose]() runs when the block exits
  using app = Mount(root, Disposable);
  el = app.element as HTMLElement & { abortSignal: AbortSignal };
  aliveInside = el.shadowRoot!.textContent!.includes("alive");
  attachedInside = root.contains(el);
  abortedInside = el.abortSignal.aborted;
}
const removedAfter = root.children.length === 0;

class DisposeTest extends Test({ name: "dom dispose (`using`)" }) {
  @Test.it("mounted + rendered inside the scope") mounted() {
    expect(aliveInside).toBeTruthy();
  }
  @Test.it("element attached to root inside the scope") attached() {
    expect(attachedInside).toBeTruthy();
  }
  @Test.it("signal live during the scope") signalLive() {
    expect(abortedInside).toBeFalsy();
  }
  @Test.it("element removed after the `using` scope") removed() {
    expect(removedAfter).toBeTruthy();
  }
  @Test.it("component disposed (signal aborted)") disposed() {
    expect(el.abortSignal.aborted).toBeTruthy();
  }
  @Test.it("onCleanup ran on dispose") cleanup() {
    expect(cleaned).toBeTruthy();
  }
}

await TestApplication().addTests(DisposeTest).reporter(new ConsoleReporter()).run();
