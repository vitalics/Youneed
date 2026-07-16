// Styles plugin — Chrome-DevTools-style editing: add a declaration to a rule,
// edit a value inline, and add a brand-new rule. Mounts a real component (so its
// shadow has live adoptedStyleSheets) and drives the panel with a stub ctx.
// Run: pnpm --filter @youneed/devtools test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, css, flushSync, define } = await import("@youneed/dom");
const { stylesPanel } = await import("../src/styles.ts");
const { installDevtools } = await import("../src/core.ts");
import type { DevtoolsContext } from "../src/core.ts";

installDevtools();

const root = document.createElement("div");
document.body.appendChild(root);

// A FRESH component per call — each gets its own adopted stylesheet, so edits in
// one test don't leak into the next (instances of one class share the sheet).
let seq = 0;
function freshBox(): Element {
  const tag = `dt-box-${seq++}`;
  class B extends Component(tag, { styles: css`:host { color: red; }` }) {
    render() {
      return html`<span>box</span>`;
    }
  }
  define(B);
  const el = document.createElement(tag);
  root.appendChild(el);
  flushSync();
  return el;
}

// The :host rule of a mounted box's live adopted stylesheet.
function hostRuleOf(box: Element): CSSStyleRule {
  const sheet = (box as Element & { shadowRoot: ShadowRoot }).shadowRoot.adoptedStyleSheets[0];
  return [...sheet.cssRules].find((r) => r instanceof CSSStyleRule) as CSSStyleRule;
}

// Mount a box + the Styles panel pointed at it; returns the panel's shadow root.
function mountPanel(box: Element): { panelRoot: ShadowRoot; cleanup: () => void } {
  const rec = { tag: "dt-box", id: 1, alive: true, elRef: new WeakRef(box), styles: [] };
  const ctx = {
    current: () => rec,
    subscribe: () => () => {},
    onSelect: () => () => {},
    highlight: () => {},
  } as unknown as DevtoolsContext;
  const container = document.createElement("div");
  root.appendChild(container);
  const cleanup = stylesPanel().render(container, ctx);
  const panelRoot = (container.querySelector("dt-styles") as Element & { shadowRoot: ShadowRoot })
    .shadowRoot;
  return { panelRoot, cleanup: () => void (typeof cleanup === "function" && cleanup()) };
}

const fire = (input: HTMLInputElement, value: string, key = "Enter"): void => {
  input.value = value;
  input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

// Whether the engine implements the `CSSStyleRule.selectorText` setter (real
// browsers do; happy-dom doesn't) — so the selector-edit assertion stays honest.
function selectorSettable(): boolean {
  const sheet = new CSSStyleSheet();
  sheet.insertRule(":host {}", 0);
  const rule = sheet.cssRules[0] as CSSStyleRule;
  try {
    rule.selectorText = ".probe";
  } catch {
    return false;
  }
  return rule.selectorText === ".probe";
}

class StylesEditSuite extends Test({ name: "devtools: styles editing" }) {
  @Test.it("add-row appends a new declaration to the live rule") addDecl() {
    const box = freshBox();
    const { panelRoot, cleanup } = mountPanel(box);

    const addInput = panelRoot.querySelector(".addrow input") as HTMLInputElement;
    expect(addInput).toBeDefined();
    fire(addInput, "background: blue");
    flushSync();

    expect(hostRuleOf(box).style.getPropertyValue("background")).toBe("blue");
    expect((panelRoot.textContent ?? "").includes("background")).toBeTruthy();
    cleanup();
    box.remove();
  }

  @Test.it("honours !important when adding") important() {
    const box = freshBox();
    const { panelRoot, cleanup } = mountPanel(box);
    fire(panelRoot.querySelector(".addrow input") as HTMLInputElement, "color: green !important");
    flushSync();
    expect(hostRuleOf(box).style.getPropertyPriority("color")).toBe("important");
    expect(hostRuleOf(box).style.getPropertyValue("color")).toBe("green");
    cleanup();
    box.remove();
  }

  @Test.it("clicking a value edits it inline; Enter commits") editValue() {
    const box = freshBox();
    const { panelRoot, cleanup } = mountPanel(box);

    (panelRoot.querySelector(".decl .val") as HTMLElement).click(); // start editing `color: red`
    flushSync();
    const editInput = panelRoot.querySelector("input.editin") as HTMLInputElement;
    expect(editInput).toBeDefined();
    fire(editInput, "rebeccapurple");
    flushSync();
    expect(hostRuleOf(box).style.getPropertyValue("color")).toBe("rebeccapurple");
    cleanup();
    box.remove();
  }

  @Test.it("editing to an empty value removes the declaration") removeDecl() {
    const box = freshBox();
    const { panelRoot, cleanup } = mountPanel(box);
    (panelRoot.querySelector(".decl .val") as HTMLElement).click();
    flushSync();
    fire(panelRoot.querySelector("input.editin") as HTMLInputElement, "");
    flushSync();
    expect(hostRuleOf(box).style.getPropertyValue("color")).toBe("");
    cleanup();
    box.remove();
  }

  @Test.it("clicking a property name renames it (value preserved)") renameProp() {
    const box = freshBox();
    const { panelRoot, cleanup } = mountPanel(box);
    (panelRoot.querySelector(".decl .prop") as HTMLElement).click(); // edit `color`
    flushSync();
    const propInput = panelRoot.querySelector("input.editin.prop") as HTMLInputElement;
    expect(propInput).toBeDefined();
    fire(propInput, "outline-color");
    flushSync();
    const rule = hostRuleOf(box);
    expect(rule.style.getPropertyValue("color")).toBe(""); // old prop gone
    expect(rule.style.getPropertyValue("outline-color")).toBe("red"); // value moved over
    cleanup();
    box.remove();
  }

  @Test.it("clicking the selector opens an inline editor; commits where supported") editSelector() {
    const box = freshBox();
    const { panelRoot, cleanup } = mountPanel(box);
    (panelRoot.querySelector(".csshead .sel") as HTMLElement).click();
    flushSync();
    const selInput = panelRoot.querySelector("input.editin.sel") as HTMLInputElement;
    expect(selInput).toBeDefined(); // the inline selector editor opened
    fire(selInput, ":host(.active)");
    flushSync();
    expect(panelRoot.querySelector("input.editin.sel")).toBeNull(); // editor closed on commit
    // The selectorText setter isn't implemented everywhere (e.g. happy-dom);
    // assert the change only where the engine supports it.
    if (selectorSettable()) expect(hostRuleOf(box).selectorText).toBe(":host(.active)");
    cleanup();
    box.remove();
  }

  @Test.it("'+ new rule' inserts an empty :host rule to fill") newRule() {
    const box = freshBox();
    const { panelRoot, cleanup } = mountPanel(box);
    const sheet = (box as Element & { shadowRoot: ShadowRoot }).shadowRoot.adoptedStyleSheets[0];
    const before = sheet.cssRules.length;
    (panelRoot.querySelector(".newrule") as HTMLButtonElement).click();
    flushSync();
    expect(sheet.cssRules.length).toBe(before + 1);
    cleanup();
    box.remove();
  }
}

await TestApplication().addTests(StylesEditSuite).reporter(new ConsoleReporter()).run();
