// Run: pnpm --filter @youneed/dom-provider-a11y test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { a11yProvider, announce, auditStyleSheets, clearAnnouncer, prefersReducedMotion } from "../src/index.ts";

registerDOM();
const { Component, html, css, flushSync } = await import("@youneed/dom");

/** Build a CSSStyleSheet from raw CSS (for the pure-audit tests). */
const sheet = (text: string): CSSStyleSheet => {
  const s = new CSSStyleSheet();
  s.replaceSync(text);
  return s;
};

@Component.define()
class Dialog extends Component("a11y-dialog", { providers: [a11yProvider()] }) {
  render() {
    return html`<button id="ok">OK</button><button id="cancel">Cancel</button>`;
  }
}

@Component.define()
class Menu extends Component("a11y-menu", { providers: [a11yProvider()] }) {
  render() {
    return html`<button>One</button><button>Two</button><button>Three</button>`;
  }
}

@Component.define()
class Empty extends Component("a11y-empty", { providers: [a11yProvider()] }) {
  render() {
    return html`<span>no focusables</span>`;
  }
}

// ── audit fixtures: components whose scoped styles the audit inspects ────────────
const auditLog: string[] = [];
const collect = (message: string): void => void auditLog.push(message);

@Component.define()
class MotionBad extends Component("a11y-motion-bad", {
  providers: [a11yProvider({ audit: { warn: collect } })],
  styles: css`.box { transition: transform 0.2s; }`,
}) {
  render() {
    return html`<div class="box">x</div>`;
  }
}

@Component.define()
class MotionGood extends Component("a11y-motion-good", {
  providers: [a11yProvider({ audit: { warn: collect } })],
  styles: css`
    .box { transition: transform 0.2s; }
    @media (prefers-reduced-motion: reduce) {
      .box { transition: none; }
    }
  `,
}) {
  render() {
    return html`<div class="box">x</div>`;
  }
}

// ── type-level checks (never executed) ───────────────────────────────────────────
() => {
  const el = document.createElement("a11y-dialog") as InstanceType<typeof Dialog>;
  el.a11y.announce("hi"); // ✓ namespaced under this.a11y
  el.a11y.announce("urgent", "assertive"); // ✓
  const release: () => void = el.a11y.trapFocus(); // ✓
  release();
  el.a11y.setTabIndex(0); // ✓
  el.a11y.makeFocusable(); // ✓
  const ctrl = el.a11y.roving("button"); // ✓
  ctrl.setActive(1);
  const rm: boolean = el.a11y.prefersReducedMotion; // ✓
  void rm;
  // @ts-expect-error — politeness must be "polite" | "assertive"
  el.a11y.announce("x", "loud");
  // @ts-expect-error — helpers live under this.a11y, not flat on the instance
  el.announce("x");
};

const live = (p: string): HTMLElement | null =>
  document.querySelector(`[data-youneed-a11y-live="${p}"]`);
const ti = (el: Element | null | undefined): string | null => el?.getAttribute("tabindex") ?? null;

const root = document.createElement("div");
document.body.appendChild(root);

class A11ySuite extends Test({ name: "dom-provider-a11y" }) {
  @Test.afterEach() reset() {
    clearAnnouncer();
    auditLog.length = 0;
  }

  @Test.it("this.a11y namespaces the helpers (not flat on the host)") namespaced() {
    const el = document.createElement("a11y-dialog") as HTMLElement & {
      a11y: { announce(m: string): void };
      announce?: unknown;
    };
    root.appendChild(el);
    flushSync();
    expect(typeof el.a11y.announce).toBe("function");
    expect(el.announce).toBeUndefined(); // not leaked onto the instance
    el.remove();
  }

  @Test.it("a11y.announce writes to the shared polite live region") announcePolite() {
    const el = document.createElement("a11y-dialog") as HTMLElement & {
      a11y: { announce(m: string): void };
    };
    root.appendChild(el);
    flushSync();
    el.a11y.announce("Saved");
    const region = live("polite")!;
    expect(region.textContent).toBe("Saved");
    expect(region.getAttribute("aria-live")).toBe("polite");
    el.remove();
  }

  @Test.it("assertive announcements use a separate alert region") announceAssertive() {
    const el = document.createElement("a11y-dialog") as HTMLElement & {
      a11y: { announce(m: string, p?: "polite" | "assertive"): void };
    };
    root.appendChild(el);
    flushSync();
    el.a11y.announce("Error!", "assertive");
    const region = live("assertive")!;
    expect(region.textContent).toBe("Error!");
    expect(region.getAttribute("role")).toBe("alert");
    el.remove();
  }

  @Test.it("standalone announce() works without a component") standalone() {
    announce("Standalone");
    expect(live("polite")!.textContent).toBe("Standalone");
  }

  @Test.it("a11y.focusFirst focuses the first focusable, returns true") focusFirst() {
    const el = document.createElement("a11y-dialog") as HTMLElement & {
      a11y: { focusFirst(): boolean };
    };
    root.appendChild(el);
    flushSync();
    expect(el.a11y.focusFirst()).toBe(true);
    expect(el.shadowRoot!.activeElement?.id).toBe("ok");
    el.remove();
  }

  @Test.it("a11y.focusFirst returns false with nothing to focus") focusNone() {
    const el = document.createElement("a11y-empty") as HTMLElement & {
      a11y: { focusFirst(): boolean };
    };
    root.appendChild(el);
    flushSync();
    expect(el.a11y.focusFirst()).toBe(false);
    el.remove();
  }

  @Test.it("a11y.trapFocus focuses inside + release restores prior focus") trap() {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const el = document.createElement("a11y-dialog") as HTMLElement & {
      a11y: { trapFocus(): () => void };
    };
    root.appendChild(el);
    flushSync();
    const release = el.a11y.trapFocus();
    expect(el.shadowRoot!.activeElement?.id).toBe("ok");
    release();
    expect(document.activeElement).toBe(outside);
    el.remove();
    outside.remove();
  }

  // ── tabindex helpers ──────────────────────────────────────────────────────────
  @Test.it("a11y.setTabIndex / makeFocusable / makeUnfocusable set tabindex") tabindex() {
    const el = document.createElement("a11y-dialog") as HTMLElement & {
      a11y: { setTabIndex(v: number): void; makeFocusable(): void; makeUnfocusable(): void };
    };
    root.appendChild(el);
    flushSync();
    el.a11y.setTabIndex(2);
    expect(el.getAttribute("tabindex")).toBe("2");
    el.a11y.makeFocusable();
    expect(el.getAttribute("tabindex")).toBe("0");
    el.a11y.makeUnfocusable();
    expect(el.getAttribute("tabindex")).toBe("-1");
    el.remove();
  }

  // ── roving tabindex (keyboard navigation) ──────────────────────────────────────
  @Test.it("a11y.roving makes one item tabbable; arrows move focus") roving() {
    const el = document.createElement("a11y-menu") as HTMLElement & {
      a11y: { roving(sel: string): { activeIndex: number } };
    };
    root.appendChild(el);
    flushSync();
    const buttons = [...el.shadowRoot!.querySelectorAll("button")];
    el.a11y.roving("button");
    expect(ti(buttons[0])).toBe("0"); // first is tabbable
    expect(ti(buttons[1])).toBe("-1");

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, composed: true }));
    expect(ti(buttons[1])).toBe("0"); // moved to second
    expect(ti(buttons[0])).toBe("-1");
    expect(el.shadowRoot!.activeElement).toBe(buttons[1]);

    el.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, composed: true }));
    expect(ti(buttons[2])).toBe("0"); // last
    el.remove();
  }

  @Test.it("roving loops at the ends by default") rovingLoop() {
    const el = document.createElement("a11y-menu") as HTMLElement & {
      a11y: { roving(sel: string): { activeIndex: number } };
    };
    root.appendChild(el);
    flushSync();
    const ctrl = el.a11y.roving("button");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, composed: true }));
    expect(ctrl.activeIndex).toBe(2); // wrapped from 0 to last
    el.remove();
  }

  @Test.it("reflects prefers-reduced-motion as an attribute + getter") async reducedMotion() {
    const el = document.createElement("a11y-dialog") as HTMLElement & {
      a11y: { prefersReducedMotion: boolean };
    };
    // The reflect is deferred out of the constructor (Custom Elements spec forbids
    // setting attributes there — real browsers throw), so it's not set synchronously.
    expect(el.hasAttribute("data-reduced-motion")).toBe(false);
    root.appendChild(el);
    flushSync();
    await Promise.resolve(); // let the deferred reflect run
    expect(typeof el.a11y.prefersReducedMotion).toBe("boolean");
    expect(el.getAttribute("data-reduced-motion")).toBe(String(prefersReducedMotion()));
    el.remove();
  }

  // ── CSS audit: pure function ───────────────────────────────────────────────────
  @Test.it("audit flags animation/transition with no reduced-motion variant") auditMotion() {
    const findings = auditStyleSheets([sheet(`.x { transition: opacity 0.3s; }`)], { label: "<x-foo>" });
    expect(findings.map((f) => f.kind)).toEqual(["reduced-motion"]);
    expect(findings[0].message).toContain("<x-foo>");
    expect(findings[0].docs).toContain("prefers-reduced-motion");
  }

  @Test.it("audit passes when a reduced-motion variant exists") auditMotionOk() {
    const ok = auditStyleSheets([
      sheet(`.x { animation: spin 1s linear infinite; } @media (prefers-reduced-motion: reduce) { .x { animation: none; } }`),
    ]);
    expect(ok.filter((f) => f.kind === "reduced-motion")).toEqual([]);
  }

  @Test.it("audit flags explicit colors with no color-scheme awareness") auditColor() {
    const findings = auditStyleSheets([sheet(`.x { color: #222; background-color: #fff; }`)]);
    expect(findings.map((f) => f.kind)).toEqual(["color-scheme"]);
    expect(findings[0].docs).toContain("prefers-color-scheme");
  }

  @Test.it("audit passes colors guarded by color-scheme or a prefers-color-scheme query") auditColorOk() {
    const declared = auditStyleSheets([sheet(`:host { color-scheme: light dark; color: #222; }`)]);
    expect(declared.filter((f) => f.kind === "color-scheme")).toEqual([]);
    const queried = auditStyleSheets([sheet(`.x { color: #222; } @media (prefers-color-scheme: dark) { .x { color: #eee; } }`)]);
    expect(queried.filter((f) => f.kind === "color-scheme")).toEqual([]);
  }

  @Test.it("audit ignores var()/keyword colors and tunable toggles") auditColorTokens() {
    expect(auditStyleSheets([sheet(`.x { color: var(--fg); background-color: transparent; }`)])).toEqual([]);
    // toggling a single check off
    expect(auditStyleSheets([sheet(`.x { color: #222; }`)], { colorScheme: false })).toEqual([]);
  }

  // ── CSS audit: through the provider, after mount ───────────────────────────────
  @Test.it("provider audit warns for an unguarded transition") async auditProviderBad() {
    const el = document.createElement("a11y-motion-bad");
    root.appendChild(el);
    flushSync();
    await Promise.resolve(); // let the audit microtask run
    expect(auditLog.some((m) => m.includes("a11y-motion-bad") && m.includes("prefers-reduced-motion"))).toBe(true);
    el.remove();
  }

  @Test.it("provider audit stays quiet when the variant is present") async auditProviderGood() {
    const el = document.createElement("a11y-motion-good");
    root.appendChild(el);
    flushSync();
    await Promise.resolve();
    expect(auditLog.some((m) => m.includes("a11y-motion-good"))).toBe(false);
    el.remove();
  }

  @Test.it("releases focus trap + roving handlers on disconnect") cleanup() {
    const el = document.createElement("a11y-menu") as HTMLElement & {
      a11y: { trapFocus(): () => void; roving(s: string): unknown };
    };
    root.appendChild(el);
    flushSync();
    el.a11y.trapFocus();
    el.a11y.roving("button");
    el.remove(); // onCleanup → release + roving.destroy; must not throw
    expect(true).toBe(true);
  }
}

await TestApplication().addTests(A11ySuite).reporter(new ConsoleReporter()).run();
