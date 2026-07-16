// Headless tests for the audit system: the pure css-usage scanners, the built-in
// `@youneed/ts-plugin/dom` audit (bindings + unusedCss), and the external
// `@youneed/dom-provider-a11y/ts-plugin` audit (loaded via require, like tsserver).
// Run: pnpm --filter @youneed/ts-plugin test  (this file is run by the test script)
import { createRequire } from "node:module";
import ts from "typescript";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { buildComponentIndex } from "../src/component-index.ts";
import { findAllTemplates } from "../src/template.ts";
import { cssClassSelectors, stringLiteralTokens } from "../src/css-usage.ts";
import domAudit from "../src/audits/dom.ts";
import type { Audit, AuditContext, AuditFactory } from "../src/audit.ts";

const require = createRequire(import.meta.url);
const a11yAudit = require("@youneed/dom-provider-a11y/ts-plugin") as AuditFactory;

const sourceFile = (code: string) => ts.createSourceFile("fix.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** A minimal AuditContext over a single fixture source. */
const ctxOf = (code: string): AuditContext => {
  const sf = sourceFile(code);
  return {
    ts,
    program: { getSourceFiles: () => [sf] } as unknown as ts.Program,
    sourceFile: sf,
    componentIndex: () => buildComponentIndex(ts, [sf]),
    templates: () => findAllTemplates(ts, sf),
    log: () => {},
  };
};

const run = (audit: Audit, code: string) => audit.diagnostics?.(ctxOf(code)) ?? [];

class CssUsageTest extends Test({ name: "css-usage scanners" }) {
  @Test.it("collects class selectors, ignores values and comments") selectors() {
    const names = cssClassSelectors("`.a, .b:hover { transition: .2s } /* .commented */ .c {}`").map((s) => s.name);
    expect(names).toEqual(["a", "b", "c"]); // `.2s` value + `.commented` comment skipped
  }

  @Test.it("string tokens split on non-identifier chars; skipRanges excludes a region") tokens() {
    const sf = sourceFile('const cls = "alpha"; const m = `<div class="beta gamma">`;');
    const all = stringLiteralTokens(ts, sf);
    expect(all.has("alpha")).toBe(true);
    expect(all.has("beta")).toBe(true); // embedded in markup text
    expect(all.has("gamma")).toBe(true);
    // skip the template-literal region → its tokens drop out
    const tpl = sf.text.indexOf("`");
    const skipped = stringLiteralTokens(ts, sf, [{ start: tpl, end: sf.text.length }]);
    expect(skipped.has("alpha")).toBe(true);
    expect(skipped.has("beta")).toBe(false);
  }
}

const dom = domAudit({ unusedCss: { enabled: true, kind: "error" } }) as Audit;

class DomAuditTest extends Test({ name: "dom audit" }) {
  @Test.it("flags an unknown .prop (error) and unknown @event (warning)") bindings() {
    const code = `
      import { Component, html } from "@youneed/dom";
      class Item extends Component("x-item") { render() { return html\`\`; } }
      class App extends Component("x-app") {
        render() { return html\`<x-item .nope=\${1} @bad=\${() => {}}></x-item>\`; }
      }`;
    const found = run(dom, code);
    const prop = found.find((d) => d.code === 990001);
    const event = found.find((d) => d.code === 990002);
    expect(prop?.severity).toBe("error");
    expect(event?.severity).toBe("warning");
  }

  @Test.it("flags a css class that's never referenced; spares a used one") unusedCss() {
    const code = `
      import { Component, css, html } from "@youneed/dom";
      class Card extends Component("x-card", { styles: css\`.used { color: red } .dead { color: blue }\` }) {
        render() { return html\`<div class="used"></div>\`; }
      }`;
    const found = run(dom, code).filter((d) => d.code === 990003);
    expect(found.map((d) => d.messageText.includes(".dead"))).toEqual([true]);
    expect(found.some((d) => d.messageText.includes(".used"))).toBe(false);
  }

  @Test.it("a class used only via classList in code counts as used") unusedCssClassList() {
    const code = `
      import { Component, css, html } from "@youneed/dom";
      class Tag extends Component("x-tag", { styles: css\`.live { color: red }\` }) {
        onMount() { this.classList.add("live"); }
        render() { return html\`<span></span>\`; }
      }`;
    expect(run(dom, code).filter((d) => d.code === 990003)).toEqual([]);
  }

  @Test.it("severity is configurable (unusedCss kind: none silences it)") silenced() {
    const off = domAudit({ unusedCss: { enabled: true, kind: "none" } }) as Audit;
    const code = `import { Component, css, html } from "@youneed/dom";
      class C extends Component("x-c", { styles: css\`.dead {}\` }) { render() { return html\`<i></i>\`; } }`;
    // "none" still produces the finding (kind=none) — the host is what drops it.
    const found = run(off, code).filter((d) => d.code === 990003);
    expect(found[0]?.severity).toBe("none");
  }
}

const a11y = a11yAudit({ reduceMotion: { kind: "warning" }, colorScheme: { kind: "warning" } }) as Audit;

class A11yAuditTest extends Test({ name: "a11y audit (external module)" }) {
  @Test.it("loads as a factory exporting a named audit") loads() {
    expect(typeof a11yAudit).toBe("function");
    expect(a11y.name).toBe("a11y");
  }

  @Test.it("flags a transition with no reduced-motion variant") motion() {
    const code = `import { Component, css, html } from "@youneed/dom";
      class A extends Component("x-a", { styles: css\`.box { transition: transform .2s }\` }) { render() { return html\`\`; } }`;
    const found = run(a11y, code);
    expect(found.some((d) => d.code === 990101 && d.severity === "warning")).toBe(true);
  }

  @Test.it("stays quiet when a reduced-motion variant is present") motionOk() {
    const code = `import { Component, css, html } from "@youneed/dom";
      class A extends Component("x-a", { styles: css\`.box { transition: transform .2s } @media (prefers-reduced-motion: reduce) { .box { transition: none } }\` }) { render() { return html\`\`; } }`;
    expect(run(a11y, code).some((d) => d.code === 990101)).toBe(false);
  }

  @Test.it("flags explicit colors with no color-scheme awareness; var() is fine") color() {
    const bad = `import { Component, css, html } from "@youneed/dom";
      class A extends Component("x-a", { styles: css\`.box { color: #333 }\` }) { render() { return html\`\`; } }`;
    expect(run(a11y, bad).some((d) => d.code === 990102)).toBe(true);
    const ok = `import { Component, css, html } from "@youneed/dom";
      class A extends Component("x-a", { styles: css\`.box { color: var(--fg) }\` }) { render() { return html\`\`; } }`;
    expect(run(a11y, ok).some((d) => d.code === 990102)).toBe(false);
  }
}

await TestApplication().addTests(CssUsageTest).addTests(DomAuditTest).addTests(A11yAuditTest).reporter(new ConsoleReporter()).run();
