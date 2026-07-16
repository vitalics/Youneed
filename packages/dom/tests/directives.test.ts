// Directives test: classMap / styleMap / when / map / If / Switch / ref / portal.
// Run: pnpm --filter @youneed/dom test
import { registerDOM } from "../src/register.ts";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html, classMap, styleMap, when, map, If, Switch, For, While, flow, ref, createRef, portal } =
  await import("../src/dom.ts");

@Component.define()
class DirHost extends Component("dir-host") {
  @Component.prop() open = false;
  @Component.prop() items: string[] = [];
  @Component.prop() status: "loading" | "error" | "ready" = "loading";
  inputRef = createRef<HTMLInputElement>();
  cbEl: Element | null = null;
  render() {
    return html`
      <div
        class=${classMap({ box: true, open: this.open })}
        style=${styleMap({ color: "red", paddingLeft: "8px" })}
      >
        <input ${ref(this.inputRef)} />
        <span ${ref((el) => (this.cbEl = el))}></span>
        ${If(
          this.items.length > 0,
          () => html`<ul>${map(this.items, (x, i) => html`<li>${i}:${x}</li>`)}</ul>`,
          () => html`<p class="empty">none</p>`,
        )}
        ${Switch(this.status, {
          loading: () => html`<p id="state">loading…</p>`,
          error: () => html`<p id="state">oops</p>`,
          default: () => html`<p id="state">ready</p>`,
        })}
        <div class="dots">${flow.for(0, 3, (i) => html`<i class="dot" data-i=${i}></i>`)}</div>
        ${portal(document.body, when(this.open, () => html`<div id="portal-content">modal</div>`))}
      </div>
    `;
  }
}

const root = document.createElement("div");
document.body.appendChild(root);
const el = document.createElement("dir-host") as HTMLElement & {
  open: boolean;
  items: string[];
  status: "loading" | "error" | "ready";
  inputRef: { value: HTMLInputElement | null };
  cbEl: Element | null;
  flushSync(): void;
};
root.appendChild(el);
el.flushSync();
const sr = el.shadowRoot!;
const box = sr.querySelector("div")!;

// closed-state snapshots
const classClosed = box.getAttribute("class");
const styleStr = box.getAttribute("style") ?? "";
const refHandle = el.inputRef.value === sr.querySelector("input");
const refCallback = el.cbEl === sr.querySelector("span");
const emptyBranch = !!sr.querySelector("p.empty") && !sr.querySelector("ul");
const portalClosed = !document.getElementById("portal-content");
const switchLoading = sr.querySelector("#state")?.textContent === "loading…"; // matched case
const dots = sr.querySelectorAll(".dots .dot");
const forRendered = dots.length === 3 && (dots[2] as HTMLElement).getAttribute("data-i") === "2";

// flip status: matched "error" case, then no match → default
el.status = "error";
el.flushSync();
const switchError = sr.querySelector("#state")?.textContent === "oops";
el.status = "ready";
el.flushSync();
const switchDefault = sr.querySelector("#state")?.textContent === "ready"; // falls through to default

// open it
el.open = true;
el.items = ["a", "b"];
el.flushSync();
const classOpen = box.getAttribute("class");
const listRendered = sr.querySelectorAll("li").length === 2 && sr.querySelector("li")!.textContent === "0:a";
const portalNode = document.getElementById("portal-content");
const portalInBody = !!portalNode && portalNode.parentNode === document.body;
const portalNotInShadow = !sr.querySelector("#portal-content");

// close → portal removed
el.open = false;
el.flushSync();
const portalRemovedOnClose = !document.getElementById("portal-content");

// reopen, then unmount → cleaned up
el.open = true;
el.flushSync();
const portalBackAfterReopen = !!document.getElementById("portal-content");
el.remove(); // disconnect → dispose → onCleanup teardown
const portalRemovedOnUnmount = !document.getElementById("portal-content");
const refNulledOnUnmount = el.inputRef.value === null;

class HelpersTest extends Test({ name: "dom directives (helpers)" }) {
  @Test.it("classMap joins truthy keys") classMapJoin() {
    expect(classMap({ btn: true, active: 1, off: false, no: 0 })).toBe("btn active");
  }
  @Test.it("styleMap camel→kebab + skips nullish") styleMapKebab() {
    expect(styleMap({ color: "red", paddingLeft: "8px", width: undefined, z: false })).toBe("color:red;padding-left:8px;");
  }
  @Test.it("styleMap passes --vars through") styleMapVars() {
    expect(styleMap({ "--x": 5 })).toBe("--x:5;");
  }
  @Test.it("when picks the branch lazily") whenLazy() {
    expect(when(true, () => "a", () => "b")).toBe("a");
    expect(when(false, () => "a", () => "b")).toBe("b");
    expect(when(false, () => "a")).toBe("");
  }
  @Test.it("map over an iterable with index") mapIndex() {
    expect(JSON.stringify(map(["a", "b"], (x, i) => `${i}:${x}`))).toBe('["0:a","1:b"]');
  }
  @Test.it("map handles null") mapNull() {
    expect(JSON.stringify(map(null, (x) => x))).toBe("[]");
  }
  @Test.it("If picks the branch lazily") ifLazy() {
    expect(If(true, () => "a", () => "b")).toBe("a");
    expect(If(false, () => "a", () => "b")).toBe("b");
    expect(If(false, () => "a")).toBe("");
  }
  @Test.it("Switch matches a case, else falls back to default") switchMatch() {
    const cases = { a: () => "A", b: () => "B", default: () => "D" };
    expect(Switch("a", cases)).toBe("A");
    expect(Switch("b", cases)).toBe("B");
    expect(Switch("z", cases)).toBe("D"); // no match → default
  }
  @Test.it("Switch with no match and no default renders nothing") switchEmpty() {
    expect(Switch("z", { a: () => "A" })).toBe("");
  }
  @Test.it("Switch runs only the matched branch") switchLazy() {
    let ran = "";
    Switch("a", { a: () => (ran += "a"), b: () => (ran += "b"), default: () => (ran += "d") });
    expect(ran).toBe("a");
  }
  @Test.it("For iterates a range (default step)") forRange() {
    expect(JSON.stringify(For(1, 5, (i) => i))).toBe("[1,2,3,4]");
  }
  @Test.it("For honours a custom step") forStep() {
    expect(JSON.stringify(For(0, 10, 2, (i) => i))).toBe("[0,2,4,6,8]");
  }
  @Test.it("For counts down with a negative step") forDown() {
    expect(JSON.stringify(For(3, 0, -1, (i) => i))).toBe("[3,2,1]");
  }
  @Test.it("For with step 0 renders nothing (no infinite loop)") forZero() {
    expect(JSON.stringify(For(0, 5, 0, (i) => i))).toBe("[]");
  }
  @Test.it("While produces while the predicate holds") whileLoop() {
    expect(JSON.stringify(While((i) => i < 3, (i) => i))).toBe("[0,1,2]");
  }
  @Test.it("While guards against a runaway predicate") whileGuard() {
    expect(() => While(() => true, (i) => i)).toThrow();
  }
  @Test.it("flow groups the helpers under keyword names") flowGroup() {
    expect(flow.if === If && flow.switch === Switch && flow.while === While && flow.for === For).toBeTruthy();
    expect(flow.when === when && flow.map === map).toBeTruthy();
    expect(flow.if(true, () => "a", () => "b")).toBe("a");
    expect(JSON.stringify(flow.for(0, 3, (i) => i))).toBe("[0,1,2]");
  }
}

class DomDirectivesTest extends Test({ name: "dom directives (DOM)" }) {
  @Test.it("classMap on element (closed)") classClosed() {
    expect(classClosed).toBe("box");
  }
  @Test.it("styleMap on element") style() {
    expect(styleStr.includes("color:red") && styleStr.includes("padding-left:8px")).toBeTruthy();
  }
  @Test.it("ref handle captured the <input>") refHandleCaptured() {
    expect(refHandle).toBeTruthy();
  }
  @Test.it("ref callback captured the <span>") refCallbackCaptured() {
    expect(refCallback).toBeTruthy();
  }
  @Test.it("If renders the empty branch") emptyBranch() {
    expect(emptyBranch).toBeTruthy();
  }
  @Test.it("portal renders nothing when closed") portalClosed() {
    expect(portalClosed).toBeTruthy();
  }
  @Test.it("classMap reflects open") classOpen() {
    expect(classOpen).toBe("box open");
  }
  @Test.it("If/map render the list") list() {
    expect(listRendered).toBeTruthy();
  }
  @Test.it("Switch renders the matched case (loading)") switchInitial() {
    expect(switchLoading).toBeTruthy();
  }
  @Test.it("Switch re-renders on value change (error)") switchOnChange() {
    expect(switchError).toBeTruthy();
  }
  @Test.it("Switch falls through to default for unmatched value") switchFallthrough() {
    expect(switchDefault).toBeTruthy();
  }
  @Test.it("flow.for renders a range in a real template") forInTemplate() {
    expect(forRendered).toBeTruthy();
  }
  @Test.it("portal content lives in document.body (escapes shadow)") portalInBody() {
    expect(portalInBody).toBeTruthy();
  }
  @Test.it("portal content NOT inside the host shadow") portalNotInShadow() {
    expect(portalNotInShadow).toBeTruthy();
  }
  @Test.it("portal content removed when closed") portalRemovedClose() {
    expect(portalRemovedOnClose).toBeTruthy();
  }
  @Test.it("portal content back after reopen") portalReopen() {
    expect(portalBackAfterReopen).toBeTruthy();
  }
  @Test.it("portal content removed on host unmount") portalUnmount() {
    expect(portalRemovedOnUnmount).toBeTruthy();
  }
  @Test.it("ref nulled on host unmount") refNulled() {
    expect(refNulledOnUnmount).toBeTruthy();
  }
}

await TestApplication().addTests(HelpersTest, DomDirectivesTest).reporter(new ConsoleReporter()).run();
