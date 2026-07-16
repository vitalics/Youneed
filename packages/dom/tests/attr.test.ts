// Attribute interpolation test: holes that are the whole value, part of a quoted
// value, or several within one value — plus events, properties and boolean attrs.
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, Mount, flushSync } = await import("../src/dom.ts");

let clicks = 0;

@Component.define()
class AttrDemo extends Component("attr-demo") {
  @Component.prop() id = 1;
  @Component.prop() tab = "profile";
  @Component.prop() dis = false;
  render() {
    return html`
      <a
        class="link"
        href="#/users/${this.id}"
        data-q="t=${this.tab}&id=${this.id}"
        title=${this.id}
        @click=${() => clicks++}
        >link</a
      >
      <button id="btn" disabled=${this.dis}>x</button>
    `;
  }
}

const root = document.createElement("div");
document.body.appendChild(root);
const { element } = Mount(root, AttrDemo);
flushSync();

const a = element.shadowRoot!.querySelector("a.link") as HTMLAnchorElement;
const btn = element.shadowRoot!.querySelector("#btn") as HTMLButtonElement;

// ── initial render snapshots ──
const hrefInit = a.getAttribute("href");
const dataqInit = a.getAttribute("data-q");
const titleInit = a.getAttribute("title");
const noDh = !a.outerHTML.includes("dh:");
a.dispatchEvent(new Event("click"));
const clicksAfter = clicks;
const disAbsentInit = !btn.hasAttribute("disabled");

// ── update: re-render patches every interpolated attribute ──
const e = element as unknown as { id: number; tab: string; dis: boolean };
e.id = 2;
e.tab = "orders";
e.dis = true;
flushSync();
const hrefUpd = a.getAttribute("href");
const dataqUpd = a.getAttribute("data-q");
const titleUpd = a.getAttribute("title");
const disPresent = btn.hasAttribute("disabled");

// ── Regression: @prop({ attribute }) must observe attributes from define-time ──
@Component.define()
class AttrReflect extends Component("attr-reflect") {
  @Component.prop({ attribute: true }) label = "a";
  render() {
    return html`<span class="out">${this.label}</span>`;
  }
}
const observedHasLabel = (customElements.get("attr-reflect") as typeof AttrReflect).observedAttributes.includes("label");
const host = document.createElement("attr-reflect") as HTMLElement & { flushSync(): void; label: string };
host.setAttribute("label", "first");
root.appendChild(host);
host.flushSync();
const outText = () => host.shadowRoot!.querySelector(".out")!.textContent;
const syncedOnConnect = outText() === "first";
host.setAttribute("label", "second"); // changing the ATTRIBUTE (not the prop) must re-render
host.flushSync();
const reRenderedOnAttr = outText() === "second";

class AttrTest extends Test({ name: "dom attribute interpolation" }) {
  @Test.it("quoted prefix + hole (href)") href() {
    expect(hrefInit).toBe("#/users/1");
  }
  @Test.it("multiple holes in one value (data-q)") multi() {
    expect(dataqInit).toBe("t=profile&id=1");
  }
  @Test.it("whole unquoted value (title)") title() {
    expect(titleInit).toBe("1");
  }
  @Test.it("no stray dh: placeholder attributes") noPlaceholders() {
    expect(noDh).toBeTruthy();
  }
  @Test.it("event handler fires on an element with interpolated attrs") event() {
    expect(clicksAfter).toBe(1);
  }
  @Test.it("boolean false → attribute absent") boolFalse() {
    expect(disAbsentInit).toBeTruthy();
  }
  @Test.it("href updated on re-render") hrefUpdated() {
    expect(hrefUpd).toBe("#/users/2");
  }
  @Test.it("data-q updated (both holes)") dataqUpdated() {
    expect(dataqUpd).toBe("t=orders&id=2");
  }
  @Test.it("title updated") titleUpdated() {
    expect(titleUpd).toBe("2");
  }
  @Test.it("boolean true → attribute present") boolTrue() {
    expect(disPresent).toBeTruthy();
  }
  @Test.it("observedAttributes populated at define time") observed() {
    expect(observedHasLabel).toBeTruthy();
  }
  @Test.it("attribute synced to prop on connect") synced() {
    expect(syncedOnConnect).toBeTruthy();
  }
  @Test.it("setAttribute re-renders (attributeChangedCallback fired)") reRender() {
    expect(reRenderedOnAttr).toBeTruthy();
  }
}

await TestApplication().addTests(AttrTest).reporter(new ConsoleReporter()).run();
