// Run: pnpm --filter @youneed/dom-provider-color-scheme test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { colorSchemeProvider, createColorSchemeStore, resolveColorScheme } from "../src/index.ts";

registerDOM();
const { Component, html, flushSync } = await import("@youneed/dom");

// Per-instance color scheme (literal seed).
@Component.define()
class LocalCard extends Component("local-card", { providers: [colorSchemeProvider("light")] }) {
  render() {
    return html`<p>${this.colorScheme.value}</p>`;
  }
}

// Shared store: app-wide theming.
const theme = createColorSchemeStore("light");
@Component.define()
class ThemedA extends Component("themed-a", { providers: [colorSchemeProvider(theme)] }) {
  render() {
    return html`<p>${this.colorScheme.value}</p>`;
  }
}
@Component.define()
class ThemedB extends Component("themed-b", { providers: [colorSchemeProvider(theme)] }) {
  render() {
    return html`<p>${this.colorScheme.value}</p>`;
  }
}

// ── type-level checks (never executed) ───────────────────────────────────────────
() => {
  const el = document.createElement("local-card") as InstanceType<typeof LocalCard>;
  el.colorScheme.set("dark"); // ✓ namespaced under this.colorScheme
  el.colorScheme.toggle(); // ✓
  const s: "light" | "dark" | "auto" = el.colorScheme.value; // ✓
  const r: "light" | "dark" = el.colorScheme.resolved; // ✓ resolved is never "auto"
  void s;
  void r;
  // @ts-expect-error — not a valid ColorScheme
  el.colorScheme.set("sepia");
  // @ts-expect-error — helpers live under this.colorScheme, not flat on the instance
  el.setColorScheme("dark");
};

const root = document.createElement("div");
document.body.appendChild(root);

class ColorSchemeSuite extends Test({ name: "dom-provider-color-scheme" }) {
  @Test.afterEach() reset() {
    theme.set("light");
  }

  @Test.it("this.colorScheme namespaces the API (value/resolved/set/toggle)") namespaced() {
    const el = document.createElement("local-card") as HTMLElement & {
      colorScheme: { value: string };
      setColorScheme?: unknown;
    };
    root.appendChild(el);
    flushSync();
    expect(el.colorScheme.value).toBe("light");
    expect(el.setColorScheme).toBeUndefined(); // not leaked flat onto the instance
    el.remove();
  }

  @Test.it("reflects CSS color-scheme + data attribute") initial() {
    const el = document.createElement("local-card");
    root.appendChild(el);
    flushSync();
    expect(el.style.getPropertyValue("color-scheme")).toBe("light");
    expect(el.getAttribute("data-color-scheme")).toBe("light");
    expect(el.shadowRoot!.textContent).toBe("light");
    el.remove();
  }

  @Test.it("colorScheme.set updates CSS + attr + re-renders") setScheme() {
    const el = document.createElement("local-card") as HTMLElement & {
      colorScheme: { set(s: string): void };
    };
    root.appendChild(el);
    flushSync();
    el.colorScheme.set("dark");
    flushSync();
    expect(el.style.getPropertyValue("color-scheme")).toBe("dark");
    expect(el.getAttribute("data-color-scheme")).toBe("dark");
    expect(el.shadowRoot!.textContent).toBe("dark");
    el.remove();
  }

  @Test.it("auto maps to CSS 'light dark'") auto() {
    @Component.define()
    class AutoCard extends Component("auto-card", { providers: [colorSchemeProvider("auto")] }) {
      render() {
        return html`<p>${this.colorScheme.value}</p>`;
      }
    }
    const el = document.createElement("auto-card");
    root.appendChild(el);
    flushSync();
    expect(el.style.getPropertyValue("color-scheme")).toBe("light dark");
    expect(el.getAttribute("data-color-scheme")).toBe("auto");
    el.remove();
  }

  @Test.it("colorScheme.toggle flips light ⇄ dark") toggle() {
    const el = document.createElement("local-card") as HTMLElement & {
      colorScheme: { value: string; toggle(): void };
    };
    root.appendChild(el);
    flushSync();
    el.colorScheme.toggle();
    expect(el.colorScheme.value).toBe("dark");
    el.colorScheme.toggle();
    expect(el.colorScheme.value).toBe("light");
    el.remove();
  }

  @Test.it("colorScheme.resolved resolves auto to a concrete scheme") resolved() {
    const el = document.createElement("local-card") as HTMLElement & {
      colorScheme: { resolved: string; set(s: string): void };
    };
    root.appendChild(el);
    flushSync();
    el.colorScheme.set("dark");
    expect(el.colorScheme.resolved).toBe("dark");
    el.remove();
  }

  @Test.it("per-instance literal scheme is independent") independent() {
    const a = document.createElement("local-card") as HTMLElement & { colorScheme: { set(s: string): void } };
    const b = document.createElement("local-card");
    root.append(a, b);
    flushSync();
    a.colorScheme.set("dark");
    flushSync();
    expect(a.getAttribute("data-color-scheme")).toBe("dark");
    expect(b.getAttribute("data-color-scheme")).toBe("light"); // unaffected
    a.remove();
    b.remove();
  }

  @Test.it("a shared store themes every bound component (global)") shared() {
    const a = document.createElement("themed-a");
    const b = document.createElement("themed-b");
    root.append(a, b);
    flushSync();
    theme.set("dark");
    flushSync();
    expect(a.getAttribute("data-color-scheme")).toBe("dark");
    expect(b.getAttribute("data-color-scheme")).toBe("dark");
    expect(b.shadowRoot!.textContent).toBe("dark");
    a.remove();
    b.remove();
  }

  @Test.it("stops reacting to the shared store after disconnect") cleanup() {
    const a = document.createElement("themed-a");
    root.appendChild(a);
    flushSync();
    a.remove();
    theme.set("dark");
    flushSync(); // must not throw / touch the detached node
    expect(a.getAttribute("data-color-scheme")).toBe("light");
  }

  @Test.it("resolveColorScheme maps explicit schemes; auto stays binary") resolve() {
    expect(resolveColorScheme("light")).toBe("light");
    expect(resolveColorScheme("dark")).toBe("dark");
    expect(["light", "dark"].includes(resolveColorScheme("auto"))).toBeTruthy();
  }
}

await TestApplication().addTests(ColorSchemeSuite).reporter(new ConsoleReporter()).run();
