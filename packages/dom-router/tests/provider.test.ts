// routerProvider self-test. Run: pnpm --filter @youneed/dom-router test:provider
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

registerDOM();
const { Component, html } = await import("@youneed/dom");
const { createRouter, routerProvider } = await import("../src/index.ts");

const tick = () => new Promise((r) => setTimeout(r, 5));
const outletOf = (host: HTMLElement) => host.shadowRoot!.querySelector("[data-router-outlet]")!;

const router = createRouter({
  mode: "hash",
  routes: [
    { path: "/", component: "home-pp" },
    { path: "/about", component: "about-pp" },
  ],
});

@Component.define()
class Shell extends Component("app-shell-pp", { providers: [routerProvider(router)] }) {
  override render() {
    return html`<header>nav</header>${this.router.outlet()}`;
  }
}

class ProviderSuite extends Test({ name: "routerProvider" }) {
  @Test.it("outlet() mounts the current route inside a host-owned outlet")
  async mounts() {
    location.hash = "#/";
    const el = document.createElement("app-shell-pp") as HTMLElement;
    document.body.appendChild(el);
    await tick();
    const slot = outletOf(el);
    expect(slot).not.toBeNull();
    expect(slot.firstElementChild?.tagName.toLowerCase()).toBe("home-pp");
    // Shell chrome around the outlet stays put.
    expect(el.shadowRoot!.querySelector("header")?.textContent).toBe("nav");
    el.remove();
  }

  @Test.it("goto navigates and the outlet swaps reactively")
  async goto() {
    location.hash = "#/";
    const el = document.createElement("app-shell-pp") as HTMLElement;
    document.body.appendChild(el);
    await tick();
    (el as unknown as { router: { goto(p: string): void } }).router.goto("/about");
    await tick();
    expect(outletOf(el).firstElementChild?.tagName.toLowerCase()).toBe("about-pp");
    expect(router.current?.path).toBe("/about");
    el.remove();
  }

  @Test.it("replace swaps the mounted node in place without changing the URL")
  async replace() {
    location.hash = "#/about";
    const el = document.createElement("app-shell-pp") as HTMLElement;
    document.body.appendChild(el);
    await tick();
    const api = (el as unknown as { router: { replace(c: string): void; path?: string; component?: string } }).router;
    api.replace("flash-pp");
    await tick();
    expect(outletOf(el).firstElementChild?.tagName.toLowerCase()).toBe("flash-pp");
    // URL/path untouched — only the node tree changed.
    expect(location.hash).toBe("#/about");
    expect(router.current?.path).toBe("/about");
    expect(api.component).toBe("flash-pp");
    el.remove();
  }

  @Test.it("exposes mode + hash on this.router")
  async exposes() {
    location.hash = "#/";
    const el = document.createElement("app-shell-pp") as HTMLElement;
    document.body.appendChild(el);
    await tick();
    const api = (el as unknown as { router: { mode: string; hash: string } }).router;
    expect(api.mode).toBe("hash");
    expect(api.hash).toBe("#/");
    el.remove();
  }
}

await TestApplication().addTests(ProviderSuite).reporter(new ConsoleReporter()).run();
