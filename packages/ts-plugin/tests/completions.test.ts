// Headless tests for the language-service plugin's pure logic: the component index
// (AST scan), the html/css context scanners, and the completion entries they
// produce. Driven with the real `typescript` API — no editor / tsserver needed.
// Run: pnpm --filter @youneed/ts-plugin test
import ts from "typescript";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { buildComponentIndex } from "../src/component-index.ts";
import { checkBindings } from "../src/html.ts";
import { cssCompletions, cssContextAt } from "../src/css.ts";
import { htmlCompletions, htmlContextAt, htmlEntryDetail, htmlQuickInfoAt, htmlDefinitionAt } from "../src/html.ts";
import { findTemplate, type TemplateMatch } from "../src/template.ts";

const sourceFile = (name: string, code: string) =>
  ts.createSourceFile(name, code, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);

const FIXTURE = `
import { Component, html, css } from "@youneed/dom";

/**
 * A counter with a label.
 * @see https://example.com/counter
 * @preview ./preview/my-counter.png
 */
@Component.define()
class MyCounter extends Component("my-counter") {
  /** The current count. */
  @Component.prop() count = 0;
  @Component.prop({ attribute: true }) label: string = "hi";
  /** Fired on every increment. */
  @Component.event("increment") inc() { this.emit("increment", this.count); }
  @Component.event() reset() { this.emit("cleared"); }   // method @event() = auto-bind, not an event
  @Component.event() onPick = (x: number) => x;          // field @event() = exposed event
  @Component.event({ name: "onSave" }) save = (v: string) => v;     // opts form: explicit name
  @Component.event({ exposed: false }) secret = (x: number) => x;   // opts form: not exposed → hidden
  @Component.event({ name: "removed", exposed: true }) remove() {}  // method declared as an exposed event
  render() { return html\`<div>\${this.count}</div>\`; }
}

@Component.define()
class FancyCounter extends Component("fancy-counter", MyCounter) {
  @Component.prop() fancy = true;
}
`;

const index = buildComponentIndex(ts, [sourceFile("fixture.ts", FIXTURE)]);

// Build a TemplateMatch from a snippet containing a `¦` cursor marker.
const at = (kind: "html" | "css", content: string): TemplateMatch => {
  const idx = content.indexOf("¦");
  const raw = "`" + content.replace("¦", "") + "`";
  return { kind, raw, base: 0, cursorRel: 1 + idx };
};
const names = (info: ts.CompletionInfo | undefined) => (info?.entries ?? []).map((e) => e.name);

class ComponentIndexTest extends Test({ name: "component index" }) {
  @Test.it("indexes custom-element tags") tags() {
    expect([...index.keys()].sort()).toEqual(["fancy-counter", "my-counter"]);
  }
  @Test.it("collects @prop fields (with type)") props() {
    const counter = index.get("my-counter")!;
    expect(counter.props.map((p) => p.name).sort()).toEqual(["count", "label"]);
    expect(counter.props.find((p) => p.name === "count")?.type).toBe("number");
    expect(counter.props.find((p) => p.name === "label")?.type).toBe("string");
  }
  @Test.it("collects events: string arg, field, opts {name}, this.emit(), exposed methods") events() {
    const ev = index.get("my-counter")!.events.map((e) => e.name).sort();
    // includes opts-form "onSave" + method-declared "removed"; excludes "reset"
    // (method auto-bind) and "secret" (opts { exposed: false }).
    expect(ev).toEqual(["cleared", "increment", "onPick", "onSave", "removed"]);
  }
  @Test.it("captures JSDoc on the class + @prop/@event declarations") jsdoc() {
    const counter = index.get("my-counter")!;
    expect(counter.doc).toBe("A counter with a label.");
    expect(counter.preview).toBe("./preview/my-counter.png");
    expect(counter.see).toEqual(["https://example.com/counter"]);
    expect(counter.props.find((p) => p.name === "count")?.doc).toBe("The current count.");
    expect(counter.events.find((e) => e.name === "increment")?.doc).toBe("Fired on every increment.");
  }
  @Test.it("inherits props/events (with their JSDoc) through the base component") inheritance() {
    const fancy = index.get("fancy-counter")!;
    expect(fancy.props.map((p) => p.name).sort()).toEqual(["count", "fancy", "label"]);
    expect(fancy.events.some((e) => e.name === "increment")).toBeTruthy();
    expect(fancy.props.find((p) => p.name === "count")?.doc).toBe("The current count.");
  }
}

class HtmlContextTest extends Test({ name: "html context scanner" }) {
  @Test.it("detects a tag-name position") tagname() {
    const ctx = htmlContextAt("`<my-`", 5); // cursor after "<my-"
    expect(ctx.type).toBe("tagname");
    expect((ctx as { word: string }).word).toBe("my-");
  }
  @Test.it("detects a .prop attribute position") dotProp() {
    const ctx = htmlContextAt("`<my-counter .`", 14);
    expect(ctx.type).toBe("attr");
    expect((ctx as { tag: string; prefix: string }).tag).toBe("my-counter");
    expect((ctx as { prefix: string }).prefix).toBe(".");
  }
  @Test.it("detects an @event attribute position") atEvent() {
    const ctx = htmlContextAt("`<my-counter @c`", 15);
    expect((ctx as { prefix: string }).prefix).toBe("@");
    expect((ctx as { word: string }).word).toBe("c");
  }
  @Test.it("defers when the cursor is inside a ${…} hole") insideHole() {
    // `<div>${ x¦ }</div>`  → cursor inside the expression
    const raw = "`<div>${ x }</div>`";
    expect(htmlContextAt(raw, raw.indexOf("x") + 1).type).toBe("value");
  }
}

class HtmlCompletionsTest extends Test({ name: "html completions" }) {
  @Test.it(".prop offers the element's @prop fields") dotProps() {
    const info = htmlCompletions(ts, at("html", "<my-counter .¦"), index);
    expect(names(info).sort()).toEqual(["count", "label"]);
    expect(info!.entries[0].insertText).toBe(info!.entries[0].name + "=");
  }
  @Test.it("@event offers component events + common DOM events") events() {
    const n = names(htmlCompletions(ts, at("html", "<my-counter @¦"), index));
    expect(n.includes("increment")).toBeTruthy();
    expect(n.includes("cleared")).toBeTruthy();
    expect(n.includes("click")).toBeTruthy(); // common DOM event still offered
  }
  @Test.it("tag-name offers known custom elements") tagname() {
    const n = names(htmlCompletions(ts, at("html", "<my¦"), index));
    expect(n.includes("my-counter")).toBeTruthy();
    expect(n.includes("fancy-counter")).toBeTruthy();
  }
  @Test.it("bare attribute offers punctuated .props and @events") bare() {
    const n = names(htmlCompletions(ts, at("html", "<my-counter ¦"), index));
    expect(n.includes(".count")).toBeTruthy();
    expect(n.includes("@increment")).toBeTruthy();
    expect(n.includes("class")).toBeTruthy();
  }
  @Test.it("unknown tag → no prop completions (defers)") unknown() {
    expect(htmlCompletions(ts, at("html", "<div .¦"), index)).toBeUndefined();
  }
  @Test.it("entry detail carries the declaration's JSDoc") entryDoc() {
    const prop = htmlEntryDetail(ts, at("html", "<my-counter .¦"), index, "count");
    expect(prop?.doc).toBe("The current count.");
    const ev = htmlEntryDetail(ts, at("html", "<my-counter @¦"), index, "increment");
    expect(ev?.doc).toBe("Fired on every increment.");
    const tag = htmlEntryDetail(ts, at("html", "<my¦"), index, "my-counter");
    expect(tag?.doc).toBe("A counter with a label.");
  }
  @Test.it("standard DOM events/attrs get a 'standard …' note + MDN link") standardDocs() {
    const click = htmlEntryDetail(ts, at("html", "<my-counter @¦"), index, "click")?.doc ?? "";
    expect(click.includes("Standard DOM event")).toBeTruthy();
    expect(click.includes("https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event")).toBeTruthy();
    const cls = htmlEntryDetail(ts, at("html", "<my-counter ¦"), index, "class")?.doc ?? "";
    expect(cls.includes("Standard HTML attribute")).toBeTruthy();
    expect(cls.includes("/Global_attributes/class")).toBeTruthy();
  }
}

class HtmlQuickInfoTest extends Test({ name: "html quick-info (hover)" }) {
  @Test.it("hover on a component tag shows its class JSDoc") tag() {
    const qi = htmlQuickInfoAt(ts, at("html", "<my-cou¦nter .count=${0}></my-counter>"), index);
    expect(qi?.detail).toBe("(component) <my-counter> — MyCounter");
    expect(qi?.doc).toBe("A counter with a label.");
    expect(qi?.preview).toBe("./preview/my-counter.png");
    expect(qi?.see).toEqual(["https://example.com/counter"]);
  }
  @Test.it("hover on a standard HTML tag shows the MDN note") stdTag() {
    const qi = htmlQuickInfoAt(ts, at("html", "<di¦v></div>"), index);
    expect(qi?.detail).toBe("<div> (HTML element)");
    expect(qi?.doc?.includes("/Web/HTML/Element/div")).toBeTruthy();
  }
  @Test.it("hover on a .prop shows its type + JSDoc") prop() {
    const qi = htmlQuickInfoAt(ts, at("html", "<my-counter .cou¦nt=${0}></my-counter>"), index);
    expect(qi?.detail).toBe("(property) count: number");
    expect(qi?.doc).toBe("The current count.");
  }
  @Test.it("hover on a declared @event shows its JSDoc") event() {
    const qi = htmlQuickInfoAt(ts, at("html", "<my-counter @inc¦rement=${0}></my-counter>"), index);
    expect(qi?.detail).toBe("(event) increment");
    expect(qi?.doc).toBe("Fired on every increment.");
  }
  @Test.it("hover on a standard DOM event shows the MDN note") domEvent() {
    const qi = htmlQuickInfoAt(ts, at("html", "<my-counter @cl¦ick=${0}></my-counter>"), index);
    expect(qi?.detail).toBe("(DOM event) click");
    expect(qi?.doc?.includes("/Web/API/Element/click_event")).toBeTruthy();
  }
  @Test.it("defers (no quick-info) inside a ${…} value") insideHole() {
    expect(htmlQuickInfoAt(ts, at("html", "<my-counter .count=${ x¦ }></my-counter>"), index)).toBeUndefined();
  }
  @Test.it("defers on an unknown prop / unknown tag") unknown() {
    expect(htmlQuickInfoAt(ts, at("html", "<my-counter .bog¦us=${0}></my-counter>"), index)).toBeUndefined();
    expect(htmlQuickInfoAt(ts, at("html", "<div .fo¦o=${0}></div>"), index)).toBeUndefined();
  }
}

class HtmlDefinitionTest extends Test({ name: "html go-to-definition" }) {
  // The component metadata is parsed from FIXTURE → the definition file is "fixture.ts".
  @Test.it("tag → the component class") tag() {
    const d = htmlDefinitionAt(at("html", "<my-cou¦nter .count=${0}></my-counter>"), index);
    expect(d?.kind).toBe("tag");
    expect(d?.target.name).toBe("MyCounter");
    expect(d?.target.container).toBe("my-counter");
    expect(d?.target.fileName).toBe("fixture.ts");
  }
  @Test.it(".prop → the @prop field") prop() {
    const d = htmlDefinitionAt(at("html", "<my-counter .cou¦nt=${0}></my-counter>"), index);
    expect(d?.kind).toBe("prop");
    expect(d?.target.name).toBe("count");
    expect(d?.target.container).toBe("MyCounter");
  }
  @Test.it("@event → the declaring member (name may differ from the event)") event() {
    // `@Component.event("increment") inc()` — event is "increment", member is "inc".
    const d = htmlDefinitionAt(at("html", "<my-counter @incr¦ement=${0}></my-counter>"), index);
    expect(d?.kind).toBe("event");
    expect(d?.target.name).toBe("inc");
  }
  @Test.it("bound span covers the token under the cursor") boundSpan() {
    const m = at("html", "<my-counter .cou¦nt=${0}></my-counter>");
    const d = htmlDefinitionAt(m, index);
    expect(m.raw.slice(d.boundStart, d.boundStart + d.boundLength)).toBe("count");
  }
  @Test.it("inherited prop → resolves to the BASE component file") inherited() {
    const d = htmlDefinitionAt(at("html", "<fancy-counter .cou¦nt=${0}></fancy-counter>"), index);
    expect(d?.target.name).toBe("count");
    expect(d?.target.fileName).toBe("fixture.ts");
  }
  @Test.it("defers on a standard DOM event / unknown tag") defers() {
    expect(htmlDefinitionAt(at("html", "<my-counter @cl¦ick=${0}></my-counter>"), index)).toBeUndefined();
    expect(htmlDefinitionAt(at("html", "<div .fo¦o=${0}></div>"), index)).toBeUndefined();
  }
}

class CssTest extends Test({ name: "css completions" }) {
  @Test.it("offers property names in a declaration position") prop() {
    const ctx = cssContextAt("`:host { col`", 12);
    expect(ctx.type).toBe("property");
    const n = names(cssCompletions(ts, at("css", ":host { col¦")));
    expect(n.includes("color")).toBeTruthy();
    expect(n.includes("columns")).toBeTruthy();
  }
  @Test.it("defers inside a value (after the colon)") value() {
    expect(cssContextAt("`:host { color: r`", 16).type).toBe("value");
    expect(cssCompletions(ts, at("css", ":host { color: r¦"))).toBeUndefined();
  }
  @Test.it("defers at selector level (outside any block)") selector() {
    expect(cssContextAt("`:ho`", 3).type).toBe("selector");
  }
}

class FindTemplateTest extends Test({ name: "findTemplate" }) {
  @Test.it("locates an html`` template and maps the cursor") html() {
    const code = `const t = html\`<my-counter .\`;`;
    const sf = sourceFile("t.ts", code);
    const pos = code.indexOf("<my-counter .") + "<my-counter .".length;
    const m = findTemplate(ts, sf, pos)!;
    expect(m.kind).toBe("html");
    expect(htmlContextAt(m.raw, m.cursorRel).type).toBe("attr");
  }
  @Test.it("locates a css`` template") css() {
    const code = `const s = css\`:host { color: red }\`;`;
    const sf = sourceFile("s.ts", code);
    const m = findTemplate(ts, sf, code.indexOf(":host") + 1)!;
    expect(m.kind).toBe("css");
  }
  @Test.it("ignores non-html/css tagged templates") other() {
    const code = `const x = sql\`select 1\`;`;
    expect(findTemplate(ts, sourceFile("x.ts", code), code.indexOf("select"))).toBeUndefined();
  }
}

class BindingDiagnosticsTest extends Test({ name: "binding diagnostics (type-safe bindings)" }) {
  @Test.it("flags an unknown @event on a known component (warning)") badEvent() {
    const diags = checkBindings("`<my-counter @nope=${h}>`", 0, index);
    expect(diags.length).toBe(1);
    expect(diags[0].kind).toBe("event");
    expect(diags[0].messageText.includes("'nope'")).toBeTruthy();
  }
  @Test.it("flags an unknown .prop on a known component (error)") badProp() {
    const diags = checkBindings("`<my-counter .bad=${h}>`", 0, index);
    expect(diags.length).toBe(1);
    expect(diags[0].kind).toBe("prop");
  }
  @Test.it("the diagnostic span points at the binding name") span() {
    const raw = "`<my-counter .bad=${h}>`";
    const d = checkBindings(raw, 0, index)[0];
    expect(raw.slice(d.start, d.start + d.length)).toBe("bad");
  }
  @Test.it("accepts declared events, declared props, and common DOM events") good() {
    const raw = "`<my-counter @increment=${h} .count=${1} @click=${h} @onSave=${h}>`";
    expect(checkBindings(raw, 0, index).length).toBe(0);
  }
  @Test.it("accepts events/props inherited from a base component") inherited() {
    expect(checkBindings("`<fancy-counter @increment=${h} .fancy=${true}>`", 0, index).length).toBe(0);
  }
  @Test.it("ignores unknown tags (plain HTML / third-party)") unknownTag() {
    expect(checkBindings("`<div .whatever=${h} @weird=${h}>`", 0, index).length).toBe(0);
  }
}

await TestApplication()
  .addTests(ComponentIndexTest, HtmlContextTest, HtmlCompletionsTest, HtmlQuickInfoTest, HtmlDefinitionTest, CssTest, FindTemplateTest, BindingDiagnosticsTest)
  .reporter(new ConsoleReporter())
  .run();
