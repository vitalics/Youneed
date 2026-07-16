// Run: pnpm --filter @youneed/dom-provider-a11y test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import type { DevtoolsContext } from "@youneed/devtools";

registerDOM();
const { Component, html, css, flushSync } = await import("@youneed/dom");
const { installDevtools, components, subscribe } = await import("@youneed/devtools");
const { announce, clearAnnouncer } = await import("../src/index.ts");
const {
  a11yPlugin,
  a11yPanel,
  a11yAnnouncements,
  clearA11yAnnouncements,
  accessibilityTree,
  roleOf,
  accessibleName,
} = await import("../src/devtools.ts");

// CAPTURE: register the plugin once. DISPLAY: mount a11yPanel() separately.
installDevtools({ plugins: [a11yPlugin()] });

// Animates but ships no `prefers-reduced-motion` variant → an audit finding.
@Component.define()
class MotionBad extends Component("dt-motion-bad", {
  providers: [],
  styles: css`.box { transition: transform 0.2s; }`,
}) {
  render() {
    return html`<div class="box">x</div>`;
  }
}

// A semantic widget for the a11y-tree tests — with real nesting (nav › ul › li › a).
@Component.define()
class Widget extends Component("dt-widget") {
  render() {
    return html`
      <nav aria-label="Main">
        <ul>
          <li><a href="/a">A</a></li>
          <li><a href="/b">B</a></li>
        </ul>
      </nav>
      <h2>Settings</h2>
      <button aria-expanded="true">Menu</button>
      <span aria-hidden="true">decorative</span>
      <img alt="Logo" src="x" />
    `;
  }
}

// Minimal DevtoolsContext stub — the panel uses components()/subscribe()/highlight().
let highlighted: { tag: string; el: Element | undefined } | undefined;
const highlight = (rec: { elRef?: WeakRef<Element>; tag?: string } | undefined): void => {
  highlighted = rec ? { tag: rec.tag ?? "", el: rec.elRef?.deref() } : undefined;
};
const ctx = { components, subscribe, highlight } as unknown as DevtoolsContext;
const callCleanup = (c: void | (() => void)): void => void (typeof c === "function" && c());

const root = document.createElement("div");
document.body.appendChild(root);

class A11yDevtoolsSuite extends Test({ name: "dom-provider-a11y/devtools" }) {
  @Test.beforeEach() reset() {
    clearAnnouncer();
    clearA11yAnnouncements();
  }

  @Test.it("a11yPlugin() is a capture DevtoolsPlugin") plugin() {
    const plugin = a11yPlugin();
    expect(plugin.name).toBe("a11y");
    expect(typeof plugin.install).toBe("function");
  }

  @Test.it("a11yPanel() is a display DevtoolsPanel") panel() {
    const panel = a11yPanel();
    expect(panel.id).toBe("a11y");
    expect(panel.title).toBe("a11y");
    expect(typeof panel.render).toBe("function");
  }

  @Test.it("the installed plugin captures announce() into the buffer") capture() {
    announce("Saved", "polite");
    announce("Error!", "assertive");
    const log = a11yAnnouncements();
    expect(log.at(-2)?.message).toBe("Saved");
    expect(log.at(-1)?.politeness).toBe("assertive");
  }

  @Test.it("panel tails captured announcements") tail() {
    const panel = a11yPanel();
    const container = document.createElement("div");
    const cleanup = panel.render(container, ctx);
    announce("Hello");
    expect((container.textContent ?? "").includes("Hello")).toBeTruthy();
    callCleanup(cleanup);
  }

  @Test.it("panel audits live components + flags a reduced-motion miss") audit() {
    const bad = document.createElement("dt-motion-bad");
    root.appendChild(bad);
    flushSync();
    const panel = a11yPanel();
    const container = document.createElement("div");
    const cleanup = panel.render(container, ctx);
    const text = container.textContent ?? "";
    expect(text.includes("dt-motion-bad")).toBeTruthy();
    expect(text.toLowerCase().includes("reduced-motion")).toBeTruthy();
    callCleanup(cleanup);
    bad.remove();
  }

  @Test.it("clearA11yAnnouncements empties the buffer") clear() {
    announce("Temporary");
    expect(a11yAnnouncements().length > 0).toBeTruthy();
    clearA11yAnnouncements();
    expect(a11yAnnouncements().length).toBe(0);
  }

  // ── accessibility tree ──────────────────────────────────────────────────────
  @Test.it("roleOf / accessibleName compute implicit role + name") roleName() {
    const btn = document.createElement("button");
    btn.textContent = "Save";
    expect(roleOf(btn)).toBe("button");
    expect(accessibleName(btn)).toBe("Save");

    const a = document.createElement("a");
    expect(roleOf(a)).toBeUndefined(); // no href → not a link
    a.setAttribute("href", "/x");
    expect(roleOf(a)).toBe("link");

    const img = document.createElement("img");
    img.setAttribute("aria-label", "Brand");
    expect(roleOf(img)).toBe("img");
    expect(accessibleName(img)).toBe("Brand"); // aria-label wins over alt
  }

  @Test.it("accessibilityTree walks shadow, prunes generics + aria-hidden") tree() {
    const el = document.createElement("dt-widget");
    root.appendChild(el);
    flushSync();
    const nodes = accessibilityTree([el]);
    const roles = nodes.map((n) => n.role);
    expect(roles.includes("navigation")).toBeTruthy();
    expect(roles.includes("heading")).toBeTruthy();
    expect(roles.includes("button")).toBeTruthy();
    expect(roles.includes("link")).toBeTruthy();
    expect(roles.includes("img")).toBeTruthy();
    // the aria-hidden span → pruned
    expect(roles.includes("generic")).toBeFalsy();
    const heading = nodes.find((n) => n.role === "heading")!;
    expect(heading.name).toBe("Settings");
    expect(heading.states.includes("level=2")).toBeTruthy();
    const btn = nodes.find((n) => n.role === "button")!;
    expect(btn.states.includes("expanded=true")).toBeTruthy();
    el.remove();
  }

  @Test.it("tree carries depth + guide info for indented rendering") guides() {
    const el = document.createElement("dt-widget");
    root.appendChild(el);
    flushSync();
    const nodes = accessibilityTree([el]);
    // nav(0) › ul/list(1) › li/listitem(2) › a/link(3)
    expect(nodes.find((n) => n.role === "navigation")!.depth).toBe(0);
    expect(nodes.find((n) => n.role === "list")!.depth).toBe(1);
    expect(nodes.find((n) => n.role === "listitem")!.depth).toBe(2);
    expect(nodes.find((n) => n.role === "link")!.depth).toBe(3);
    // top-level last sibling (the <img>) is `isLast`; carries the live element.
    const top = nodes.filter((n) => n.depth === 0);
    expect(top[top.length - 1].isLast).toBe(true);
    expect(top[top.length - 1].element.localName).toBe("img");
    el.remove();
  }

  @Test.it("panel renders the accessibility tree with guide prefixes") treePanel() {
    const el = document.createElement("dt-widget");
    root.appendChild(el);
    flushSync();
    const panel = a11yPanel();
    const container = document.createElement("div");
    const cleanup = panel.render(container, ctx);
    const text = container.textContent ?? "";
    expect(text.includes("accessibility tree")).toBeTruthy();
    expect(text.includes("heading")).toBeTruthy();
    expect(text.includes("Settings")).toBeTruthy();
    expect(text.includes("└─") || text.includes("├─")).toBeTruthy(); // tree guides
    callCleanup(cleanup);
    el.remove();
  }

  @Test.it("hovering a tree row highlights its element via ctx.highlight") highlight() {
    const el = document.createElement("dt-widget");
    root.appendChild(el);
    flushSync();
    const panel = a11yPanel();
    const container = document.createElement("div");
    const cleanup = panel.render(container, ctx);
    const rows = [...container.querySelectorAll(".node")];
    rows[0].dispatchEvent(new Event("mouseenter"));
    expect(highlighted?.el?.localName).toBe("nav"); // the first node's element
    rows[0].dispatchEvent(new Event("mouseleave"));
    expect(highlighted).toBeUndefined();
    callCleanup(cleanup);
    el.remove();
  }
}

await TestApplication().addTests(A11yDevtoolsSuite).reporter(new ConsoleReporter()).run();
