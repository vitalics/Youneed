// Run: pnpm --filter @youneed/dom-provider-rbac test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createRBAC, owns } from "@youneed/rbac";
import { rbacProvider, provideRBAC, setSubject, can } from "../src/index.ts";

registerDOM();
const { Component, html, when, flushSync } = await import("@youneed/dom");

const engine = createRBAC((role) => {
  role("admin").can("*", "*");
  role("editor")
    .can(["create", "update"], "post")
    .can("delete", "post", owns("authorId"));
  role("viewer").can("read", "post");
});

// Install the app-wide engine so the `can(...)` template-hole accessor works.
provideRBAC(engine);

const post = { id: "p1", authorId: "u1" };

// The composable `providers` slot — `Component(tag, { providers })`, the DOM
// analogue of a Controller's `{ guards, interceptors }`. `rbacProvider` adds a
// scoped `this.can` and auto-wires reactivity to the current subject.
@Component.define()
class PostCard extends Component("post-card", {
  providers: [rbacProvider(engine)],
}) {
  render() {
    return html`<div>${when(this.can.can("update", "post", post), () => html`<button>Edit</button>`, () => html`<span>readonly</span>`)} · ${when(this.can.can("delete", "post", post), () => html`<button>Del</button>`, () => html`<span>-</span>`)}</div>`;
  }
}

const root = document.createElement("div");
document.body.appendChild(root);

class RbacDomSuite extends Test({ name: "rbac-dom" }) {
  @Test.afterEach() reset() {
    setSubject({ roles: [] });
  }

  @Test.it("providers: scoped this.can gates the template") render() {
    setSubject({ roles: ["viewer"], id: "u9" });
    const el = document.createElement("post-card");
    root.appendChild(el);
    flushSync();
    // viewer may only read → no Edit, no Del
    expect(el.shadowRoot!.textContent).toBe("readonly · -");
    el.remove();
  }

  @Test.it("providers: re-renders when the subject changes automatically") reactive() {
    const el = document.createElement("post-card");
    root.appendChild(el);
    flushSync();
    // default empty subject → nothing allowed
    expect(el.shadowRoot!.textContent).toBe("readonly · -");
    // log in as the post's owning editor → setSubject fires → requestUpdate
    setSubject({ roles: ["editor"], id: "u1" });
    flushSync();
    // editor may update; owns(authorId=u1) → may delete too
    expect(el.shadowRoot!.textContent).toBe("Edit · Del");
    el.remove();
  }

  @Test.it("providers: ownership condition denies a non-owner") ownership() {
    const el = document.createElement("post-card");
    root.appendChild(el);
    flushSync();
    setSubject({ roles: ["editor"], id: "someone-else" });
    flushSync();
    // may update, but not delete (not the owner)
    expect(el.shadowRoot!.textContent).toBe("Edit · -");
    el.remove();
  }

  @Test.it("providers: stops reacting after disconnect") cleanup() {
    const el = document.createElement("post-card");
    root.appendChild(el);
    flushSync();
    el.remove();
    setSubject({ roles: ["admin"] }); // must not throw / touch the detached node
    flushSync();
    expect(el.shadowRoot!.textContent).toBe("readonly · -");
  }

  @Test.it("providers: exposes a scoped this.can API") instance() {
    setSubject({ roles: ["editor"], id: "u1" });
    const el = document.createElement("post-card") as HTMLElement & {
      can: { can(a: string, r: string, i?: Record<string, unknown>): boolean; cannot(a: string, r: string, i?: Record<string, unknown>): boolean; roles(): string[]; subject(): { roles: string[] } };
    };
    root.appendChild(el);
    flushSync();
    expect(el.can.can("update", "post", post)).toBe(true);
    expect(el.can.cannot("delete", "post", { authorId: "nope" })).toBe(true);
    expect(el.can.roles()).toEqual(["editor"]);
    expect(el.can.subject().roles).toEqual(["editor"]);
    el.remove();
  }

  @Test.it("global can(...) evaluates against the current subject") global() {
    setSubject({ roles: ["admin"] });
    expect(can("anything", "everything")).toBe(true);
    setSubject({ roles: ["viewer"] });
    expect(can("read", "post")).toBe(true);
    expect(can("update", "post")).toBe(false);
  }
}

await TestApplication().addTests(RbacDomSuite).reporter(new ConsoleReporter()).run();
