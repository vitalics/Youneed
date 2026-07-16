// Run: pnpm --filter @youneed/dom-provider-feature-flags test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createFlags, fromSnapshot } from "@youneed/feature-flags";
import { featureFlagsProvider, hydrateFlags } from "../src/index.ts";

registerDOM();
const { Component, html, when, flushSync } = await import("@youneed/dom");

const engine = createFlags([
  { key: "new-ui", defaultValue: false },
  {
    key: "checkout",
    defaultValue: "control",
    variants: { control: "control", fast: "fast" },
    rules: [{ attributes: { plan: "pro" }, variant: "fast" }],
  },
]);

// The composable `providers` slot — `Component(tag, { providers })`, the DOM
// analogue of a Controller's `{ guards, interceptors }`. `featureFlagsProvider`
// adds a scoped `this.flags` and auto-wires reactivity.
@Component.define()
class FlaggedCard extends Component("flagged-card", {
  providers: [featureFlagsProvider(engine, { context: () => ({ attributes: { plan: "pro" } }) })],
}) {
  render() {
    return html`<div>${when(this.flags.isEnabled("new-ui"), () => html`<span>new</span>`, () => html`<span>old</span>`)} · ${this.flags.variant("checkout")}</div>`;
  }
}

const root = document.createElement("div");
document.body.appendChild(root);

class FlagsDomSuite extends Test({ name: "feature-flags-dom" }) {
  @Test.afterEach() reset() {
    engine.override("new-ui", undefined);
  }

  @Test.it("providers: scoped this.flags renders in the template") render() {
    const el = document.createElement("flagged-card");
    root.appendChild(el);
    flushSync();
    // new-ui defaults false → "old"; checkout resolves "fast" for plan=pro
    expect(el.shadowRoot!.textContent).toBe("old · fast");
    el.remove();
  }

  @Test.it("providers: re-renders on flag change automatically") reactive() {
    const el = document.createElement("flagged-card");
    root.appendChild(el);
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("old · fast");
    engine.override("new-ui", true); // fires onChange → requestUpdate
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("new · fast");
    el.remove();
  }

  @Test.it("providers: stops reacting after disconnect") cleanup() {
    const el = document.createElement("flagged-card");
    root.appendChild(el);
    flushSync();
    el.remove();
    engine.override("new-ui", true);
    flushSync(); // must not throw / touch the detached node
    expect(el.shadowRoot!.textContent).toBe("old · fast");
  }

  @Test.it("providers: exposes a scoped this.flags API") instance() {
    const el = document.createElement("flagged-card") as HTMLElement & {
      flags: { isEnabled(k: string): boolean; variant(k: string): string | undefined; value(k: string, f?: unknown): unknown };
    };
    root.appendChild(el);
    flushSync();
    expect(el.flags.isEnabled("new-ui")).toBe(false);
    expect(el.flags.variant("checkout")).toBe("fast");
    expect(el.flags.value("missing", "fallback")).toBe("fallback");
    el.remove();
  }

  @Test.it("hydrateFlags: rebuilds a read-only engine from an SSR snapshot") hydrate() {
    // Server evaluates all flags, serialises, client rehydrates from window.__FLAGS__.
    const snapshot = engine.all({ attributes: { plan: "pro" } });
    (globalThis as Record<string, unknown>).__FLAGS__ = JSON.parse(JSON.stringify(snapshot));
    const hydrated = hydrateFlags();
    expect(hydrated.variant("checkout")).toBe("fast");
    expect(hydrated.isEnabled("new-ui")).toBe(false);
    // and the direct-record form matches fromSnapshot
    const direct = fromSnapshot(snapshot);
    expect(hydrateFlags(snapshot).variant("checkout")).toBe(direct.variant("checkout"));
    delete (globalThis as Record<string, unknown>).__FLAGS__;
  }
}

await TestApplication().addTests(FlagsDomSuite).reporter(new ConsoleReporter()).run();
