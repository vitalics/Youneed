// Run: pnpm --filter @youneed/dom-provider-i18n test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createI18n } from "@youneed/i18n";
import { i18nProvider } from "../src/index.ts";

registerDOM();
const { Component, html, flushSync } = await import("@youneed/dom");

const translator = createI18n({
  resources: {
    en: { hello: "Hello {name}", bye: "Bye" },
    de: { hello: "Hallo {name}", bye: "Tschüss" },
  },
  locale: "en",
  fallbackLocale: "en",
});

// The composable `providers` slot — `Component(tag, { providers })`, the DOM
// analogue of a Controller's `{ guards, interceptors }`. `i18nProvider` adds a
// typed `this.i18n` and auto-wires reactivity.
@Component.define()
class ProvidedCard extends Component("provided-card", { providers: [i18nProvider(translator)] }) {
  render() {
    // `this.i18n` is typed from the provider's contribution: the key autocompletes
    // AND the params object is INFERRED from the template — `{ name }` is required
    // for "Hello {name}", while "bye" (no placeholders) takes no params at all.
    return html`<div>${this.i18n("hello", { name: "Ada" })} · ${this.i18n("bye")}</div>`;
  }
}

// ── type-level checks (never executed) ───────────────────────────────────────────
// Params are inferred per key from the template's `{placeholders}`.
() => {
  translator("hello", { name: "Ada" }); // ✓ required param present
  translator("bye"); // ✓ no placeholders → no params
  // @ts-expect-error — `name` is required for "Hello {name}"
  translator("hello");
  // @ts-expect-error — "bye" has no placeholders, so it takes no params
  translator("bye", { name: "x" });
  // @ts-expect-error — "name" is the only valid param key
  translator("hello", { nope: "x" });
  // @ts-expect-error — unknown translation key
  translator("missing");
};

const root = document.createElement("div");
document.body.appendChild(root);

class I18nDomSuite extends Test({ name: "i18n-dom" }) {
  @Test.afterEach() reset() {
    translator.setLocale("en");
  }

  @Test.it("providers: typed this.i18n renders in the template") render() {
    const el = document.createElement("provided-card");
    root.appendChild(el);
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("Hello Ada · Bye");
    el.remove();
  }

  @Test.it("providers: re-renders on locale change automatically") reactive() {
    const el = document.createElement("provided-card");
    root.appendChild(el);
    flushSync();
    translator.setLocale("de");
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("Hallo Ada · Tschüss");
    el.remove();
  }

  @Test.it("providers: stops reacting after disconnect") cleanup() {
    const el = document.createElement("provided-card");
    root.appendChild(el);
    flushSync();
    el.remove();
    translator.setLocale("de");
    flushSync(); // must not throw / touch the detached node
    expect(el.shadowRoot!.textContent).toBe("Hello Ada · Bye");
  }

  @Test.it("providers: exposes the typed translator as this.i18n") instance() {
    const el = document.createElement("provided-card") as HTMLElement & { i18n: typeof translator };
    root.appendChild(el);
    flushSync();
    expect(el.i18n).toBe(translator);
    expect(el.i18n("hello", { name: "Z" })).toBe("Hello Z");
    el.remove();
  }
}

await TestApplication().addTests(I18nDomSuite).reporter(new ConsoleReporter()).run();
